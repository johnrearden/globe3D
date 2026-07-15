"""Daily-quiz domain logic: lazy generation, grading, scoring, ranking."""

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils import timezone

from .generation import generate_for_quiz
from .models import Attempt, DailyQuiz

# The daily leaderboard is identical for every viewer, so a short cache absorbs
# the daily-challenge read spike. Invalidated the moment an attempt completes.
LEADERBOARD_TTL = 15


def seed_for_date(d):
    """Stable integer seed from a date (YYYYMMDD)."""
    return d.year * 10000 + d.month * 100 + d.day


@transaction.atomic
def get_or_create_quiz(d):
    """Return the DailyQuiz for date `d`, generating it once on first access."""
    quiz, created = DailyQuiz.objects.select_for_update().get_or_create(
        date=d, defaults={'seed': seed_for_date(d)},
    )
    if created or not quiz.questions.exists():
        generate_for_quiz(quiz)
    return quiz


def today():
    return timezone.localdate()


def clamp_ms(raw):
    """Clamp a client-reported per-question time into the allowed band."""
    return max(settings.ANSWER_MIN_MS, min(int(raw), settings.ANSWER_MAX_MS))


def normalize_given(given):
    """Accept a single value or a list; return a clean list of strings."""
    if given is None:
        return []
    if not isinstance(given, list):
        given = [given]
    return [str(g) for g in given if g is not None and str(g) != '']


def grade(question, given):
    """Grade a submission. Returns (is_correct, reveal_dict).

    Single-answer and multi-select both require an exact set match to count.
    `reveal` carries the educational feedback the UI shows after submitting.
    """
    correct = list(question.answer.get('correct', []))
    correct_set = set(correct)
    given_list = normalize_given(given)
    given_set = set(given_list)

    is_correct = given_set == correct_set
    reveal = {
        'correct': is_correct,
        'correctOptions': correct,
        'yourSelections': given_list,
        'rightPicks': sorted(given_set & correct_set),
        'wrongPicks': sorted(given_set - correct_set),
        'missed': sorted(correct_set - given_set),
    }
    return is_correct, reveal


def finalize_timing(attempt):
    """Anti-cheat floor: a run can't claim less time than a fraction of the real
    wall-clock between starting and finishing (blunts obviously-spoofed times)."""
    if not attempt.finished:
        return attempt.total_time_ms
    server_elapsed_ms = int((attempt.finished - attempt.started).total_seconds() * 1000)
    floor = int(server_elapsed_ms * settings.ANSWER_WALLCLOCK_MIN_RATIO)
    return max(attempt.total_time_ms, floor)


def _leaderboard_key(quiz, limit):
    return f'lb:{quiz.date.isoformat()}:{limit}'


def leaderboard(quiz, limit=50):
    """Completed attempts ranked by score desc, then total time asc.

    Cached for LEADERBOARD_TTL seconds per (quiz date, limit); the board is the
    same for everyone, so this collapses repeated reads onto one query. An empty
    board is a valid cached value, hence the explicit `is not None` check.

    Nameless attempts are excluded: a device plays anonymously and only picks a
    nickname after finishing, so an un-registered (or cancelled) finisher has an
    empty nickname and must not surface as a blank row.
    """
    key = _leaderboard_key(quiz, limit)
    cached = cache.get(key)
    if cached is not None:
        return cached
    qs = (
        Attempt.objects.filter(quiz=quiz, completed=True)
        .exclude(player__nickname='')
        .select_related('player')
        .order_by('-score', 'total_time_ms', 'finished')
    )
    result = list(qs[:limit])
    cache.set(key, result, LEADERBOARD_TTL)
    return result


def invalidate_leaderboard(quiz, limit=50):
    """Drop the cached board so a freshly completed attempt shows immediately."""
    cache.delete(_leaderboard_key(quiz, limit))


def invalidate_leaderboard_for_date(d, limit=50):
    """Drop the cached board for a date without needing a DailyQuiz row.

    Used when a player registers (adds a nickname) after finishing: their now-named
    attempt must appear on the very next board read, even if a concurrent viewer
    just re-cached the nameless-excluded board.
    """
    cache.delete(f'lb:{d.isoformat()}:{limit}')


def rank_of(attempt):
    """1-based rank of a completed attempt within its quiz (None if not done)."""
    if not attempt.completed:
        return None
    better = (
        Attempt.objects.filter(quiz=attempt.quiz, completed=True)
        .exclude(player__nickname='')
        .filter(models_q_better(attempt))
        .count()
    )
    return better + 1


def models_q_better(attempt):
    """Q describing attempts that outrank `attempt`."""
    from django.db.models import Q
    return (
        Q(score__gt=attempt.score)
        | Q(score=attempt.score, total_time_ms__lt=attempt.total_time_ms)
    )
