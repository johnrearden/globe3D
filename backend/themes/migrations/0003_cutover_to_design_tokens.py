"""B9 — the backend token cutover.

The allow-list in themes/tokens.py is now the 14 knobs generated from
packages/design-tokens. Every stored Theme names tokens from the legacy 24-token
vocabulary (--accent, --text-mid, --bg-elevated, ...) that the new list rejects,
so the rows are deleted rather than migrated: there is no mapping from the old
names to the new ones that would produce a theme anyone authored, and the
feature is superuser-gated with test users only.

Three columns go with them. `base` named a styles.css preset
(:root[data-theme="soft"|"sharp"|"mono"]) that the token-built app does not
have; `scene_bg` and `ocean_color` are now derived from the --bg-app and
--ocean knobs. `country_scheme` stays — it is a palette key, not a colour.
"""
from django.db import migrations


def drop_legacy_themes(apps, schema_editor):
    Theme = apps.get_model('themes', 'Theme')
    Theme.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('themes', '0002_theme_country_scheme_theme_ocean_color_and_more'),
    ]

    operations = [
        # Rows first, while the columns they depend on still exist.
        migrations.RunPython(drop_legacy_themes, migrations.RunPython.noop),
        migrations.RemoveField(model_name='theme', name='base'),
        migrations.RemoveField(model_name='theme', name='scene_bg'),
        migrations.RemoveField(model_name='theme', name='ocean_color'),
    ]
