"""Allow-list + validation for theme token maps.

A theme is a map of CSS custom-property overrides ({"--accent": "#3b82f6", ...})
layered on a built-in base preset. Only the curated ~26 "knob" tokens the built-in
presets control may be set — this keeps stored themes to the intended surface and
doubles as an injection guard (keys outside the list are rejected; values are
constrained to a safe CSS charset, so no url()/selector break-out is possible).

Mirrors the semantic tokens + scales in the styles.css :root block. If a token is
added/removed there, update the corresponding list here.
"""
import re

# Built-in presets a theme can layer on (js/features/theme-switcher.js THEMES).
BASE_THEMES = ('default', 'soft', 'sharp', 'mono')

FONT_TOKENS = ('--font-display', '--font-ui')
WEIGHT_TOKENS = ('--weight-normal', '--weight-medium', '--weight-semibold', '--weight-bold')
# Two editable roundness knobs. --radius-pill / --radius-circle are fixed shapes,
# deliberately NOT editable (a theme can't change them).
RADIUS_TOKENS = ('--radius-btn', '--radius-panel')
COLOR_TOKENS = (
    '--accent', '--on-accent',
    '--bg-app', '--bg-panel', '--bg-elevated', '--scrim',
    '--border-subtle', '--white', '--black',
    '--text-heading', '--text-mid', '--text-low', '--text-soft', '--ok', '--bad',
)
EDITABLE_TOKENS = frozenset(FONT_TOKENS + WEIGHT_TOKENS + RADIUS_TOKENS + COLOR_TOKENS)

MAX_VALUE_LEN = 64
# Whitelist of characters real token values need: hex (#), rgb()/rgba() (digits,
# parens, comma, dot, %, spaces), lengths (px/%), and font stacks (letters, both
# quote styles, commas, spaces, hyphens). Structural CSS chars (; { } < > : / etc.)
# are excluded, which also blocks url(...) and selector break-out.
_VALUE_RE = re.compile(r"""^[A-Za-z0-9#().,%'"\s-]+$""")


class TokenValidationError(ValueError):
    """Raised when a token map has a disallowed key or unsafe value."""


def validate_tokens(tokens):
    """Validate a {token: value} map; return a cleaned dict or raise TokenValidationError."""
    if not isinstance(tokens, dict):
        raise TokenValidationError('tokens must be an object.')
    cleaned = {}
    for key, value in tokens.items():
        if key not in EDITABLE_TOKENS:
            raise TokenValidationError(f'Unknown or non-editable token: {key}')
        if not isinstance(value, str):
            raise TokenValidationError(f'{key}: value must be a string.')
        v = value.strip()
        if not v or len(v) > MAX_VALUE_LEN:
            raise TokenValidationError(f'{key}: value must be 1-{MAX_VALUE_LEN} characters.')
        if not _VALUE_RE.match(v):
            raise TokenValidationError(f'{key}: value contains invalid characters.')
        cleaned[key] = v
    return cleaned
