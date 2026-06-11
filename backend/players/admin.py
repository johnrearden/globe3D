from django.contrib import admin

from .models import Player


@admin.register(Player)
class PlayerAdmin(admin.ModelAdmin):
    list_display = ('nickname', 'country', 'ads_removed', 'email', 'created')
    list_filter = ('ads_removed', 'country')
    search_fields = ('nickname', 'device_token', 'email')
    readonly_fields = ('device_token', 'created', 'updated')
    ordering = ('-created',)
