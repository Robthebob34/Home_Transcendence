console.log('=== GAME.JS LOADED ===');

class PongGame {
    constructor() {
        console.log('Game constructor called');
        
        // Bind methods to this instance first
        this.handleKeyPress = this.handleKeyPress.bind(this);
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
                    console.log('Canvas initialized successfully');
                }
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
        window.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        console.log('Event listeners initialized');
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
        const wsUrl = `${wsScheme}://${window.location.host}/ws/game/`;
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
            console.log('Received message:', event.data);
            const data = JSON.parse(event.data);
            console.log('Parsed message data:', data);
            
            switch (data.type) {
                case 'connection_established':
                    console.log('Connected to game server');
                    this.connected = true;
                    this.playerId = data.user.id;
                    break;

                case 'game_created':
                    console.log('Game created:', data.game_id);
                    this.gameId = data.game_id;
                    if (this.gameStatus) {
                        this.gameStatus.textContent = 'Waiting for opponent...';
                    }
                    break;

                case 'game_joined':
                    console.log('Game joined');
                    this.gameStarted = true;
                    if (this.canvasContainer) {
                        this.canvasContainer.style.display = 'block';
                    }
                    if (this.gameStatus) {
                        this.gameStatus.textContent = 'Game starting...';
                    }
                    // Start animation loop when game is joined
                    requestAnimationFrame(() => this.animate());
                    break;

                case 'game_state_update':
                    console.log('Game state update received:', data);
                    if (!this.gameStarted) {
                        this.gameStarted = true;
                        if (this.canvasContainer) {
                            this.canvasContainer.style.display = 'block';
                        }
                        // Start animation loop if not already started
                        if (!this.animationFrameId) {
                            this.animationFrameId = requestAnimationFrame(this.animate);
                        }
                    }
                    if (data.game_state) {
                        console.log('Updating game state:', data.game_state);
                        this.updateGameState(data.game_state);
                    }
                    break;

                case 'game_over':
                    this.handleGameOver(data);
                    break;

                case 'error':
                    console.error('Game error:', data.message);
                    if (this.gameStatus) {
                        this.gameStatus.textContent = `Error: ${data.message}`;
                    }
                    break;

                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }
    
    startGame() {
        console.log('startGame called');
        console.log('Connection status:', this.connected);
        console.log('WebSocket state:', this.gameSocket ? this.gameSocket.readyState : 'No WebSocket');
        
        if (!this.connected) {
            console.error('Not connected to game server');
            return;
        }
        
        if (this.gameId) {
            console.log('Game already created, skipping... Game ID:', this.gameId);
            return;
        }
        
        console.log('Starting new game...');
        if (this.createGameBtn) {
            console.log('Disabling create game button');
            this.createGameBtn.disabled = true;
        } else {
            console.error('Create game button not found');
        }
        
        if (this.joinGameBtn) {
            console.log('Disabling join game button');
            this.joinGameBtn.disabled = true;
        } else {
            console.error('Join game button not found');
        }
        
        try {
            const message = JSON.stringify({
                type: 'create_game'
            });
            console.log('Sending create_game message:', message);
            this.gameSocket.send(message);
            console.log('Message sent successfully');
        } catch (error) {
            console.error('Error sending create_game message:', error);
        }
    }
    
    joinGame() {
        if (!this.connected) {
            console.error('Not connected to game server');
            return;
        }
        
        console.log('Attempting to join game...');
        if (this.createGameBtn) this.createGameBtn.disabled = true;
        if (this.joinGameBtn) this.joinGameBtn.disabled = true;
        
        this.gameSocket.send(JSON.stringify({
            type: 'join_game'
        }));
    }

    handleKeyPress(event) {
        if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN || !this.gameId) return;
        
        let direction = null;
        if (event.key === 'ArrowUp') direction = 'up';
        if (event.key === 'ArrowDown') direction = 'down';
        
        if (direction) {
            console.log('Sending paddle move:', direction);
            this.gameSocket.send(JSON.stringify({
                type: 'paddle_move',
                direction: direction
            }));
        }
    }
    
    animate() {
        try {
            if (!this.gameStarted) {
                console.log('Game not started, waiting...');
                return;
            }

            // Draw the current game state
            this.draw();

            // Continue the animation loop with frame rate control
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
            this.animationFrameId = requestAnimationFrame(this.animate);
        } catch (error) {
            console.error('Error in animation loop:', error);
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
        }
    }
    
    draw() {
        try {
            if (!this.ctx || !this.gameStarted) {
                console.log('Cannot draw: ctx or game not started');
                return;
            }
            
            // Ensure canvas dimensions are set
            if (!this.canvas.width || !this.canvas.height) {
                this.canvas.width = 800;
                this.canvas.height = 600;
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
            
            // Draw ball if it exists
            if (this.ball && typeof this.ball.x === 'number' && typeof this.ball.y === 'number') {
                this.ctx.beginPath();
                this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius || 10, 0, Math.PI * 2);
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
            
            // Initialize default paddle positions if they don't exist
            if (!this.paddles) {
                this.paddles = {
                    left: { x: 50, y: 250, width: 20, height: 100 },
                    right: { x: 730, y: 250, width: 20, height: 100 }
                };
            }
        } catch (error) {
            console.error('Error in draw method:', error);
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
        }
        
        try {
            // Draw left paddle
            if (this.paddles && this.paddles.left) {
                console.log('Drawing left paddle:', this.paddles.left);
                this.ctx.fillRect(
                    this.paddles.left.x,
                    this.paddles.left.y,
                    this.paddles.left.width,
                    this.paddles.left.height
                );
            }
            
            // Draw right paddle
            if (this.paddles && this.paddles.right) {
                console.log('Drawing right paddle:', this.paddles.right);
                this.ctx.fillRect(
                    this.paddles.right.x,
                    this.paddles.right.y,
                    this.paddles.right.width,
                    this.paddles.right.height
                );
            }
            
            // Reset shadow
            this.ctx.shadowBlur = 0;
        } catch (error) {
            console.error('Error drawing paddles:', error);
        }
    }
    
    updateGameState(state) {
        if (!state) return;
        console.log('Updating game state with:', state);
        
        // Update ball position
        if (state.ball) {
            this.ball = state.ball;
            console.log('Updated ball position:', this.ball);
        }
        
        // Update paddle positions
        if (state.paddles) {
            // Create a new paddles object if it doesn't exist
            if (!this.paddles) {
                this.paddles = {
                    left: { x: 50, y: 250, width: 20, height: 100 },
                    right: { x: 730, y: 250, width: 20, height: 100 }
                };
            }
            
            // Update paddle positions
            if (state.paddles.player1) {
                this.paddles.left = {
                    ...this.paddles.left,
                    ...state.paddles.player1
                };
                console.log('Updated left paddle:', this.paddles.left);
            }
            if (state.paddles.player2) {
                this.paddles.right = {
                    ...this.paddles.right,
                    ...state.paddles.player2
                };
                console.log('Updated right paddle:', this.paddles.right);
            }
        }
        
        // Update score
        if (state.score) {
            this.score = state.score;
            if (this.player1Score) this.player1Score.textContent = state.score.left;
            if (this.player2Score) this.player2Score.textContent = state.score.right;
        }
    }

    handleGameOver(data) {
        const winner = data.winner === this.playerId ? 'You won!' : 'You lost!';
        alert(`Game Over! ${winner}`);
        document.querySelector('.canvas-container').style.display = 'none';
        document.querySelector('.game-buttons').style.display = 'block';
    }
}

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new PongGame();
});
