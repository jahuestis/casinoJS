
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
        this.bet = 0;
        this.folded = 0;
        this.lastAction = "";
        this.lastRaiseID;
        this.restoreDeck();

        this.updateLoop = setInterval(() => {
            this.update();
        }, 2500);


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
            player.sendWS(jsonDeal(player.hole));
        })

        this.river = [];
        for (let i = 0; i < 5; i++) {
            if (this.deck.length > 0) {
                const randomIndex = Math.floor(Math.random() * this.deck.length);
                this.river.push(this.deck.splice(randomIndex, 1)[0]);
            }
        }
        //console.log(`River: ${this.river}`);

    }

    startHand() {
        if (this.roundState == 0 && this.players.length > 1) {
            //shuffleArray(this.players);
            this.turnOrder = this.players.map(player => player.id);
            this.turnID = this.turnOrder[2 % this.players.length];
            this.round += 1;
            this.roundState = 1;
            this.minRaise = 25;
            this.folded = 0;
            this.lastAction = "startHand";
            console.log(`Starting hand with ${this.players.length} players`);
            this.resetBets();
            this.blind(this.players[0], this.minRaise, "small");
            this.blind(this.players[1], this.minRaise, "big");
            this.broadcastNames();
            this.broadcastToPlayers(jsonMessage("handStart", 0));
            this.restoreDeck();
            this.deal();
            this.sendTurns();
        }
        
    }

    shiftSeats() {
        this.players.push(this.players.shift());
    }

    sendTurns() {
        this.players.forEach(player => {
            try {
                if (player.id == this.turnID) {
                    player.sendWS(jsonYourTurn());
                } else {
                    player.sendWS(jsonNotYourTurn());
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
        
        this.turnID = this.turnOrder[(turnIndex += 1) % this.turnOrder.length];
        const player = this.getPlayer(this.turnID);

        if (this.turnID == this.lastRaiseID) {
            console.log(`round over`);
            return;
        }

        if ((!player && this.players.length > 0) || (player && (player.lastAction == "fold" || player.lastAction == "abandoned") && (this.folded < this.turnOrder.length))) {
            this.nextTurn();
        } else {
            console.log(`Next turn`);
            this.sendTurns();
        }
    }

    resetBets() {
        this.bet = 0;
        this.players.forEach(player => {
            player.bet = 0;
            player.setLastAction("reset");
        })
    }

    setLastAction(action, player) {
        this.lastAction = action;
        player.setLastAction(action);
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
        const player = this.getPlayer(id);
        if (player) {
            this.fold(player);
            player.setLastAction("abandoned");
        }
        this.playerQueue = this.playerQueue.filter(player => player.id !== id);
        this.purgatory = this.purgatory.filter(player => player.id !== id);
        this.players = this.players.filter(player => player.id !== id);
        this.broadcastNames();
        if (this.players.length <= 1 && this.roundState == 0) {
            this.broadcastToPlayers(jsonMessage("roundUnready", 0));
        }
        if (this.roundState == 1 && this.turnID == id) {
            this.nextTurn();
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
                    player.sendWS(jsonError("game full"));
                }
                
            } else {
                console.log("matchmaking timeout");
                this.removePlayer(id);
                player.sendWS(jsonError("matchmaking timeout"));
            }
        } else {
            console.log("player not in purgatory");
        }
    }

    action(id, action, raise) {
        if (id == this.turnID) {
            console.log('valid player')
            let actionSuccessful = false;
            switch (action) {
                case 0:
                    actionSuccessful = this.raise(this.getPlayer(id), parseInt(raise));
                    break;
                case 1:
                    actionSuccessful = this.allIn(this.getPlayer(id));
                    break;
                case 2:
                    actionSuccessful = this.call(this.getPlayer(id));
                    break;
                case 3:
                    actionSuccessful = this.fold(this.getPlayer(id));
                    break;
                case 4:
                    actionSuccessful = this.check(this.getPlayer(id));
                    break;
                default:
                    console.log('invalid action');
            }

            if (actionSuccessful) {
                this.broadcastDetails();
                if (this.folded >= this.turnOrder.length - 1) {
                    console.log('uncontested hand');
                }
                this.nextTurn();
            }

        } else {
            console.log('invalid player action')
        }
    }

    blind(player, amount, blindSize) {
        if (player.chips + player.bet >= this.bet + amount) {
            this.minRaise = amount;
            this.bet = this.bet + amount;
            player.setBet(this.bet);
            this.setLastAction(`${blindSize} blind`, player);
            this.lastRaiseID = player.id;
            console.log(`${player.name} (${player.chips}) posted ${blindSize} blind (${this.bet})`);
            return true;
        } else {
            console.log(`${player.name} (${player.chips}) could not post ${blindSize} blind (${this.bet})`);
            return false;
        }
    }

    raise(player, amount) {
        if (player.chips + player.bet >= this.bet + amount && amount >= this.minRaise) {
            this.minRaise = amount;
            this.bet = this.bet + amount;
            player.setBet(this.bet);
            this.setLastAction("raise", player);
            this.lastRaiseID = player.id;
            console.log(`${player.name} (${player.chips}) raised by ${amount} (${this.bet})`)
            return true;
        } else {
            console.log(`${player.name} (${player.chips}) could not raise by ${amount} (${this.bet})`)
            return false;
        }
    }

    allIn(player) {
        console.log("All-in not implemented");
        return false;
    }

    call(player) {
        if (player.chips + player.bet>= this.bet) {
            player.setBet(this.bet);
            this.setLastAction("call", player);
            console.log(`${player.name} (${player.chips}) called (${this.bet})`)
            return true;
        } else {
            console.log(`${player.name} (${player.chips}) could not call (${this.bet})`)
            return false;
        }
    }

    fold(player) {
        this.folded ++;
        this.setLastAction("fold", player);
        console.log(`${player.name} folded`)
        return true;
    }

    check(player) {
        if (this.lastAction == "check") {
            console.log(`${player.name} checked`)
            this.setLastAction("check", player);
            return true;
        } else {
            console.log(`${player.name} could not check`)
            return false;
        }
    }

    update() {
        if (this.roundState == 0) {
            // Move players to purgatory for queue confirmation if space available in game
            while (this.players.length < this.maxPlayers && this.playerQueue.length > 0) {
                const player = this.playerQueue.shift();
                this.purgatory.push(player);
                player.resetTimeInPurgatory();
                player.sendWS(jsonMessage("invitePoker", 0));
                console.log(`${player.name} invited to poker and moved to purgatory to await confirmation`);
            }
            // Increment time in purgatory
            for (let i = 0; i < this.purgatory.length; i++) {
                const player = this.purgatory[i];
                player.incrementTimeInPurgatory();
                if (player.timeInPurgatory > 3) {
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

    chatMessage(id, message) {
        const sender = this.getPlayer(id);
        if (sender) {
            const trimmedMessage = String(message).trim();
            if (trimmedMessage) {
                const formattedMessage = `${sender.name}: ${trimmedMessage}`;
                this.broadcastToPlayers(jsonChatMessage(formattedMessage));
            } else {
                console.log("empty message, ignored");
            }
        } else {
            console.log("request to send chat has invalid player ID");
        }
    }

    broadcastNames() {
        // send list display names to all current players
        const playerNames = []
        this.players.forEach(player => {
            playerNames.push(player.name);
        }) 
        this.broadcastToPlayers(jsonNamesList(playerNames));
    }

    broadcastDetails() {

    }

    broadcastToPlayers(message) {
        this.players.forEach(player => {
            player.sendWS(message);
        })
    }

}

class PokerPlayer {
    constructor(id, ws, name, chips = 500) {
        this.id = id;
        this.ws = ws;
        this.name = name;
        this.hole = [];
        this.timeInPurgatory = 0;
        this.chips = chips;
        this.bet = 0;
        this.lastAction = "";
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

    setLastAction(action) {
        this.lastAction = action;
    }

    setBet(newBet) {
        this.chips -= (newBet - this.bet);
        this.bet = newBet;
        this.sendChips();
    }

    addChips(amount) {
        this.chips += amount;
        this.sendChips();
    }

    setChips(chips) {
        this.chips = chips;
        this.sendChips();
    }

    getFreeChips(amount = 25, maxFreeChips = 1500) {
        if (!poker.getPlayer(this.id)) {
            if (this.chips < maxFreeChips) {
                if (this.chips + amount > maxFreeChips) {
                    this.setChips(maxFreeChips);
                } else {
                    this.addChips(amount);
                }
            }
        }
    }

    sendWS(message) {
        try {
            this.ws.send(message);
        } catch (error) {
            console.log(error);
        }
    }

    sendChips() {
        try {
            this.sendWS(jsonChips(this.chips));
        } catch (error) {
            
        }
    }

}

const clients = new Map();
const poker = new PokerGame();

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
                    clients(data.id).updateWS(ws);
                } else {
                    clients.set(data.id, new PokerPlayer(data.id, ws, data.name + testPlayerCounter++));
                }
                console.log(`${clients.get(data.id).name} connected`);
                const client = clients.get(data.id);
                client.sendWS(jsonInitializeClient(client.name, client.chips));
            } else if (type === "freeChips") {
                if (clients.has(data.id)) {
                    clients.get(data.id).getFreeChips();
                }
            } else if (type === "queuePoker") {
                if (clients.has(data.id)) {
                    poker.addToQueue(clients.get(data.id));
                    console.log(`${clients.get(data.id).name} queued for poker`);
                }
            } else if (type === "acceptPoker") {
                if (clients.has(data.id)) {
                    console.log(`${clients.get(data.id).name} accepted poker invitation`);
                    poker.advanceFromPurgatory(data.id);
                }
            } else if (type === "leavePoker") {
                if (clients.has(data.id)) {
                    console.log(`${clients.get(data.id).name} left poker/queue`);
                    poker.removePlayer(data.id);
                }
            } 
            else if (type === "chatMessage") {
                if (clients.has(data.id)) {
                    poker.chatMessage(data.id, data.message);
                }
            } else if (type === "startHand") {
                poker.startHand();
            } else if (type === "action") {
                if (poker.roundState == 1 && clients.has(data.id)) {
                    poker.action(data.id, data.action, data.raise);
                }
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

function jsonInitializeClient(name, chips) {
    return jsonMessage("initializeClient", {
        name: name,
        chips: chips
    });
}

function jsonChips(chips) {
    return jsonMessage("chips", {
        chips: chips
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

function jsonChatMessage(message) {
    return jsonMessage("chatMessage", {
        message: message
    });
}


function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        // Generate a random index between 0 and i (inclusive)
        const randomIndex = Math.floor(Math.random() * (i + 1));
        // Swap the elements at i and randomIndex
        [array[i], array[randomIndex]] = [array[randomIndex], array[i]];
    }
    return array;
}