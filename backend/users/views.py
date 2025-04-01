from django.shortcuts import render
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.parsers import MultiPartParser
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from django.contrib.auth import authenticate, login, logout
from .serializers import UserSerializer, UserRegistrationSerializer
from django.contrib.auth import get_user_model
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
from django.shortcuts import redirect
import logging
import requests
from urllib.parse import urlparse
from django.core.files.base import ContentFile
import os
from django.utils import timezone
from datetime import timedelta
import urllib.parse


logger = logging.getLogger(__name__)
User = get_user_model()




CLIENT_ID = os.getenv("CLIENT_ID")
CLIENT_SECRET = os.getenv("CLIENT_SECRET")
REDIRECT_URI = "http://localhost:8000/auth/callback/"
TOKEN_URL = "https://api.intra.42.fr/oauth/token"
USER_INFO_URL = "https://api.intra.42.fr/v2/me"


def update_user_avatar(user, avatar_url):
    response = requests.get(avatar_url)
    if response.status_code == 200:
        file_name = os.path.basename(urlparse(avatar_url).path)
        user.avatar.save(file_name, ContentFile(response.content), save=True)
        return user.avatar.url
    return None

@api_view(["GET"])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def oauth_login(request):
    auth_url = f"https://api.intra.42.fr/oauth/authorize?client_id={CLIENT_ID}&redirect_uri={REDIRECT_URI}&response_type=code"
    return redirect(auth_url)

@api_view(["GET"])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def oauth_callback(request):
    code = request.GET.get("code")
    if not code:
        return redirect(f"https://localhost/#login?oauth=failed&error=No authorization code provided")
        # return Response({"error": "No authorization code provided"}, status=status.HTTP_400_BAD_REQUEST)
    data = {
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }
    response = requests.post(TOKEN_URL, data=data)
    if response.status_code != 200:
        return redirect(f"https://localhost/#login?oauth=failed&error=Failed to get access token")
        # return Response({"error": "Failed to get access token"}, status=status.HTTP_400_BAD_REQUEST)
    token_data = response.json()
    access_token = token_data.get("access_token")
    headers = {"Authorization": f"Bearer {access_token}"}
    user_info = requests.get(USER_INFO_URL, headers=headers)
    if user_info.status_code != 200:
        return redirect(f"https://localhost/#login?oauth=failed&error=Failed to fetch user info")
        # return Response({"error": "Failed to fetch user info"}, status=status.HTTP_400_BAD_REQUEST)
    user_data = user_info.json()

    try:
        user, created = User.objects.get_or_create(
            email=user_data["email"],
            from42=True,
            defaults={
                "username": user_data["login"],
                "display_name": user_data["displayname"],
                "avatar": user_data["image"]["link"]
            }
        )
    except Exception as e:
        logger.error(f"Registration failed for user : {str(e)}")
        return redirect(f"https://localhost/#login?oauth=failed&error=Registration failed")
        # return Response({'detail': 'Registration failed'}, status=status.HTTP_400_BAD_REQUEST)

    user.backend = 'django.contrib.auth.backends.ModelBackend'
    login(request, user)

    avatar_url = None
    username = None    
    if created:
        avatar_url = update_user_avatar(user, user_data["image"]["link"])
        username = user_data["login"]
    else:
        username = user.get_username()
        if user.avatar:
            avatar_url = user.avatar.url
            if not avatar_url.startswith('http'):
                avatar_url = request.build_absolute_uri(avatar_url)

    return redirect("https://localhost/#login?oauth=true&id="+str(user.id)+"&username="+(username)+"&avatar="+(avatar_url or "null"))


@api_view(["GET"])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def user_info(request):
    if request.user.is_authenticated:
        return Response({"id": request.user.id, "username": request.user.username}, status=200)
    return Response({"error": "Not authenticated"}, status=401)

@api_view(["GET"])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def user_delete(request):
    user_id = request.query_params.get('user_id')

    if not user_id:
        return Response({'detail': 'Please provide user_id'}, status=status.HTTP_400_BAD_REQUEST)
    try:
        user = get_object_or_404(User, id=user_id)
        user.delete()
        return Response({'message': 'user got deleted'}, status=status.HTTP_200_OK)
    except User.DoesNotExist:
        return Response({"error": "User not found"}, status=status.HTTP_404_NOT_FOUND)

@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def register_view(request):
    username = request.data.get('username')
    email = request.data.get('email')
    password = request.data.get('password')

    logger.info(f"Registration attempt for user: {username}")

    if not username or not password or not email:
        return Response({
            'detail': 'Please provide username, email and password'
        }, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(username=username).exists():
        return Response({
            'detail': 'Username already exists'
        }, status=status.HTTP_400_BAD_REQUEST)

    if User.objects.filter(email=email).exists():
        return Response({
            'detail': 'Email already exists'
        }, status=status.HTTP_400_BAD_REQUEST)

    try:
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password,
            display_name=username  # Set display_name during registration
        )
        logger.info(f"User {username} registered successfully")
        return Response({
            'detail': 'Registration successful'
        }, status=status.HTTP_201_CREATED)
    except Exception as e:
        logger.error(f"Registration failed for user {username}: {str(e)}")
        return Response({
            'detail': 'Registration failed'
        }, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def get_csrf_token(request):
    token = get_token(request)
    return Response({'csrfToken': token})

@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def login_view(request):
    try:
        logger.info(f"Received login request. Headers: {dict(request.headers)}")
        username = request.data.get('username')
        password = request.data.get('password')

        logger.info(f"Login attempt for user: {username}")

        if not username or not password:
            logger.warning("Missing username or password")
            return Response({
                'detail': 'Please provide both username and password'
            }, status=status.HTTP_400_BAD_REQUEST)

        # Check if user exists
        try:
            user = User.objects.get(username=username)
            logger.info(f"User exists: {user.username}")

            # Ensure display_name is set
            if not user.display_name:
                user.display_name = user.username
                user.save()
                logger.info(f"Set display_name to {user.display_name}")

        except User.DoesNotExist:
            logger.warning(f"User {username} does not exist")
            return Response({
                'detail': 'Invalid credentials'
            }, status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            logger.error(f"Error checking user: {str(e)}")
            return Response({
                'detail': 'An error occurred while checking user'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        user = authenticate(request, username=username, password=password)
        logger.info(f"Authentication result for {username}: {'success' if user else 'failed'}")

        if user is not None:
            # Clear any existing sessions for this user
            logger.info(f"Clearing existing sessions for user {username}")
            request.session.flush()

            # Create new session
            login(request, user)
            logger.info(f"New session created for user {username}")

            # Set session expiry
            request.session.set_expiry(1209600)  # 2 weeks

            return Response({
                'detail': 'Login successful',
                'user': {
                    'id': user.id,
                    'username': user.username,
                    'display_name': user.display_name,
                }
            }, status=status.HTTP_200_OK)
        else:
            logger.warning(f"Invalid credentials for user {username}")
            return Response({
                'detail': 'Invalid credentials'
            }, status=status.HTTP_401_UNAUTHORIZED)

    except Exception as e:
        logger.error(f"Login error: {str(e)}")
        return Response({
            'detail': 'An error occurred during login'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout_view(request):
    try:
        username = request.user.username
        logger.info(f"Logout request for user: {username}")

        request.user.last_logout = timezone.now()
        request.user.save()
        # Clear the session
        request.session.flush()
        logout(request)
        logger.info(f"User {username} logged out successfully")
        return Response({'detail': 'Logout successful'}, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Logout error: {str(e)}")
        return Response({'detail': 'An error occurred during logout'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def profile_view(request):
    logger.info(f"Profile view request for user: {request.user.username}")
    serializer = UserSerializer(request.user)
    return Response(serializer.data)

@api_view(['GET'])
@ensure_csrf_cookie
@csrf_exempt
@permission_classes([AllowAny])
def get_csrf_token(request):
    token = get_token(request)
    logger.info(f"Generated CSRF token: {token}")
    response = Response({'csrfToken': token})
    response['X-CSRFToken'] = token
    return response

@api_view(['PUT'])
@permission_classes([IsAuthenticated])
def update_profile(request):
    logger.info(f"Profile update request for user: {request.user.username}")
    serializer = UserSerializer(request.user, data=request.data, partial=True)
    if serializer.is_valid():
        serializer.save()
        logger.info(f"Profile updated for user: {request.user.username}")
        return Response(serializer.data)
    logger.warning(f"Profile update failed for user {request.user.username}: {serializer.errors}")
    return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def get_email(request):
    email = request.user.email
    return Response({'email': email}, status=status.HTTP_200_OK)

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def get_avatar(request, user_id):
    user = get_object_or_404(User, id=user_id)
    avatar_url = None

    if user.avatar:
        avatar_url = user.avatar.url
        if not avatar_url.startswith('http'):
            avatar_url = request.build_absolute_uri(avatar_url)

    return Response({'avatar': avatar_url}, status=status.HTTP_200_OK)

@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser])
def change_avatar(request):
    new_avatar = request.FILES.get('avatar')
    if new_avatar:
        request.user.avatar = new_avatar
        request.user.save()

        avatar_url = request.user.avatar.url
        if not avatar_url.startswith('http'):
            avatar_url = request.build_absolute_uri(avatar_url)
        return Response({'url': avatar_url}, status=status.HTTP_200_OK)
    return Response({'error': 'Avatar not changed'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def change_username(request):
    new_username = request.data.get('username')
    if new_username:
        request.user.username = new_username
        request.user.save()
        return Response({'status': 'Username changed'}, status=status.HTTP_200_OK)
    return Response({'error': 'Username not changed'}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def delete_avatar(request):
    if request.user.avatar:
        request.user.avatar.delete(save=False)
        request.user.avatar = None
        request.user.save()
        return Response({'status': 'Avatar deleted'}, status=status.HTTP_200_OK)
    return Response({'error': 'No avatar to delete'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def change_password(request):
    new_password = request.data.get('password')
    if new_password:
        request.user.set_password(new_password)
        request.user.save()
        return Response({'status': 'Password changed'}, status=status.HTTP_200_OK)
    return Response({'error': 'password not changed'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def heart_beat(request):
    if request.user:
        request.user.last_active = timezone.now()
        request.user.save()
        return Response(status=status.HTTP_204_NO_CONTENT)
    else:
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([IsAuthenticated])
def check_status(request):

    id_user_0 = request.query_params.get('id_user_0')

    if not id_user_0:
        return Response({'error': 'id_user_0 is required'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        user_0 = get_object_or_404(User, id=id_user_0)

    except Exception as e:
        return Response({'error': 'user not found'}, status=status.HTTP_404_NOT_FOUND)

    last_active = user_0.last_active
    last_login = user_0.last_login
    last_logout = user_0.last_logout


    if not last_active:
        print("STATUS: OFFLINE - User is logged out")
        return Response({'status': 1}, status=status.HTTP_200_OK) # User is logged out (offline)

    elif last_logout and last_logout > last_login:
        print("STATUS: OFFLINE - User is logged out")
        return Response({'status': 1}, status=status.HTTP_200_OK) # User is logged out (offline)

    elif timezone.now() - last_active < timedelta(minutes=1) or timezone.now() - last_login < timedelta(minutes=2):
        print("STATUS: ONLINE - User is logged in and active")
        return Response({'status': 0}, status=status.HTTP_200_OK) # User is logged in and active (online)

    else:
        print("STATUS: AWAY - User is logged in but away")
        return Response({'status': 2}, status=status.HTTP_200_OK) # User is logged in but away (inactive for more than 2 minutes)
