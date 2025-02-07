from django.urls import path, include
from . import views

urlpatterns = [
    path('test/', views.test_view, name='test_view'),
    path('block_user/', views.block_user, name='block_user'),
    path('send_message/', views.send_message, name='send_message'),
    path('get_message/', views.get_message, name='get_message'),
    path('get_friends/', views.get_friends, name='get_friends'),
    path('check_friendship/', views.check_friendship, name='check_friendship'),
    path('add_friend_user/', views.add_friend_user, name='add_friend_user'),
    path('delete_friend_user/', views.delete_friend_user, name='delete_friend_user'),
    path('delete_blocked_user/', views.delete_blocked_user, name='delete_blocked_user'),
    path('get_blocked/', views.get_blocked, name='get_blocked'),
]
