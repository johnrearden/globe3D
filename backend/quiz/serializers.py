from rest_framework import serializers


def sanitized_question(question):
    """The client-safe payload for a question (already answer-free)."""
    return question.payload


def leaderboard_entry(attempt, rank):
    return {
        'rank': rank,
        'nickname': attempt.player.nickname,
        'country': attempt.player.country,
        'score': attempt.score,
        'timeMs': attempt.total_time_ms,
    }


class AnswerInputSerializer(serializers.Serializer):
    attemptId = serializers.IntegerField()
    index = serializers.IntegerField(min_value=0)
    # answer may be a single value or a list of values (multi-select)
    answer = serializers.JSONField()
    elapsedMs = serializers.IntegerField(min_value=0)
