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
            player.ws.send(jsonHand(player.hand));
        })
    }

    startRound() {
        if (this.roundState == 0 && this.players.length > 1) {
            this.round += 1;
            this.roundState = 1;
            console.log(`Starting round ${this.round} with ${this.players.length} players`);
            this.broadcastToPlayers(jsonMessage("roundStart", 0));
            this.restoreDeck();
            this.deal();
        }
        
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
        this.broadcastNames();
        if (this.players.length <= 1 && this.roundState == 0) {
            this.broadcastToPlayers(jsonMessage("roundUnready", 0));
        }
    }

    advanceFromPurgatory(ws) {
        if (this.roundState == 0) {
            if (this.players.length < this.maxPlayers) {
                const player = this.getFromPurgatory(ws);
                if (player) {
                    this.players.push(player);
                    this.purgatory = this.purgatory.filter(player => player.ws !== ws);
                    this.broadcastNames();
                    if (this.players.length > 1) {
                        this.broadcastToPlayers(jsonMessage("roundReady", 0));
                    }
                }
            } else {
                ws.send(jsonError("game full"));
            }
            
        } else {
            console.log("matchmaking timeout");
            this.removePlayer(ws);
            ws.send(jsonError("matchmaking timeout"));
        }
    }

    update() {
        if (this.roundState == 0) {
            // Move players to purgatory for queue confirmation if space available in game
            while (this.players.length < this.maxPlayers && this.playerQueue.length > 0) {
                const player = this.playerQueue.shift();
                this.purgatory.push(player);
                player.ws.send(jsonMessage("invitePoker", 0));
                console.log(`${player.name} invited to poker and moved to purgatory to await confirmation`);
            }
            // Increment time in purgatory
            for (let i = 0; i < this.purgatory.length; i++) {
                const player = this.purgatory[i];
                player.incrementTimeInPurgatory();
                if (player.timeInPurgatory > 6) {
                    this.removePlayer(player.ws);
                    console.log(`${player.name} did not accept invitation, purged`);
                }
            }
            
        }

        //console.log(`queue: ${this.playerQueue}`);
        //console.log(`purgatory: ${this.purgatory}`);
        //console.log(`players: ${this.players}`);
    }

    broadcastNames() {
        // send list display names to all current players
        const playerNames = []
        this.players.forEach(player => {
            playerNames.push(player.name);
        }) 
        this.broadcastToPlayers(jsonNamesList(playerNames));
    }

    broadcastToPlayers(message) {
        this.players.forEach(player => {
            player.ws.send(message);
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

// listen and react for WS messages
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
                console.log(`${clients.get(ws)} accepted poker invitation`);
                poker.advanceFromPurgatory(ws);
            } else if (type === "leavePoker") {
                poker.removePlayer(ws);
            } else if (type === "startRound") {
                poker.startRound();
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

function jsonError(error) {
    return jsonMessage("error", {
        error: error
    });
}

function jsonHand(hand) {
    return jsonMessage("hand", {
        hand: hand
    });

}