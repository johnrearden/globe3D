from django.db import models

from .tokens import COUNTRY_SCHEMES


class Theme(models.Model):
    """A named set of design-token overrides, authored by an admin and picked
    by test users.

    `tokens` is a {"--knob": "value"} map over the 14 authorable knobs
    (themes/tokens.py, generated from packages/design-tokens). There is no base
    preset: the built tokens.css is one `:root` block and a theme is purely the
    deviation from it — the same shape as packages/design-tokens/theme.json.
    Writes are superuser-gated (themes/views.py, reusing the audit token);
    reading published themes is public.

    The globe's space and ocean colours are derived from the --bg-app and
    --ocean knobs, so they are not stored separately. The country colour scheme
    is: it is a palette key rather than a colour, and no knob implies it.
    Empty = inherit the app default.
    """

    name = models.CharField(max_length=80, unique=True, db_index=True)
    tokens = models.JSONField(default=dict)
    country_scheme = models.CharField(
        max_length=16, blank=True, default='',
        choices=[(s, s.title()) for s in COUNTRY_SCHEMES],
        help_text='Country color scheme (js/features/color-schemes.js). Empty = default.')
    is_published = models.BooleanField(
        default=True, help_text='Visible to test users in the theme selector.')
    created_by = models.CharField(max_length=150, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ('name',)

    def __str__(self):
        return self.name
