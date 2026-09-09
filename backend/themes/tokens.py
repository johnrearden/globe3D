"""Allow-list + validation for theme token maps.

The allow-list between the GENERATED markers is written by
`npm run build:tokens` from packages/design-tokens/src/tokens.js — the design
system's single source of truth — and `npm test` fails if it is stale. Do not
edit it by hand; add a knob there and rebuild.

A theme is a map of CSS custom-property overrides ({"--primary": "#3b82f6", ...})
layered over the generated `:root` block in packages/design-tokens/dist/tokens.css.
Only the 14 authorable knobs may be set: every other value in the system is
either fixed (status colours, the type and spacing scales) or derived from a
knob, so a stored theme is small and cannot break comprehension. The list also
doubles as an injection guard — keys outside it are rejected, and values are
constrained to a safe CSS charset, so no url()/selector break-out is possible.

The globe follows the same knobs: --bg-app drives the scene background (via the
derived --globe-space) and --ocean the water, applied through
GlobeAppearance.setThemeColors. The country colour SCHEME is the one thing a
theme pins that is not a token — it is a palette key, never colours.

The validation below the allow-list is hand-maintained and stays: the value
charset and length cap are security-relevant and do not change when a knob is
added.
"""
import re

# Country color schemes a theme can pin for the 3D globe. MUST mirror the SCHEMES
# keys in js/data/color-schemes.js (both are the source of the picker options).
COUNTRY_SCHEMES = ('vibrant', 'greens', 'browns', 'uniform', 'blues', 'purples', 'greys')

# --- BEGIN GENERATED: @terragotcha/design-tokens ---
# Regenerate with: npm run build:tokens
# Source of truth: packages/design-tokens/src/tokens.js
#
# 14 authorable knobs. Everything else in the design system is
# either fixed (type/spacing scales, elevation, status colours, pill/circle
# radii) or derived in JS from these — see that file for which and why.

FONT_TOKENS = (
    '--font-heading',
    '--font-body',
)

RADIUS_TOKENS = (
    '--radius-btn',
    '--radius-panel',
)

COLOR_TOKENS = (
    '--bg-app',
    '--bg-panel',
    '--surface-raised',
    '--surface-inset',
    '--primary',
    '--on-primary',
    '--text-primary',
    '--text-secondary',
    '--ocean',
    '--globe-border',
)

EDITABLE_TOKENS = frozenset((
    '--font-heading',
    '--font-body',
    '--bg-app',
    '--bg-panel',
    '--surface-raised',
    '--surface-inset',
    '--primary',
    '--on-primary',
    '--text-primary',
    '--text-secondary',
    '--ocean',
    '--globe-border',
    '--radius-btn',
    '--radius-panel',
))
# --- END GENERATED ---

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
