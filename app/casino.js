
const gameArea = document.getElementById("game");
const chipsCounter = document.getElementById("chips-counter");

let chips = 0;
let displayName = "anon";

let playerNames = [];

function updateChips(count) {
    chips += count;
    chipsCounter.textContent = "chips: " + chips;
}

// Input info
let mouseX = 0;
let mouseY = 0;
let mouseDown = false;
let mouseClick = false;
let totalClicks = 0;

// images
const suits = ["H", "S", "C", "D"];
const cardImages = [];
const cardBack = new Image();
const totalAssets = 53;
let assetsLoaded = 0;

let deltaTime = 0;
let lastUpdateTime = 0;

let hand = [];

class PokerCard {
    constructor(card, faceUp, element = null) {
        this.card = card;
        this.faceUp = faceUp;
        this.element =  element
        this.image = this.faceUp ? cardImages[this.card] : cardBack;
        if (element) {
            this.element.src = this.image.src
        }
    }

    setElement(element) {
        this.element = element;
        this.element.src = this.image.src
    }

    flip() {
        this.faceUp = !this.faceUp;
        this.image = this.faceUp ? cardImages[this.card] : cardBack;
        this.element.src = this.image.src
    }

}

// --Create common page elements--
function createButton(text, id = "game-button") {
    const button = document.createElement("button");
    button.id = id;
    button.textContent = text;
    return button;
}

function createDiv(elements, id = "flex-stack") {
    const stack = document.createElement("div");
    stack.id = id;
    for (let i = 0; i < elements.length; i++) {
        stack.appendChild(elements[i]);
    }
    return stack;
}

function createHeading(text, headingSize = 1, id = "game-heading") {
    const heading = document.createElement("h" + headingSize);
    heading.id = id;
    heading.textContent = text;
    return heading;
}

function createCardWithElement(card, faceUp = false) {
    const element = document.createElement("img");
    element.classList.add("cards");
    element.classList.add("clickable");
    return new PokerCard(card, faceUp, element);
}

class loadingHeading {
    constructor(text = "", headingSize = 1, id = "loading-heading") {
        this.text = text;
        this.element = createHeading(this.text, headingSize, id);
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
    const loading = new loadingHeading("waiting for game");
    loading.startAnimation(500, 4);
    const backButton = createButton("back");
    backButton.addEventListener("click", () => {
        queueStack.remove();
        gameArea.appendChild(mainMenu);
        pokerQueued = false; 
        socket.send(jsonMessage("leavePoker", 0));
        console.log("left poker/queue")
    })
    const buttonDiv = createDiv([backButton], "queue-buttons");
    const queueStack = createDiv([loading.element, buttonDiv]);
    gameArea.appendChild(queueStack);
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
        socket.send(jsonMessage("leavePoker", 0));
        console.log("left poker/queue")
    })
    const startButton = createButton("start", "start-button");
    startButton.addEventListener("click", () => {
        console.log("requesting round start");
        socket.send(jsonMessage("startRound", 0));
    })
    const buttonDiv = createDiv([backButton, startButton], "ready-buttons");
    const readyStack = createDiv([ready, buttonDiv]);
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
    return `in game: ${listString(playerNames)}`
}

const chipsButton = createButton("get chips");
chipsButton.addEventListener("click", () => updateChips(5));
const pokerButton = createButton("play poker");
pokerButton.addEventListener("click", () => requestPoker(mainMenu));
const blackjackButton = createButton("blackjack");
const testButton = createButton("test");
const mainMenu = createDiv([chipsButton, pokerButton]);
testButton.addEventListener("click", () => dealTest(mainMenu));

// -- Client --
const socket = new WebSocket('ws://localhost:3000');

socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const messageType = message.type;
    const data = message.data;
    if (messageType === "requestClient") {
        socket.send(jsonConnect());
    }else if (messageType === "hand") {
        const newHand = data.hand;
        console.log(`received hand: ${newHand}`);
        hand = [];
        for (let i = 0; i < newHand.length; i++) {
            hand.push(createCardWithElement(newHand[i], true));
            hand[i].element.addEventListener("click", () => {
                hand[i].flip();
            });
        }
        const handDiv = document.createElement("div");
        handDiv.id = "hand";
        for (let i = 0; i < hand.length; i++) {
            handDiv.appendChild(hand[i].element);
        }
        const testStack = createDiv([handDiv], 'testStack');
        gameArea.appendChild(testStack);
    } else if (messageType === "invitePoker") {
        if (pokerQueued) {
            console.log("poker accepted")
            socket.send(jsonMessage("acceptPoker", 0));
        } 
    } else if (messageType === "error") {
        while (gameArea.firstChild) {
            gameArea.removeChild(gameArea.firstChild);
        }
        gameArea.appendChild(mainMenu);
        console.log(`error: ${data.error}`);
        window.alert(`error: ${data.error}`);
        pokerQueued = false;
    } else if (messageType === "namesList") {
        playerNames = data.names;
        const namesPreviewElement = document.getElementById("preview-players");
        if (namesPreviewElement) {
            namesPreviewElement.textContent = previewPlayersString();
        }
        console.log(`received display names: ${playerNames}`);
    } else if (messageType === "roundReady") {
        if (pokerQueued && !document.getElementById("start-round")) {
            console.log("round ready to start");
            pokerReadyScreen();
        }
    } else if (messageType === "roundUnready") {
        if (pokerQueued) {
            pokerQueueScreen(false);
        }
    } else if (messageType === "roundStart") {
        console.log("round started!");
        while (gameArea.firstChild) {
            gameArea.removeChild(gameArea.firstChild);
        }
        pokerQueued = false;
    }
}


function jsonConnect() {
    return jsonMessage("clientConnected", {
        name: displayName
    });
}
function jsonRequestHand(size) {
    return jsonMessage("requestHand", {
        size: size
    });
}

function jsonQueuePoker() {
    return jsonMessage("queuePoker", 0);
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

    // load card images
    const loadingText = document.createElement("p");
    const loadingDiv = createDiv([loadingText], "loading-div");
    gameArea.appendChild(loadingDiv);
    requestAnimationFrame(() => {loadingScreen(loadingDiv, loadingText)});
    for (let i = 2; i <= 14; i++) {
        for (let j = 0; j < suits.length; j++) {
            const image = new Image();
            image.src = "/images/cards/" + i + suits[j] + ".png";
            cardImages.push(image);
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
        gameArea.append(mainMenu);
    } else {
        requestAnimationFrame(() => {loadingScreen(loadingDiv, loadingText)});
    }
}

function dealTest(previousPage) {
    previousPage.remove();
    socket.send(jsonRequestHand(2));
}

let pokerQueued = false; 

function requestPoker(previousPage) {
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


