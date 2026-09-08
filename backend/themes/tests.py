from django.contrib.auth import get_user_model
from django.test import TestCase

from quiz.audit_auth import mint_token

from .models import Theme
from .tokens import EDITABLE_TOKENS, TokenValidationError, validate_tokens


class TokenValidationTests(TestCase):
    """The allow-list is generated; these pin the RULES, not the list.

    Accepted names are the 14 knobs. The retired-name cases matter more than the
    accepted ones: the legacy vocabulary is still what styles.css and the vanilla
    editor speak, so a theme authored there must be rejected, not stored to
    style nothing."""

    def test_accepts_the_generated_knobs(self):
        cleaned = validate_tokens({'--primary': '#3b82f6', '--radius-btn': '10px',
                                   '--font-body': "'Archivo', system-ui, sans-serif"})
        self.assertEqual(cleaned['--primary'], '#3b82f6')

    def test_the_allow_list_is_exactly_the_knobs(self):
        # 14, and only names a theme author may set. A derived value (--scrim,
        # --border-subtle) or a fixed one (--space-1, --status-correct) turning
        # up here would mean the generated block was edited by hand.
        self.assertEqual(len(EDITABLE_TOKENS), 14)
        for name in ('--scrim', '--border-subtle', '--space-1', '--status-correct',
                     '--globe-space', '--globe-label'):
            self.assertNotIn(name, EDITABLE_TOKENS)

    def test_rejects_the_legacy_vocabulary(self):
        # One from each legacy group: the accent, a surface, a text tier, a
        # weight, a font, a status colour. All were accepted before the cutover.
        for name in ('--accent', '--on-accent', '--bg-elevated', '--text-mid',
                     '--weight-bold', '--font-ui', '--ok', '--accent-secondary'):
            with self.assertRaises(TokenValidationError, msg=name):
                validate_tokens({name: '#000'})

    def test_accepts_rgba(self):
        cleaned = validate_tokens({'--bg-panel': 'rgba(14, 23, 38, 0.9)'})
        self.assertEqual(cleaned['--bg-panel'], 'rgba(14, 23, 38, 0.9)')

    def test_rejects_unknown_key(self):
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--totally-made-up': '#000'})

    def test_accepts_the_two_radius_knobs(self):
        cleaned = validate_tokens({'--radius-btn': '8px', '--radius-panel': '16px'})
        self.assertEqual(cleaned['--radius-panel'], '16px')

    def test_rejects_a_fixed_radius(self):
        # --radius-pill / --radius-circle are shapes, not knobs.
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--radius-pill': '4px'})

    def test_accepts_the_globe_knobs(self):
        # --ocean and --globe-border are knobs precisely so a theme can set
        # them; the scene background is NOT one (derived from --bg-app).
        cleaned = validate_tokens({'--ocean': '#061a33', '--globe-border': '#c9c9c9'})
        self.assertEqual(cleaned['--ocean'], '#061a33')
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--globe-space': '#000'})

    def test_rejects_selector_breakout(self):
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--primary': 'red; } body{display:none}'})

    def test_rejects_url_value(self):
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--bg-app': 'url(http://evil/x)'})

    def test_rejects_overlong(self):
        with self.assertRaises(TokenValidationError):
            validate_tokens({'--primary': '#' + 'a' * 64})


class ThemeApiTests(TestCase):
    def setUp(self):
        User = get_user_model()
        self.superuser = User.objects.create_superuser('admin', 'a@x.com', 'pw')
        self.token = mint_token(self.superuser)
        Theme.objects.create(name='Published One', tokens={'--primary': '#111111'})
        Theme.objects.create(name='Draft One', is_published=False,
                             tokens={'--primary': '#222222'})

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
                               data={'name': 'Ocean', 'tokens': {'--primary': '#0088ff'}},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 201)
        theme = Theme.objects.get(name='Ocean')
        self.assertEqual(theme.tokens, {'--primary': '#0088ff'})
        self.assertEqual(theme.created_by, 'admin')

    def test_create_rejects_a_legacy_theme(self):
        # The vanilla theme-editor still speaks the old names. It must get a
        # 400, not a stored theme that styles nothing on the token-built app.
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Old', 'tokens': {'--accent': '#0088ff'}},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 400)
        self.assertFalse(Theme.objects.filter(name='Old').exists())

    def test_base_and_scene_colours_are_ignored_not_stored(self):
        # Retired input fields. A stale client sending them gets a theme, not an
        # error — and nothing of them survives, since the columns are gone.
        res = self.client.post(
            '/api/admin/themes',
            data={'name': 'Stale', 'tokens': {}, 'base': 'soft',
                  'sceneBg': '#101820', 'oceanColor': 'rgb(8, 30, 57)'},
            content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 201)
        body = res.json()
        for gone in ('base', 'sceneBg', 'oceanColor'):
            self.assertNotIn(gone, body)

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

    def test_create_round_trips_the_country_scheme(self):
        res = self.client.post(
            '/api/admin/themes',
            data={'name': 'Sepia', 'tokens': {}, 'countryScheme': 'browns'},
            content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['countryScheme'], 'browns')
        self.assertEqual(Theme.objects.get(name='Sepia').country_scheme, 'browns')

    def test_scheme_is_optional(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Plain', 'tokens': {}},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 201)
        self.assertEqual(res.json()['countryScheme'], '')

    def test_public_list_exposes_the_scheme(self):
        Theme.objects.create(name='Blue World', country_scheme='blues')
        res = self.client.get('/api/themes')
        row = next(t for t in res.json() if t['name'] == 'Blue World')
        self.assertEqual(row['countryScheme'], 'blues')

    def test_create_rejects_unknown_scheme(self):
        res = self.client.post('/api/admin/themes',
                               data={'name': 'Weird', 'tokens': {},
                                     'countryScheme': 'rainbow'},
                               content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 400)

    def test_update_and_delete(self):
        t = Theme.objects.create(name='Temp', tokens={})
        res = self.client.put(f'/api/admin/themes/{t.pk}',
                              data={'name': 'Temp2', 'tokens': {'--primary': '#010101'}},
                              content_type='application/json', **self._hdr())
        self.assertEqual(res.status_code, 200)
        t.refresh_from_db()
        self.assertEqual(t.name, 'Temp2')
        self.assertEqual(t.tokens['--primary'], '#010101')

        res = self.client.delete(f'/api/admin/themes/{t.pk}', **self._hdr())
        self.assertEqual(res.status_code, 204)
        self.assertFalse(Theme.objects.filter(pk=t.pk).exists())
