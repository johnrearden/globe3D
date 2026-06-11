"""Owner-only (staff) templated dashboards. Not part of the public API."""

from django.contrib.admin.views.decorators import staff_member_required
from django.db.models import Avg, Count, Q
from django.shortcuts import render

from players.models import Player
from quiz import services
from quiz.models import AnswerRecord, Attempt, DailyQuiz, Question


@staff_member_required
def dashboard(request):
    quiz = services.get_or_create_quiz(services.today())
    context = {
        'quiz': quiz,
        'players_total': Player.objects.count(),
        'attempts_today': Attempt.objects.filter(quiz=quiz).count(),
        'completed_today': Attempt.objects.filter(quiz=quiz, completed=True).count(),
        'quizzes_total': DailyQuiz.objects.count(),
    }
    return render(request, 'stats/dashboard.html', context)


@staff_member_required
def leaderboard_page(request):
    date = request.GET.get('date')
    if date:
        from datetime import datetime
        try:
            d = datetime.strptime(date, '%Y-%m-%d').date()
        except ValueError:
            d = services.today()
    else:
        d = services.today()
    quiz = services.get_or_create_quiz(d)
    entries = services.leaderboard(quiz, limit=200)
    context = {
        'quiz': quiz,
        'entries': [(i + 1, a) for i, a in enumerate(entries)],
        'recent_dates': DailyQuiz.objects.values_list('date', flat=True)[:30],
    }
    return render(request, 'stats/leaderboard.html', context)


@staff_member_required
def participation_page(request):
    # Per-question difficulty for the most recent quiz.
    quiz = DailyQuiz.objects.order_by('-date').first()
    question_stats = []
    if quiz:
        for q in quiz.questions.all():
            agg = AnswerRecord.objects.filter(question=q).aggregate(
                total=Count('id'),
                correct=Count('id', filter=Q(correct=True)),
                avg_ms=Avg('elapsed_ms'),
            )
            total = agg['total'] or 0
            correct = agg['correct'] or 0
            pct = round(100 * correct / total) if total else None
            question_stats.append({
                'index': q.index,
                'type': q.type,
                'prompt': q.payload.get('prompt', ''),
                'total': total,
                'correct_pct': pct,
                'avg_ms': int(agg['avg_ms']) if agg['avg_ms'] else None,
            })

    # Signups + participation over recent days.
    daily = []
    for dq in DailyQuiz.objects.order_by('-date')[:30]:
        daily.append({
            'date': dq.date,
            'attempts': Attempt.objects.filter(quiz=dq).count(),
            'completed': Attempt.objects.filter(quiz=dq, completed=True).count(),
        })

    context = {
        'quiz': quiz,
        'question_stats': question_stats,
        'daily': daily,
        'players_total': Player.objects.count(),
    }
    return render(request, 'stats/participation.html', context)
