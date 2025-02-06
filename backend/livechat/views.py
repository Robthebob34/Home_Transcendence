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
import logging

# Create your views here.
User = get_user_model()

@api_view(['GET'])
@ensure_csrf_cookie
@permission_classes([AllowAny])
def test_view(request):

    user_id = request.query_params.get('user_id')

    if not user_id:
        return Response({
            'detail': 'Please provide user_id'
        }, status=status.HTTP_400_BAD_REQUEST)
    try:
        user = get_object_or_404(User, id=user_id)
        return Response({'id': user.id, 'username': user.username, 'email': user.email}, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
