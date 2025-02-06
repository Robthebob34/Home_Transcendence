from rest_framework import serializers
from .models import Game
from django.contrib.auth import get_user_model

User = get_user_model()

class GameSerializer(serializers.ModelSerializer):
    class Meta:
        model = Game
        fields = '__all__'

class GameDetailSerializer(serializers.ModelSerializer):
    player1 = serializers.SerializerMethodField()
    player2 = serializers.SerializerMethodField()
    winner = serializers.SerializerMethodField()

    class Meta:
        model = Game
        fields = '__all__'
        depth = 1

    def get_player1(self, obj):
        return {
            'id': obj.player1.id,
            'username': obj.player1.username,
            'display_name': obj.player1.display_name
        }

    def get_player2(self, obj):
        if obj.player2:
            return {
                'id': obj.player2.id,
                'username': obj.player2.username,
                'display_name': obj.player2.display_name
            }
        return None

    def get_winner(self, obj):
        if obj.winner:
            return {
                'id': obj.winner.id,
                'username': obj.winner.username,
                'display_name': obj.winner.display_name
            }
        return None
