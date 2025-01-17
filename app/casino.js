

const gameArea = document.getElementById("game");

let chips = 0;
let displayName = "anon";
let playerID;
let myTurn = false;
let minRaise = 0;

const players = new Map();
let communityCards = [];
let communityRevealed = 0;

function updateChips() {
    socket.send(jsonFreeChips());
}

// Input info
let mouseX = 0;
let mouseY = 0;
let mouseDown = false;
let mouseClick = false;
let totalClicks = 0;

// images
const suits = ["H", "S", "C", "D"];
const cardImages = new Map();
const cardBack = new Image();
const totalAssets = 53;
let assetsLoaded = 0;

let deltaTime = 0;
let lastUpdateTime = 0;

let hole = [];

class PokerCard {
    constructor(card, faceUp, element = null, flippable = false) {
        this.card = card;
        this.faceUp = faceUp;
        this.element =  element
        this.setFace(faceUp);
        if (element) {
            this.element.src = this.image.src
            if (flippable) {
                this.element.addEventListener("click", () => {
                    this.flip();
                });
            }
        }
    }

    setElement(element) {
        this.element = element;
        this.element.src = this.image.src
    }

    flip() {
        this.setFace(!this.faceUp);
    }

    setFace(up) {
        this.faceUp = up;
        this.image = this.faceUp ? cardImages.get(this.cardToKey()) : cardBack;
        this.element.src = this.image.src
    }

    setCard(card) {
        this.card = card;
        this.setFace(this.faceUp);
    }

    cardToKey() {
        return this.card.rank + this.card.suit;
    }

}

function createCardWithElement(card, faceUp = false, flippable = false) {
    const element = document.createElement("img");
    element.classList.add("cards");
    element.classList.add("clickable");
    return new PokerCard(card, faceUp, element, flippable);
}

// --Create common page elements--
function createButton(text, id = "game-button", classes = []) {
    const button = document.createElement("button");
    button.id = id;
    button.classList.add(...classes);
    button.textContent = text;
    return button;
}

function createInput(value = "", id = "game-input", classes = [], autoComplete = false) {
    const input = document.createElement("input");
    input.id = id;
    input.classList.add(...classes);
    input.value = value;
    input.setAttribute("autocomplete", autoComplete? "on" : "off");
    return input;
}

function createDiv(elements, id = "flex-stack", classes = []) {
    const stack = document.createElement("div");
    stack.id = id;
    for (let i = 0; i < elements.length; i++) {
        stack.appendChild(elements[i]);
    }
    stack.classList.add(...classes);
    return stack;
}

function createSpacer() {
    return createDiv([], "spacer");
}

function createHeading(text, headingSize = 1, id = "game-heading", classes = []) {
    const heading = document.createElement("h" + headingSize);
    heading.id = id;
    heading.textContent = text;
    heading.classList.add(...classes);
    return heading;
}

function createActionButtons() {
    const buttons = [];
    buttons.push(createInput("0", "raise-input", ["action"]));
    buttons.push(createButton("raise", "raise", ["action"])); // action 0
    buttons.push(createButton("call", "call", ["action"])); // action 1
    buttons.push(createButton("all-in", "all-in", ["action"])); // action 2
    buttons.push(createButton("fold", "fold", ["action"])); // action 3
    buttons.push(createButton("check", "check", ["action"])); // action 4
    for (let i = 1; i < buttons.length; i++) {
        buttons[i].addEventListener("click", () => {
            if (myTurn) socket.send(jsonAction(i - 1, document.getElementById("raise-input").value));
        })
    }
    return buttons;
}

class liveHeading {
    constructor(text = "", headingSize = 1, id = "loading-heading", classes = []) {
        this.text = text;
        this.element = createHeading(this.text, headingSize, id, classes);
        this.animationReference = null;
        this.animationFrame = 0;
    }

    setText(text) {
        this.stopAnimation();
        this.text = text;
        this.element.textContent = text;
    }

    setSize(headingSize) {
        this.element = createHeading(this.text, headingSize, this.element.id);
    }

    startAnimation(speed, length) {
        //console.log("starting loading animation");
        this.animationFrame = 0;
        this.animationReference = setInterval(() => this.animate(length), speed);
        setTimeout(() => this.animationSafeguard(), 5000);
    }

    animate(length) {
        //console.log("animating");
        this.element.textContent = (this.text + ".".repeat((this.animationFrame += 1) % length));
    }

    stopAnimation() {
        try {
            clearInterval(this.animationReference);
        } catch (e) {}
    }

    animationSafeguard() { // clear animation interval if element is not in dom
        if (!document.contains(this.element)) {
            this.stopAnimation();
            //console.log('Element not in dom, animation interval cleared');
        } else {
            setTimeout(() => this.animationSafeguard(), 5000);
        }
    }
}

function pokerQueueScreen() {
    while (gameArea.firstChild) {
        gameArea.firstChild.remove();
    }
    const loading = new liveHeading("waiting for game");
    loading.startAnimation(500, 4);
    const backButton = createButton("back");
    backButton.addEventListener("click", () => {
        queueStack.remove();
        gameArea.appendChild(mainMenu);
        pokerQueued = false; 
        socket.send(jsonLeavePoker());
        console.log("left poker/queue")
    })
    const buttonDiv = createDiv([backButton], "queue-buttons");
    const queueStack = createDiv([loading.element, buttonDiv], "matchmaking-stack");
    gameArea.appendChild(queueStack);
}

function mainMenuScreen() {
    while (gameArea.firstChild) {
        gameArea.firstChild.remove();
    }
    gameArea.appendChild(mainMenu);
}

function pokerReadyScreen() {
    while (gameArea.firstChild) {
        gameArea.firstChild.remove();
    }
    const ready = createHeading(previewPlayersString(), 1, "preview-players")
    const backButton = createButton("back");
    backButton.addEventListener("click", () => {
        readyStack.remove();
        gameArea.appendChild(mainMenu);
        pokerQueued = false; 
        socket.send(jsonLeavePoker());
        console.log("left poker/queue")
    })
    const startButton = createButton("start", "start-button");
    startButton.addEventListener("click", () => {
        console.log("requesting round start");
        socket.send(jsonMessage("startHand", 0));
    })
    const buttonDiv = createDiv([backButton, startButton], "ready-buttons");
    const readyStack = createDiv([ready, buttonDiv], "matchmaking-stack");
    gameArea.appendChild(readyStack);
}

function listString(list) {
    let str = "";
    for (let i = 0; i < list.length; i++) {
        str += `${list[i]}`;
        if (i == list.length - 2) {
            str += " & ";
        } else if (i < list.length - 1) {
            str += ", ";
        }
    }
    return str;
}

function previewPlayersString() {
    return `playing: ${listString(Array.from(players.keys()))}`
}

function detailsString(details) {
    return `${details.name} (${details.chips}) ${details.lastAction}`;

}

const title = createHeading("casinoJS");
const chipsCounter = createHeading("", 2, "chips-counter");
const chipsCounter2 = createHeading("", 2, "chips-counter");
const gameInfo = createHeading("", 2, "game-info");
const chipsButton = createButton("get chips", "chips-button", ["menu-button"]);
chipsButton.addEventListener("click", () => updateChips(25));
const pokerButton = createButton("play poker", "poker-button", ["menu-button"]);
pokerButton.addEventListener("click", () => requestPoker());
const blackjackButton = createButton("blackjack");
const changeNameButton = createButton("rename", "change-name-button", ["menu-button"]);
changeNameButton.addEventListener("click", () => showChangeName());
const mainMenu = createDiv([title, createSpacer(), pokerButton, chipsButton, changeNameButton, createSpacer(), chipsCounter], "main-menu");


const changeNameInput = createInput("", "change-name-input", ["menu-button"]);
changeNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        rename();
    }
})
const submitNameButton = createButton("submit", "submit-name-button", ["menu-button"]);
submitNameButton.addEventListener("click", () => rename());
const changeNameHeader = createHeading("max 10 characters", 2, "change-name-header");
const changeNameInputDiv = createDiv([changeNameInput, submitNameButton], "change-name-input-div");
const changeNameMenu = createDiv([createSpacer(), changeNameInputDiv, changeNameHeader, createSpacer()], "change-name-menu");
function showChangeName() {
    while (gameArea.firstChild) {
        gameArea.firstChild.remove();
    }
    gameArea.appendChild(changeNameMenu);
}

function rename() {
    socket.send(jsonRename(changeNameInput.value));
    mainMenuScreen();
}



// -- Client --
let socket;

function connectWebSocket() {
    if (socket) {
        socket.close();
    }
    
    socket = new WebSocket('wss://node.beanswithwater.net/casino');

    socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        const messageType = message.type;
        const data = message.data;
        if (messageType === "requestClient") {
            if (!playerID) {
                playerID = data.id;
            }
            socket.send(jsonConnect(displayName, playerID));
        } else if (messageType === "initializeClient") {
            displayName = data.name;
            chips = data.chips;
            chipsCounter.textContent = `${displayName}: ${chips} chips`;
            chipsCounter2.textContent = `${displayName}: ${chips} chips`;
        } else if (messageType === "chips") {
            chips = data.chips;
            chipsCounter.textContent = `${displayName}: ${chips} chips`;
            chipsCounter2.textContent = `${displayName}: ${chips} chips`;
        } else if (messageType === "invitePoker") {
            if (pokerQueued) {
                console.log("poker accepted")
                socket.send(jsonAcceptPoker());
            } 
        } else if (messageType === "error") {
            while (gameArea.firstChild) {
                gameArea.removeChild(gameArea.firstChild);
            }
            gameArea.appendChild(mainMenu);
            console.log(`error: ${data.error}`);
            window.alert(`error: ${data.error}`);
            pokerQueued = false;
        } else if (messageType === "details") {
            const details = data.details;
            const clear = data.clear;
            if (clear) {
                players.clear();
            }
            details.forEach(details => {
                if (!players.has(details.name)) {
                    players.set(details.name, new liveHeading(detailsString(details), 2, "player-info"));
                } else {
                    players.get(details.name).setText(detailsString(details));
                }
            });
            const community = data.community;
            if (community.length > communityRevealed && communityCards.length == 5) {
                for (let i = communityRevealed; i < community.length; i++) {
                    communityCards[i].setCard(community[i]);
                    communityCards[i].setFace(true);
                }
                communityRevealed = data.community.length;
            }

            gameInfo.textContent = `bet: ${data.bet} | min raise: ${data.minRaise} | max payout: ${data.maxPayout}`;

            const raiseInput = document.getElementById("raise-input");
            if (raiseInput) {
                if (minRaise < data.minRaise || data.forceRaiseUpdate) {
                    minRaise = data.minRaise;
                    raiseInput.value = minRaise;
                }
            }

            const namesPreviewElement = document.getElementById("preview-players");
            if (namesPreviewElement) {
                namesPreviewElement.textContent = previewPlayersString();
            }

            const turnIndicatorElement = document.getElementById("turn-indicator");
            if (turnIndicatorElement) {
                if (data.state == 2) {
                    turnIndicatorElement.textContent = "hand over";
                } else if (data.state == 1){
                    if (data.turn == displayName) {
                        turnIndicatorElement.textContent = "your turn";
                        myTurn = true;
                    } else {
                        turnIndicatorElement.textContent = `${data.turn}'s turn`;
                        myTurn = false;
                    }
                }
            }
            
        } else if (messageType === "roundReady") {
            if (pokerQueued && !document.getElementById("start-round")) {
                console.log("round ready to start");
                pokerReadyScreen();
            }
        } else if (messageType === "roundUnready") {
            if (pokerQueued) {
                pokerQueueScreen(false);
            }
        } else if (messageType === "handStart") {
            console.log("hand started!");
            communityRevealed = 0;
            minRaise = 0;

            while (gameArea.firstChild) {
                gameArea.removeChild(gameArea.firstChild);
            }
            const chatDiv = createDiv([], "chat-div");
            const chatInput = createInput("", "chat-input");
            const chatSend = createButton("send", "chat-send");
            function sendMessage() {
                const trimmedMessage = String(chatInput.value).trim();
                if (trimmedMessage) {
                    console.log(`sending chat message: ${chatInput.value}`);
                    socket.send(jsonChatMessage(chatInput.value));
                }
                chatInput.value = "";
            }
            chatSend.addEventListener("click", () => sendMessage());
            chatInput.addEventListener("keydown", (event) => {
                if (event.key === "Enter") {
                    sendMessage();
                }
            })
            const chatInputDiv = createDiv([chatInput,chatSend], "chat-input-div");
            const chatStack = createDiv([chatDiv, createSpacer(), chatInputDiv], "chat-stack");
            const playerInfoDiv = createDiv([], "player-info-div");
            Array.from(players.keys()).forEach(name => {
                playerInfoDiv.appendChild(players.get(name).element);
            })

            const playerStack = createDiv([playerInfoDiv, chatStack], "player-stack");

            const holeDiv = createDiv([], "hole-div");
            const communityDiv = createDiv([], "community-div");
            const cardDiv = createDiv([communityDiv, holeDiv], "card-div");
            const buttonDiv = createDiv(createActionButtons(), "action-div");
            const turnIndicator = createHeading("", 2, "turn-indicator");
            const pokerStack = createDiv([chipsCounter2, gameInfo, cardDiv, turnIndicator, buttonDiv], "poker-stack");
            const pokerWrapper = createDiv([pokerStack], "poker-wrapper");
            gameArea.appendChild(playerStack);
            gameArea.appendChild(pokerWrapper);
            pokerQueued = false;

            // fix chat height
            requestAnimationFrame(() => fixChatHeight());
        } else if (messageType === "deal") {
            const newHole = data.hole;
            console.log(newHole);
            console.log(`received hole: ${newHole}`);
            hole = [];
            for (let i = 0; i < newHole.length; i++) {
                hole.push(createCardWithElement(newHole[i], true, true));
            }
            const holeDiv = document.getElementById("hole-div");
            for (let i = 0; i < hole.length; i++) {
                holeDiv.appendChild(hole[i].element);
            }
            const communityDiv = document.getElementById("community-div");
            communityCards = [];
            for (let i = 0; i < 5; i++) {
                communityCards.push(createCardWithElement(0, false, false));
                communityDiv.appendChild(communityCards[i].element);
            }
        } else if (messageType === "chatMessage") {
            const chat = document.getElementById("chat-div");
            const messageElement = createHeading(data.message, 2, "chat-message");
            chat.appendChild(messageElement);
            chat.scrollTop = chat.scrollHeight;
        } else if (messageType === "playAgain") {
            const buttonDiv = document.getElementById("action-div");
            while (buttonDiv.firstChild) {
                buttonDiv.removeChild(buttonDiv.firstChild);
            }
            const mainMenuButton = createButton("main menu", "leave-button", ["end-game-button"]);
            const playAgainButton = createButton("play again", "play-again-button", ["end-game-button"]);
            mainMenuButton.addEventListener("click", () => {
                mainMenuScreen();
                socket.send(jsonLeavePoker());
            });
            playAgainButton.addEventListener("click", () => {
                pokerQueueScreen();
                pokerQueued = true;
            })
            buttonDiv.appendChild(mainMenuButton);
            buttonDiv.appendChild(playAgainButton);
            

        } else if (messageType === "rename") {
            displayName = data.name;
            chipsCounter.textContent = `${displayName}: ${chips} chips`;
            chipsCounter2.textContent = `${displayName}: ${chips} chips`;
        }else {
            console.log(`unknown message type: ${messageType}`);
        }
    });

    socket.onopen = () => {
        console.log('WebSocket connected.');
    };

    socket.onclose = () => {
        console.log('WebSocket closed.');
    };

    socket.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}
// Reconnection
setInterval(() => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
        connectWebSocket();
    }
}, 2500);


// Initial connection
connectWebSocket();

window.addEventListener('offline', () => {
    console.log('Network connection lost.');
});

function fixChatHeight () {
    const playerStack = document.getElementById("player-stack");
    const pokerStack = document.getElementById("poker-stack");

    if (playerStack && pokerStack) {
        const chatStack = document.getElementById("chat-stack");
        const infoDiv = document.getElementById("player-info-div");
        const infoHeight = infoDiv.getBoundingClientRect().height;
        const pokerHeight = pokerStack.getBoundingClientRect().height;
        playerStack.style.height = `${pokerHeight}px`;

        
        chatStack.style.height = `${pokerHeight - infoHeight - 8}px`;
        requestAnimationFrame(() => fixChatHeight());
    }


}

function jsonConnect(name, id) {
    return jsonMessage("clientConnected", {
        name: name,
        id: id
    });
}

function jsonRename(name) {
    return jsonMessage("rename", {
        id: playerID, type: "rename", 
        name: name
    });
}

function jsonFreeChips() {
    return jsonMessage("freeChips", {
        id: playerID
    });
}
function jsonQueuePoker() {
    return jsonMessage("queuePoker", {
        id: playerID
    });
}

function jsonAcceptPoker() {
    return jsonMessage("acceptPoker", {
        id: playerID
    });
}

function jsonLeavePoker() {
    return jsonMessage("leavePoker", {
        id: playerID
    });
}

function jsonAction(action, raise) {
    return jsonMessage("action", {
        id: playerID,
        action: action,
        raise: raise
    });
}

function jsonChatMessage(message) {
    return jsonMessage("chatMessage", {
        id: playerID,
        message: message
    });
}

function jsonMessage(type, data) {
    return JSON.stringify({
        type: type,
        data: data
    });
}

window.onload = () => {
    // mouse stuff
    window.ondragstart = function() {return false};
    document.addEventListener('mousemove', function(event) {
        mouseX = event.clientX;
        mouseY = event.clientY;
    });
    document.addEventListener('mousedown', function(event) {
        mouseDown = true;
    });
    document.addEventListener('mouseup', function(event) {
        if (mouseDown) {
            mouseClick = true;
            //console.log("click");
        }
        mouseDown = false;
    });

    // window close
    window.addEventListener('beforeunload', (event) => {
        socket.send(jsonLeavePoker());
    })

    // load card images
    const loadingText = document.createElement("p");
    const loadingDiv = createDiv([loadingText], "loading-div");
    gameArea.appendChild(loadingDiv);
    requestAnimationFrame(() => {loadingScreen(loadingDiv, loadingText)});
    for (let i = 2; i <= 14; i++) {
        for (let j = 0; j < 4; j++) {
            const image = new Image();
            image.src = "/images/cards/" + i + suits[j] + ".png";
            cardImages.set(i + suits[j], image);
            image.onload = () => assetsLoaded++;
        }
    }
    cardBack.src = "/images/cards/back.png";
    cardBack.onload = () => assetsLoaded++;

}

function loadingScreen(loadingDiv, loadingText) {
    loadingText.textContent = "Loading assets... " + assetsLoaded + "/" + totalAssets;
    if (assetsLoaded >= totalAssets) { // Start Game Loop
        loadingDiv.remove();
        gameArea.appendChild(mainMenu);
    } else {
        requestAnimationFrame(() => {loadingScreen(loadingDiv, loadingText)});
    }
}


let pokerQueued = false; 

function requestPoker() {
    console.log("queueing poker");
    pokerQueueScreen();
    socket.send(jsonQueuePoker());
    pokerQueued = true;


}


class wrapper {
    constructor(value) {
        this.value = value;
    }

    setValue(value) {
        this.value = value;
    }
}


// -- Game Loop --
/*
function update() {
    // delta time
    deltaTime = (Date.now() - lastUpdateTime) / 10;
    lastUpdateTime = Date.now();

    requestAnimationFrame(update);

    
}
*/


