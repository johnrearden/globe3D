from django.contrib import admin

from .models import Country


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ('name', 'mesh_name', 'cca2', 'region', 'subregion', 'landlocked', 'independent')
    list_filter = ('region', 'landlocked', 'independent')
    search_fields = ('name', 'mesh_name', 'cca2', 'cca3')
    ordering = ('name',)
