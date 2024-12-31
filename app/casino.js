
const gameArea = document.getElementById("game");
const chipsCounter = document.getElementById("chips-counter");
let chips = 0;
let displayName = "testplayer";

const handDiv = document.createElement("div");
handDiv.id = "hand";

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

function createStack(elements, id = "flex-stack") {
    const stack = document.createElement("div");
    stack.id = id;
    for (let i = 0; i < elements.length; i++) {
        stack.appendChild(elements[i]);
    }
    return stack;
}

function createDiv(id, width = 'auto', height = 'auto') {
    const div = document.createElement("div");
    div.id = id;
    div.style.width = width;
    div.style.height = height;
    return div;
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


const chipsButton = createButton("get chips");
chipsButton.addEventListener("click", () => updateChips(5));
const pokerButton = createButton("texas holdem");
pokerButton.addEventListener("click", () => requestPoker(mainMenu));
const blackjackButton = createButton("blackjack");
const testButton = createButton("test");
const mainMenu = createStack([testButton, chipsButton, pokerButton, blackjackButton]);
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
        while (handDiv.firstChild) {
            handDiv.removeChild(handDiv.firstChild);
        }
        for (let i = 0; i < hand.length; i++) {
            handDiv.appendChild(hand[i].element);
        }
        const spacer = createDiv("spacer", "auto", "2vh");
        const backButton = createButton("back");
        backButton.addEventListener("click", () => {
            testStack.remove();
            gameArea.appendChild(mainMenu);
        })
        const testStack = createStack([handDiv, spacer, backButton], 'testStack');
        gameArea.appendChild(testStack);
    } else if (messageType === "confirmPokerQueued") {
        if (pokerQueued) {
            socket.send(jsonMessage("confirmPokerQueued", 0));
        }
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
        gameArea.append(mainMenu);
        clearInterval(intervalReference);
    }
}

function dealTest(previousPage) {
    previousPage.remove();
    socket.send(jsonRequestHand(2));
}

let pokerQueued = false; 

function requestPoker(previousPage) {
    previousPage.remove();
    const loadingText = createHeading("waiting for game", 1);
    const backButton = createButton("back");
    backButton.addEventListener("click", () => {
        loadingStack.remove();
        gameArea.appendChild(mainMenu);
        pokerQueued = false; 
    })
    const loadingStack = createStack([loadingText, backButton], "loading-stack");
    gameArea.appendChild(loadingStack);
    const loadingStage = new wrapper(1);
    const loadingInterval = setInterval(() => incrementLoadingText(loadingText, loadingStage, loadingInterval), 500);
    socket.send(jsonQueuePoker());
    pokerQueued = true;


}

function incrementLoadingText(text, stage, intervalReference) {
    text.textContent = "waiting for game" + ".".repeat(stage.value);
    stage.setValue(((stage.value + 1) % 4));
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


