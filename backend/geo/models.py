from django.utils.text import slugify

from django.db import models


class Country(models.Model):
    """Country reference data, seeded from a vendored restcountries snapshot.

    This is the backbone the quiz generators draw on. The frontend globe knows
    countries only by display *name* (from world-geojson) + centroid/bbox; it has
    no neighbours, landlocked flag, capitals or continents. So this table owns all
    of that, and is reconciled back to the frontend by ISO-2 (`cca2`) plus a small
    alias table for names that differ between the two datasets.
    """

    cca2 = models.CharField(max_length=2, unique=True)
    cca3 = models.CharField(max_length=3, blank=True)

    # `name` is the restcountries common name; `mesh_name` is the frontend's
    # world-geojson display name (what the client renders/picks by). They are
    # usually identical; mesh_name is what the API speaks to the client.
    name = models.CharField(max_length=128)
    mesh_name = models.CharField(max_length=128, blank=True, db_index=True)

    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)

    # Land area in km² (restcountries `area`); used to keep tiny countries out of
    # map-click questions where they'd be near-impossible to tap.
    area = models.FloatField(null=True, blank=True)

    capital = models.CharField(max_length=128, blank=True)
    capital_lat = models.FloatField(null=True, blank=True)
    capital_lng = models.FloatField(null=True, blank=True)

    landlocked = models.BooleanField(default=False)
    independent = models.BooleanField(default=True)

    region = models.CharField(max_length=64, blank=True)
    subregion = models.CharField(max_length=64, blank=True)
    continents = models.JSONField(default=list)

    # Neighbours as a list of cca3 codes (restcountries `borders`).
    borders = models.JSONField(default=list)

    flag_iso = models.CharField(max_length=2, blank=True)

    # URL slug for the static country page (/country/<slug>). Stored rather than
    # derived at build time because it is a permanent public URL: regenerating it
    # from a name that later gets edited would silently break every inbound link
    # and every internal <a href>. Backfilled from display_name by the migration;
    # editable in admin for the handful where the derived form reads badly.
    slug = models.SlugField(max_length=140, unique=True, blank=True, db_index=True)

    class Meta:
        verbose_name_plural = 'countries'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.cca2})'

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.display_name)
        super().save(*args, **kwargs)

    @property
    def display_name(self):
        """The name the client speaks: the reconciled mesh name when known."""
        return self.mesh_name or self.name


class CountryContent(models.Model):
    """Hand-authored editorial content for a country's static page.

    Deliberately a separate table from ``Country`` rather than extra fields on it,
    because the two have opposite lifecycles: ``Country`` is *seeded* — wiped and
    rewritten by ``seed_countries`` from a vendored restcountries snapshot —
    whereas this is *written*, slowly, by a person. Editorial work must not be
    destroyable by a reseed.

    This content is the entire point of the static country pages: AdSense
    rejected the site for "low quality content" because the client-rendered shell
    has no substantive text in its initial HTML response. Scraped or bulk-generated
    filler is exactly what that check flags, so the workflow below is built around
    a human signing off each country rather than around volume.
    """

    class Status(models.TextChoices):
        DRAFT = 'draft', 'Draft'
        IN_REVIEW = 'in_review', 'In review'
        PUBLISHED = 'published', 'Published'

    country = models.OneToOneField(
        Country, on_delete=models.CASCADE, related_name='content',
    )

    # One or two sentences. Doubles as the page's <meta name="description"> and
    # the docked panel's peeking state, so it has to stand alone out of context.
    summary = models.TextField(blank=True)

    # The three editorial layers. Plain prose, one paragraph per blank line —
    # deliberately not HTML, so a stored field can never inject markup into a
    # statically generated page.
    geography = models.TextField(blank=True)
    history = models.TextField(blank=True)
    literature = models.TextField(blank=True)

    # Where the facts came from. Not rendered; it exists so a claim can be traced
    # when someone questions it, which is the difference between curated content
    # and plausible content.
    sources = models.TextField(
        blank=True, help_text='One source per line: URL or citation.',
    )

    status = models.CharField(
        max_length=16, choices=Status.choices, default=Status.DRAFT, db_index=True,
    )

    # Who checked it, and when. A country reaches PUBLISHED only through a person;
    # the export refuses anything else.
    reviewed_by = models.CharField(max_length=150, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'country content'
        ordering = ['country__name']

    def __str__(self):
        return f'{self.country.display_name} content ({self.status})'

    @property
    def is_complete(self):
        """Every layer present. Publishing an empty section is worse than having
        no page: a thin page is precisely what the AdSense reviewer is looking
        for."""
        return all([
            self.summary.strip(),
            self.geography.strip(),
            self.history.strip(),
            self.literature.strip(),
        ])

    @property
    def word_count(self):
        return sum(
            len(field.split())
            for field in (self.summary, self.geography, self.history, self.literature)
        )
