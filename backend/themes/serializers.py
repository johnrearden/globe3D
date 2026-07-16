from rest_framework import serializers

from .models import Theme
from .tokens import BASE_THEMES, TokenValidationError, validate_tokens


class ThemeSerializer(serializers.ModelSerializer):
    """Public output shape (camelCase)."""

    isPublished = serializers.BooleanField(source='is_published', read_only=True)
    createdBy = serializers.CharField(source='created_by', read_only=True)

    class Meta:
        model = Theme
        fields = ['id', 'name', 'base', 'tokens', 'isPublished', 'createdBy', 'updated']


class ThemeInputSerializer(serializers.Serializer):
    """Input for create/update (superuser)."""

    name = serializers.CharField(max_length=80)
    base = serializers.ChoiceField(choices=BASE_THEMES, default='default')
    tokens = serializers.DictField(child=serializers.CharField(), default=dict)
    isPublished = serializers.BooleanField(source='is_published', default=True)

    def validate_tokens(self, value):
        try:
            return validate_tokens(value)
        except TokenValidationError as e:
            raise serializers.ValidationError(str(e))
