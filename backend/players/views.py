from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Player
from .serializers import PlayerProfileSerializer, RegisterPlayerSerializer


@api_view(['POST'])
def register_player(request):
    """Register or update a player by device token (idempotent).

    The client generates and stores its own device token; this upserts the
    nickname/country for that token. Existing entitlements (ads_removed, email)
    are preserved.
    """
    serializer = RegisterPlayerSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    player, _ = Player.objects.update_or_create(
        device_token=data['deviceToken'],
        defaults={'nickname': data['nickname'], 'country': data.get('country', '')},
    )
    return Response(PlayerProfileSerializer(player).data, status=status.HTTP_200_OK)
