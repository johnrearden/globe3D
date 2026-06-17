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

    class Meta:
        verbose_name_plural = 'countries'
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.cca2})'

    @property
    def display_name(self):
        """The name the client speaks: the reconciled mesh name when known."""
        return self.mesh_name or self.name
