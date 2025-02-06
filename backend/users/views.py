from django.shortcuts import render
from rest_framework import status, generics
from rest_framework.decorators import api_view, permission_classes
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

logger = logging.getLogger(__name__)
User = get_user_model()



CLIENT_ID = "u-s4t2ud-7720a84449f888d7ea7b95c0f35efe215017c9ddf0900283de4a4b61105ce772"
CLIENT_SECRET = "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"
REDIRECT_URI = "http://localhost:8000/auth/callback/"
TOKEN_URL = "https://api.intra.42.fr/oauth/token"
USER_INFO_URL = "https://api.intra.42.fr/v2/me"


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
        return Response({"error": "No authorization code provided"}, status=status.HTTP_400_BAD_REQUEST)
    data = {
        "grant_type": "authorization_code",
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "code": code,
        "redirect_uri": REDIRECT_URI,
    }
    response = requests.post(TOKEN_URL, data=data)
    if response.status_code != 200:
        return Response({"error": "Failed to get access token"}, status=status.HTTP_400_BAD_REQUEST)
    token_data = response.json()
    access_token = token_data.get("access_token")
    headers = {"Authorization": f"Bearer {access_token}"}
    user_info = requests.get(USER_INFO_URL, headers=headers)
    if user_info.status_code != 200:
        return Response({"error": "Failed to fetch user info"}, status=status.HTTP_400_BAD_REQUEST)
    user_data = user_info.json()

    user, created = User.objects.get_or_create(
        username=user_data["login"],
        defaults={"email": user_data["email"], "display_name": user_data["displayname"], "avatar": user_data["image"]["link"]}
    )
    user.backend = 'django.contrib.auth.backends.ModelBackend'
    login(request, user)
    return redirect("http://localhost/game")


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
