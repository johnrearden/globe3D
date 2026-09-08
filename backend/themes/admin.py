from django.contrib import admin

from .models import Theme


@admin.register(Theme)
class ThemeAdmin(admin.ModelAdmin):
    list_display = ('name', 'country_scheme', 'is_published', 'created_by', 'updated')
    list_filter = ('is_published', 'country_scheme')
    search_fields = ('name', 'created_by')
    readonly_fields = ('created', 'updated')
    ordering = ('name',)
