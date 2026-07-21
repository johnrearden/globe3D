from django.db import models

from .tokens import BASE_THEMES, COUNTRY_SCHEMES


class Theme(models.Model):
    """A named set of CSS design-token overrides, authored by an admin and picked
    by test users.

    `tokens` is a {"--var": "value"} map layered on top of the built-in `base`
    preset (see js/features/theme-switcher.js). Writes are superuser-gated
    (themes/views.py, reusing the audit token); reading published themes is public.

    The 3D scene lives outside CSS, so its themeable look is stored in dedicated
    fields (scene background, ocean color, country color scheme) and applied
    imperatively by js/features/scene-appearance.js. Empty = inherit the app
    default.
    """

    name = models.CharField(max_length=80, unique=True, db_index=True)
    base = models.CharField(
        max_length=20, default='default',
        choices=[(t, t.title()) for t in BASE_THEMES],
        help_text='Built-in preset the token overrides are layered on.',
    )
    tokens = models.JSONField(default=dict)
    # Three.js scene appearance (empty string = use the built-in default).
    scene_bg = models.CharField(
        max_length=32, blank=True, default='',
        help_text='Space color behind the globe (hex/rgb). Empty = default.')
    ocean_color = models.CharField(
        max_length=32, blank=True, default='',
        help_text='Ocean/water color (hex/rgb). Empty = default.')
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
