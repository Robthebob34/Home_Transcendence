from django.urls import path, include
from . import views

urlpatterns = [
    path('login/', views.login_view, name='login'),
    path('logout/', views.logout_view, name='logout'),
    path('profile/', views.profile_view, name='profile'),
    path('csrf/', views.get_csrf_token, name='csrf'),
    path('register/', views.register_view, name='register'),
    path('oauth_login/', views.oauth_login, name='oauth_login'),
    path('oauth_callback/', views.oauth_callback, name='oauth_callback'),
    path('user_delete/', views.user_delete, name='user_delete'),
    path('user_info/', views.user_info, name='user_info'),
]
