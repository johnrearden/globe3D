from rest_framework import serializers

from .models import Player


class PlayerProfileSerializer(serializers.ModelSerializer):
    """Public profile shape returned to the client."""

    adsRemoved = serializers.BooleanField(source='ads_removed', read_only=True)

    class Meta:
        model = Player
        fields = ['nickname', 'country', 'adsRemoved']


class RegisterPlayerSerializer(serializers.Serializer):
    """Input for POST /api/players (register/update by device token)."""

    deviceToken = serializers.CharField(max_length=64)
    nickname = serializers.CharField(max_length=40)
    country = serializers.CharField(max_length=64, required=False, allow_blank=True, default='')
