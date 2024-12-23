
// canvas
var canvas;
var ctx;

// Sprite collections
var activeSprites = [];
var mousedSprites = [];

// Input info
var mouseX = 0;
var mouseY = 0;
var mouseDown = false;
var mouseClick = false;
var totalClicks = 0;

// images
const suits = ["H", "S", "C", "D"];
const cardImages = [];
const cardBack = new Image();
const totalImages = 53;
var imagesLoaded = 0;
var loadingReference;

var deltaTime = 0;
var lastUpdateTime = 0;


class Sprite {
    constructor(image, x, y, scaleX, scaleY, depth=0, visible = true) {
        this.image = image;
        this.x = x;
        this.y = y;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.depth = depth;
        this.visible = visible;
        this.width;
        this.height;

        this.updateBounds();
        activeSprites.push(this);
    }
    setImage(image) {
        this.image = image;
    }
    moveX(x) {
        this.x += x;
    }
    moveY(y) {
        this.y += y;
    }
    setPosition(x, y) {
        this.x = x;
        this.y = y;
    }
    setScaleX(scaleX) {
        this.scaleX = scaleX;
    }
    setScaleY(scaleY) {
        this.scaleY = scaleY;
    }
    setScale(scaleX, scaleY) {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
    }
    setVisible(visible) {
        this.visible = visible;
    }
    updateBounds() {
        this.width = (this.image.width * this.scaleX);
        this.height = Math.abs(this.image.height * this.scaleY);
        this.bounds = [this.x - this.width / 2, this.y - this.height / 2, this.x + this.width / 2, this.y + this.height / 2];
    }
    update() {
        this.updateBounds();
        if (this.visible && mouseX > this.bounds[0] && mouseX < this.bounds[2] && mouseY > this.bounds[1] && mouseY < this.bounds[3]) {
            mousedSprites.push(this);
            //console.log('moused');
        }
    }

    mouseClick() {
        console.log("mouseClick() not implemented");
    }

    mouseDown() {
        console.log("mouseDown() not implemented");
    }

    draw(context) {
        if (this.visible) {
            const offsetX = this.width / 2;
            const offsetY = this.height / 2;
            context.drawImage(this.image, this.x - offsetX, this.y - offsetY, this.image.naturalWidth * this.scaleX, this.image.naturalHeight * this.scaleY);
        }
    }

    destroy() {
        activeSprites.splice(activeSprites.indexOf(this), 1);
    }

}

class BlackjackCard extends Sprite {
    constructor(card, x, y, scaleX, scaleY, faceUp = true, depth=0, visible = true) {
        super(faceUp == true ? cardImages[card] : cardBack, x, y, scaleX, scaleY, depth, visible);
        this.card = card;
        this.faceUp = faceUp;
    }
    mouseClick() {
        console.log(`Clicked ${cardImages[this.card].src}`)
        this.flip();
    }
    flip() {
        this.faceUp = !this.faceUp;
        this.setImage(this.faceUp == true ? cardImages[this.card] : cardBack);
    }
    mouseDown() {

    }
}

window.onload = () => {
    canvas = document.getElementById("canvas");
    canvas.width = 1200;
    canvas.height = 700;
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // mouse stuff
    document.addEventListener('mousemove', function(event) {
        const bounds = canvas.getBoundingClientRect();
        const scaleX = canvas.width / bounds.width;
        const scaleY = canvas.height / bounds.height;
        mouseX = Math.floor((event.clientX - bounds.left) * scaleX);
        mouseY = Math.floor((event.clientY - bounds.top) * scaleY);
    });
    document.addEventListener('mousedown', function(event) {
        mouseDown = true;
    });
    canvas.addEventListener('mouseup', function(event) {
        if (mouseDown) {
            mouseClick = true;
            //console.log("click");
        }
        mouseDown = false;
    });

    // load card images
    loadingReference = setInterval(loadingScreen, 10);
    for (let i = 2; i <= 14; i++) {
        for (let j = 0; j < suits.length; j++) {
            const image = new Image();
            image.src = "/images/cards/" + i + suits[j] + ".png";
            cardImages.push(image);
            image.onload = () => imagesLoaded++;
        }
    }
    cardBack.src = "/images/cards/back.png";
    cardBack.onload = () => imagesLoaded++;

}

function loadingScreen() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawText(ctx, `loading assets... (${imagesLoaded}/${totalImages})`, canvas.width / 2, canvas.height / 2, "Arial", 30, "lime");
    ctx.draw
    if (imagesLoaded >= totalImages) { // Start Game Loop
        card1 = new BlackjackCard(Math.floor(Math.random() * cardImages.length), 475, 350, 5, 5, false);
        card2 = new BlackjackCard(Math.floor(Math.random() * cardImages.length), 725, 350, 5, 5, false, 1);
        clearInterval(loadingReference);
        lastUpdateTime = Date.now();
        requestAnimationFrame(update);
    }
}

function drawText(context, text, x, y, font, size, color) {
    context.font = `${size}px ${font}`;
    context.fillStyle = color;
    context.textAlign = "center";
    context.fillText(text, x, y);

}

// -- Game Loop --
function update() {
    // delta time
    deltaTime = (Date.now() - lastUpdateTime) / 10;
    lastUpdateTime = Date.now();

    // update sprites
    activeSprites.forEach((sprite) => {
        //sprite.moveX(1 * deltaTime);
        sprite.update();
    })

    // handle input
    if (mousedSprites.length > 0) {
        mousedSprites.sort((a, b) => b.depth - a.depth);
        mousedSprites[0].mouseDown();
        if (mouseClick) {
            mousedSprites[0].mouseClick();
        }
        if (mouseDown) {
            mousedSprites[0].mouseDown();
        }
    }
    mouseClick = false;

    // draw sprites
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    activeSprites.sort((a, b) => a.depth - b.depth);
    activeSprites.forEach((sprite) => {
        sprite.draw(ctx);
    })

    // draw mouse info
    drawText(ctx, `${mouseX}, ${mouseY}`, 600, 670, "Arial", 30, "lime");

    // reset inputs
    mousedSprites = [];
    // request next frame
    requestAnimationFrame(update);

    
}



