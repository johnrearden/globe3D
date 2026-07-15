from datetime import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import NotAuthenticated, ValidationError
from rest_framework.response import Response

from players.auth import get_or_create_player, get_player

from . import services
from .models import AnswerRecord, Attempt, Question
from .serializers import AnswerInputSerializer, leaderboard_entry, sanitized_question


def _attempt_status(attempt):
    if attempt is None:
        return 'none'
    return 'completed' if attempt.completed else 'in-progress'


@api_view(['GET'])
def daily_today(request):
    """Metadata about today's quiz and the player's standing with it.

    Tolerates an unknown/unregistered device: the frontend calls this on load for
    everyone (to detect an already-completed attempt), so a token with no Player
    row reports status 'none' rather than 401 — and does not mint a Player (only
    daily_start does that, when play actually begins).
    """
    quiz = services.get_or_create_quiz(services.today())
    try:
        player = get_player(request)
    except NotAuthenticated:
        player = None
    attempt = (
        Attempt.objects.filter(player=player, quiz=quiz).first() if player else None
    )
    return Response({
        'quizDate': quiz.date.isoformat(),
        'questionCount': quiz.questions.count(),
        'attempt': {
            'status': _attempt_status(attempt),
            'runningScore': attempt.score if attempt else 0,
            'rank': services.rank_of(attempt) if attempt else None,
        },
    })


@api_view(['POST'])
def daily_start(request):
    """Begin (or resume) today's attempt. 409 if already completed today.

    Creates a nameless Player for a first-time device — play happens before
    registration, which is collected after the first completed run.
    """
    player = get_or_create_player(request)
    quiz = services.get_or_create_quiz(services.today())
    attempt = Attempt.objects.filter(player=player, quiz=quiz).first()

    if attempt and attempt.completed:
        return Response(
            {'detail': 'You have already completed today\'s challenge.',
             'attempt': {'status': 'completed', 'score': attempt.score,
                         'totalTimeMs': attempt.total_time_ms,
                         'rank': services.rank_of(attempt)}},
            status=status.HTTP_409_CONFLICT,
        )

    if attempt is None:
        attempt = Attempt.objects.create(player=player, quiz=quiz)

    question = quiz.questions.get(index=attempt.current_index)
    return Response({
        'attemptId': attempt.id,
        'questionCount': quiz.questions.count(),
        'runningScore': attempt.score,
        'question': sanitized_question(question),
    })


@api_view(['POST'])
def daily_answer(request):
    """Grade one answer, advance the attempt, return reveal + next question."""
    player = get_player(request)
    data = AnswerInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    data = data.validated_data

    attempt = get_object_or_404(Attempt, id=data['attemptId'], player=player)
    if attempt.completed:
        raise ValidationError('This attempt is already complete.')

    if data['index'] != attempt.current_index:
        raise ValidationError(
            f'Out-of-order answer: expected question {attempt.current_index}.'
        )

    question = get_object_or_404(Question, quiz=attempt.quiz, index=data['index'])
    if AnswerRecord.objects.filter(attempt=attempt, question=question).exists():
        raise ValidationError('This question has already been answered.')

    is_correct, reveal = services.grade(question, data['answer'])
    clamped = services.clamp_ms(data['elapsedMs'])

    AnswerRecord.objects.create(
        attempt=attempt,
        question=question,
        given=services.normalize_given(data['answer']),
        correct=is_correct,
        elapsed_ms=clamped,
        elapsed_ms_raw=int(data['elapsedMs']),
    )

    if is_correct:
        attempt.score += question.points
    attempt.total_time_ms += clamped
    attempt.current_index += 1

    total_questions = attempt.quiz.questions.count()
    done = attempt.current_index >= total_questions
    next_question = None
    if done:
        attempt.completed = True
        attempt.finished = timezone.now()
        attempt.total_time_ms = services.finalize_timing(attempt)
    else:
        next_question = attempt.quiz.questions.get(index=attempt.current_index)
    attempt.save()

    if done:
        # A new finisher changes the standings — drop the cached board.
        services.invalidate_leaderboard(attempt.quiz)

    body = {
        'reveal': reveal,
        'runningScore': attempt.score,
        'totalTimeMs': attempt.total_time_ms,
    }
    if done:
        body['done'] = True
        body['rank'] = services.rank_of(attempt)
    else:
        body['next'] = sanitized_question(next_question)
    return Response(body)


def _leaderboard_response(request, quiz):
    try:
        player = get_player(request)
    except Exception:
        player = None

    entries = services.leaderboard(quiz)
    payload = {'quizDate': quiz.date.isoformat(),
               'entries': [leaderboard_entry(a, i + 1) for i, a in enumerate(entries)]}

    # Only a *named* player gets a "you" row — a nameless (unregistered) finisher
    # is off the board entirely, so highlighting a rank for them would mislead.
    if player and player.nickname:
        mine = Attempt.objects.filter(player=player, quiz=quiz, completed=True).first()
        if mine:
            payload['you'] = leaderboard_entry(mine, services.rank_of(mine))
    return Response(payload)


@api_view(['GET'])
def daily_leaderboard_today(request):
    quiz = services.get_or_create_quiz(services.today())
    return _leaderboard_response(request, quiz)


@api_view(['GET'])
def daily_leaderboard(request, date):
    try:
        d = datetime.strptime(date, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError('Date must be YYYY-MM-DD.')
    quiz = services.get_or_create_quiz(d)
    return _leaderboard_response(request, quiz)
