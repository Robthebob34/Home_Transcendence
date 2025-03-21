function loadGame(){
	console.log("Loading game.")
}

function initGame(){
	console.log("Initializing game.")
    setTimeout(initializeGame, 300);
}

let game = null;
let gameInitialized = false;

async function initializeGame() {
    console.log('Loading game script...');
    try {
        // await loadGameScript();
        console.log('[GAME] Creating game instance...');
        game = new PongGame();
        gameInitialized = true;
        console.log('[GAME] Game instance created successfully');
    } catch (error) {
        console.error('[GAME] Failed to initialize game:', error);
        gameInitialized = false;
    }
}
