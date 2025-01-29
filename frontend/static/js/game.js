class PongGame {
    constructor() {
        console.log('Waiting for DOM to be ready...');
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
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
            const response = await fetch('/api/users/profile/', {
                credentials: 'include',
                headers: {
                    'X-Requested-With': 'XMLHttpRequest',
                }
            });
            
            if (!response.ok) {
                console.error('Session check failed:', response.status);
                return false;
            }
            
            const userData = await response.json();
            console.log('Session valid for user:', userData.username);
            
            // Store the current user's info
            this.currentUser = userData;
            
            // Update UI with user info
            const usernameElement = document.getElementById('username');
            const userAvatarElement = document.getElementById('userAvatar');
            
            if (usernameElement) {
                usernameElement.textContent = userData.username;
            }
            if (userAvatarElement) {
                userAvatarElement.textContent = userData.username[0].toUpperCase();
            }
            
            return true;
        } catch (error) {
            console.error('Error checking session:', error);
            return false;
        }
    }
    
    initializeElements() {
        console.log('Initializing game elements...');
        
        // Get DOM elements
        this.canvas = document.getElementById('gameCanvas');
        this.canvasContainer = document.getElementById('gameCanvasContainer');
        this.createGameBtn = document.getElementById('createGameBtn');
        this.joinGameBtn = document.getElementById('joinGameBtn');
        this.gameStatus = document.getElementById('gameStatus');
        this.player1Score = document.getElementById('player1Score');
        this.player2Score = document.getElementById('player2Score');
        
        // Verify all elements exist
        const elements = {
            canvas: this.canvas,
            canvasContainer: this.canvasContainer,
            createGameBtn: this.createGameBtn,
            joinGameBtn: this.joinGameBtn,
            gameStatus: this.gameStatus,
            player1Score: this.player1Score,
            player2Score: this.player2Score
        };
        
        for (const [name, element] of Object.entries(elements)) {
            if (!element) {
                throw new Error(`Required element not found: ${name}`);
            }
        }
        
        // Initialize canvas
        this.ctx = this.canvas.getContext('2d');
        if (!this.ctx) {
            throw new Error('Could not get canvas context');
        }
        
        // Set initial canvas size
        this.canvas.width = 800;
        this.canvas.height = 600;
        
        console.log('Game elements initialized successfully');
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
        if (this.gameSocket) {
            console.log('WebSocket already exists, closing previous connection...');
            this.gameSocket.close();
        }

        console.log('Setting up WebSocket connection...');
        const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
        const wsUrl = `${wsScheme}://${window.location.host}/ws/game/`;
        
        console.log('Attempting to connect to:', wsUrl);
        this.gameSocket = new WebSocket(wsUrl);
        
        this.gameSocket.onopen = () => {
            console.log('WebSocket connection established successfully');
            this.connected = true;
            this.connectionAttempt = false;
            
            // Send user info after connection
            if (this.currentUser) {
                this.gameSocket.send(JSON.stringify({
                    type: 'user_connected',
                    user_id: this.currentUser.id,
                    username: this.currentUser.username
                }));
            }
        };
        
        this.gameSocket.onmessage = this.handleWebSocketMessage.bind(this);
        this.gameSocket.onclose = this.handleWebSocketClose.bind(this);
        this.gameSocket.onerror = this.handleWebSocketError.bind(this);
    }
    
    handleWebSocketOpen() {
        console.log('WebSocket connection established successfully');
    }
    
    handleWebSocketClose(event) {
        console.log('WebSocket connection closed:', event);
        this.connected = false;
        
        if (!this.connectionAttempt && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            this.reconnectTimeout = setTimeout(() => {
                this.setupWebSocket();
            }, 3000);
        }
    }
    
    handleWebSocketError(error) {
        console.error('WebSocket error:', error);
    }
    
    handleWebSocketMessage(event) {
        try {
            console.log('Received message:', event.data);
            const data = JSON.parse(event.data);
            
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
                    break;

                case 'game_state_update':
                    if (!this.gameStarted) {
                        this.gameStarted = true;
                        if (this.canvasContainer) {
                            this.canvasContainer.style.display = 'block';
                        }
                    }
                    if (data.game_state) {
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
        if (!this.connected) {
            console.error('Not connected to game server');
            return;
        }
        
        if (this.gameId) {
            console.log('Game already created, skipping...');
            return;
        }
        
        console.log('Starting new game...');
        this.createGameBtn.disabled = true;
        this.joinGameBtn.disabled = true;
        
        this.gameSocket.send(JSON.stringify({
            type: 'create_game'
        }));
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
        if (!this.gameStarted) {
            console.log('Game not started, waiting...');
        }
        // Draw the current game state
        this.draw();
        // Continue the animation loop
        requestAnimationFrame(this.animate);
    }
    
    draw() {
        if (!this.ctx || !this.gameStarted) return;
        
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
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = '#00ff88';
        this.ctx.shadowColor = '#00ff88';
        this.ctx.shadowBlur = 15;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        
        // Draw paddles
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = '#ffffff';
        this.ctx.shadowBlur = 10;
        
        // Left paddle
        this.ctx.fillRect(
            this.paddles.left.x,
            this.paddles.left.y,
            this.paddles.left.width,
            this.paddles.left.height
        );
        
        // Right paddle
        this.ctx.fillRect(
            this.paddles.right.x,
            this.paddles.right.y,
            this.paddles.right.width,
            this.paddles.right.height
        );
        
        this.ctx.shadowBlur = 0;
    }
    
    updateGameState(state) {
        if (!state) return;
        
        // Update ball position
        if (state.ball) {
            this.ball = state.ball;
        }
        
        // Update paddle positions
        if (state.paddles) {
            this.paddles = state.paddles;
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
