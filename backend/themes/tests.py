from django.contrib.auth import get_user_model
from django.test import TestCase

from quiz.audit_auth import mint_token

from .models import Theme
from .tokens import (ColorValidationError, TokenValidationError,
                     validate_color, validate_tokens)


class TokenValidationTests(TestCase):
    def test_accepts_known_tokens(self):
        cleaned = validate_tokens({'--accent': '#3b82f6', '--radius-btn': '10px',
                                   '--font-ui': "'Archivo', system-ui, sans-serif"})
        self.assertEqual(cleaned['--accent'], '#3b82f6')

    def test_rejects_a_retired_font_token(self):
        # Fonts collapsed to --font-display/--font-ui; base/mono are gone.
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--font-base': 'Arial, sans-serif'})

    def test_accepts_rgba(self):
        cleaned = validate_tokens({'--scrim': 'rgba(0, 0, 0, 0.6)'})
        self.assertEqual(cleaned['--scrim'], 'rgba(0, 0, 0, 0.6)')

    def test_rejects_unknown_key(self):
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--totally-made-up': '#000'})

    def test_accepts_the_two_radius_knobs(self):
        cleaned = validate_tokens({'--radius-btn': '8px', '--radius-panel': '16px'})
        self.assertEqual(cleaned['--radius-panel'], '16px')

    def test_rejects_a_retired_radius_token(self):
        # Radii were collapsed to --radius-btn/--radius-panel; the old ones are gone.
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--radius-modal': '16px'})

    def test_accepts_surface_and_scrim_tokens(self):
        cleaned = validate_tokens({'--bg-panel': 'rgba(14, 23, 38, 0.9)',
                                   '--bg-elevated': '#16283c', '--scrim': 'rgba(0, 0, 0, 0.6)'})
        self.assertIn('--bg-panel', cleaned)

    def test_rejects_a_retired_surface_token(self):
        # Surfaces collapsed to app/panel/elevated; bg-deep/raised/overlay are gone.
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--bg-overlay': '#000'})

    def test_accepts_accent_and_on_accent(self):
        cleaned = validate_tokens({'--accent': '#3b82f6', '--on-accent': '#08131f'})
        self.assertEqual(cleaned['--accent'], '#3b82f6')

    def test_rejects_a_retired_accent_token(self):
        # Accent collapsed to --accent (+ --on-accent); accent-amber/soft are gone.
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--accent-amber': '#f59e4b'})

    def test_rejects_selector_breakout(self):
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--accent': 'red; } body{display:none}'})

    def test_rejects_url_value(self):
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--bg-app': 'url(http://evil/x)'})


class ColorValidationTests(TestCase):
    def test_accepts_hex(self):
        self.assertEqual(validate_color('#0a1c30'), '#0a1c30')
        self.assertEqual(validate_color('#abc'), '#abc')

    def test_accepts_rgb_and_rgba(self):
        self.assertEqual(validate_color('rgb(8, 30, 57)'), 'rgb(8, 30, 57)')
        self.assertEqual(validate_color('rgba(8, 30, 57, 0.5)'), 'rgba(8, 30, 57, 0.5)')

    def test_empty_means_inherit(self):
        self.assertEqual(validate_color(''), '')
        self.assertEqual(validate_color(None), '')

    def test_rejects_url_and_breakout(self):
        with self.assertRaises(ColorValidationError):
            validate_color('url(http://evil/x)')
        with self.assertRaises(ColorValidationError):
            validate_color('#000; } body{display:none}')

    def test_rejects_overlong(self):
        with self.assertRaises(ColorValidationError):
            validate_color('#' + 'a' * 64)


class ThemeApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.superuser = User.objects.create_superuser('admin', 'a@x.com', 'pw')
        self.token = mint_token(self.superuser)
        Theme.objects.create(name='Published One', tokens={'--accent': '#111111'})
        Theme.objects.create(name='Draft One', is_published=False,
                             tokens={'--accent': '#222222'})

    def _hdr(self):
        return {'HTTP_X_AUDIT_TOKEN': self.token}

    def test_public_list_only_published(self):
        res = self.client.get('/api/themes')
        self.assertEqual(res.status_code, 200)
        names = [t['name'] for t in res.json()]
        self.assertIn('Published One', names)
        self.assertNotIn('Draft One', names)

    def test_admin_list_requires_token(self):
        self.assertIn(self.client.get('/api/admin/themes').status_code, (401, 403))

    def test_admin_list_with_token_sees_drafts(self):
        res = self.client.get('/api/admin/themes', **self._hdr())
        self.assertEqual(res.status_code, 200)
        self.assertIn('Draft One', [t['name'] for t in res.json()])

    def test_create_requires_token(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'X', 'tokens': {}},
                               content_type='application/json')
        self.assertIn(res.status_code, (401, 403))
        self.assertFalse(Theme.objects.filter(name='X').exists())

    def test_create_with_token(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Ocean', 'base': 'soft',
                                     'tokens': {'--accent': '#0088ff'}},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 201)
        theme = Theme.objects.get(name='Ocean')
        self.assertEqual(theme.base, 'soft')
        self.assertEqual(theme.created_by, 'admin')

    def test_create_rejects_bad_token_map(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Bad', 'tokens': {'--nope': 'x'}},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 400)

    def test_create_rejects_duplicate_name(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Published One', 'tokens': {}},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 400)

    def test_create_round_trips_scene_appearance(self):
        res = self.client.post(
            '/api/admin/themes',
            data={'name': 'Sepia', 'tokens': {},
                  'sceneBg': '#101820', 'oceanColor': 'rgb(8, 30, 57)',
                  'countryScheme': 'browns'},
            content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body['sceneBg'], '#101820')
        self.assertEqual(body['oceanColor'], 'rgb(8, 30, 57)')
        self.assertEqual(body['countryScheme'], 'browns')
        theme = Theme.objects.get(name='Sepia')
        self.assertEqual(theme.scene_bg, '#101820')
        self.assertEqual(theme.country_scheme, 'browns')

    def test_scene_fields_are_optional(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Plain', 'tokens': {}},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 201)
        body = res.json()
        self.assertEqual(body['sceneBg'], '')
        self.assertEqual(body['countryScheme'], '')

    def test_public_list_exposes_scene_fields(self):
        Theme.objects.create(name='Blue World', scene_bg='#001133',
                             country_scheme='blues')
        res = self.client.get('/api/themes')
        row = next(t for t in res.json() if t['name'] == 'Blue World')
        self.assertEqual(row['sceneBg'], '#001133')
        self.assertEqual(row['countryScheme'], 'blues')

    def test_create_rejects_bad_scene_color(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Evil', 'tokens': {},
                                     'sceneBg': 'url(http://evil/x)'},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Theme.objects.filter(name='Evil').exists())

    def test_create_rejects_unknown_scheme(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Weird', 'tokens': {},
                                     'countryScheme': 'rainbow'},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 400)

    def test_update_and_delete(self):
        t = Theme.objects.create(name='Temp', tokens={})
        res = self.client.put(f'/api/admin/themes/{t.pk}',
                              data={'name': 'Temp2', 'tokens': {'--accent': '#010101'}},
                              content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 200)
        t.refresh_from_db()
        self.assertEqual(t.name, 'Temp2')
        self.assertEqual(t.tokens['--accent'], '#010101')

        res = self.client.delete(f'/api/admin/themes/{t.pk}', **self._hdr())
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Theme.objects.filter(pk=t.pk).exists())
