from django.shortcuts import render
from django.shortcuts import get_object_or_404
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth import get_user_model
from django.middleware.csrf import get_token
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from livechat.models import ChatMessage, BlockedUser
from django.db import models
import logging

# Create your views here.
User = get_user_model()

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def test_view(request):

    user_id = request.query_params.get('user_id')

    if not user_id:
        return Response({'detail': 'Please provide user_id'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user = get_object_or_404(User, id=user_id)
        return Response({'id': user.id, 'username': user.username, 'email': user.email}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def block_user(request):
    id_user_0 = request.data.get('id_user_0')
    id_user_1 = request.data.get('id_user_1')

    if not id_user_0 or not id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_to_block = User.objects.get(id=id_user_1)
    except User.DoesNotExist:
        return Response({'error': 'User to block not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        user_blocking = User.objects.get(id=id_user_0)
    except User.DoesNotExist:
        return Response({'error': 'User blocking not found'}, status=status.HTTP_404_NOT_FOUND)

    if BlockedUser.objects.filter(id_user_0=user_blocking, id_user_1=user_to_block).exists():
        return Response({'message': 'User is already blocked'}, status=status.HTTP_400_BAD_REQUEST)

    BlockedUser.objects.create(id_user_0=user_blocking, id_user_1=user_to_block)
    return Response({'message': f'{user_to_block.username} has been blocked by {user_blocking.username}'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def send_message(request):
    id_user_0 = request.data.get('id_user_0')
    id_user_1 = request.data.get('id_user_1')
    message = request.data.get('message')

    if not id_user_0 or not id_user_1 or not message:
        return Response({'error': 'id_user_0 and id_user_1 and message is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_sending = User.objects.get(id=id_user_0)
    except User.DoesNotExist:
        return Response({'error': 'User sending message not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        user_to_send = User.objects.get(id=id_user_1)
    except User.DoesNotExist:
        return Response({'error': 'User to send message not found'}, status=status.HTTP_404_NOT_FOUND)

    if BlockedUser.objects.filter(id_user_0=id_user_0, id_user_1=id_user_1).exists():
        return Response({'error': 'User cannot send message to someone he blocked'}, status=status.HTTP_400_BAD_REQUEST)

    if BlockedUser.objects.filter(id_user_0=id_user_1, id_user_1=id_user_0).exists():
        return Response({'error': 'User cannot send message to someone that blocked him'}, status=status.HTTP_400_BAD_REQUEST)

    message = ChatMessage.objects.create(id_user_0=user_sending, id_user_1=user_to_send, message=message)
    return Response({'message': f'{user_sending.username} has sent {message.id} id to {user_to_send.username}'}, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def get_message(request):
    id_user_0 = request.query_params.get('id_user_0')
    id_user_1 = request.query_params.get('id_user_1')

    if not id_user_0 or not id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 is required'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user_sending = get_object_or_404(User, id=id_user_0)
    except Exception as e:
        return Response({'error': 'User sending message not found'}, status=status.HTTP_404_NOT_FOUND)
    try:
        user_to_send = get_object_or_404(User, id=id_user_1)
    except Exception as e:
        return Response({'error': 'User to send sending message not found'}, status=status.HTTP_404_NOT_FOUND)

    messages = ChatMessage.objects.filter(id_user_0=id_user_0, id_user_1=id_user_1) | ChatMessage.objects.filter(id_user_0=id_user_1, id_user_1=id_user_0)
    var = ""
    for message in messages:
        var += f"{message.id} : {message.message} : {User.objects.get(id=message.id_user_0_id).username} -> {User.objects.get(id=message.id_user_1_id).username}, "
    return Response({'messages': f'{var}'})
