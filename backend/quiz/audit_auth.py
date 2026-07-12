"""Signed-token access for the superuser audit API.

The static frontend is served cross-origin, so instead of session cookies the
audit flow works like this: a superuser logs into Django and visits
/audit/launch, which mints a signed expiring token and hands it to the
frontend via the ?audit= query param. The frontend sends it back on every
audit request as the X-Audit-Token header. Superuser status is re-checked on
each request, so revoking it invalidates outstanding tokens immediately.

The custom header forces a CORS preflight, so browsers can't be tricked into
firing authenticated audit requests cross-site (no CSRF surface).
"""

from functools import wraps

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import signing
from rest_framework.exceptions import NotAuthenticated, PermissionDenied

SALT = 'terragotcha.quiz.audit'
HEADER = 'HTTP_X_AUDIT_TOKEN'


def mint_token(user):
    return signing.TimestampSigner(salt=SALT).sign(str(user.pk))


def verify_token(raw):
    """Return the superuser the token was minted for, or raise a DRF error."""
    if not raw:
        raise NotAuthenticated('Missing X-Audit-Token header.')
    try:
        pk = signing.TimestampSigner(salt=SALT).unsign(
            raw, max_age=settings.AUDIT_TOKEN_MAX_AGE,
        )
    except signing.SignatureExpired:
        raise NotAuthenticated('Audit token expired — visit /audit/launch again.')
    except signing.BadSignature:
        raise NotAuthenticated('Invalid audit token.')
    user = get_user_model().objects.filter(
        pk=pk, is_active=True, is_superuser=True,
    ).first()
    if user is None:
        raise PermissionDenied('Audit access requires an active superuser.')
    return user


def require_audit(view):
    """Decorator for @api_view functions; sets request.audit_user."""
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        request.audit_user = verify_token(request.META.get(HEADER, '').strip())
        return view(request, *args, **kwargs)
    return wrapped
