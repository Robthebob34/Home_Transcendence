from django.db import models
from django.conf import settings

# Create your models here.

class Game(models.Model):
    GAME_STATUS_CHOICES = (
        ('waiting', 'Waiting for Player'),
        ('playing', 'Game in Progress'),
        ('paused', 'Game Paused'),
        ('finished', 'Game Finished'),
    )

    player1 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='games_as_player1',
        on_delete=models.CASCADE
    )
    player2 = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='games_as_player2',
        null=True,
        blank=True,
        on_delete=models.SET_NULL
    )
    status = models.CharField(
        max_length=20,
        choices=GAME_STATUS_CHOICES,
        default='waiting'
    )
    score_player1 = models.IntegerField(default=0)
    score_player2 = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    game_state = models.JSONField(default=dict)
    winner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name='games_won',
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    duration = models.IntegerField(null=True, blank=True)  # Duration in seconds
    duration_formatted = models.CharField(max_length=10, null=True, blank=True)  # MM:SS format

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Game {self.id}: {self.player1.username} vs {self.player2.username if self.player2 else 'Waiting'}"

    def save(self, *args, **kwargs):
        if not self.game_state and self._state.adding:  # Only set default state when creating new game
            self.game_state = {
                'ball': {'x': 400, 'y': 300, 'dx': 5, 'dy': 5, 'radius': 10},
                'paddles': {
                    'player1': {'x': 50, 'y': 250, 'width': 20, 'height': 100},
                    'player2': {'x': 730, 'y': 250, 'width': 20, 'height': 100}
                },
                'canvas': {'width': 800, 'height': 600},
                'score': {'player1': 0, 'player2': 0},
                'paddle_speed': 25
            }
        super().save(*args, **kwargs)

    def is_player_in_game(self, user):
        return user == self.player1 or user == self.player2

    def get_player_position(self, user):
        if user == self.player1:
            return 'left'
        elif user == self.player2:
            return 'right'
        return None

    def update_score(self, scorer):
        if scorer == self.player1:
            self.score_player1 += 1
        elif scorer == self.player2:
            self.score_player2 += 1
        self.save()

    def get_game_state(self):
        return {
            'status': self.status,
            'player1': {
                'id': str(self.player1.id),
                'username': self.player1.username,
                'score': self.score_player1
            },
            'player2': {
                'id': str(self.player2.id) if self.player2 else None,
                'username': self.player2.username if self.player2 else None,
                'score': self.score_player2
            } if self.player2 else None
        }
