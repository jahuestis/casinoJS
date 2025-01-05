
const { v4: uuidv4 } = require('uuid');
const WebSocketServer = require('ws').Server;
const socket = new WebSocketServer({ 
    port: 3000, 
});
let testPlayerCounter = 0;

class PokerGame {
    constructor() {
        this.maxPlayers = 8;
        this.round = 0;
        this.roundState = 0; // 0 = waiting for round start, 1 = round active
        this.playerQueue = [];
        this.purgatory = [];
        this.players = [];
        this.turnOrder = [];
        this.turnID;
        this.deck = [];
        this.river = [];
        this.minRaise = 25;
        this.ante = 25;
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
            player.hole = [];
            for (let i = 0; i < count; i++) {
                if (this.deck.length > 0) {
                    const randomIndex = Math.floor(Math.random() * this.deck.length);
                    player.hole.push(this.deck.splice(randomIndex, 1)[0]);
                }
            }
            try {
                player.ws.send(jsonDeal(player.hole));
            } catch (error) {
                console.log(error);
            }
        })

        this.river = [];
        for (let i = 0; i < 5; i++) {
            if (this.deck.length > 0) {
                const randomIndex = Math.floor(Math.random() * this.deck.length);
                this.river.push(this.deck.splice(randomIndex, 1)[0]);
            }
        }
        console.log(`River: ${this.river}`);

    }

    startRound() {
        if (this.roundState == 0 && this.players.length > 1) {
            this.turnOrder = this.players.map(player => player.id);
            this.turnID = this.turnOrder[0];
            this.round += 1;
            this.roundState = 1;
            this.minRaise = 25;
            console.log(`Starting round ${this.round} with ${this.players.length} players`);
            this.broadcastToPlayers(jsonMessage("roundStart", 0));
            this.restoreDeck();
            this.deal();
            this.sendTurns();
        }
        
    }

    sendTurns() {
        this.players.forEach(player => {
            try {
                if (player.id == this.turnID) {
                    player.ws.send(jsonYourTurn());
                } else {
                    player.ws.send(jsonNotYourTurn());
                }
            } catch (error) {
                console.log(error);
            }
        })
            
    }

    nextTurn() {
        let turnIndex = 0;

        for (let i = 0; i < this.turnOrder.length; i++) {
            if (this.turnOrder[i] == this.turnID) {
                turnIndex = i;
            }
        }
        do {
            this.turnID = this.turnOrder[(turnIndex += 1) % this.turnOrder.length];
        } while (!this.getPlayer(this.turnID) && this.players.length > 0);
        
    }

    addToQueue(player) {
        this.playerQueue.push(player);
    }


    getPlayer(id) {
        const player = this.players.find(player => player.id === id);
        if (player) {
            return player;
        } else {
            return null;
        }
    }

    getFromPurgatory(id) {
        const player = this.purgatory.find(player => player.id === id);
        if (player) {
            return player;
        } else {
            return null;
        }
    }

    removePlayer(id) {
        this.playerQueue = this.playerQueue.filter(player => player.id !== id);
        this.purgatory = this.purgatory.filter(player => player.id !== id);
        this.players = this.players.filter(player => player.id !== id);
        this.broadcastNames();
        if (this.players.length <= 1 && this.roundState == 0) {
            this.broadcastToPlayers(jsonMessage("roundUnready", 0));
        }
    }

    advanceFromPurgatory(id) {
        const player = this.getFromPurgatory(id);

        if (player) {
            if (this.roundState == 0) {
                if (this.players.length < this.maxPlayers) {
                    if (player) {
                        this.players.push(player);
                        this.purgatory = this.purgatory.filter(player => player.id !== id);
                        this.broadcastNames();
                        if (this.players.length > 1) {
                            this.broadcastToPlayers(jsonMessage("roundReady", 0));
                        }
                    }
                } else {
                    try {
                        player.ws.send(jsonError("game full"));
                    } catch (error) {
                        console.log(error);
                    }
                }
                
            } else {
                console.log("matchmaking timeout");
                this.removePlayer(id);
                try {
                    player.ws.send(jsonError("matchmaking timeout"));
                } catch (error) {
                    console.log(error);
                }
            }
        } else {
            console.log("player not in purgatory");
        }
    }

    update() {
        if (this.roundState == 0) {
            // Move players to purgatory for queue confirmation if space available in game
            while (this.players.length < this.maxPlayers && this.playerQueue.length > 0) {
                const player = this.playerQueue.shift();
                this.purgatory.push(player);
                player.resetTimeInPurgatory();
                try {
                    player.ws.send(jsonMessage("invitePoker", 0));
                    console.log(`${player.name} invited to poker and moved to purgatory to await confirmation`);
                } catch (error) {
                    console.log(error);
                }
            }
            // Increment time in purgatory
            for (let i = 0; i < this.purgatory.length; i++) {
                const player = this.purgatory[i];
                player.incrementTimeInPurgatory();
                if (player.timeInPurgatory > 6) {
                    this.removePlayer(player.id);
                    console.log(`${player.name} did not accept invitation, purged`);
                }
            }
            
        } else if (this.roundState == 1) {
            this.sendTurns();
        }

        if (this.players.length == 0) {
            if (this.roundState != 0) {
                console.log("All players disconnected, restarting game");
            }
            this.roundState = 0;
        }

        //console.log(`queue: ${this.playerQueue}`);
        //console.log(`purgatory: ${this.purgatory}`);
        //console.log(`players: ${this.players}`);
        //console.log(this.roundState);
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
            try {
                player.ws.send(message);
            } catch (error) {
                console.log(error);
            }
        })
    }

}

class PokerPlayer {
    constructor(id, ws, name) {
        this.id = id;
        this.ws = ws;
        this.name = name;
        this.hole = [];
        this.timeInPurgatory = 0;
    }

    incrementTimeInPurgatory() {
        this.timeInPurgatory += 1;
    }
    
    resetTimeInPurgatory() {
        this.timeInPurgatory = 0;
    }

    updateWS(ws) {
        this.ws = ws;
    }

}

let clients = new Map();
let poker = new PokerGame();

// listen and react for WS messages
socket.on('connection', (ws) => {
    try {
        ws.send(jsonRequestClient(uuidv4()));
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
                if (clients.has(data.id)) {
                    clients(id).updateWS(ws);
                } else {
                    clients.set(data.id, new PokerPlayer(data.id, ws, data.name + testPlayerCounter++));
                }
                console.log(`${clients.get(data.id).name} connected`);
            } else if (type === "queuePoker") {
                poker.addToQueue(clients.get(data.id));
                console.log(`${clients.get(data.id).name} queued for poker`);
            } else if (type === "acceptPoker") {
                console.log(`${clients.get(data.id).name} accepted poker invitation`);
                poker.advanceFromPurgatory(data.id);
            } else if (type === "leavePoker") {
                console.log(`${clients.get(data.id).name} left poker/queue`);
                poker.removePlayer(data.id);
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
        console.log('Client disconnected');
    });

    ws.on('error', (error) => {
        console.error(error.message);
    });

});

function jsonMessage(type, data) {
    return JSON.stringify({
        type: type,
        data: data
    });
}

function jsonRequestClient(id) {
    return jsonMessage("requestClient", {
        id: id
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

function jsonDeal(hole) {
    return jsonMessage("deal", {
        hole: hole
    });

}

function jsonYourTurn() {
    return jsonMessage("yourTurn", {});
}

function jsonNotYourTurn() {
    return jsonMessage("notYourTurn", {});
}