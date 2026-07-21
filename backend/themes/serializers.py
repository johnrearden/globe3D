from rest_framework import serializers

from .models import Theme
from .tokens import (BASE_THEMES, COUNTRY_SCHEMES, ColorValidationError,
                     TokenValidationError, validate_color, validate_tokens)


class ThemeSerializer(serializers.ModelSerializer):
    """Public output shape (camelCase)."""

    isPublished = serializers.BooleanField(source='is_published', read_only=True)
    createdBy = serializers.CharField(source='created_by', read_only=True)
    sceneBg = serializers.CharField(source='scene_bg', read_only=True)
    oceanColor = serializers.CharField(source='ocean_color', read_only=True)
    countryScheme = serializers.CharField(source='country_scheme', read_only=True)

    class Meta:
        model = Theme
        fields = ['id', 'name', 'base', 'tokens', 'isPublished', 'createdBy',
                  'sceneBg', 'oceanColor', 'countryScheme', 'updated']


class ThemeInputSerializer(serializers.Serializer):
    """Input for create/update (superuser)."""

    name = serializers.CharField(max_length=80)
    base = serializers.ChoiceField(choices=BASE_THEMES, default='default')
    tokens = serializers.DictField(child=serializers.CharField(), default=dict)
    isPublished = serializers.BooleanField(source='is_published', default=True)
    # 3D scene appearance (empty = inherit the app default).
    sceneBg = serializers.CharField(source='scene_bg', max_length=32,
                                    allow_blank=True, required=False, default='')
    oceanColor = serializers.CharField(source='ocean_color', max_length=32,
                                       allow_blank=True, required=False, default='')
    countryScheme = serializers.ChoiceField(source='country_scheme',
                                            choices=list(COUNTRY_SCHEMES) + [''],
                                            required=False, default='')

    def validate_tokens(self, value):
        try:
            return validate_tokens(value)
        except TokenValidationError as e:
            raise serializers.ValidationError(str(e))

    def validate_sceneBg(self, value):
        try:
            return validate_color(value)
        except ColorValidationError as e:
            raise serializers.ValidationError(str(e))

    def validate_oceanColor(self, value):
        try:
            return validate_color(value)
        except ColorValidationError as e:
            raise serializers.ValidationError(str(e))
