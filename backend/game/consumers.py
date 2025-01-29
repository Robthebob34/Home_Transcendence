import json
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from asgiref.sync import sync_to_async
from .models import Game
from django.contrib.auth import get_user_model
from django.db import models
from django.db import transaction
from django.db.models import Q
import asyncio
import logging
from datetime import timedelta

logger = logging.getLogger(__name__)
User = get_user_model()

class GameConsumer(AsyncWebsocketConsumer):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.user = None
        self.game = None
        self.channel_group_name = None
        self.user_group = None
        self.is_connected = False

    async def connect(self):
        """
        Called when a WebSocket connection is established
        """
        try:
            if self.scope["user"].is_anonymous:
                await self.close()
                return

            self.user = self.scope["user"]
            self.is_connected = True
            self.game = None
            self.user_group = f"user_{self.user.id}"
            
            # Accept the connection first
            await self.accept()
            
            # Then send the message
            await self.send_json({
                'type': 'connection_established',
                'message': 'Connected successfully'
            })
            
            logger.info(f"User {self.user.username} connected successfully")

        except Exception as e:
            logger.error(f"Error in connect: {str(e)}", exc_info=True)
            await self.close()

    async def receive(self, text_data=None, bytes_data=None):
        """
        Receive message from WebSocket
        """
        try:
            if not text_data:
                return
                
            logger.info(f"Received text data: {text_data}")
            data = json.loads(text_data)
            message_type = data.get('type')
            
            if message_type == 'create_game':
                # Create a new game
                try:
                    game = await self.create_game()
                    if game:
                        # Join game channel
                        self.game = game
                        self.channel_group_name = f"game_{game.id}"
                        await self.channel_layer.group_add(
                            self.channel_group_name,
                            self.channel_name
                        )
                        
                        # Send confirmation
                        await self.send_json({
                            'type': 'game_created',
                            'game_id': game.id,
                            'player_id': self.user.id
                        })
                        logger.info(f"Game {game.id} created successfully")
                    else:
                        await self.send_json({
                            'type': 'error',
                            'message': 'Failed to create game'
                        })
                except Exception as e:
                    logger.error(f"Error creating game: {str(e)}", exc_info=True)
                    await self.send_json({
                        'type': 'error',
                        'message': 'Failed to create game'
                    })
            elif message_type == 'join_game':
                game_id = data.get('game_id')
                if not game_id:
                    # Find an available game
                    game = await self.find_available_game()
                    if game:
                        game_id = game.id
                    else:
                        await self.send_json({
                            'type': 'error',
                            'message': 'No available games found'
                        })
                        return

                try:
                    game_data = await self.join_game(game_id)
                    if game_data:
                        # Join game channel
                        self.game = game_data['game']
                        self.channel_group_name = f"game_{game_id}"
                        await self.channel_layer.group_add(
                            self.channel_group_name,
                            self.channel_name
                        )
                        
                        # Send confirmation to both players
                        game_message = {
                            'type': 'game_joined',
                            'game_id': game_id,
                            'player1_id': game_data['player1_id'],
                            'player2_id': game_data['player2_id'],
                            'status': 'active'
                        }
                        await self.channel_layer.group_send(
                            self.channel_group_name,
                            game_message
                        )
                        logger.info(f"User {self.user.username} joined game {game_id}")
                    else:
                        # Check if the game is already active
                        game = await self.get_game(game_id)
                        if game and game.status == 'active' and (game.player1 == self.user or game.player2 == self.user):
                            # User is already in this game, send them the game state
                            self.game = game
                            self.channel_group_name = f"game_{game_id}"
                            await self.channel_layer.group_add(
                                self.channel_group_name,
                                self.channel_name
                            )
                            await self.send_json({
                                'type': 'game_joined',
                                'game_id': game_id,
                                'player1_id': game.player1.id,
                                'player2_id': game.player2.id,
                                'status': 'active'
                            })
                        else:
                            await self.send_json({
                                'type': 'error',
                                'message': 'Game is no longer available'
                            })
                except Exception as e:
                    logger.error(f"Error joining game: {str(e)}", exc_info=True)
                    await self.send_json({
                        'type': 'error',
                        'message': 'Failed to join game'
                    })
            else:
                await self.send_json({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                })
                
        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON received: {text_data}")
            await self.send_json({
                'type': 'error',
                'message': 'Invalid JSON message'
            })
        except Exception as e:
            logger.error(f"Error in receive: {str(e)}", exc_info=True)
            await self.send_json({
                'type': 'error',
                'message': 'Internal server error'
            })

    @database_sync_to_async
    def get_game(self, game_id):
        """Get game by id with player information"""
        try:
            return Game.objects.select_related('player1', 'player2').get(id=game_id)
        except Game.DoesNotExist:
            return None
        except Exception as e:
            logger.error(f"Error getting game: {str(e)}", exc_info=True)
            return None

    @database_sync_to_async
    def create_game(self):
        """Create a new game"""
        try:
            with transaction.atomic():
                game = Game.objects.create(
                    player1=self.user,
                    status='waiting',
                    score_player1=0,
                    score_player2=0
                )
                logger.info(f"Created game {game.id} for user {self.user.username}")
                return game
        except Exception as e:
            logger.error(f"Error creating game: {str(e)}", exc_info=True)
            return None

    @database_sync_to_async
    def find_available_game(self):
        """Find an available game to join"""
        try:
            return Game.objects.filter(
                status='waiting'
            ).exclude(
                player1=self.user
            ).first()
        except Exception as e:
            logger.error(f"Error finding available game: {str(e)}", exc_info=True)
            return None

    @database_sync_to_async
    def join_game(self, game_id):
        """Join an existing game"""
        try:
            with transaction.atomic():
                game = Game.objects.select_for_update().get(
                    id=game_id,
                    status='waiting'
                )
                if game.player2 is None and game.player1 != self.user:
                    game.player2 = self.user
                    game.status = 'active'
                    game.save()
                    
                    # Get player IDs in a sync context
                    player1_id = game.player1.id
                    player2_id = game.player2.id
                    
                    return {
                        'game': game,
                        'player1_id': player1_id,
                        'player2_id': player2_id
                    }
                return None
        except Game.DoesNotExist:
            logger.error(f"Game {game_id} not found or not available")
            return None
        except Exception as e:
            logger.error(f"Error joining game: {str(e)}", exc_info=True)
            return None

    async def game_joined(self, event):
        """Handle game_joined message"""
        try:
            logger.info(f"Sending game_joined event to {self.user.username}: {event}")
            await self.send_json(event)
        except Exception as e:
            logger.error(f"Error sending game_joined event: {str(e)}", exc_info=True)

    async def send_json(self, content):
        """Send JSON message to WebSocket"""
        try:
            logger.debug(f"Sending message to {self.user.username}: {content}")
            await self.send(text_data=json.dumps(content))
        except Exception as e:
            logger.error(f"Error sending message: {str(e)}", exc_info=True)

    async def disconnect(self, close_code):
        """Handle disconnect"""
        try:
            if hasattr(self, 'channel_group_name'):
                await self.channel_layer.group_discard(
                    self.channel_group_name,
                    self.channel_name
                )
        except Exception as e:
            logger.error(f"Error in disconnect: {str(e)}", exc_info=True)
        finally:
            logger.info(f"User {self.user.username if hasattr(self, 'user') else 'Unknown'} disconnected")
