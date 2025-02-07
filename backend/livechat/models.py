from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class ChatMessage(models.Model):
    id_user_0 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sent_messages")
    id_user_1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="received_messages")
    message = models.TextField()

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Message from {self.id_user_0.username} to {self.id_user_1.username}"

class BlockedUser(models.Model):
    id_user_0 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocker")
    id_user_1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="blocked")

    blocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('id_user_0', 'id_user_1')

    def __str__(self):
        return f"{self.id_user_0.username} a blocked {self.id_user_1.username}"


class FriendUser(models.Model):
    id_user_0 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="iniator")
    id_user_1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="friend")

    blocked_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('id_user_0', 'id_user_1')

    def __str__(self):
        return f"{self.id_user_0.username} add {self.id_user_1.username} as a friend"
