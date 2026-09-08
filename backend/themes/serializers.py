from rest_framework import serializers

from .models import Theme
from .tokens import COUNTRY_SCHEMES, TokenValidationError, validate_tokens


class ThemeSerializer(serializers.ModelSerializer):
    """Public output shape (camelCase)."""

    isPublished = serializers.BooleanField(source='is_published', read_only=True)
    createdBy = serializers.CharField(source='created_by', read_only=True)
    countryScheme = serializers.CharField(source='country_scheme', read_only=True)

    class Meta:
        model = Theme
        fields = ['id', 'name', 'tokens', 'isPublished', 'createdBy',
                  'countryScheme', 'updated']


class ThemeInputSerializer(serializers.Serializer):
    """Input for create/update (superuser)."""

    name = serializers.CharField(max_length=80)
    tokens = serializers.DictField(child=serializers.CharField(), default=dict)
    isPublished = serializers.BooleanField(source='is_published', default=True)
    # Palette key for the globe (empty = inherit the app default).
    countryScheme = serializers.ChoiceField(source='country_scheme',
                                            choices=list(COUNTRY_SCHEMES) + [''],
                                            required=False, default='')

    def validate_tokens(self, value):
        try:
            return validate_tokens(value)
        except TokenValidationError as e:
            raise serializers.ValidationError(str(e))
