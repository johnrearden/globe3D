from django.contrib import admin

from .models import Theme


@admin.register(Theme)
class ThemeAdmin(admin.ModelAdmin):
    list_display = ('name', 'base', 'is_published', 'created_by', 'updated')
    list_filter = ('is_published', 'base')
    search_fields = ('name', 'created_by')
    readonly_fields = ('created', 'updated')
    ordering = ('name',)
