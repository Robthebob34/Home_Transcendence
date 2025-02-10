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
        
        // Add a timestamp to limit logging frequency
        this.lastLogTime = 0;
        this.lastPaddleUpdate = 0;
        this.paddleUpdateInterval = 16; // Update paddle every 16ms (approximately 60fps)
        
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
        //console.log('handleWebSocketMessage called');
        const message = JSON.parse(event.data);
        //console.log('WebSocket message received:', message);
        
        try {
            // Only log non-game-state messages
            if (message.type !== 'game_state_update') {
                console.log('Received WebSocket message:', event.data);
            }
            
            switch (message.type) {
                case 'connection_established':
                    console.log('Connection established:', {
                        playerId: message.user.id,
                        username: message.user.username
                    });
                    this.connected = true;
                    this.playerId = message.user.id;
                    break;

                case 'game_created':
                    console.log('Game created, initializing game state:', message);
                    this.gameId = message.game_id;
                    this.gameState = message.game_state;
                    this.isCreatingGame = false;
                    
                    // Wait for game_joined message to set player roles
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
                    console.log('Game joined with data:', message);
                    this.gameId = message.game_id;
                    this.gameState = message.game_state;
                    
                    // Set player roles
                    if (message.player1_id && message.player2_id) {
                        if (this.playerId === message.player1_id) {
                            this.playerRole = 'player1';
                            console.log('Set as player1 with ID:', this.playerId);
                        } else if (this.playerId === message.player2_id) {
                            this.playerRole = 'player2';
                            console.log('Set as player2 with ID:', this.playerId);
                        }
                        
                        // Store player IDs in game state
                        this.gameState.player1_id = message.player1_id;
                        this.gameState.player2_id = message.player2_id;
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
                    if (message.game_state) {
                        console.log('Received game state update:', {
                            currentState: this.gameState ? {
                                player1Y: this.gameState.paddles.player1.y,
                                player2Y: this.gameState.paddles.player2.y
                            } : null,
                            newState: {
                                player1Y: message.game_state.paddles.player1.y,
                                player2Y: message.game_state.paddles.player2.y
                            }
                        });

                        // Preserve player IDs when updating game state
                        const player1_id = this.gameState?.player1_id;
                        const player2_id = this.gameState?.player2_id;
                        this.gameState = message.game_state;
                        if (player1_id && player2_id) {
                            this.gameState.player1_id = player1_id;
                            this.gameState.player2_id = player2_id;
                        }
                        
                        // Update scores if available
                        if (this.gameState.score) {
                            if (this.player1Score) this.player1Score.textContent = this.gameState.score.player1;
                            if (this.player2Score) this.player2Score.textContent = this.gameState.score.player2;
                        }

                        console.log('Game state updated:', {
                            player1Y: this.gameState.paddles.player1.y,
                            player2Y: this.gameState.paddles.player2.y
                        });
                    }
                    break;

                case 'game_end':
                    console.log('Received game_end event:', message);
                    this.gameStarted = false;
                    if (this.animationFrameId) {
                        cancelAnimationFrame(this.animationFrameId);
                        this.animationFrameId = null;
                    }
                    
                    // Show game over message with winner and duration
                    if (this.gameStatus) {
                        const winner = message.winner === 'player1' ? 'Player 1' : 'Player 2';
                        const duration = message.duration_formatted;
                        const score = `${message.final_score.player1} - ${message.final_score.player2}`;
                        this.gameStatus.textContent = `Game Over! ${winner} wins! (${score}) Duration: ${duration}`;
                        console.log('Updated game status with:', this.gameStatus.textContent);
                    }
                    
                    // Disable game controls
                    if (this.createGameBtn) {
                        this.createGameBtn.disabled = false;
                        console.log('Re-enabled create game button');
                    }
                    if (this.joinGameBtn) {
                        this.joinGameBtn.disabled = false;
                        console.log('Re-enabled join game button');
                    }
                    this.handleGameEnd(message);
                    break;

                case 'game_over':
                    console.log('Received deprecated game_over event');
                    break;

                case 'error':
                    if (this.gameStatus) {
                        this.gameStatus.textContent = `Error: ${message.message}`;
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }
    
    handleGameEnd(data) {
        const winner = data.winner;
        const duration = data.duration;
        
        // Stop the game loop
        this.gameStarted = false;
        
        // Create game end overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        
        // Create result text
        const resultText = document.createElement('h1');
        resultText.style.color = '#fff';
        resultText.style.marginBottom = '20px';
        resultText.style.fontSize = '2.5em';
        resultText.innerText = `${winner === 'player1' ? 'Player 1' : 'Player 2'} Wins!`;
        
        // Create score text
        const scoreText = document.createElement('h2');
        scoreText.style.color = '#fff';
        scoreText.style.marginBottom = '20px';
        scoreText.style.fontSize = '1.8em';
        scoreText.innerText = `Final Score: ${data.final_score.player1} - ${data.final_score.player2}`;
        
        // Create duration text
        const durationText = document.createElement('h3');
        durationText.style.color = '#fff';
        durationText.style.marginBottom = '30px';
        durationText.style.fontSize = '1.5em';
        durationText.innerText = `Game Duration: ${duration}`;
        
        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '20px';
        
        // Create "Create New Game" button
        const createButton = document.createElement('button');
        createButton.innerText = 'Create New Game';
        createButton.style.padding = '15px 30px';
        createButton.style.fontSize = '1.2em';
        createButton.style.cursor = 'pointer';
        createButton.style.backgroundColor = '#4CAF50';
        createButton.style.color = 'white';
        createButton.style.border = 'none';
        createButton.style.borderRadius = '5px';
        createButton.onclick = () => {
            // Clean up WebSocket before navigating
            if (this.gameSocket) {
                this.gameSocket.onclose = null; // Remove onclose handler
                this.gameSocket.close();
                this.gameSocket = null;
            }
            window.location.href = '/game/';  
        };
        
        // Create "Join Game" button
        const joinButton = document.createElement('button');
        joinButton.innerText = 'Join Game';
        joinButton.style.padding = '15px 30px';
        joinButton.style.fontSize = '1.2em';
        joinButton.style.cursor = 'pointer';
        joinButton.style.backgroundColor = '#2196F3';
        joinButton.style.color = 'white';
        joinButton.style.border = 'none';
        joinButton.style.borderRadius = '5px';
        joinButton.onclick = () => {
            // Clean up WebSocket before navigating
            if (this.gameSocket) {
                this.gameSocket.onclose = null; // Remove onclose handler
                this.gameSocket.close();
                this.gameSocket = null;
            }
            window.location.href = '/game/join/';  
        };
        
        // Add buttons to container
        buttonsContainer.appendChild(createButton);
        buttonsContainer.appendChild(joinButton);
        
        // Add elements to overlay
        overlay.appendChild(resultText);
        overlay.appendChild(scoreText);
        overlay.appendChild(durationText);
        overlay.appendChild(buttonsContainer);
        
        // Add overlay to body
        document.body.appendChild(overlay);
        
        // Clean up WebSocket connection
        if (this.gameSocket) {
            this.gameSocket.onclose = null; // Remove onclose handler to prevent reconnection
            this.gameSocket.close();
            this.gameSocket = null;
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
        console.log('handleKeyPress called');
        if (!this.gameSocket || this.gameSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {
            console.log('Cannot handle key press:', {
                hasSocket: !!this.gameSocket,
                socketState: this.gameSocket?.readyState,
                gameId: this.gameId,
                gameStarted: this.gameStarted
            });
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
                console.log('Sending paddle_move:', { direction, gameId: this.gameId });
                this.gameSocket.send(JSON.stringify({
                    type: 'paddle_move',
                    direction: direction,
                    game_id: this.gameId
                }));
            }
        }
    }
    
    updatePaddlePosition() {
        console.log('updatePaddlePosition called');
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
        this.updatePaddlePosition();

        // Draw the current game state
        this.draw();

        // Continue the animation loop
        this.animationFrameId = requestAnimationFrame(() => this.animate());
    }
    
    
    draw() {
        //console.log('draw called');
        try {
            if (!this.ctx || !this.gameState) {
                console.log('Cannot draw, missing context or game state:', {
                    hasContext: !!this.ctx,
                    hasGameState: !!this.gameState
                });
                return;
            }
            
            //console.log('Drawing game state:', this.gameState);
            
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
        
        // Add a timestamp to limit logging frequency
        const logInterval = 2000; // Log every 500ms
        const currentTime = Date.now();
        if (currentTime - this.lastLogTime > logInterval) {
            console.log('Paddle positions:', this.gameState.paddles);
            //console.log('Key state:', this.keyState);
            //console.log('Game state:', this.gameState);
            this.lastLogTime = currentTime;
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
        const winner = data.winner;
        const duration = data.duration;
        
        // Stop the game loop
        this.gameStarted = false;
        
        // Create game end overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        overlay.style.display = 'flex';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '1000';
        
        // Create result text
        const resultText = document.createElement('h1');
        resultText.style.color = '#fff';
        resultText.style.marginBottom = '20px';
        resultText.style.fontSize = '2.5em';
        resultText.innerText = `${winner === 'player1' ? 'Player 1' : 'Player 2'} Wins!`;
        
        // Create score text
        const scoreText = document.createElement('h2');
        scoreText.style.color = '#fff';
        scoreText.style.marginBottom = '20px';
        scoreText.style.fontSize = '1.8em';
        scoreText.innerText = `Final Score: ${data.final_score.player1} - ${data.final_score.player2}`;
        
        // Create duration text
        const durationText = document.createElement('h3');
        durationText.style.color = '#fff';
        durationText.style.marginBottom = '30px';
        durationText.style.fontSize = '1.5em';
        durationText.innerText = `Game Duration: ${duration}`;
        
        // Create buttons container
        const buttonsContainer = document.createElement('div');
        buttonsContainer.style.display = 'flex';
        buttonsContainer.style.gap = '20px';
        
        // Create "Create New Game" button
        const createButton = document.createElement('button');
        createButton.innerText = 'Create New Game';
        createButton.style.padding = '15px 30px';
        createButton.style.fontSize = '1.2em';
        createButton.style.cursor = 'pointer';
        createButton.style.backgroundColor = '#4CAF50';
        createButton.style.color = 'white';
        createButton.style.border = 'none';
        createButton.style.borderRadius = '5px';
        createButton.onclick = () => {
            // Clean up WebSocket before navigating
            if (this.gameSocket) {
                this.gameSocket.onclose = null; // Remove onclose handler
                this.gameSocket.close();
                this.gameSocket = null;
            }
            window.location.href = '/game/';  
        };
        
        // Create "Join Game" button
        const joinButton = document.createElement('button');
        joinButton.innerText = 'Join Game';
        joinButton.style.padding = '15px 30px';
        joinButton.style.fontSize = '1.2em';
        joinButton.style.cursor = 'pointer';
        joinButton.style.backgroundColor = '#2196F3';
        joinButton.style.color = 'white';
        joinButton.style.border = 'none';
        joinButton.style.borderRadius = '5px';
        joinButton.onclick = () => {
            // Clean up WebSocket before navigating
            if (this.gameSocket) {
                this.gameSocket.onclose = null; // Remove onclose handler
                this.gameSocket.close();
                this.gameSocket = null;
            }
            window.location.href = '/game/join/';  
        };
        
        // Add buttons to container
        buttonsContainer.appendChild(createButton);
        buttonsContainer.appendChild(joinButton);
        
        // Add elements to overlay
        overlay.appendChild(resultText);
        overlay.appendChild(scoreText);
        overlay.appendChild(durationText);
        overlay.appendChild(buttonsContainer);
        
        // Add overlay to body
        document.body.appendChild(overlay);
        
        // Clean up WebSocket connection
        if (this.gameSocket) {
            this.gameSocket.onclose = null; // Remove onclose handler to prevent reconnection
            this.gameSocket.close();
            this.gameSocket = null;
        }
    }
};  

// Initialize game when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    const game = new PongGame();
});
