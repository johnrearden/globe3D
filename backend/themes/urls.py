from django.urls import path

from . import views

urlpatterns = [
    path('themes', views.theme_list, name='theme-list'),
    path('admin/themes', views.admin_theme_list, name='admin-theme-list'),
    path('admin/themes/<int:pk>', views.admin_theme_detail, name='admin-theme-detail'),
]
