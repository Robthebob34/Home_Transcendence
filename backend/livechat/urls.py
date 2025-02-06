from django.urls import path, include
from . import views

urlpatterns = [
    path('test/', views.test_view, name='test_view'),
    path('block_user/', views.block_user, name='block_user'),
    path('send_message/', views.send_message, name='send_message'),
    path('get_message/', views.get_message, name='get_message'),
]
