from django.db import models
from django.contrib.auth.models import AbstractUser

# Create your models here.

class User(AbstractUser):
    display_name = models.CharField(max_length=30, unique=False, null=True, blank=True)
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    last_logout = models.DateTimeField(blank=True, null=True, verbose_name='last logout')
    last_active = models.DateTimeField(blank=True, null=True, verbose_name='last active')
    from42 = models.BooleanField(default=False)
    # Fix group and permission clashes
    groups = models.ManyToManyField(
        'auth.Group',
        related_name='custom_user_set',
        blank=True,
        help_text='The groups this user belongs to.',
        verbose_name='groups',
    )
    user_permissions = models.ManyToManyField(
        'auth.Permission',
        related_name='custom_user_set',
        blank=True,
        help_text='Specific permissions for this user.',
        verbose_name='user permissions',
    )

    def save(self, *args, **kwargs):
        if not self.display_name:
            self.display_name = self.username
        super().save(*args, **kwargs)

    def __str__(self):
        return self.display_name or self.username
