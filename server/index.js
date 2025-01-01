const WebSocketServer = require('ws').Server;
const socket = new WebSocketServer({ 
    port: 3000, 
});
let testPlayerCounter = 0;

class PokerGame {
    constructor(maxPlayers = 8) {
        this.maxPlayers = maxPlayers;
        this.round = 0;
        this.roundState = 0; // 0 = waiting for round start, 1 = round active
        this.playerQueue = [];
        this.purgatory = [];
        this.players = [];
        this.deck;
        this.restoreDeck();

        this.updateLoop = setInterval(() => {
            this.update();
        }, 1000);

    }

    restoreDeck() {
        this.deck = [];
        for (let i = 0; i < 52; i++) {
            this.deck.push(i);
        }
    }

    deal(count = 2) {
        this.players.forEach(player => {
            player.hand = [];
            for (let i = 0; i < count; i++) {
                if (this.deck.length > 0) {
                    const randomIndex = Math.floor(Math.random() * this.deck.length);
                    player.hand.push(this.deck.splice(randomIndex, 1)[0]);
                }
            }
        })
    }

    startRound() {
        this.round += 1;
        this.roundState = 1;
        this.restoreDeck();
        this.deal();
    }


    addPlayer(ws, name) {
        const player = new PokerPlayer(ws, name);
        this.players.push(player);
    }


    addToQueue(ws, name) {
        const player = new PokerPlayer(ws, name);
        this.playerQueue.push(player);
    }


    getPlayer(ws) {
        const player = this.players.find(player => player.ws === ws);
        if (player) {
            return player;
        } else {
            return null;
        }
    }

    getFromPurgatory(ws) {
        const player = this.purgatory.find(player => player.ws === ws);
        return player;
    }

    removePlayer(ws) {
        this.playerQueue = this.playerQueue.filter(player => player.ws !== ws);
        this.purgatory = this.purgatory.filter(player => player.ws !== ws);
        this.players = this.players.filter(player => player.ws !== ws);
        this.sendNames();
    }

    advanceFromPurgatory(ws) {
        const player = this.getFromPurgatory(ws);
        if (player) {
            this.players.push(player);
            this.purgatory = this.purgatory.filter(player => player.ws !== ws);
            this.sendNames();
        }
    }

    update() {
        if (this.roundState == 0) {
            // Move players to purgatory for queue confirmation if space available in game
            while (this.players.length < this.maxPlayers && this.playerQueue.length > 0) {
                const player = this.playerQueue.shift();
                this.purgatory.push(player);
                player.ws.send(jsonMessage("invitePoker", 0));
                console.log(`${player.name} invited to poker and moved to purgatory to await acception`);
            }
            // Increment time in purgatory
            for (let i = 0; i < this.purgatory.length; i++) {
                const player = this.purgatory[i];
                player.incrementTimeInPurgatory();
                if (player.timeInPurgatory > 6) {
                    this.removePlayer(player.ws);
                    console.log(`no queue confirmation from ${player.name}, purged`);
                }
            }

            
        }
        //console.log(`queue: ${this.playerQueue}`);
        //console.log(`purgatory: ${this.purgatory}`);
        //console.log(`players: ${this.players}`);
    }

    sendNames() {
        // send list display names to all current players
        const playerNames = []
        this.players.forEach(player => {
            playerNames.push(player.name);
        }) 

        this.players.forEach(player => {
            player.ws.send(jsonNamesList(playerNames));
        }) 
    }

}

class PokerPlayer {
    constructor(ws, name) {
        this.ws = ws;
        this.name = name;
        this.hand = [];
        this.timeInPurgatory = 0;
    }

    incrementTimeInPurgatory() {
        this.timeInPurgatory += 1;
    }
}

let clients = new Map();
let poker = new PokerGame();


socket.on('connection', (ws) => {
    try {
        ws.send(jsonMessage('requestClient', 0));
    } catch (error) {
        console.log(error);
    }
    ws.on('message', (message) => {
        try {
            const messageStr = message instanceof Buffer ? message.toString() : message;
            const messageJSON = JSON.parse(messageStr);
            const type = messageJSON.type;
            const data = messageJSON.data;
            if (type === "clientConnected") {
                clients.set(ws, data.name + `${testPlayerCounter++}`);
                console.log(`${clients.get(ws)} connected`);
            } else if (type === "requestHand") {
                console.log('Client requested hand')
                ws.send(jsonHand(ws));
            } else if (type === "queuePoker") {
                poker.addToQueue(ws, clients.get(ws));
                console.log(`${clients.get(ws)} queued for poker`);
            } else if (type === "acceptPoker") {
                if (poker.roundState == 0) {
                    poker.advanceFromPurgatory(ws);
                    console.log(`${clients.get(ws)} accepted poker invitation`);
                }

            } else if (type === "leavePoker") {
                poker.removePlayer(ws);
            } else {
                throw new Error(`Unknown message type: ${type}`);
            }

        } catch (error) {
            console.log(error);
        }
    });

    ws.on('close', () => {
        clients.delete(ws);
        console.log('Client disconnected');
        poker.removePlayer(ws);
    });

    ws.on('error', (error) => {
        console.error(`Error on channel ${clients.get(ws)}: ${error.message}`);
    });

});

function jsonMessage(type, data) {
    return JSON.stringify({
        type: type,
        data: data
    });
}

function jsonNamesList(names) {
    return jsonMessage("namesList", {
        names: names
    });
}

function jsonHand(client) {
    return jsonMessage("hand", {
        hand: [Math.floor(Math.random() * 52), Math.floor(Math.random() * 52)]
    });

}