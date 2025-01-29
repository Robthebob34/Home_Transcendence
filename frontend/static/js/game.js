class PongGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.gameSocket = null;
        this.gameId = null;
        this.playerId = null;
        this.connected = false;
        this.connectionAttempt = false;
        this.reconnectTimeout = null;
        this.maxReconnectAttempts = 5;
        this.reconnectAttempts = 0;
        
        // Game state
        this.ball = { x: 400, y: 200, dx: 5, dy: 5, radius: 8 };
        this.paddles = {
            left: { x: 50, y: 150, width: 10, height: 100 },
            right: { x: 740, y: 150, width: 10, height: 100 }
        };
        this.score = { left: 0, right: 0 };
        
        // Visual settings
        this.colors = {
            background: 'rgba(0, 0, 0, 0.3)',
            ball: '#00ff88',
            paddle: '#ffffff',
            centerLine: 'rgba(255, 255, 255, 0.2)',
            score: '#00ff88',
            glow: '0 0 10px rgba(0, 255, 136, 0.5)'
        };

        // Get button elements
        this.createGameBtn = document.getElementById('createGameBtn');
        this.joinGameBtn = document.getElementById('joinGameBtn');
        
        // Bind event listeners
        this.createGameBtn.addEventListener('click', () => this.startGame());
        this.joinGameBtn.addEventListener('click', () => this.joinGame());
        window.addEventListener('keydown', (e) => this.handleKeyPress(e));
        
        // Disable buttons initially
        this.createGameBtn.disabled = true;
        this.joinGameBtn.disabled = true;
        
        // Initialize WebSocket
        this.setupWebSocket();
    }
    
    setupWebSocket() {
        if (this.connectionAttempt || this.connected) {
            console.log('Already connected or attempting to connect');
            return;
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnection attempts reached');
            alert('Unable to connect to game server. Please refresh the page.');
            return;
        }
        
        try {
            this.connectionAttempt = true;
            console.log('Setting up new WebSocket connection...');
            
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}/ws/game/`;
            
            if (this.gameSocket) {
                console.log('Closing existing WebSocket connection');
                this.gameSocket.close();
                this.gameSocket = null;
            }
            
            this.gameSocket = new WebSocket(wsUrl);
            
            this.gameSocket.onopen = () => {
                console.log('WebSocket connection opened - waiting for server confirmation');
            };
            
            this.gameSocket.onmessage = (event) => {
                this.handleWebSocketMessage(event);
            };
            
            this.gameSocket.onclose = () => {
                console.log('WebSocket connection closed');
                this.connected = false;
                this.connectionAttempt = false;
                this.createGameBtn.disabled = true;
                this.joinGameBtn.disabled = true;
                
                if (!this.gameId && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    console.log(`Reconnection attempt ${this.reconnectAttempts} of ${this.maxReconnectAttempts}`);
                    
                    if (this.reconnectTimeout) {
                        clearTimeout(this.reconnectTimeout);
                    }
                    
                    this.reconnectTimeout = setTimeout(() => {
                        if (!this.connected && !this.connectionAttempt) {
                            this.setupWebSocket();
                        }
                    }, 5000);
                }
            };
            
            this.gameSocket.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.connected = false;
                this.connectionAttempt = false;
                this.createGameBtn.disabled = true;
                this.joinGameBtn.disabled = true;
            };
        } catch (error) {
            console.error('Error setting up WebSocket:', error);
            this.connected = false;
            this.connectionAttempt = false;
            this.createGameBtn.disabled = true;
            this.joinGameBtn.disabled = true;
        }
    }
    
    startGame() {
        if (!this.connected || !this.gameSocket) {
            console.error('Cannot create game: WebSocket not connected');
            return;
        }
        
        console.log('Creating new game...');
        this.createGameBtn.disabled = true;
        this.joinGameBtn.disabled = true;
        
        this.gameSocket.send(JSON.stringify({
            type: 'create_game'
        }));
    }

    joinGame() {
        if (!this.connected || !this.gameSocket) {
            console.error('Cannot join game: WebSocket not connected');
            return;
        }
        
        const gameId = prompt('Enter game ID:');
        if (!gameId) {
            console.log('Game ID not provided');
            return;
        }
        
        console.log(`Joining game ${gameId}...`);
        this.createGameBtn.disabled = true;
        this.joinGameBtn.disabled = true;
        
        this.gameSocket.send(JSON.stringify({
            type: 'join_game',
            game_id: gameId
        }));
    }

    handleWebSocketMessage(event) {
        try {
            const data = JSON.parse(event.data);
            console.log('Received message:', data);

            switch (data.type) {
                case 'connection_established':
                    console.log('Connection established message received');
                    this.connected = true;
                    this.connectionAttempt = false;
                    this.reconnectAttempts = 0;
                    
                    // Clear any pending reconnect timeout
                    if (this.reconnectTimeout) {
                        clearTimeout(this.reconnectTimeout);
                        this.reconnectTimeout = null;
                    }
                    
                    // Only enable buttons if we're not in a game
                    if (!this.gameId) {
                        console.log('Enabling game buttons');
                        this.createGameBtn.disabled = false;
                        this.joinGameBtn.disabled = false;
                    }
                    break;

                case 'game_created':
                    console.log('Game created:', data);
                    this.gameId = data.game_id;
                    this.playerId = data.player_id;
                    
                    // Display the game ID
                    const gameIdDisplay = document.getElementById('gameIdDisplay');
                    if (gameIdDisplay) {
                        gameIdDisplay.textContent = `Game ID: ${this.gameId}`;
                        gameIdDisplay.style.display = 'block';
                    }
                    break;

                case 'game_joined':
                    console.log('Game joined:', data);
                    this.gameId = data.game_id;
                    this.playerId = data.player_id;
                    break;

                case 'game_state':
                    this.updateGameState(data.game_state);
                    break;

                case 'error':
                    console.error('Error from server:', data.message);
                    alert(data.message);
                    
                    // Re-enable buttons on error if not in a game
                    if (!this.gameId && this.connected) {
                        console.log('Re-enabling buttons after error');
                        this.createGameBtn.disabled = false;
                        this.joinGameBtn.disabled = false;
                    }
                    break;

                default:
                    console.log('Unknown message type:', data.type);
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }
    
    handleKeyPress(event) {
        if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN) return;
        
        let direction = null;
        if (event.key === 'ArrowUp') direction = 'up';
        if (event.key === 'ArrowDown') direction = 'down';
        
        if (direction) {
            this.gameSocket.send(JSON.stringify({
                type: 'paddle_move',
                direction: direction,
                game_id: this.gameId,
                player_id: this.playerId
            }));
        }
    }
    
    updateGameState(state) {
        // Update game elements
        this.ball = state.ball;
        this.paddles = state.paddles;
        this.score = state.score;
        
        // Draw the game state
        this.draw();
    }
    
    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw background
        this.ctx.fillStyle = this.colors.background;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Draw center line
        this.ctx.setLineDash([10, 10]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.canvas.width / 2, 0);
        this.ctx.lineTo(this.canvas.width / 2, this.canvas.height);
        this.ctx.strokeStyle = this.colors.centerLine;
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        
        // Draw ball with glow effect
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fillStyle = this.colors.ball;
        this.ctx.shadowColor = this.colors.ball;
        this.ctx.shadowBlur = 15;
        this.ctx.fill();
        this.ctx.shadowBlur = 0;
        
        // Draw paddles with slight glow
        this.ctx.shadowColor = this.colors.paddle;
        this.ctx.shadowBlur = 10;
        this.ctx.fillStyle = this.colors.paddle;
        
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
        
        // Update score display
        document.getElementById('player1Score').textContent = this.score.left;
        document.getElementById('player2Score').textContent = this.score.right;
    }
    
    startGameLoop() {
        this.draw();
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
