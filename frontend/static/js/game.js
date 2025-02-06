console.log('=== GAME.JS LOADED ===');

class PongGame {
    constructor() {
        // Bind methods to this instance first
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.animate = this.animate.bind(this);
        this.draw = this.draw.bind(this);
        this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);
        
        // Initialize properties
        this.connected = false;
        this.connectionAttempt = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.heartbeatInterval = null;
        this.gameSocket = null;
        this.currentUser = null;
        this.gameId = null;
        this.gameState = null;
        this.animationFrameId = null;
        this.gameStarted = false;
        this.isCreatingGame = false;
        this.canvas = null;
        this.ctx = null;
        this.keyState = { w: false, s: false };
        
        this.paddleSpeed = 25; // pixels to move per keypress
        
        // Start initialization
        this.init().catch(error => {
            console.error('Failed to initialize game:', error);
        });
    }

    async init() {
        console.log('Initializing game...');
        try {
            const valid = await this.checkSession();
            if (!valid) {
                console.error('Invalid session, redirecting to login...');
                window.location.href = '/login';
                return;
            }
            
            // Initialize in correct order
            this.initializeElements();
            this.initializeGameState();
            this.initializeEventListeners();
            this.setupWebSocket();
            
            console.log('Game initialization complete');
        } catch (error) {
            console.error('Error during initialization:', error);
        }
    }

    async checkSession() {
        try {
            console.log('Checking session...');
            const response = await fetch('/api/users/profile/', {
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                    'X-CSRFToken': this.getCookie('csrftoken')
                }
            });
            
            console.log('Session check response:', response.status);
            if (!response.ok) {
                console.error('Session check failed:', response.status);
                const text = await response.text();
                console.error('Response text:', text);
                return false;
            }
            
            const userData = await response.json();
            console.log('Session valid for user:', userData);
            
            // Store the current user's info
            this.currentUser = userData;
            
            // Update UI with user info
            const usernameElement = document.getElementById('username');
            const userAvatarElement = document.getElementById('userAvatar');
            
            console.log('Username element:', usernameElement);
            console.log('Avatar element:', userAvatarElement);
            
            if (usernameElement) {
                usernameElement.textContent = userData.username;
                console.log('Username updated to:', userData.username);
            } else {
                console.error('Username element not found');
            }
            
            if (userAvatarElement) {
                userAvatarElement.textContent = userData.username[0].toUpperCase();
                console.log('Avatar updated to:', userData.username[0].toUpperCase());
            } else {
                console.error('Avatar element not found');
            }
            
            return true;
        } catch (error) {
            console.error('Error checking session:', error);
            console.error('Error stack:', error.stack);
            return false;
        }
    }
    
    getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i].trim();
                if (cookie.substring(0, name.length + 1) === (name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
    
    initializeElements() {
        console.log('Initializing game elements...');
        
        try {
            // Get DOM elements
            this.canvas = document.getElementById('gameCanvas');
            console.log('Canvas element:', this.canvas);
            
            this.canvasContainer = document.getElementById('gameCanvasContainer');
            console.log('Canvas container:', this.canvasContainer);
            
            this.createGameBtn = document.getElementById('createGameBtn');
            console.log('Create game button:', this.createGameBtn);
            
            this.joinGameBtn = document.getElementById('joinGameBtn');
            console.log('Join game button:', this.joinGameBtn);
            
            this.gameStatus = document.getElementById('gameStatus');
            console.log('Game status:', this.gameStatus);
            
            this.player1Score = document.getElementById('player1Score');
            console.log('Player 1 score:', this.player1Score);
            
            this.player2Score = document.getElementById('player2Score');
            console.log('Player 2 score:', this.player2Score);
            
            // Initialize canvas if it exists
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                if (!this.ctx) {
                    console.error('Could not get canvas context');
                } else {
                    // Set initial canvas size
                    this.canvas.width = 800;
                    this.canvas.height = 600;
                    // Clear the canvas with black background
                    this.ctx.fillStyle = '#000000';
                    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                    console.log('Canvas initialized successfully');
                }
            } else {
                console.error('Canvas element not found');
            }
            
            // Add event listeners to buttons if they exist
            if (this.createGameBtn) {
                this.createGameBtn.disabled = true; // Initially disabled
                this.createGameBtn.addEventListener('click', () => {
                    console.log('Create game button clicked');
                    this.startGame();
                });
                console.log('Create game button event listener added');
            } else {
                console.error('Create game button not found');
            }
            
            if (this.joinGameBtn) {
                this.joinGameBtn.disabled = true; // Initially disabled
                this.joinGameBtn.addEventListener('click', () => {
                    console.log('Join game button clicked');
                    this.joinGame();
                });
                console.log('Join game button event listener added');
            } else {
                console.error('Join game button not found');
            }

            // Add window resize handler
            window.addEventListener('resize', () => {
                if (this.canvas) {
                    // Maintain aspect ratio while fitting the container
                    const container = this.canvas.parentElement;
                    const containerWidth = container.clientWidth;
                    const containerHeight = container.clientHeight;
                    const aspectRatio = 800 / 600;

                    let width = containerWidth;
                    let height = width / aspectRatio;

                    if (height > containerHeight) {
                        height = containerHeight;
                        width = height * aspectRatio;
                    }

                    this.canvas.style.width = `${width}px`;
                    this.canvas.style.height = `${height}px`;
                }
            });
            
            console.log('Game elements initialization completed');
        } catch (error) {
            console.error('Error initializing game elements:', error);
            console.error('Error stack:', error.stack);
        }
    }
    
    initializeGameState() {
        // Game state
        this.gameStarted = false;
        this.gameId = null;
        this.playerId = null;
        this.connected = false;
        this.gameSocket = null;
        this.score = { left: 0, right: 0 };
        
        // Initial game objects
        this.ball = { x: 400, y: 300, dx: 5, dy: 5, radius: 10 };
        this.paddles = {
            left: { x: 50, y: 250, width: 20, height: 100 },
            right: { x: 730, y: 250, width: 20, height: 100 }
        };
        
        // WebSocket connection settings
        this.maxReconnectAttempts = 10; // Increased from default
        this.reconnectAttempts = 0;
        this.reconnectTimeout = null;
        this.heartbeatInterval = null;
        
        // Hide canvas initially
        if (this.canvasContainer) {
            this.canvasContainer.style.display = 'none';
        }
        
        console.log('Game state initialized');
    }
    
    initializeEventListeners() {
        // Disable buttons initially
        this.createGameBtn.disabled = true;
        this.joinGameBtn.disabled = true;
        
        // Bind event listeners
        this.createGameBtn.addEventListener('click', () => this.startGame());
        this.joinGameBtn.addEventListener('click', () => this.joinGame());
        window.addEventListener('keydown', this.handleKeyPress);
        window.addEventListener('keyup', this.handleKeyUp);
        
        console.log('Event listeners initialized');
    }

    handleKeyUp(event) {
        // Handle key release events if needed
        // This can be used to stop paddle movement when keys are released
        if (this.gameStarted && this.connected) {
            // Add your key up handling logic here if needed
            console.log('Key released:', event.key);
        }
    }
    
    showCanvas() {
        try {
            console.log('Attempting to show canvas container...');
            const container = document.getElementById('gameCanvasContainer');
            
            if (!container) {
                throw new Error('Canvas container element not found');
            }
            
            // Update the instance variable
            this.canvasContainer = container;
            this.canvasContainer.style.display = 'block';
            
            console.log('Canvas container shown successfully');
            
            // Force a redraw
            if (this.ctx) {
                this.draw();
            }
        } catch (error) {
            console.error('Error showing canvas:', error);
            throw error; // Re-throw to handle it in the caller
        }
    }
    
    hideCanvas() {
        try {
            console.log('Attempting to hide canvas container...');
            const container = document.getElementById('gameCanvasContainer');
            
            if (!container) {
                throw new Error('Canvas container element not found');
            }
            
            // Update the instance variable
            this.canvasContainer = container;
            this.canvasContainer.style.display = 'none';
            
            console.log('Canvas container hidden successfully');
        } catch (error) {
            console.error('Error hiding canvas:', error);
            throw error; // Re-throw to handle it in the caller
        }
    }
    
    setupWebSocket() {
        console.log('Setting up WebSocket...');
        
        if (this.gameSocket) {
            console.log('WebSocket already exists, state:', this.gameSocket.readyState);
            if (this.gameSocket.readyState === WebSocket.OPEN) {
                console.log('WebSocket is already open and connected');
                this.connected = true;
                return;
            }
            console.log('Closing previous connection...');
            this.gameSocket.close();
        }

        // Clear any existing intervals
        if (this.heartbeatInterval) {
            console.log('Clearing existing heartbeat interval');
            clearInterval(this.heartbeatInterval);
        }

        const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        // Use localhost:8000 for development
        const wsUrl = `${wsScheme}://localhost:8000/ws/game/`;
        console.log('Attempting to connect to:', wsUrl);
        
        try {
            this.gameSocket = new WebSocket(wsUrl);
            console.log('WebSocket instance created');
        } catch (error) {
            console.error('Error creating WebSocket:', error);
            return;
        }
        
        this.gameSocket.onopen = () => {
            console.log('WebSocket connection established successfully');
            console.log('Current user:', this.currentUser);
            
            this.connected = true;
            this.connectionAttempt = false;
            this.reconnectAttempts = 0; // Reset reconnect attempts on successful connection
            
            // Enable game buttons when connection is established
            console.log('Enabling game buttons...');
            if (this.createGameBtn) {
                console.log('Create game button found, enabling...');
                this.createGameBtn.disabled = false;
            } else {
                console.error('Create game button not found!');
            }
            
            if (this.joinGameBtn) {
                console.log('Join game button found, enabling...');
                this.joinGameBtn.disabled = false;
            } else {
                console.error('Join game button not found!');
            }
            
            // Start heartbeat
            console.log('Setting up heartbeat interval...');
            this.heartbeatInterval = setInterval(() => {
                if (this.gameSocket && this.gameSocket.readyState === WebSocket.OPEN) {
                    console.log('Sending heartbeat...');
                    this.gameSocket.send(JSON.stringify({ type: 'heartbeat' }));
                }
            }, 30000); // Send heartbeat every 30 seconds
            
            // Send user info after connection
            if (this.currentUser) {
                console.log('Sending user info:', this.currentUser);
                this.gameSocket.send(JSON.stringify({
                    type: 'user_connected',
                    user_id: this.currentUser.id,
                    username: this.currentUser.username
                }));
            } else {
                console.error('No current user information available!');
            }
        };
        
        this.gameSocket.onmessage = this.handleWebSocketMessage.bind(this);
        this.gameSocket.onclose = this.handleWebSocketClose.bind(this);
        this.gameSocket.onerror = this.handleWebSocketError.bind(this);
    }
    
    handleWebSocketOpen() {
        console.log('WebSocket connection established successfully');
        // Enable game buttons when connection is established
        if (this.createGameBtn) this.createGameBtn.disabled = false;
        if (this.joinGameBtn) this.joinGameBtn.disabled = false;
    }
    
    handleWebSocketClose(event) {
        console.log('WebSocket connection closed:', event);
        this.connected = false;
        
        // Clear heartbeat interval
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }
        
        if (!this.connectionAttempt && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            
            // Use exponential backoff for reconnection attempts
            const backoffTime = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
            console.log(`Waiting ${backoffTime}ms before next reconnection attempt`);
            
            this.reconnectTimeout = setTimeout(() => {
                this.setupWebSocket();
            }, backoffTime);
        } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Maximum reconnection attempts reached. Please refresh the page.');
        }
    }
    
    handleWebSocketError(error) {
        console.error('WebSocket error:', error);
    }
    
    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            // Only log non-game-state messages
            if (data.type !== 'game_state_update') {
                console.log('Received WebSocket message:', event.data);
            }
            
            switch (data.type) {
                case 'connection_established':
                    console.log('Connection established:', {
                        playerId: data.user.id,
                        username: data.user.username
                    });
                    this.connected = true;
                    this.playerId = data.user.id;
                    break;

                case 'game_created':
                    console.log('Game created, initializing game state:', data);
                    this.gameId = data.game_id;
                    this.gameState = data.game_state;
                    this.isCreatingGame = false;
                    
                    // Set player role for game creator
                    this.playerRole = 'player1';
                    this.gameState.player1_id = this.playerId;
                    
                    console.log('Set as player1 with ID:', this.playerId);
                    
                    // Show canvas and start animation
                    if (this.canvasContainer) {
                        this.canvasContainer.style.display = 'block';
                    }
                    
                    // Start animation loop even when waiting
                    if (!this.animationFrameId) {
                        console.log('Starting animation loop');
                        this.gameStarted = true; // Set this to true to allow drawing
                        this.animationFrameId = requestAnimationFrame(() => this.animate());
                    }
                    
                    if (this.gameStatus) {
                        this.gameStatus.textContent = 'Waiting for opponent...';
                    }
                    break;

                case 'game_joined':
                    console.log('Game joined with data:', data);
                    this.gameId = data.game_id;
                    this.gameState = data.game_state;
                    
                    // Set player roles
                    if (data.player1_id && data.player2_id) {
                        if (this.playerId === data.player1_id) {
                            this.playerRole = 'player1';
                            console.log('Set as player1 with ID:', this.playerId);
                        } else if (this.playerId === data.player2_id) {
                            this.playerRole = 'player2';
                            console.log('Set as player2 with ID:', this.playerId);
                        }
                        
                        // Store player IDs in game state
                        this.gameState.player1_id = data.player1_id;
                        this.gameState.player2_id = data.player2_id;
                    }
                    
                    this.gameStarted = true;
                    
                    if (this.canvasContainer) {
                        this.canvasContainer.style.display = 'block';
                    }
                    if (this.gameStatus) {
                        this.gameStatus.textContent = 'Game in progress';
                    }
                    
                    // Start animation loop
                    if (!this.animationFrameId) {
                        this.animationFrameId = requestAnimationFrame(() => this.animate());
                    }
                    break;

                case 'game_state_update':
                    if (data.game_state) {
                        console.log('Game state update:', {
                            myPlayerId: this.playerId,
                            player1_id: data.game_state.player1_id,
                            player2_id: data.game_state.player2_id,
                            player1_y: data.game_state.paddles.player1.y,
                            player2_y: data.game_state.paddles.player2.y
                        });
                        this.gameState = data.game_state;
                        
                        // Update scores if available
                        if (this.gameState.score) {
                            if (this.player1Score) {
                                this.player1Score.textContent = this.gameState.score.player1;
                            }
                            if (this.player2Score) {
                                this.player2Score.textContent = this.gameState.score.player2;
                            }
                        }
                        
                        // Make sure canvas is visible and animation is running
                        if (this.canvasContainer) {
                            this.canvasContainer.style.display = 'block';
                        }
                        
                        // Start animation if not already running
                        if (!this.animationFrameId) {
                            console.log('Starting animation loop');
                            this.animationFrameId = requestAnimationFrame(() => this.animate());
                        }
                    }
                    break;

                case 'game_over':
                    this.gameStarted = false;
                    if (this.animationFrameId) {
                        cancelAnimationFrame(this.animationFrameId);
                        this.animationFrameId = null;
                    }
                    if (this.gameStatus) {
                        this.gameStatus.textContent = 'Game Over!';
                    }
                    break;

                case 'error':
                    if (this.gameStatus) {
                        this.gameStatus.textContent = `Error: ${data.message}`;
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }
    
    startGame() {
        if (!this.connected || this.isCreatingGame || this.gameId) {
            console.log('Cannot create game:', {
                connected: this.connected,
                isCreatingGame: this.isCreatingGame,
                hasGameId: !!this.gameId
            });
            return;
        }
        
        this.isCreatingGame = true;
        
        if (this.createGameBtn) {
            this.createGameBtn.disabled = true;
        }
        
        if (this.joinGameBtn) {
            this.joinGameBtn.disabled = true;
        }
        
        try {
            this.gameSocket.send(JSON.stringify({
                type: 'create_game'
            }));
        } catch (error) {
            console.error('Error creating game:', error);
        }
    }
    
    joinGame() {
        if (!this.connected) {
            console.error('Not connected to game server');
            return;
        }
        
        if (this.createGameBtn) this.createGameBtn.disabled = true;
        if (this.joinGameBtn) this.joinGameBtn.disabled = true;
        
        this.gameSocket.send(JSON.stringify({
            type: 'join_game'
        }));
    }

    handleKeyPress(event) {
        if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {

            return;
        }
        
        const key = event.key.toLowerCase();
        if (key === 'w' || key === 's') {
            event.preventDefault();
            
            // Get current paddle position
            const paddleKey = this.playerId === this.gameState.player1_id ? 'player1' : 'player2';
            const paddle = this.gameState.paddles[paddleKey];
            const canvasHeight = this.gameState.canvas.height;
            

            
            // Move paddle based on key
            let direction = null;
            if (key === 'w' && paddle.y > 0) {
                direction = 'up';
            } else if (key === 's' && paddle.y < canvasHeight - paddle.height) {
                direction = 'down';
            }
            
            if (direction) {
                this.gameSocket.send(JSON.stringify({
                    type: 'paddle_move',
                    direction: direction
                }));
            }
        }
    }
    
    updatePaddlePosition() {
        if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {
            console.log('Cannot update paddle: socket:', !!this.gameSocket, 'state:', this.gameSocket?.readyState, 'gameId:', this.gameId, 'started:', this.gameStarted);
            return;
        }
        
        const now = performance.now();
        if (now - this.lastPaddleUpdate < this.paddleUpdateInterval) {
            return;
        }
        
        // Get current paddle position
        const paddleKey = this.playerId === this.gameState.player1_id ? 'player1' : 'player2';
        const paddle = this.gameState.paddles[paddleKey];
        const canvasHeight = this.gameState.canvas.height;
        
        let direction = null;
        if (this.keyState.w && paddle.y > 0) {
            direction = 'up';
        } else if (this.keyState.s && paddle.y < canvasHeight - paddle.height) {
            direction = 'down';
        }
        
        if (direction) {
            this.gameSocket.send(JSON.stringify({
                type: 'paddle_move',
                direction: direction
            }));
            this.lastPaddleUpdate = now;
        }
    }
    
    animate() {
        if (!this.gameStarted || !this.gameState) {
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
            return;
        }

        // Update paddle position based on key state
        if (this.keyState.w || this.keyState.s) {
            this.updatePaddlePosition();
        }

        // Draw the current game state
        this.draw();

        // Continue the animation loop
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
    
    
    draw() {
        try {
            if (!this.ctx || !this.gameState) {
                console.log('Cannot draw, missing context or game state:', {
                    hasContext: !!this.ctx,
                    hasGameState: !!this.gameState
                });
                return;
            }
            
            console.log('Drawing game state:', this.gameState);
            
            const { canvas, ball, paddles } = this.gameState;
            
            // Ensure canvas dimensions are set
            if (!this.canvas.width || !this.canvas.height) {
                this.canvas.width = canvas.width;
                this.canvas.height = canvas.height;
            }
            
            // Clear canvas
            this.ctx.fillStyle = '#000000';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
            
            // Draw center line
            this.ctx.setLineDash([5, 15]);
            this.ctx.beginPath();
            this.ctx.moveTo(this.canvas.width / 2, 0);
            this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
            this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            
            // Draw ball
            if (ball) {
                this.ctx.beginPath();
                this.ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                this.ctx.fillStyle = '#00ff88';
                this.ctx.shadowColor = '#00ff88';
                this.ctx.shadowBlur = 15;
                this.ctx.fill();
                this.ctx.shadowBlur = 0;
            }
            
            // Draw paddles
            this.ctx.fillStyle = '#ffffff';
            this.ctx.shadowColor = '#ffffff';
            this.ctx.shadowBlur = 10;
            
            // Draw player1 paddle
            if (paddles.player1) {
                this.ctx.fillRect(
                    paddles.player1.x,
                    paddles.player1.y,
                    paddles.player1.width,
                    paddles.player1.height
                );
            }
            
            // Draw player2 paddle
            if (paddles.player2) {
                this.ctx.fillRect(
                    paddles.player2.x,
                    paddles.player2.y,
                    paddles.player2.width,
                    paddles.player2.height
                );
            }
            
            // Reset shadow blur after drawing paddles
            this.ctx.shadowBlur = 0;
            
            // Draw scores
            if (this.gameState.score) {
                this.ctx.fillStyle = '#ffffff';
                this.ctx.font = '48px Arial';
                this.ctx.textAlign = 'center';
                
                // Player 1 score on the left
                this.ctx.fillText(
                    this.gameState.score.player1,
                    this.canvas.width * 0.25,
                    60
                );
                
                // Player 2 score on the right
                this.ctx.fillText(
                    this.gameState.score.player2,
                    this.canvas.width * 0.75,
                    60
                );
            }
        } catch (error) {
            console.error('Error in draw method:', error);
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
                this.animationFrameId = null;
            }
        }
    }

    
    updateGameState(state) {
        if (!state) return;
        
        try {
            // Update game status and player IDs
            if (state.status) {
                this.gameStatus = state.status;
            }
            if (state.player1_id) {
                this.player1Id = state.player1_id;
            }
            if (state.player2_id) {
                this.player2Id = state.player2_id;
            }
            
            // Update ball position
            if (state.ball) {
                this.ball = state.ball;
            }
            
            // Update paddle positions
            if (state.paddles) {
                // Initialize paddles if they don't exist
                if (!this.paddles) {
                    this.paddles = {
                        left: { x: 50, y: 250, width: 20, height: 100 },
                        right: { x: 730, y: 250, width: 20, height: 100 }
                    };
                }
                
                // Update left paddle
                if (state.paddles.player1) {
                    this.paddles.left.y = state.paddles.player1.y;
                    console.log('Updated left paddle position:', this.paddles.left.y);
                }
                
                // Update right paddle
                if (state.paddles.player2) {
                    this.paddles.right.y = state.paddles.player2.y;
                    console.log('Updated right paddle position:', this.paddles.right.y);
                }
            }
            
            // Update score
            if (state.score) {
                if (this.player1Score) this.player1Score.textContent = state.score.player1;
                if (this.player2Score) this.player2Score.textContent = state.score.player2;
            }
        } catch (error) {
            console.error('Error updating game state:', error);
        }
    }

    handleGameOver(data) {
        const winner = data.winner === this.playerId ? 'You won!' : 'You lost!';
        alert(`Game Over! ${winner}`);
        document.querySelector('.canvas-container').style.display = 'none';
        document.querySelector('.game-buttons').style.display = 'block';
    }
};  // Added semicolon here

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new PongGame();
});
