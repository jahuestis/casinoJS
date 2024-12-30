
const gameArea = document.getElementById("game");
const chipsCounter = document.getElementById("chips-counter");
let chips = 0;

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
        this.image = faceUp ? cardImages[this.card] : cardBack;
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
        this.image = faceUp ? cardImages[this.card] : cardBack;
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

function createMenu(elements, id = "menu") {
    const menu = document.createElement("div");
    menu.id = id;
    if (Array.isArray(elements)) {
        for (let i = 0; i < elements.length; i++) {
            menu.appendChild(elements[i]);
        }
    } else {
        menu.appendChild(elements);
    }
    return menu;
}

// -- Client --
const socket = new WebSocket('ws://localhost:3000');

socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    const messageType = message.type;
    const data = JSON.parse(message.data);
    if (messageType === "hand") {
        const hand = data.hand;
        card1 = new PokerCard(hand[0], true);
        card2 = new PokerCard(hand[1], true);
        console.log(`received hand: ${card1.card} ${card2.card}`);
    }
}

function jsonRequestHand(size) {
    return jsonMessage("requestHand", JSON.stringify({
        size: size
    }));
}

function jsonMessage(type, data) {
    return JSON.stringify({
        type: type,
        data: data
    });
}

window.onload = () => {

    // mouse stuff
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
    const loadingDiv = document.createElement("div");
    loadingDiv.id = "loading-div";
    gameArea.appendChild(loadingDiv);
    const loadingText = document.createElement("p");
    loadingDiv.appendChild(loadingText);
    let loadingReference = setInterval(() => loadingScreen(loadingReference, loadingDiv, loadingText), 5);
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

function loadingScreen(intervalReference, loadingDiv, loadingText) {
    loadingText.textContent = "Loading assets... " + assetsLoaded + "/" + totalAssets;
    if (assetsLoaded >= totalAssets) { // Start Game Loop
        loadingDiv.remove();
        const chipsButton = createButton("get chips");
        chipsButton.addEventListener("click", () => updateChips(5));
        const pokerButton = createButton("texas hold em");
        const blackjackButton = createButton("blackjack");
        const mainMenu = createMenu([chipsButton, pokerButton, blackjackButton]);
        gameArea.append(mainMenu);
        clearInterval(intervalReference);
        socket.send(jsonRequestHand(2));
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

function createCardWithElement(card, faceUp = false) {
    const element = document.createElement("img");
    element.class = "cards";
    return new PokerCard(card, faceUp, element);
}
