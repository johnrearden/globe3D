from django.contrib import admin
from django.utils import timezone
from django.utils.html import format_html

from .models import Country, CountryContent


@admin.register(Country)
class CountryAdmin(admin.ModelAdmin):
    list_display = ('name', 'mesh_name', 'cca2', 'slug', 'region', 'subregion', 'landlocked', 'independent')
    list_filter = ('region', 'landlocked', 'independent')
    search_fields = ('name', 'mesh_name', 'cca2', 'cca3', 'slug')
    ordering = ('name',)
    # Editable, not prepopulated: the slug is a permanent public URL, so changing
    # it silently when a name is edited would break inbound links.
    readonly_fields = ()


@admin.register(CountryContent)
class CountryContentAdmin(admin.ModelAdmin):
    """Authoring surface for the static country pages.

    Built around the reviewing, not the typing: the whole point of this content is
    that a person vouched for it, so the list view leads with what is missing and
    how long each entry is, and publishing is an explicit action that stamps who
    did it.
    """

    list_display = (
        'country_name', 'status', 'missing_sections', 'word_count', 'has_sources',
        'reviewed_by', 'updated',
    )
    list_filter = ('status', 'country__region')
    search_fields = ('country__name', 'country__mesh_name', 'country__slug')
    ordering = ('country__name',)
    autocomplete_fields = ('country',)
    readonly_fields = ('created', 'updated', 'word_count')
    actions = ('mark_in_review', 'publish', 'unpublish')

    fieldsets = (
        (None, {'fields': ('country', 'status')}),
        ('Content', {
            'fields': ('summary', 'geography', 'history', 'literature'),
            'description': (
                'Plain prose — one paragraph per blank line. No HTML: it is rendered '
                'into a statically generated page. The summary also becomes the '
                'page&rsquo;s meta description, so it has to read standalone.'
            ),
        }),
        ('Provenance', {
            'fields': ('sources', 'reviewed_by', 'reviewed_at'),
            'description': (
                'Sources are not rendered. They exist so a claim can be traced later '
                '&mdash; the difference between curated content and merely plausible content.'
            ),
        }),
        ('Timestamps', {'fields': ('created', 'updated', 'word_count'), 'classes': ('collapse',)}),
    )

    @admin.display(description='Country', ordering='country__name')
    def country_name(self, obj):
        return obj.country.display_name

    @admin.display(description='Missing')
    def missing_sections(self, obj):
        missing = [
            label for label, value in (
                ('summary', obj.summary), ('geography', obj.geography),
                ('history', obj.history), ('literature', obj.literature),
            ) if not value.strip()
        ]
        if not missing:
            return format_html('<span style="color:#2e7d32">complete</span>')
        return format_html('<span style="color:#c62828">{}</span>', ', '.join(missing))

    @admin.display(description='Words', ordering='id')
    def word_count(self, obj):
        return obj.word_count

    @admin.display(description='Sources', boolean=True)
    def has_sources(self, obj):
        return bool(obj.sources.strip())

    @admin.action(description='Mark as in review')
    def mark_in_review(self, request, queryset):
        n = queryset.update(status=CountryContent.Status.IN_REVIEW)
        self.message_user(request, f'{n} moved to in review.')

    @admin.action(description='Publish (only if every section is filled)')
    def publish(self, request, queryset):
        published, skipped = 0, []
        for content in queryset:
            # Refuse incomplete entries rather than publishing a thin page. A page
            # with an empty section is worse than no page at all — it is exactly
            # what the AdSense reviewer is looking for.
            if not content.is_complete:
                skipped.append(content.country.display_name)
                continue
            content.status = CountryContent.Status.PUBLISHED
            content.reviewed_by = request.user.get_username()
            content.reviewed_at = timezone.now()
            content.save(update_fields=['status', 'reviewed_by', 'reviewed_at', 'updated'])
            published += 1
        if published:
            self.message_user(request, f'{published} published.')
        if skipped:
            self.message_user(
                request,
                f'Skipped {len(skipped)} with empty sections: {", ".join(skipped)}',
                level='WARNING',
            )

    @admin.action(description='Return to draft')
    def unpublish(self, request, queryset):
        n = queryset.update(status=CountryContent.Status.DRAFT)
        self.message_user(request, f'{n} returned to draft.')
