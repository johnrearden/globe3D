from django.db import models


class Player(models.Model):
    """A quiz participant.

    v1 identity is anonymous: an opaque device token (generated client-side,
    stored in localStorage) plus a chosen nickname + country. The model already
    carries the fields a later milestone needs — `email` for account upgrade and
    `ads_removed` / `stripe_customer_id` for the Stripe "remove ads" purchase —
    so adding those flows is additive, no migration of existing rows required.
    """

    device_token = models.CharField(max_length=64, unique=True, db_index=True)
    nickname = models.CharField(max_length=40)
    country = models.CharField(max_length=64, blank=True)

    # Reserved for the later account-upgrade + billing milestone (unused in v1).
    email = models.EmailField(blank=True, null=True, unique=True)
    ads_removed = models.BooleanField(default=False)
    stripe_customer_id = models.CharField(max_length=64, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.nickname} ({self.device_token[:8]}…)'
