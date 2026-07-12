from django.conf import settings
from django.db import models


class DailyQuiz(models.Model):
    """One quiz per calendar day, identical for every player.

    Generated deterministically from `seed` (derived from the date) so the set is
    reproducible and the same for everyone. Questions are generated once and
    stored; the per-question correct answers live in `Question.answer` and are
    never serialized to clients.
    """

    date = models.DateField(unique=True, db_index=True)
    seed = models.BigIntegerField()
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'daily quizzes'
        ordering = ['-date']

    def __str__(self):
        return f'DailyQuiz {self.date} ({self.questions.count()} questions)'


class Question(models.Model):
    """A single question within a daily quiz.

    `payload` is the sanitized presentation+options sent to clients (prompt, map,
    flag, grid, answer.method) and contains NO answer. `answer` is the grading key
    (the correct country name or set of names) and is server-only.
    """

    TYPE_NAME_COUNTRY = 'name-country'
    TYPE_IDENTIFY_FLAG = 'identify-flag'
    TYPE_CAPITAL = 'capital'
    TYPE_BORDERING = 'bordering'
    TYPE_LANDLOCKED = 'landlocked'
    TYPE_REGION_CLICK = 'region-click'

    quiz = models.ForeignKey(DailyQuiz, related_name='questions', on_delete=models.CASCADE)
    index = models.PositiveIntegerField()
    type = models.CharField(max_length=32)
    payload = models.JSONField()
    answer = models.JSONField()
    points = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ['index']
        constraints = [
            models.UniqueConstraint(fields=['quiz', 'index'], name='unique_question_index'),
        ]

    def __str__(self):
        return f'Q{self.index} [{self.type}] of {self.quiz.date}'


class Attempt(models.Model):
    """One player's run at one daily quiz. Enforces one-attempt-per-day."""

    player = models.ForeignKey('players.Player', related_name='attempts', on_delete=models.CASCADE)
    quiz = models.ForeignKey(DailyQuiz, related_name='attempts', on_delete=models.CASCADE)

    score = models.PositiveIntegerField(default=0)
    total_time_ms = models.PositiveIntegerField(default=0)
    current_index = models.PositiveIntegerField(default=0)
    completed = models.BooleanField(default=False)

    started = models.DateTimeField(auto_now_add=True)
    finished = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-score', 'total_time_ms']
        constraints = [
            models.UniqueConstraint(fields=['player', 'quiz'], name='one_attempt_per_day'),
        ]

    def __str__(self):
        return f'{self.player.nickname} @ {self.quiz.date}: {self.score} in {self.total_time_ms}ms'


class QuestionFlag(models.Model):
    """Audit record: a superuser flagged a question as faulty/unsuitable.

    Snapshots the question content at flag time — the Question row itself is
    regenerated in place, so this is the only place the replaced content
    survives (for later generator-improvement analysis).
    """

    question = models.ForeignKey(Question, related_name='flags', on_delete=models.CASCADE)
    quiz = models.ForeignKey(DailyQuiz, related_name='flags', on_delete=models.CASCADE)
    index = models.PositiveIntegerField()
    reason = models.TextField(blank=True)
    flagged_by = models.CharField(max_length=150)
    old_type = models.CharField(max_length=32)
    old_payload = models.JSONField()
    old_answer = models.JSONField()
    regenerated = models.BooleanField(default=False)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created']

    def __str__(self):
        state = 'regenerated' if self.regenerated else 'flag only'
        return f'Flag Q{self.index} [{self.old_type}] of {self.quiz.date} ({state})'


class AnswerRecord(models.Model):
    """Audit row for each submitted answer (also feeds owner stats / anti-cheat)."""

    attempt = models.ForeignKey(Attempt, related_name='answers', on_delete=models.CASCADE)
    question = models.ForeignKey(Question, on_delete=models.CASCADE)
    given = models.JSONField()
    correct = models.BooleanField()
    elapsed_ms = models.PositiveIntegerField()
    elapsed_ms_raw = models.PositiveIntegerField(help_text='Client-reported time before clamping.')
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['attempt', 'question__index']
        constraints = [
            models.UniqueConstraint(fields=['attempt', 'question'], name='one_answer_per_question'),
        ]

    def __str__(self):
        return f'{self.attempt_id}:{self.question.index} {"✓" if self.correct else "✗"}'
