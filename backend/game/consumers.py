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
import time
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
        self.last_paddle_update = {}
        self.paddle_update_interval = 0.016  # 16ms (~60fps)

    @property
    def game_state(self):
        if not hasattr(self, '_game_state'):
            logger.info("Initializing new game state")
            canvas_width = 800
            canvas_height = 600
            paddle_width = 20
            paddle_height = 100
            ball_radius = 10
            
            self._game_state = {
                'canvas': {
                    'width': canvas_width,
                    'height': canvas_height
                },
                'ball': {
                    'x': canvas_width // 2,
                    'y': canvas_height // 2,
                    'dx': 7,
                    'dy': 7,
                    'radius': ball_radius
                },
                'paddles': {
                    'player1': {
                        'x': 50,
                        'y': (canvas_height - paddle_height) // 2,
                        'width': paddle_width,
                        'height': paddle_height
                    },
                    'player2': {
                        'x': canvas_width - 50 - paddle_width,
                        'y': (canvas_height - paddle_height) // 2,
                        'width': paddle_width,
                        'height': paddle_height
                    }
                },
                'score': {
                    'player1': 0,
                    'player2': 0
                },
                'paddle_speed': 25
            }
            logger.info(f"Initial game state: {self._game_state}")
        return self._game_state

    async def connect(self):
        """
        Called when a WebSocket connection is established
        """
        try:
            if self.scope["user"].is_anonymous:
                await self.close()
                return

            self.user = self.scope["user"]
            self.user_id = self.user.id
            self.username = self.user.username
            self.is_connected = True
            self.game = None
            self.user_group = f"user_{self.user.id}"
            
            # Accept the connection first
            await self.accept()
            
            # Then send the message
            await self.send_json({
                'type': 'connection_established',
                'message': 'Connected successfully',
                'user': {
                    'id': self.user_id,
                    'username': self.username
                }
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
                
            logger.info(f"Received text data from {self.user.username}: {text_data}")
            data = json.loads(text_data)
            message_type = data.get('type')
            
            # Handle heartbeat messages
            if message_type == 'heartbeat':
                await self.send_json({
                    'type': 'heartbeat_response'
                })
                return
            
            # Validate user session
            if self.scope["user"].is_anonymous:
                await self.send_json({
                    'type': 'error',
                    'message': 'Invalid session'
                })
                await self.close()
                return

            if message_type == 'create_game':
                try:
                    game = await self.create_game()
                    if game:
                        self.game = game
                        self.channel_group_name = f"game_{game.id}"
                        await self.channel_layer.group_add(
                            self.channel_group_name,
                            self.channel_name
                        )
                        
                        # Send confirmation and initial game state
                        response = {
                            'type': 'game_created',
                            'game_id': game.id,
                            'player_id': self.user.id,
                            'game_state': self.game_state
                        }
                        logger.info(f"Sending game created response: {response}")
                        await self.send_json(response)
                        
                        # Broadcast initial game state
                        await self.channel_layer.group_send(
                            self.channel_group_name,
                            {
                                'type': 'game_state_update',
                                'game_state': self.game_state
                            }
                        )
                except Exception as e:
                    logger.error(f"Error creating game: {str(e)}", exc_info=True)
                    await self.send_json({
                        'type': 'error',
                        'message': 'Failed to create game'
                    })
            
            elif message_type == 'join_game':
                game_id = data.get('game_id')
                if not game_id:
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
                        self.game = game_data['game']
                        self.channel_group_name = f"game_{game_id}"
                        await self.channel_layer.group_add(
                            self.channel_group_name,
                            self.channel_name
                        )
                        
                        # Send confirmation to both players with game state
                        game_message = {
                            'type': 'game_joined',
                            'game_id': game_id,
                            'player1_id': game_data['player1_id'],
                            'player2_id': game_data['player2_id'],
                            'status': 'active',
                            'game_state': self.game_state
                        }
                        logger.info(f"Broadcasting game joined message: {game_message}")
                        await self.channel_layer.group_send(
                            self.channel_group_name,
                            game_message
                        )
                        
                        # Broadcast initial game state
                        await self.channel_layer.group_send(
                            self.channel_group_name,
                            {
                                'type': 'game_state_update',
                                'game_state': self.game_state
                            }
                        )
                except Exception as e:
                    logger.error(f"Error joining game: {str(e)}", exc_info=True)
                    await self.send_json({
                        'type': 'error',
                        'message': 'Failed to join game'
                    })
            
            elif message_type == 'paddle_move':
                try:
                    if not self.game or not hasattr(self.game, 'player1') or not hasattr(self.game, 'player2'):
                        logger.error("Game not properly initialized for paddle movement")
                        return

                    direction = data.get('direction')
                    if not direction:
                        return

                    # Determine which paddle to move based on the player
                    if self.user == self.game.player1:
                        paddle_key = 'player1'
                    elif self.user == self.game.player2:
                        paddle_key = 'player2'
                    else:
                        logger.error(f"User {self.user.username} is not a player in this game")
                        return

                    # Rate limiting
                    current_time = time.time()
                    last_update = self.last_paddle_update.get(paddle_key, 0)
                    if current_time - last_update < self.paddle_update_interval:
                        return
                    self.last_paddle_update[paddle_key] = current_time

                    logger.info(f"Moving paddle for {self.user.username} ({paddle_key}) in direction: {direction}")

                    # Get current paddle position
                    paddle = self.game_state['paddles'][paddle_key]
                    paddle_speed = self.game_state['paddle_speed']
                    canvas_height = self.game_state['canvas']['height']
                    paddle_height = paddle['height']

                    # Calculate new position with direct movement
                    current_y = paddle['y']
                    
                    if direction == 'up':
                        new_y = max(0, current_y - paddle_speed)
                    elif direction == 'down':
                        new_y = min(canvas_height - paddle_height, current_y + paddle_speed)
                    else:
                        return

                    # Update paddle position
                    self.game_state['paddles'][paddle_key]['y'] = new_y

                    # Broadcast updated game state immediately
                    await self.channel_layer.group_send(
                        self.channel_group_name,
                        {
                            'type': 'game_state_update',
                            'game_state': self.game_state
                        }
                    )
                except Exception as e:
                    logger.error(f"Error handling paddle movement: {str(e)}", exc_info=True)
            
            elif message_type == 'user_connected':
                # Handle user connection info
                user_id = data.get('user_id')
                username = data.get('username')
                
                # Validate that the WebSocket user matches the session user
                if str(self.user_id) != str(user_id) or self.username != username:
                    await self.send_json({
                        'type': 'error',
                        'message': 'User session mismatch'
                    })
                    await self.close()
                    return
                
                logger.info(f"User connected: {username} (ID: {user_id})")

            else:
                await self.send_json({
                    'type': 'error',
                    'message': f'Unknown message type: {message_type}'
                })
                
        except json.JSONDecodeError:
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
    def create_game_sync(self):
        try:
            logger.info(f"Creating new game for user {self.user.username}")
            game = Game.objects.create(
                player1=self.user,
                status='waiting'
            )
            game.save()
            logger.info(f"Game {game.id} created successfully")
            return game
        except Exception as e:
            logger.error(f"Error creating game: {str(e)}", exc_info=True)
            return None

    async def create_game(self):
        return await self.create_game_sync()

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

    async def join_game(self, game_id):
        try:
            game = await self.get_game(game_id)
            if not game:
                logger.error(f"Game {game_id} not found")
                return None

            if game.status == 'waiting' and game.player1 != self.user:
                logger.info(f"User {self.user.username} joining game {game_id}")
                game.player2 = self.user
                game.status = 'active'
                await sync_to_async(game.save)()
                return {
                    'game': game,
                    'player1_id': game.player1.id,
                    'player2_id': self.user.id
                }
            elif game.status == 'active' and (game.player1 == self.user or game.player2 == self.user):
                logger.info(f"User {self.user.username} reconnecting to game {game_id}")
                return {
                    'game': game,
                    'player1_id': game.player1.id,
                    'player2_id': game.player2.id
                }
            else:
                logger.warning(f"Game {game_id} is not available for joining")
                return None
        except Exception as e:
            logger.error(f"Error joining game: {str(e)}", exc_info=True)
            return None

    async def game_joined(self, event):
        """
        Handle game joined event.
        """
        try:
            # Initialize game state
            if not hasattr(self, '_game_state'):
                self._game_state = {
                    'ball': {'x': 400, 'y': 300, 'dx': 5, 'dy': 5, 'radius': 10},
                    'paddles': {
                        'player1': {'x': 50, 'y': 250, 'width': 20, 'height': 100},
                        'player2': {'x': 730, 'y': 250, 'width': 20, 'height': 100}
                    },
                    'canvas': {'width': 800, 'height': 600},
                    'score': {'player1': 0, 'player2': 0}
                }
            
            await self.send_json({
                'type': 'game_joined',
                'game_id': event['game_id'],
                'player1_id': event['player1_id'],
                'player2_id': event['player2_id'],
                'game_state': self._game_state
            })
            
            # Start game loop when both players have joined
            if self.game and self.game.status == 'active' and self.game.player1 and self.game.player2:
                asyncio.create_task(self.game_loop())
        except Exception as e:
            logger.error(f'Error in game_joined: {str(e)}', exc_info=True)
    
    async def game_loop(self):
        """Game loop to update ball position and send state updates"""
        try:
            while self.game and self.game.status == 'active':
                # Update ball position
                ball = self._game_state['ball']
                ball['x'] += ball['dx']
                ball['y'] += ball['dy']
                
                # Ball collision with top and bottom walls
                if ball['y'] <= ball['radius'] or ball['y'] >= self._game_state['canvas']['height'] - ball['radius']:
                    ball['dy'] *= -1
                
                # Ball collision with paddles
                paddles = self._game_state['paddles']
                
                # Left paddle collision
                if (ball['x'] - ball['radius'] <= paddles['player1']['x'] + paddles['player1']['width'] and
                    ball['y'] >= paddles['player1']['y'] and
                    ball['y'] <= paddles['player1']['y'] + paddles['player1']['height']):
                    ball['dx'] = abs(ball['dx'])  # Ensure ball moves right
                    ball['dx'] *= 1.1  # Speed up slightly
                
                # Right paddle collision
                if (ball['x'] + ball['radius'] >= paddles['player2']['x'] and
                    ball['y'] >= paddles['player2']['y'] and
                    ball['y'] <= paddles['player2']['y'] + paddles['player2']['height']):
                    ball['dx'] = -abs(ball['dx'])  # Ensure ball moves left
                    ball['dx'] *= 1.1  # Speed up slightly
                
                # Ball out of bounds - scoring
                if ball['x'] < 0:  # Player 2 scores
                    self._game_state['score']['player2'] += 1
                    ball['x'] = self._game_state['canvas']['width'] / 2
                    ball['y'] = self._game_state['canvas']['height'] / 2
                    ball['dx'] = -5  # Reset speed and direction
                    ball['dy'] = 5 if ball['dy'] > 0 else -5
                elif ball['x'] > self._game_state['canvas']['width']:  # Player 1 scores
                    self._game_state['score']['player1'] += 1
                    ball['x'] = self._game_state['canvas']['width'] / 2
                    ball['y'] = self._game_state['canvas']['height'] / 2
                    ball['dx'] = 5  # Reset speed and direction
                    ball['dy'] = 5 if ball['dy'] > 0 else -5
                
                # Send game state update to all players
                await self.channel_layer.group_send(
                    self.channel_group_name,
                    {
                        'type': 'game_state_update',
                        'game_state': self._game_state
                    }
                )
                
                # Wait before next update (60 FPS)
                await asyncio.sleep(1/60)
                
        except Exception as e:
            logger.error(f'Error in game loop: {str(e)}', exc_info=True)
            await self.send_json({
                'type': 'error',
                'message': 'Game loop error'
            })

    async def game_state_update(self, event):
        """
        Send game state update to WebSocket.
        """
        try:
            logger.info(f"Broadcasting game state update to {self.user.username}")
            await self.send_json(event)
        except Exception as e:
            logger.error(f"Error sending game state update: {str(e)}", exc_info=True)

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
