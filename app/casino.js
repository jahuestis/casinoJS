
var canvas;
var ctx;

var activeSprites = [];

// images
const suits = ["H", "S", "C", "D"];
const cardImages = [];
const cardBack = new Image();
const totalImages = 53;
var imagesLoaded = 0;
var loadingReference;


class Sprite {
    constructor(img, x, y, scaleX, scaleY, depth=0, visible = true) {
        this.img = img;
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

    setX(x) {
        this.x = x;
        this.updateBounds();
    }

    setY(y) {
        this.y = y;
        this.updateBounds();
    }

    setPosition(x, y) {
        this.x = x;
        this.y = y;
        this.updateBounds();
    }

    setScaleX(scaleX) {
        this.scaleX = scaleX;
        this.updateBounds();
    }

    setScaleY(scaleY) {
        this.scaleY = scaleY;
        this.updateBounds();
    }

    setScale(scaleX, scaleY) {
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.updateBounds();
    }

    setVisible(visible) {
        this.visible = visible;
    }

    updateBounds() {
        this.width = (this.img.width * this.scaleX);
        this.height = Math.abs(this.img.height * this.scaleY);
        this.bounds = [this.x, this.y, this.x + this.width, this.y + this.height];
    }

    destroy() {
        activeSprites.splice(activeSprites.indexOf(this), 1);
    }

    draw(context) {
        if (this.visible) {
            const offsetX = this.width / 2;
            const offsetY = this.height / 2;
            context.drawImage(this.img, this.x - offsetX, this.y - offsetY, this.img.naturalWidth * this.scaleX, this.img.naturalHeight * this.scaleY);
        }
    }

}

window.onload = () => {
    canvas = document.getElementById("canvas");
    canvas.width = 1200;
    canvas.height = 700;
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

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
    ctx.font = "30px Arial";
    ctx.fillStyle = "lime";
    ctx.textAlign = "center";
    ctx.fillText(`loading... (${imagesLoaded}/${totalImages})`, canvas.width / 2, canvas.height / 2);
    ctx.draw
    if (imagesLoaded >= totalImages) {
        back = new Sprite(cardBack, 450, 350, 6, 6);
        randomCard = new Sprite(cardImages[Math.floor(Math.random() * cardImages.length)], 750, 350, 6, 6);
        requestAnimationFrame(update);
        clearInterval(loadingReference);
    }
}

function update() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    activeSprites.sort((a, b) => a.depth - b.depth);
    activeSprites.forEach((sprite) => {
        sprite.draw(ctx);
    })
    requestAnimationFrame(update);
}



