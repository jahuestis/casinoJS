
var canvas;
var ctx;

var activeSprites = [];

const cardImages = [];

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
    for (i = 2; i <= 14; i++) {
        suits = ["H", "S", "C", "D"];
        for (j = 0; j < suits.length; j++) {
            var image = new Image();
            image.src = "/images/cards/" + i + suits[j] + ".png";
            cardImages.push(image);
        }
    }
    cardBack = new Image();
    cardBack.src = "/images/cards/back.png";
    cardImages.push(cardBack);

    randomCard = Math.floor(Math.random() * cardImages.length);
    new Sprite(cardImages[randomCard], 600, 350, 6, 6);
    requestAnimationFrame(update);
}

function update() {

    activeSprites.sort((a, b) => a.depth - b.depth);
    activeSprites.forEach((sprite) => {
        sprite.draw(ctx);
    })
    requestAnimationFrame(update);
}



