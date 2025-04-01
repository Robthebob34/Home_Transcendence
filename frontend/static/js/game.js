console.log('=== GAME.JS LOADED ===');

// Function to get the current page from the URL hash
function getPage() {
    const hash = window.location.hash.substring(1); // Remove the # character

    if (!hash) return 'game'; // Default page

    if (hash === 'game') return 'game';
    if (hash.startsWith('play/')) return 'play';
    if (hash.startsWith('tournament')) return 'tournament';
    if (hash === 'tournaments') return 'tournaments';
    if (hash === 'profile') return 'profile';

    // Extract the first part of the hash if it contains a slash
    const firstPart = hash.split('/')[0];
    return firstPart || 'game';
}

class PongGame {
    constructor() {
        this.player1username = null;
        this.player2username = null;

        // Bind methods to this instance first
        this.handleKeyPress = this.handleKeyPress.bind(this);
        this.handleKeyUp = this.handleKeyUp.bind(this);
        this.animate = this.animate.bind(this);
        this.draw = this.draw.bind(this);
        this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);

        // Initialize properties
        this.player1ProfileLoaded = false;
        this.player2ProfileLoaded = false;

        this.chatInterface = false;
        this.connected = false;
        this.connectionAttempt = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 5000;
        this.heartbeatInterval = null;
        this.gameSocket = null;
        this.uiSocket = null;
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

        // Initialize ready button handlers
            this.startGameHandler = this.startGame.bind(this);
        this.player1Ready = document.getElementById('player1_ready');
        this.player2Ready = document.getElementById('player2_ready');
        this.player1Name = document.getElementById('player1_name');
        this.player2Name = document.getElementById('player2_name');
        this.player2Name.textContent = getTranslation("play_waiting_player");


        this.player1Avatar = document.getElementById('player1_avatar');
        this.player2Avatar = document.getElementById('player2_avatar');

        if (this.player1Ready) {
            this.player1Ready.addEventListener('click', () => this.handleReadyClick());
        }
        if (this.player2Ready) {
            this.player2Ready.addEventListener('click', () => this.handleReadyClick());
        }

        this.handleStartGameClick = this.startGame.bind(this);
        this.handleChatDropdownClick = () => {
            if (chat_currentlyWith != null) {
                this.chatInterface = true;
                this.startGame();
            }
        };
        this.handleJoinGameClick = this.showJoinGameForm.bind(this);
        this.handleKeyDown = this.handleKeyPress.bind(this);
        this.handleKeyUpListener = this.handleKeyUp.bind(this);
        this.handlePopState = this.handleNavigation.bind(this);
        this.handleBeforeUnloadListener = this.handleBeforeUnload.bind(this);

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
                console.warn('Session check failed:', response.status);
                const text = await response.text();
                console.warn('Response text:', text);
                return false;
            }

            const userData = await response.json();
            console.log('Session valid for user:', userData);

            // Store the current user's info
            this.currentUser = userData;

            // Update UI with user info
            const usernameElement = document.getElementById('header_username');
            const userAvatarElement = document.getElementById('header_userAvatar');

            console.log('Username element:', usernameElement);
            console.log('Avatar element:', userAvatarElement);

            if (usernameElement) {
                // usernameElement.textContent = userData.username;
                console.log('Username updated to:', userData.username);
            } else {
                console.error('Username element not found');
            }

            if (userAvatarElement) {
                // userAvatarElement.textContent = userData.username[0].toUpperCase();
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
        let match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? decodeURIComponent(match[2]) : null;
    }

    initializeElements() {
        console.log('Initializing game elements...');

        try {
            // Get DOM elements
            this.canvas = document.getElementById('game_Canvas');
            console.log('Canvas element:', this.canvas);

            this.canvasContainer = document.getElementById('game_CanvasContainer');
            console.log('Canvas container:', this.canvasContainer);
            this.createGameBtn = document.getElementById('createGameBtn');


            this.joinGameBtn = document.getElementById('joinGameBtn');
            console.log('Game buttons:', { create: this.createGameBtn, join: this.joinGameBtn });

            this.gameStatus = document.getElementById('game_Status');
            console.log('Game status:', this.gameStatus);

            this.player1Score = document.getElementById('game_player1Score');
            console.log('Player 1 score:', this.player1Score);

            this.player2Score = document.getElementById('game_player2Score');
            console.log('Player 2 score:', this.player2Score);


            let imgElement0 = document.getElementById("player1_avatar");
            let placeholder0 = document.createElement("div");
            placeholder0.className = "profile_placeholder";
            placeholder0.textContent = "?";
            placeholder0.id = "player1_avatar";
            if (imgElement0)
                imgElement0.parentNode.replaceChild(placeholder0, imgElement0);

            let imgElement1 = document.getElementById("player2_avatar");
            let placeholder1 = document.createElement("div");
            placeholder1.className = "profile_placeholder";
            placeholder1.textContent = "?";
            placeholder1.id = "player2_avatar";
            if (imgElement1)
                imgElement1.parentNode.replaceChild(placeholder1, imgElement1);

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
        // Utilisation des références stockées
        if (this.createGameBtn) {
            this.createGameBtn.addEventListener('click', this.handleStartGameClick);
        }
        const chatBtn = document.getElementById('chat_dropdownMenuButton_PlayPong');
        if (chatBtn) {
            chatBtn.addEventListener('click', this.handleChatDropdownClick);
        }
        if (this.joinGameBtn) {
            this.joinGameBtn.addEventListener('click', this.handleJoinGameClick);
        }
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUpListener);
        window.addEventListener('popstate', this.handlePopState);
        window.addEventListener('beforeunload', this.handleBeforeUnloadListener);
    }

    cleanupEventListeners() {
        if (this.createGameBtn) {
            this.createGameBtn.removeEventListener('click', this.handleStartGameClick);
        }
        const chatBtn = document.getElementById('chat_dropdownMenuButton_PlayPong');
        if (chatBtn) {
            chatBtn.removeEventListener('click', this.handleChatDropdownClick);
        }
        if (this.joinGameBtn) {
            this.joinGameBtn.removeEventListener('click', this.handleJoinGameClick);
        }
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUpListener);
        window.removeEventListener('popstate', this.handlePopState);
        window.removeEventListener('beforeunload', this.handleBeforeUnloadListener);
    }

    destroy() {
        // Nettoyage des timers, sockets et listeners existants
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        if (this.uiSocket) {
            this.uiSocket.onclose = null;
            this.uiSocket.close();
            this.uiSocket = null;
            this.connected = false;
        }
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        this.cleanupEventListeners();
        const originalHTML = `
        <div class="game_lobby">
            <div class="game_lobby-players">
                <!-- Player 1 -->
                <div class="game_lobby-player" id="player1_container">
                    <div class="profile_avatar-container">
                        <img id="player1_avatar" alt="User Avatar" class="profile_avatar">
                    </div>
                    <div class="game_lobby-name" id="player1_name"></div>
                    <button class="game_lobby-ready" id="player1_ready"></button>
                </div>

                <!-- VS Separator -->
                <div class="game_lobby-vs">VS</div>

                <!-- Player 2 -->
                <div class="game_lobby-player" id="player2_container">
                    <div class="profile_avatar-container">
                        <img id="player2_avatar" alt="User Avatar" class="profile_avatar">
                    </div>
                    <div class="game_lobby-name" id="player2_name"></div>
                    <button class="game_lobby-ready" id="player2_ready" disabled></button>
                </div>
            </div>
        </div>
        <div id="game_CanvasContainer" class="game_canvas-container">
            <div class="game_score-container">
                <div id="game_player1Score" class="player-score">0</div>
                <div id="game_player2Score" class="player-score">0</div>
            </div>
            <canvas id="game_Canvas"></canvas>
        </div>
    `;
    const playContainer = document.getElementById("play");
    if (playContainer) {
        playContainer.innerHTML = originalHTML;
    }
    }



    handleNavigation() {
        console.log('Navigation detected (browser back/forward button)');
        const currentPage = getPage();
        console.log('Current page:', currentPage);

        // Only clean up WebSocket when navigating away from the play page
        if (currentPage === 'play') {
            console.log('On play page, keeping WebSocket connection');
        } else if (this.gameStarted) {
            console.log('Game was started but leaving play page, cleaning up WebSocket');
            this.cleanupWebSocket();
        } else {
            this.cleanupWebSocket();
            console.log('Not on play page and no game started, no cleanup needed');
        }
    }

    handleBeforeUnload() {
        console.log('Page unload detected');
        const currentPage = getPage();
        console.log('Current page on unload:', currentPage);

        // Only clean up WebSocket when unloading from the play page
        if (currentPage === 'play') {
            console.log('Leaving play page, cleaning up WebSocket');
            this.cleanupWebSocket();
        } else {
            console.log('Not on play page, no cleanup needed');
        }
    }

    cleanupWebSocket() {
        if (this.uiSocket) {
            console.log('Closing WebSocket connection due to navigation');
            this.uiSocket.onclose = null; // Remove onclose handler to prevent reconnection
            this.destroy();
            gameInitialized = false;
            this.uiSocket = null;
            this.connected = false;
        }
    }

    handleKeyUp(event) {
        if(getPage() != "game")
            return;
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
            const container = document.getElementById('game_CanvasContainer');

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
            const container = document.getElementById('game_CanvasContainer');

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
        if (this.connectionAttempt) {
            console.log('Connection attempt already in progress');
            return;
        }

        this.connectionAttempt = true;
        const wsScheme = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
        const wsBase = wsScheme + window.location.host;

        // Setup UI WebSocket for general interactions
        const wsUrl = `${wsBase}/ws/game/`;
        console.log('Connecting to UI WebSocket:', wsUrl);

        this.uiSocket = new WebSocket(wsUrl);

        this.uiSocket.onopen = () => {
            console.log('UI WebSocket connection established');
            this.connected = true;
            this.connectionAttempt = false;
            this.reconnectAttempts = 0;
        };

        this.uiSocket.onclose = () => {
            console.log('UI WebSocket connection closed');
            this.handleWebSocketClose();
        };

        this.uiSocket.onerror = (error) => {
            console.error('UI WebSocket error:', error);
            this.connectionAttempt = false;
        };

        this.uiSocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('Received UI WebSocket message:', data);
            this.handleWebSocketMessage(data);
        };
    }

    updateProfilePic(message)
    {
        if (message.game_state.players.player1)
        {
            if (!this.player1username)
            {
                this.player1username = message.game_state.players.player1.username;
            }
            fetch("/api/users/get_avatar/" + message.game_state.players.player1.id + "/", {
                 method: "GET",headers: { 'X-CSRFToken': getCookie('csrftoken') }
            })
            .then(response => response.json())
            .then(data2 => {
                if (data2.avatar != null)
                {
                    let imgElement = document.getElementById("player1_avatar");
                    let placeholder = document.createElement("div");
                    placeholder.className = "profile_avatar";
                    placeholder.style.backgroundImage = `url('${data2.avatar}')`;
                    placeholder.id = "profile_avatar";
                    if (imgElement)
                        imgElement.parentNode.replaceChild(placeholder, imgElement);
                }
                else {
                    let imgElement = document.getElementById("player1_avatar");
                    let placeholder = document.createElement("div");
                    placeholder.className = "profile_placeholder";
                    placeholder.textContent = message.game_state.players.player1.username[0];
                    placeholder.id = "player1_avatar";
                    if (imgElement)
                        imgElement.parentNode.replaceChild(placeholder, imgElement);
                }
                })
            .catch(error => console.error("Error while getting avatar:", error));
        }
        else
        {
            let imgElement0 = document.getElementById("player1_avatar");
            let placeholder0 = document.createElement("div");
            placeholder0.className = "profile_placeholder";
            placeholder0.textContent = "?";
            placeholder0.id = "player1_avatar";
            if (imgElement0)
                imgElement0.parentNode.replaceChild(placeholder0, imgElement0);
        }
        if (message.game_state.players.player2)
            {
                if (!this.player2username)
                {
                    this.player2username = message.game_state.players.player2.username;
                }
                fetch("/api/users/get_avatar/" + message.game_state.players.player2.id + "/", {
                     method: "GET",headers: { 'X-CSRFToken': getCookie('csrftoken') }
                })
                .then(response => response.json())
                .then(data2 => {
                    if (data2.avatar != null)
                    {
                        let imgElement = document.getElementById("player2_avatar");
                        let placeholder = document.createElement("div");
                        placeholder.className = "profile_avatar";
                        placeholder.style.backgroundImage = `url('${data2.avatar}')`;
                        placeholder.id = "profile_avatar";
                        if (imgElement)
                            imgElement.parentNode.replaceChild(placeholder, imgElement);
                    }
                    else {
                        let imgElement = document.getElementById("player2_avatar");
                        let placeholder = document.createElement("div");
                        placeholder.className = "profile_placeholder";
                        placeholder.textContent = message.game_state.players.player2.username[0];
                        placeholder.id = "player2_avatar";
                        if (imgElement)
                            imgElement.parentNode.replaceChild(placeholder, imgElement);
                    }
                    })
                .catch(error => console.error("Error while getting avatar:", error));
            }
            else
            {
                let imgElement0 = document.getElementById("player2_avatar");
                let placeholder0 = document.createElement("div");
                placeholder0.className = "profile_placeholder";
                placeholder0.textContent = "?";
                placeholder0.id = "player2_avatar";
                if (imgElement0)
                    imgElement0.parentNode.replaceChild(placeholder0, imgElement0);
            }
    }

    async startGame() {

        if (this.isCreatingGame) return;
        this.isCreatingGame = true;

        try {
            // if (!this.uiSocket || this.uiSocket.readyState !== WebSocket.OPEN) {
            //     throw new Error('WebSocket connection not ready');
            // }

            console.log('Creating game via HTTP POST...');
            const response = await fetch('/api/game/create/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': this.getCookie('csrftoken'),
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include'
            });

            const text = await response.text();
            console.log('Server response:', text);

            if (!response.ok) {
                throw new Error(`Failed to create game: ${response.status} - ${text}`);
            }

            const data = JSON.parse(text);
            console.log('Game created successfully:', data);
            this.gameId = data.id;
            console.log(this.gameId)
            console.log(this.gameId)

            // No need to send any WebSocket message
            // Backend will automatically:
            // 1. Add us to the game channel
            // 2. Send game_created message through existing WebSocket
            // 3. handleWebSocketMessage will then update URL hash

        } catch (error) {
            console.error('Error creating game:', error);
            if (this.gameStatus) {
                this.gameStatus.textContent = `Error: ${error.message}`;
            }
        } finally {
            this.isCreatingGame = false;
        }
    }

    handleWebSocketMessage(message) {
        try {
            console.log('Received WebSocket message:', message);

            switch (message.type) {
                case 'game_created':
                    console.log('Game created:', message);
                    this.gameId = parseInt(message.game_id, 10);
                    this.playerId = parseInt(message.player1_id, 10);  // Set player ID from player1 info
                    this.gameState = message.game_state;  // Make sure we store the game state
                    this.isCreatingGame = false;
                    console.log(message)
                    // Reset both ready buttons to Not Ready
                    if (this.player1Ready) {
                        this.player1Ready.textContent = getTranslation("global_notready");
                        this.player1Ready.classList.remove('ready');
                        this.player1Ready.disabled = !(this.playerId === parseInt(message.player1_id, 10));
                    }
                    if (this.player2Ready) {
                        this.player2Ready.textContent = getTranslation("global_notready");
                        this.player2Ready.classList.remove('ready');
                        this.player2Ready.disabled = true;  // Player 2 hasn't joined yet
                    }

                    // Initialize ready button states with the new game state
                    console.log('Game XXXX:', message.game_state);
                    this.updateProfilePic(message);
                    this.updateReadyState(message.game_state);

                    // Only join game group and set URL if we have a valid game ID
                    if (!isNaN(this.gameId)) {
                        // Join the game's WebSocket group
                        this.uiSocket.send(JSON.stringify({
                            type: 'rejoin_game_group',
                            game_id: this.gameId
                        }));

                        console.log('Setting URL hash to:', `play/${this.gameId}`);
                        if (this.chatInterface)
                        {
                            console.log("CHAAAAAAAT INTERFACE");
                            chat_sendMessageValue(this.gameId);
                            this.chatInterface = false;
                        }
                        window.location.hash = `play/${this.gameId}`;
                    } else {
                        console.error('Invalid game ID received:', message.game_id);
                    }
                    break;

                case 'game_joined':
                    console.log('Game joined:', message);
                    // Parse game_id as integer
                    this.gameId = parseInt(message.game_id, 10);
                    // Check if we're player 1 or player 2
                    if (this.playerId === parseInt(message.player1_id, 10)) {
                        // We're already player 1, keep our ID
                        console.log('We are player 1');
                    } else {
                        // We're player 2 or we don't have an ID yet
                        this.playerId = parseInt(message.player2_id, 10);
                        console.log('We are player 2 with ID:', this.playerId);
                    }
                    this.updateProfilePic(message);
                    // Initialize ready button states with the new game state
                    if (message.game_state) {
                        this.gameState = message.game_state;
                        this.updateReadyState(message.game_state);
                    }

                    // Hide canvas until game starts
                    if (this.canvasContainer) {
                        this.canvasContainer.style.display = 'none';
                    }

                    // Join the game's WebSocket group
                    this.uiSocket.send(JSON.stringify({
                        type: 'rejoin_game_group',
                        game_id: this.gameId
                    }));

                    window.location.hash = `play/${this.gameId}`;
                    break;

                case 'connection_established':
                    console.log('Connection established:', {
                        playerId: message.user.id,
                        username: message.user.username
                    });
                    this.connected = true;
                    this.playerId = parseInt(message.user.id, 10);  // Ensure player ID is integer

                    // If loading from URL hash, rejoin game group
                    if (window.location.hash.startsWith('#play/')) {
                        const gameId = window.location.hash.split('/')[1];
                        this.uiSocket.send(JSON.stringify({
                            type: 'rejoin_game_group',
                            game_id: gameId
                        }));
                    }
                    break;
                case 'game_state_update':
                    this.gameState = message.game_state;

                    // Update ready button states
                    this.updateReadyState(message.game_state);

                    // Start game and show canvas only when both players are ready and game is playing
                    if (message.game_state.status === 'playing') {
                        if (!this.gameStarted) {
                            this.gameStarted = true;
                            if (this.canvasContainer) {
                                this.canvasContainer.style.display = 'block';
                            }
                            if (!this.animationFrameId) {
                                this.animationFrameId = requestAnimationFrame(() => this.animate());
                            }
                        }
                    } else {
                        // Hide canvas if game is not playing
                        if (this.canvasContainer) {
                            this.canvasContainer.style.display = 'none';
                        }
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
                    // if (this.gameStatus) {
                    //     const winner = message.winner === 'player1' ? 'Player 1' : 'Player 2';
                    //     const duration = message.duration_formatted;
                    //     const score = `${message.final_score.player1} - ${message.final_score.player2}`;
                    //     this.gameStatus.textContent = `Game Over! ${winner} wins! (${score}) Duration: ${duration}`;
                    //     console.log('Updated game status with:', this.gameStatus.textContent);
                    // }

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

                case 'player_ready':
                    console.log('Player ready:', message);
                    this.updateReadyState(message.game_state);
                    break;
            }
        } catch (error) {
            console.error('Error handling WebSocket message:', error);
        }
    }

    joinGame(gameId) {

        try {
            // Parse gameId as integer
            this.gameId = parseInt(gameId, 10);
            // Send join_game message through UI socket
            if (!this.gameId)
                throw error("No game id");
            if (!this.uiSocket)
                throw error("No socket id");

            this.uiSocket.send(JSON.stringify({
                'type': 'join_game',
                'game_id': this.gameId
            }));
            console.log('Sent join_game message');

        } catch (error) {
            console.error('Error joining game:', error);
        }
    }

    handleWebSocketClose() {
        this.connected = false;
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            setTimeout(() => {
                this.reconnectAttempts++;
                this.setupWebSocket();
            }, this.reconnectDelay);
        }
    }

    handleKeyPress(event) {
        console.log('handleKeyPress called');
        const hash = window.location.hash;
        const match = hash.match(/#play\/([^/]+)/);
        if (!match) {
            console.log("Not on play page with game ID");
            return;
        }

        if (!this.uiSocket || this.uiSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {
            console.log('Cannot handle key press:', {
                hasSocket: !!this.uiSocket,
                socketState: this.uiSocket?.readyState,
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
                this.uiSocket.send(JSON.stringify({
                    type: 'paddle_move',
                    direction: direction,
                    game_id: this.gameId
                }));
            }
        }
    }

    updatePaddlePosition() {
        //console.log('updatePaddlePosition called');
        if (!this.uiSocket || this.uiSocket.readyState !== WebSocket.OPEN || !this.gameId || !this.gameStarted || !this.gameState) {
            console.log('Cannot update paddle: socket:', !!this.uiSocket, 'state:', this.uiSocket?.readyState, 'gameId:', this.gameId, 'started:', this.gameStarted);
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
            this.uiSocket.send(JSON.stringify({
                type: 'paddle_move',
                direction: direction,
                game_id: this.gameId
            }));
            this.lastPaddleUpdate = now;
        }
    }

    animate() {
        //console.log('animate called');
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
            // console.log('Paddle positions:', this.gameState.paddles);
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
        resultText.innerText = `${winner === 'player1' ? this.player1username : this.player2username} Wins!`;

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

        // Create button based on where the game was launched from
        const homeButton = document.createElement('button');

        // Simple way to check if we came from a tournament - check the referrer
        const referrer = document.referrer;
        const currentHash = window.location.hash;
        const fromTournament = this.fromTournament || localStorage.getItem('fromTournament') === 'true';
        if (fromTournament || currentHash.includes('tournament')) {
            // Tournament game button
            if (this.playerId == data.winner_id && globTournament.status != "completed")
                homeButton.innerText = 'Go to Tournament';
            else
                homeButton.innerText = 'Go back to Lobby';

            homeButton.style.backgroundColor = '#2196F3'; // Blue for tournament
            homeButton.onclick = () => {
                document.body.removeChild(overlay);
                // Get tournament ID from localStorage if available
                //const tournamentId = localStorage.getItem('currentTournamentId');

                // Clear localStorage values

                const tournamentId = data.tournament_id || localStorage.getItem('currentTournamentId');

                localStorage.removeItem('fromTournament');
                localStorage.removeItem('currentTournamentId');

                if (this.uiSocket) {
                    console.log('Closing WebSocket connection in handleGameEnd');
                    this.uiSocket.onclose = null; // Remove onclose handler to prevent reconnection
                    this.destroy();
                    gameInitialized = false;
                    this.uiSocket = null;
                    this.connected = false;
                }

                if (this.playerId == data.winner_id)
                {
                    if (globTournament.status == "completed")
                    {
                        if (currentSocket) {
                            currentSocket.close();
                            currentSocket = null;
                        }
                        window.location.href = '#game';
                    }
                    else if (globTournament) {
                        console.log("ICI C'EST LE AAA");
                        console.log(globTournament.id);
                        //game = null;
                        //gameInitialized = false;
                        //loadGame();
                        window.location.href = `#tournament/${globTournament.id}`;
                        this.player1username = null;
                        this.player2username = null;

                        // Bind methods to this instance first
                        this.handleKeyPress = this.handleKeyPress.bind(this);
                        this.handleKeyUp = this.handleKeyUp.bind(this);
                        this.animate = this.animate.bind(this);
                        this.draw = this.draw.bind(this);
                        this.handleWebSocketMessage = this.handleWebSocketMessage.bind(this);

                        // Initialize properties
                        this.player1ProfileLoaded = false;
                        this.player2ProfileLoaded = false;

                        this.chatInterface = false;
                        this.connected = false;
                        this.connectionAttempt = false;
                        this.reconnectAttempts = 0;
                        this.maxReconnectAttempts = 5;
                        this.reconnectDelay = 5000;
                        this.heartbeatInterval = null;
                        this.gameSocket = null;
                        this.uiSocket = null;
                        this.currentUser = null;
                        this.gameId = null;
                        this.gameState = null;
                        this.animationFrameId = null;
                        this.gameStarted = false;
                        this.isCreatingGame = false;
                        this.canvas = null;
                        this.ctx = null;
                        this.keyState = { w: false, s: false };
                        this.gameRole = undefined;
                        this.paddleSpeed = 25; // pixels to move per keypress

                        // Add a timestamp to limit logging frequency
                        this.lastLogTime = 0;
                        this.lastPaddleUpdate = 0;
                        this.paddleUpdateInterval = 16; // Update paddle every 16ms (approximately 60fps)

                        // Initialize ready button handlers
                            this.startGameHandler = this.startGame.bind(this);
                        this.player1Ready = document.getElementById('player1_ready');
                        this.player2Ready = document.getElementById('player2_ready');
                        this.player1Name = document.getElementById('player1_name');
                        this.player2Name = document.getElementById('player2_name');
                        this.player2Name.textContent = getTranslation("play_waiting_player");


                        this.player1Avatar = document.getElementById('player1_avatar');
                        this.player2Avatar = document.getElementById('player2_avatar');

                        if (this.player1Ready) {
                            this.player1Ready.addEventListener('click', () => this.handleReadyClick());
                        }
                        if (this.player2Ready) {
                            this.player2Ready.addEventListener('click', () => this.handleReadyClick());
                        }

                        this.handleStartGameClick = this.startGame.bind(this);
                        this.handleChatDropdownClick = () => {
                            if (chat_currentlyWith != null) {
                                this.chatInterface = true;
                                this.startGame();
                            }
                        };
                        this.handleJoinGameClick = this.showJoinGameForm.bind(this);
                        this.handleKeyDown = this.handleKeyPress.bind(this);
                        this.handleKeyUpListener = this.handleKeyUp.bind(this);
                        this.handlePopState = this.handleNavigation.bind(this);
                        this.handleBeforeUnloadListener = this.handleBeforeUnload.bind(this);

                        // Start initialization
                        this.init().catch(error => {
                            console.error('Failed to initialize game:', error);
                        });

                    } else {
                        window.location.href = '#tournament';
                    }
                } else {
                    if (currentSocket) {
                        currentSocket.close();
                        currentSocket = null;
                    }
                    window.location.href = '#game';
                }
            };
        } else {
            // Regular game button
            homeButton.innerText = 'Go to Lobby';
            homeButton.style.backgroundColor = '#4CAF50'; // Green for regular games
            homeButton.onclick = () => {
                document.body.removeChild(overlay);

                // Clear localStorage values (just to be safe)
                localStorage.removeItem('fromTournament');
                localStorage.removeItem('currentTournamentId');

                if (this.uiSocket) {
                    console.log('Closing WebSocket connection in handleGameEnd');
                    this.uiSocket.onclose = null; // Remove onclose handler to prevent reconnection
                    this.destroy();
                    gameInitialized = false;
                    this.uiSocket = null;
                    this.connected = false;
                }

                window.location.href = '#game';
            };
        }

        homeButton.style.padding = '15px 30px';
        homeButton.style.fontSize = '1.2em';
        homeButton.style.cursor = 'pointer';
        homeButton.style.color = 'white';
        homeButton.style.border = 'none';
        homeButton.style.borderRadius = '5px';

        // Add buttons to container
        buttonsContainer.appendChild(homeButton);

        // Add elements to overlay
        overlay.appendChild(resultText);
        overlay.appendChild(scoreText);
        overlay.appendChild(durationText);
        overlay.appendChild(buttonsContainer);

        // Add overlay to body
        document.body.appendChild(overlay);

        // Clean up WebSocket connection
        if (this.uiSocket) {
            console.log('Closing WebSocket connection in handleGameEnd');
            this.uiSocket.onclose = null; // Remove onclose handler to prevent reconnection
            this.destroy();
            gameInitialized = false;
            this.uiSocket = null;
            this.connected = false;
        }
    }

    handleReadyClick() {
        console.log('Player clicked ready button');

        // Try to get gameId from multiple sources
        if (!this.gameId) {
            // Try from gameState
            if (this.gameState && this.gameState.id) {
                this.gameId = this.gameState.id;
                console.log('Setting gameId from gameState.id:', this.gameId);
            }
            // Try from URL hash
            else if (window.location.hash) {
                const hashMatch = window.location.hash.match(/play\/(\d+)/);
                if (hashMatch && hashMatch[1]) {
                    this.gameId = hashMatch[1];
                    console.log('Setting gameId from URL hash:', this.gameId);
                }
            }
        }

        if (!this.gameId) {
            console.error('No game ID available');
            return;
        }

        if (!this.playerId) {
            console.error('No player ID available');
            return;
        }

        if (!this.gameRole) {
            console.error('No gameRole available');
            return;
        }
        if (!this.uiSocket)
        {
            console.error('No uiSocket available');
            return;
        }
        console.log('Sending player_ready message for game:', this.gameId, 'player:', this.playerId, 'role:', this.gameRole);

        this.uiSocket.send(JSON.stringify({
            'type': 'player_ready',
            'game_id': parseInt(this.gameId, 10),
            'player_role': this.gameRole  // Send the player role to the backend
        }));

        // Set an optimistic ready flag that we'll use in updateReadyState
        this._optimisticReady = false;
        console.log('Setting optimistic ready flag');

        // Optimistically update our own ready state in the UI
        if (this.gameRole === 'player1' && this.player1Ready) {
            console.log('Optimistically updating player 1 ready state');
            this.player1Ready.textContent = getTranslation("global_ready");
            this.player1Ready.classList.add('ready');
            this.player1Ready.disabled = true;
        } else if (this.gameRole === 'player2' && this.player2Ready) {
            console.log('Optimistically updating player 2 ready state');
            this.player2Ready.textContent = getTranslation("global_ready");
            this.player2Ready.classList.add('ready');
            this.player2Ready.disabled = true;
        }
    }

    updateReadyState(gameState) {
        console.log('updateReadyState called with playerId:', this.playerId);
        if (!gameState || !gameState.players) return;
        console.log('Game state:', gameState);

        // Store the game state for reference
        this.gameState = gameState;

        const players = gameState.players;
        console.log('Current playerId:', this.playerId, 'Type:', typeof this.playerId);
        if (players.player1) {
            console.log('Player1 ID from state:', players.player1.id, 'Type:', typeof players.player1.id);
        }
        if (players.player2) {
            console.log('Player2 ID from state:', players.player2.id, 'Type:', typeof players.player2.id);
        }

        // Ensure we're using the correct player IDs
        const player1Id = players.player1?.id ? parseInt(players.player1.id, 10) : null;
        const player2Id = players.player2?.id ? parseInt(players.player2.id, 10) : null;
        const currentPlayerId = this.playerId ? parseInt(this.playerId, 10) : null;

        console.log('Parsed IDs - Current:', currentPlayerId, 'Player1:', player1Id, 'Player2:', player2Id);

        // Store our role in the game for future reference
        if (this.gameRole === undefined || this.gameRole === 'spectator') {
            // Check if we're player 1
            if (currentPlayerId === player1Id) {
                this.gameRole = 'player1';
                console.log('Setting game role to player1');
            }
            // Check if we're player 2 - handle the case where player2Id might be wrong
            else if (currentPlayerId === player2Id && player1Id !== player2Id) {
                this.gameRole = 'player2';
                console.log('Setting game role to player2');
            }
            // Special case: if we know we're player 2 from other sources
            else if (this.playerId && players.player2 &&
                    parseInt(this.playerId, 10) === parseInt(players.player2.id, 10) &&
                    parseInt(this.playerId, 10) !== parseInt(players.player1.id, 10)) {
                this.gameRole = 'player2';
                console.log('Setting game role to player2 (special case)');
            }
            else {
                this.gameRole = 'spectator';
                console.log('Setting game role to spectator');
            }
        }

        // Use our stored role for consistency if available
        let isPlayer1 = false;
        let isPlayer2 = false;

        if (this.gameRole) {
            isPlayer1 = this.gameRole === 'player1';
            isPlayer2 = this.gameRole === 'player2';
            console.log('Using stored game role:', this.gameRole);
        } else {
            // Fallback to direct ID comparison
            isPlayer1 = currentPlayerId === player1Id;
            isPlayer2 = currentPlayerId === player2Id && player1Id !== player2Id; // Ensure player2 is distinct from player1
            console.log('Using direct ID comparison for roles');
        }

        console.log('Identity check results - isPlayer1:', isPlayer1, 'isPlayer2:', isPlayer2);


        if (players.player1 && this.player1Ready) {
            // Update name
            if (this.player1Name) {
                this.player1Name.textContent = players.player1.username;
            }

            console.log('Updating player 1 ready state:', players.player1.is_ready);
            console.log('Player 1 ID:', players.player1.id, 'Current player ID:', this.playerId);
            console.log('isPlayer1:', isPlayer1, 'Type of player1.id:', typeof players.player1.id, 'Type of this.playerId:', typeof this.playerId);

            // Check if this is our ready button based on our stored role
            const isMyReadyButton = this.gameRole === 'player1';
            console.log('Is this my ready button?', isMyReadyButton, 'Game role:', this.gameRole);

            this.player1Ready.textContent = getTranslation("global_notready");  // Always start as Not Ready
            this.player1Ready.classList.remove('ready');  // Remove ready class by default

            // Use either the server state or our optimistic state
            const isReady = players.player1.is_ready || (isMyReadyButton && this._optimisticReady === true);
            console.log('Is player 1 ready?', isReady, 'Server says:', players.player1.is_ready, 'Optimistic state:', this._optimisticReady);

            if (isReady) {  // Update if ready
                this.player1Ready.textContent = getTranslation("global_ready");
                this.player1Ready.classList.add('ready');
            }

            // Button should be disabled if not player 1 or already ready
            const shouldDisable = !isMyReadyButton || isReady;
            console.log('Player 1 button should be disabled:', shouldDisable, 'Reason:', !isMyReadyButton ? 'Not player 1' : (isReady ? 'Already ready' : 'Can click ready'));
            this.player1Ready.disabled = shouldDisable;
        }

        // Update player 2 ready button and name
        if (players.player2 && this.player2Ready) {
            // Update name
            if (this.player2Name) {
                this.player2Name.textContent = players.player2.username;
            }

            console.log('Updating player 2 ready state:', players.player2.is_ready);
            console.log('Player 2 ID:', players.player2.id, 'Current player ID:', this.playerId);
            console.log('isPlayer2:', isPlayer2, 'Type of player2.id:', typeof players.player2.id, 'Type of this.playerId:', typeof this.playerId);

            // Check if this is our ready button based on our stored role
            const isMyReadyButton = this.gameRole === 'player2';
            console.log('Is this my ready button?', isMyReadyButton, 'Game role:', this.gameRole);

            this.player2Ready.textContent = getTranslation("global_notready");  // Always start as Not Ready
            this.player2Ready.classList.remove('ready');  // Remove ready class by default

            // Use either the server state or our optimistic state
            const isReady = players.player2.is_ready || (isMyReadyButton && this._optimisticReady === true);
            console.log('Is player 2 ready?', isReady, 'Server says:', players.player2.is_ready, 'Optimistic state:', this._optimisticReady);

            if (isReady) {  // Update if ready
                this.player2Ready.textContent = getTranslation("global_ready");
                this.player2Ready.classList.add('ready');
            }

            // Button should be disabled if not player 2 or already ready
            const shouldDisable = !isMyReadyButton || isReady;
            console.log('Player 2 button should be disabled:', shouldDisable, 'Reason:', !isMyReadyButton ? 'Not player 2' : (isReady ? 'Already ready' : 'Can click ready'));
            this.player2Ready.disabled = shouldDisable;
        }
    }

    showJoinGameForm() {
        const modal = document.getElementById('joinGameModal');
        const gameIdInput = document.getElementById('gameIdInput');
        const confirmButton = document.getElementById('confirmJoinGame');
        const cancelButton = document.getElementById('cancelJoinGame');
        const resultSection = document.getElementById('joinGameResultSection');
        const inputSection = document.getElementById('joinGameInputSection');
        const resultMessage = document.getElementById('joinGameResultMessage');
        const closeResultButton = document.getElementById('closeJoinGameResult');

        resultSection.style.display = 'none';
        inputSection.style.display = 'block';
        gameIdInput.value = '';

        modal.style.display = 'flex';

        setTimeout(() => gameIdInput.focus(), 100);

        const handleJoin = () => {
            const gameId = gameIdInput.value.trim();
            if (gameId) {
                console.log('Joining game:', gameId);
                this.joinGame(gameId);
                closeModal();
            } else {
                resultSection.style.display = 'block';
                inputSection.style.display = 'none';
                resultMessage.textContent = 'Please enter a valid Game ID';
                resultMessage.className = 'game_error-message';
            }
        };

        const closeModal = () => {
            modal.style.display = 'none';
            confirmButton.removeEventListener('click', handleJoin);
            cancelButton.removeEventListener('click', closeModal);
            closeResultButton.removeEventListener('click', closeModal);
            gameIdInput.removeEventListener('keypress', handleEnterKey);
        };

        const handleEnterKey = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleJoin();
            }
        };

        confirmButton.addEventListener('click', handleJoin);
        cancelButton.addEventListener('click', closeModal);
        closeResultButton.addEventListener('click', closeModal);
        gameIdInput.addEventListener('keypress', handleEnterKey);
    }
};
