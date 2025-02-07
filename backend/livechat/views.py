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
from livechat.models import ChatMessage, BlockedUser, FriendUser
from django.db import models
from django.db.models import Q
import logging

# Create your views here.
User = get_user_model()

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def test_view(request):

    user_id = request.user.id

    if not user_id:
        return Response({'detail': 'Please provide user_id'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user = get_object_or_404(User, id=user_id)
        return Response({'id': user.id, 'username': user.username, 'email': user.email}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def block_user(request):
    id_user_0 = request.user.id
    id_user_1 = request.data.get('id_user_1')

    if not id_user_0 or not id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 is required'}, status=status.HTTP_400_BAD_REQUEST)
    if id_user_0 == id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 must be different'}, status=status.HTTP_400_BAD_REQUEST)
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
@permission_classes([IsAuthenticated])
def add_friend_user(request):
    id_user_0 = request.user.id
    id_user_1 = request.data.get('id_user_1')

    if not id_user_0 or not id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 is required'}, status=status.HTTP_400_BAD_REQUEST)
    if id_user_0 == id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 must be different'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user_to_add = User.objects.get(id=id_user_1)
    except User.DoesNotExist:
        return Response({'error': 'User to add friend not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        user_adding = User.objects.get(id=id_user_0)
    except User.DoesNotExist:
        return Response({'error': 'User adding not found'}, status=status.HTTP_404_NOT_FOUND)

    if FriendUser.objects.filter(id_user_0=user_adding, id_user_1=user_to_add).exists():
        return Response({'message': 'User is already friend'}, status=status.HTTP_400_BAD_REQUEST)

    if BlockedUser.objects.filter(id_user_0=user_adding, id_user_1=user_to_add).exists():
        return Response({'message': 'You cannot add friend someone you blocked'}, status=status.HTTP_400_BAD_REQUEST)

    if BlockedUser.objects.filter(id_user_0=user_to_add, id_user_1=user_adding).exists():
        return Response({'message': 'You cannot add friend someone that blocked you'}, status=status.HTTP_400_BAD_REQUEST)

    FriendUser.objects.create(id_user_0=user_adding, id_user_1=user_to_add)
    return Response({'message': f'{user_to_add.username} has been added friend by {user_adding.username}'}, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def send_message(request):
    id_user_0 = request.user.id
    id_user_1 = request.data.get('id_user_1')
    message = request.data.get('message')

    if not id_user_0 or not id_user_1 or not message:
        return Response({'error': 'id_user_0 and id_user_1 and message is required'}, status=status.HTTP_400_BAD_REQUEST)
    if id_user_0 == id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 must be different'}, status=status.HTTP_400_BAD_REQUEST)
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

    if not FriendUser.objects.filter(id_user_0=id_user_0, id_user_1=id_user_1).exists():
        return Response({'error': 'User cannot send message to someone he doesnt had friend'}, status=status.HTTP_400_BAD_REQUEST)

    if not FriendUser.objects.filter(id_user_0=id_user_1, id_user_1=id_user_0).exists():
        return Response({'error': 'User cannot send message to someone who isnt your friend'}, status=status.HTTP_400_BAD_REQUEST)

    message = ChatMessage.objects.create(id_user_0=user_sending, id_user_1=user_to_send, message=message)
    return Response({'message': f'{user_sending.username} has sent {message.id} id to {user_to_send.username}'}, status=status.HTTP_201_CREATED)

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def get_message(request):
    id_user_0 = request.user.id
    id_user_1 = request.query_params.get('id_user_1')

    if not id_user_0 or not id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 are required'}, status=status.HTTP_400_BAD_REQUEST)
    if id_user_0 == id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 must be different'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_sending = get_object_or_404(User, id=id_user_0)
        user_to_send = get_object_or_404(User, id=id_user_1)
    except Exception as e:
        return Response({'error': 'One or both users not found'}, status=status.HTTP_404_NOT_FOUND)

    messages = ChatMessage.objects.filter(
        Q(id_user_0=id_user_0, id_user_1=id_user_1) | Q(id_user_0=id_user_1, id_user_1=id_user_0)
    ).order_by('created_at')

    formatted_messages = [
        {
            "id": message.id,
            "text": message.message,
            "sender": message.id_user_0.username,
            "receiver": message.id_user_1.username,
            "timestamp": message.created_at.strftime("%Y-%m-%d %H:%M:%S"),
        }
        for message in messages
    ]

    return Response({"messages": formatted_messages}, status=status.HTTP_200_OK)



@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def check_friendship(request):
    id_user_0 = request.user.id
    id_user_1 = request.data.get('id_user_1')

    if not id_user_0 or not id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 is required'}, status=status.HTTP_400_BAD_REQUEST)
    if id_user_0 == id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 must be different'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user_to_add = User.objects.get(id=id_user_0)
    except User.DoesNotExist:
        return Response({'error': 'User id_user_0 not found'}, status=status.HTTP_404_NOT_FOUND)

    try:
        user_adding = User.objects.get(id=id_user_1)
    except User.DoesNotExist:
        return Response({'error': 'User id_user_1 found'}, status=status.HTTP_404_NOT_FOUND)
    try:
        user_0 = get_object_or_404(User, id=id_user_0)
        user_1 = get_object_or_404(User, id=id_user_1)
        is_friends = False
        if FriendUser.objects.filter(id_user_0=id_user_0, id_user_1=id_user_1).exists() and FriendUser.objects.filter(id_user_0=id_user_1, id_user_1=id_user_0).exists():
            is_friends = True
        return Response({"is_friends": is_friends}, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def get_friends(request):
    id_user = request.user.id

    if not id_user:
        return Response({'detail': 'Please provide user_id'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = get_object_or_404(User, id=id_user)

        outgoing_friends = FriendUser.objects.filter(id_user_0=user).values_list("id_user_1", flat=True)

        mutual_friends = FriendUser.objects.filter(id_user_0__in=outgoing_friends, id_user_1=user).values_list("id_user_0", flat=True)

        mutual_friends_list = User.objects.filter(id__in=mutual_friends).values("id", "username")

        return Response({"mutual_friends": list(mutual_friends_list)}, status=status.HTTP_200_OK)


    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def get_blocked(request):
    id_user = request.user.id

    if not id_user:
        return Response({'detail': 'Please provide user_id'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = get_object_or_404(User, id=id_user)

        outgoing_friends = BlockedUser.objects.filter(id_user_0=user).values_list("id_user_1", flat=True)
        mutual_friends_list = User.objects.filter(id__in=outgoing_friends).values("id", "username")

        return Response({"blocked": list(mutual_friends_list)}, status=status.HTTP_200_OK)


    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)



@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def delete_friend_user(request):
    id_user_0 = request.user.id
    id_user_1 = request.data.get('id_user_1')

    if not id_user_0 or not id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 are required'}, status=status.HTTP_400_BAD_REQUEST)
    if id_user_0 == id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 must be different'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user_0 = User.objects.get(id=id_user_0)
        user_1 = User.objects.get(id=id_user_1)
    except User.DoesNotExist:
        return Response({'error': 'One or both users not found'}, status=status.HTTP_404_NOT_FOUND)

    friendship = FriendUser.objects.filter((Q(id_user_0=user_0, id_user_1=user_1)))

    if not friendship.exists():
        return Response({'message': 'Users are not friends'}, status=status.HTTP_400_BAD_REQUEST)

    friendship.delete()

    return Response({'message': f'Friendship from {user_0.username} to {user_1.username} has been removed'}, status=status.HTTP_200_OK)

@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def delete_blocked_user(request):
    id_user_0 = request.user.id
    id_user_1 = request.data.get('id_user_1')

    if not id_user_0 or not id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 are required'}, status=status.HTTP_400_BAD_REQUEST)
    if id_user_0 == id_user_1:
        return Response({'error': 'id_user_0 and id_user_1 must be different'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user_0 = User.objects.get(id=id_user_0)
        user_1 = User.objects.get(id=id_user_1)
    except User.DoesNotExist:
        return Response({'error': 'One or both users not found'}, status=status.HTTP_404_NOT_FOUND)

    blocked = BlockedUser.objects.filter((Q(id_user_0=user_0, id_user_1=user_1)))

    if not blocked.exists():
        return Response({'message': 'Users are not blocked'}, status=status.HTTP_400_BAD_REQUEST)

    blocked.delete()

    return Response({'message': f'blocking from {user_0.username} to {user_1.username} has been removed'}, status=status.HTTP_200_OK)

