from django.contrib import admin

from .models import AnswerRecord, Attempt, DailyQuiz, Question


class QuestionInline(admin.TabularInline):
    model = Question
    extra = 0
    fields = ('index', 'type', 'points')
    readonly_fields = ('index', 'type', 'points')
    can_delete = False
    show_change_link = True


@admin.register(DailyQuiz)
class DailyQuizAdmin(admin.ModelAdmin):
    list_display = ('date', 'seed', 'question_count', 'created')
    inlines = [QuestionInline]

    @admin.display(description='questions')
    def question_count(self, obj):
        return obj.questions.count()


@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ('quiz', 'index', 'type', 'points')
    list_filter = ('type', 'quiz__date')
    ordering = ('-quiz__date', 'index')


@admin.register(Attempt)
class AttemptAdmin(admin.ModelAdmin):
    list_display = ('player', 'quiz', 'score', 'total_time_ms', 'completed', 'finished')
    list_filter = ('completed', 'quiz__date')
    search_fields = ('player__nickname',)
    ordering = ('-quiz__date', '-score', 'total_time_ms')


@admin.register(AnswerRecord)
class AnswerRecordAdmin(admin.ModelAdmin):
    list_display = ('attempt', 'question', 'correct', 'elapsed_ms', 'elapsed_ms_raw')
    list_filter = ('correct',)
