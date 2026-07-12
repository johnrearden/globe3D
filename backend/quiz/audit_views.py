"""Superuser audit tool: browse any date's quiz with answers, flag + regenerate.

Two surfaces:
  /audit/launch (session-authed, server-rendered)  — mints the signed token and
      links into the static frontend's audit mode.
  /api/audit/daily/<date>[...]  (X-Audit-Token)    — full-reveal quiz data and
      the flag/regenerate action. These endpoints never touch Attempt or
      AnswerRecord, so auditing can't pollute leaderboards or player state.
"""

from datetime import datetime
from urllib.parse import quote

from django.conf import settings
from django.contrib.auth.decorators import user_passes_test
from django.shortcuts import get_object_or_404, render
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

from . import regeneration, services
from .audit_auth import mint_token, require_audit
from .models import Question, QuestionFlag
from .serializers import AuditFlagInputSerializer


def _parse_date(date):
    try:
        return datetime.strptime(date, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError('Date must be YYYY-MM-DD.')


def _flag_dict(flag):
    return {
        'id': flag.id,
        'index': flag.index,
        'reason': flag.reason,
        'flaggedBy': flag.flagged_by,
        'oldType': flag.old_type,
        'oldPrompt': flag.old_payload.get('prompt', ''),
        'regenerated': flag.regenerated,
        'created': flag.created.isoformat(),
    }


def _audit_question(question, flags):
    """Full reveal: exactly what a player receives, plus the grading key."""
    return {
        'index': question.index,
        'type': question.type,
        'points': question.points,
        'prompt': question.payload.get('prompt', ''),
        'payload': question.payload,
        'answer': question.answer,
        'flags': [_flag_dict(f) for f in flags],
    }


@user_passes_test(lambda u: u.is_active and u.is_superuser, login_url='/admin/login/')
def audit_launch(request):
    """Mint an audit token and hand it to the frontend. Superusers only."""
    token = mint_token(request.user)
    origin = settings.AUDIT_FRONTEND_ORIGIN.rstrip('/')
    return render(request, 'quiz/audit_launch.html', {
        'audit_url': f'{origin}/?audit={quote(token)}',
        'hours': settings.AUDIT_TOKEN_MAX_AGE // 3600,
    })


@api_view(['GET'])
@require_audit
def audit_daily(request, date):
    """The full quiz for any date (generated on first access), answers included."""
    quiz = services.get_or_create_quiz(_parse_date(date))
    flags_by_question = {}
    for flag in QuestionFlag.objects.filter(quiz=quiz).order_by('created'):
        flags_by_question.setdefault(flag.question_id, []).append(flag)
    return Response({
        'quizDate': quiz.date.isoformat(),
        'seed': quiz.seed,
        'questionCount': quiz.questions.count(),
        'attemptCount': quiz.attempts.count(),
        'completedAttemptCount': quiz.attempts.filter(completed=True).count(),
        'questions': [
            _audit_question(q, flags_by_question.get(q.pk, []))
            for q in quiz.questions.all()
        ],
    })


@api_view(['POST'])
@require_audit
def audit_flag(request, date):
    """Flag a question as faulty; snapshot it and regenerate a replacement.

    Regeneration rewrites the slot in place, so once players have attempted the
    quiz it requires an explicit force=true (the snapshot preserves what they
    actually saw).
    """
    quiz = services.get_or_create_quiz(_parse_date(date))
    data = AuditFlagInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    v = data.validated_data

    question = get_object_or_404(Question, quiz=quiz, index=v['index'])

    attempt_count = quiz.attempts.count()
    if v['regenerate'] and attempt_count and not v['force']:
        return Response(
            {'detail': f'{attempt_count} attempt(s) exist for {quiz.date}; '
                       f'pass force=true to regenerate anyway.',
             'attemptCount': attempt_count},
            status=status.HTTP_409_CONFLICT,
        )

    prior_flags = QuestionFlag.objects.filter(question=question).count()
    flag = QuestionFlag.objects.create(
        question=question,
        quiz=quiz,
        index=question.index,
        reason=v['reason'],
        flagged_by=request.audit_user.username,
        old_type=question.type,
        old_payload=question.payload,
        old_answer=question.answer,
    )

    if v['regenerate']:
        try:
            regeneration.regenerate_question(question, flag_count=prior_flags)
        except regeneration.RegenerationError as e:
            return Response(
                {'detail': str(e), 'flag': _flag_dict(flag)},
                status=status.HTTP_422_UNPROCESSABLE_ENTITY,
            )
        flag.regenerated = True
        flag.save(update_fields=['regenerated'])
        question.refresh_from_db()

    flags = list(QuestionFlag.objects.filter(question=question).order_by('created'))
    return Response({
        'flag': _flag_dict(flag),
        'question': _audit_question(question, flags),
    })
