"""Device-token resolution for the public quiz API.

Players are identified by the opaque `X-Device-Token` header. This is not real
authentication (anyone can present any token) — it's a stable handle for the
anonymous identity, sufficient for the leaderboard and the one-attempt-per-day
rule. Treat it accordingly; the model is built to be upgraded to real accounts.
"""

from rest_framework.exceptions import NotAuthenticated

from .models import Player

HEADER = 'HTTP_X_DEVICE_TOKEN'


def get_device_token(request):
    token = request.META.get(HEADER, '').strip()
    if not token:
        raise NotAuthenticated('Missing X-Device-Token header.')
    return token


def get_player(request):
    """Return the Player for the request's device token, or raise NotAuthenticated.

    Does not create the player — registration happens via POST /api/players.
    """
    token = get_device_token(request)
    try:
        return Player.objects.get(device_token=token)
    except Player.DoesNotExist:
        raise NotAuthenticated('Unknown device token; register via POST /api/players first.')
