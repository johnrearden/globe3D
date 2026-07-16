"""Theme API.

Public read (published themes) + superuser-gated write, reusing the audit-token
gate (quiz.audit_auth.require_audit). Mirrors the /api/audit/* split: public
consumers hit /api/themes; admins hit /api/admin/themes[/<pk>].
"""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from quiz.audit_auth import require_audit

from .models import Theme
from .serializers import ThemeInputSerializer, ThemeSerializer


@api_view(['GET'])
def theme_list(request):
    """Public: published themes for the settings-gear selector."""
    themes = Theme.objects.filter(is_published=True)
    return Response(ThemeSerializer(themes, many=True).data)


@api_view(['GET', 'POST'])
@require_audit
def admin_theme_list(request):
    """Superuser: list all themes (incl. drafts), or create one."""
    if request.method == 'GET':
        return Response(ThemeSerializer(Theme.objects.all(), many=True).data)

    data = ThemeInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    v = data.validated_data
    if Theme.objects.filter(name=v['name']).exists():
        return Response({'detail': 'A theme with that name already exists.'},
                        status=status.HTTP_400_BAD_REQUEST)
    theme = Theme.objects.create(
        name=v['name'], base=v['base'], tokens=v['tokens'],
        is_published=v['is_published'], created_by=request.audit_user.username,
    )
    return Response(ThemeSerializer(theme).data, status=status.HTTP_201_CREATED)


@api_view(['PUT', 'DELETE'])
@require_audit
def admin_theme_detail(request, pk):
    """Superuser: update or delete a theme."""
    theme = get_object_or_404(Theme, pk=pk)
    if request.method == 'DELETE':
        theme.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    data = ThemeInputSerializer(data=request.data)
    data.is_valid(raise_exception=True)
    v = data.validated_data
    if Theme.objects.filter(name=v['name']).exclude(pk=theme.pk).exists():
        return Response({'detail': 'A theme with that name already exists.'},
                        status=status.HTTP_400_BAD_REQUEST)
    theme.name = v['name']
    theme.base = v['base']
    theme.tokens = v['tokens']
    theme.is_published = v['is_published']
    theme.save()
    return Response(ThemeSerializer(theme).data)
