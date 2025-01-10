
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
        this.gameState = 0; // 0 = waiting for round start, 1 = round active
        this.playerQueue = [];
        this.purgatory = [];
        this.players = [];
        this.turnIndex = 0;
        this.deck = [];
        this.community = [];
        this.defaultMinRaise = 0;
        this.minRaise = 0;
        this.bet = 0;
        this.pot = 0;
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

        this.community = [];
        for (let i = 0; i < 5; i++) {
            if (this.deck.length > 0) {
                const randomIndex = Math.floor(Math.random() * this.deck.length);
                this.community.push(this.deck.splice(randomIndex, 1)[0]);
            }
        }

    }

    shiftSeats() {
        this.players.push(this.players.shift());
    }

    sendTurns() {
        this.players.forEach(player => {
            try {
                if (player == this.players[this.turnIndex]) {
                    player.sendWS(jsonYourTurn());
                } else {
                    player.sendWS(jsonNotYourTurn());
                }
            } catch (error) {
                console.log(error);
            }
        })
            
    }

    startHand() {
        if (this.gameState == 0 && this.players.length > 1) {
            this.pot = 0;
            this.turnIndex = 2 % this.players.length;
            this.lastRaiseID = this.players[this.turnIndex].id;
            this.round = 0;
            this.gameState = 1;
            this.folded = 0;
            this.lastAction = "startHand";

            // determine min raise based on average chip count
            let totalChips = 0;
            this.players.forEach(player => {
                totalChips += player.chips;
            });
            const averageChips = totalChips / this.players.length;
            this.defaultMinRaise = Math.ceil(averageChips / 150) * 5;
            this.minRaise = this.defaultMinRaise;
            console.log(`Min raise set to ${this.minRaise}`);
            
            console.log(`Starting hand with ${this.players.length} players`);
            this.resetBets();
            this.blind(this.players[0], this.minRaise, "small");
            this.blind(this.players[1], this.minRaise, "big");
            this.broadcastDetails();
            this.broadcastToPlayers(jsonMessage("handStart", 0));
            this.restoreDeck();
            this.deal();
            this.sendTurns();
        }
        
    }

    nextTurn(checkRoundOver = true) {
        
        this.turnIndex = (this.turnIndex + 1) % this.players.length;
        const player = this.players[this.turnIndex];
        
        if (player.id == this.lastRaiseID && checkRoundOver) {
            console.log("Next round");
            this.nextRound();
            return;
        }

        if (!player || ((player.folded) && (this.folded < this.players.length))) {
            this.nextTurn(checkRoundOver);
        } else {
            console.log(`Next turn`);
            player.setLastAction("...");
            this.broadcastDetails();
            this.sendTurns();
        }
    }

    nextRound() {
        this.round ++;
        switch (this.round) {
            case 1:
                this.reveal(3);
                break;
            case 2:
                this.reveal(4);
                break;
            case 3:
                this.reveal(5);
                break;
            case 4:
                console.log("Hand over");
                break
            default:
                console.error("Invalid turn value:", this.turn);
        }
        this.players.forEach(player => {
            if (!player.folded) {
                player.setLastAction("...");
            }
        })
        this.resetBets()
        this.broadcastDetails();
        this.lastAction = "check";
        this.turnIndex = this.players.length - 1;
        this.nextTurn(false);
        this.lastRaiseID = this.players[this.turnIndex].id;
        

    }

    reveal(range) {
        console.log(`revealed ${range} community cards`);
        this.broadcastToPlayers(jsonCommunity(this.community.slice(0, range)));
    }

    resetBets() {
        this.minRaise = this.defaultMinRaise;
        this.bet = 0;
        this.players.forEach(player => {
            player.bet = 0;
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
            if (this.gameState == 1) {
                this.fold(player);
                player.prepareKick();
                return;
            }
        }
        this.playerQueue = this.playerQueue.filter(player => player.id !== id);
        this.purgatory = this.purgatory.filter(player => player.id !== id);
        this.players = this.players.filter(player => player.id !== id);
        this.broadcastDetails(true);
        if (this.players.length <= 1 && this.gameState == 0) {
            this.broadcastToPlayers(jsonMessage("roundUnready", 0));
        }
        if (this.gameState == 1 && this.players[this.turnIndex].id == id) {
            this.nextTurn();
        }
    }

    advanceFromPurgatory(id) {
        const player = this.getFromPurgatory(id);

        if (player) {
            if (this.gameState == 0) {
                if (this.players.length < this.maxPlayers) {
                    if (player) {
                        this.players.push(player);
                        this.purgatory = this.purgatory.filter(player => player.id !== id);
                        this.broadcastDetails(true);
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
        if (id == this.players[this.turnIndex].id) {
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
                if (this.folded >= this.players.length - 1) {
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
            this.bet = this.bet + amount;
            player.setBet(this.bet);
            this.setLastAction(`${blindSize} blind`, player);
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
            this.setLastAction(`raised ${amount}`, player);
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
        if (this.bet > 0 && player.chips + player.bet >= this.bet && player.bet < this.bet) {
            player.setBet(this.bet);
            this.setLastAction("called", player);
            console.log(`${player.name} (${player.chips}) called (${this.bet})`)
            return true;
        } else {
            console.log(`${player.name} (${player.chips}) could not call (${this.bet})`)
            return false;
        }
    }

    fold(player) {
        this.folded ++;
        this.setLastAction("folded", player);
        player.fold();
        console.log(`${player.name} folded`)
        return true;
    }

    check(player) {
        if (this.bet == player.bet) {
            console.log(`${player.name} checked`)
            this.setLastAction("checked", player);
            return true;
        } else {
            console.log(`${player.name} could not check`)
            return false;
        }
    }

    increasePot(amount) {
        this.pot += amount;
    }

    update() {
        if (this.gameState == 0) {
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
            
        } else if (this.gameState == 1) {
            this.sendTurns();
        }

        if (this.folded >= this.players.length) {
            if (this.gameState != 0) {
                console.log("All players disconnected, restarting game");
                this.gameState = 0;
                this.kickPlayers();
            }
        }

        //console.log(`queue: ${this.playerQueue}`);
        //console.log(`purgatory: ${this.purgatory}`);
        //console.log(`players: ${this.players}`);
        //console.log(this.gameState);
    }

    kickPlayers() {
        this.players.forEach(player => {
            //console.log(player.kickMe);
            if (player.kickMe) {
                console.log(`kicking ${player.name}`);
                this.removePlayer(player.id);
            }
        });
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

    broadcastDetails(clear = false, player = null) {
        let details = []
        if (!player) {
            this.players.forEach(player => {
                details.push(this.formatDetails(player));
            })
        } else {
            details.push(this.formatDetails(player))
        }

        this.broadcastToPlayers(jsonDetails(details, this.minRaise, this.bet, this.pot, clear));
    }

    formatDetails(player) {
        return {
            name: player.name, 
            chips: player.chips, 
            lastAction: player.lastAction, 
            folded: player.folded
        }
    }

    broadcastToPlayers(message) {
        this.players.forEach(player => {
            player.sendWS(message);
        })
    }

}

class PokerScorer {
    constructor(hole, community) {
        this.hole = hole;
        this.hand = hole.concat(community);
        this.hand.sort();
        this.score = 0;
    }

    getRank(card) {
        if (card == 0) return 1;
        return Math.ceil(card / 4);
    }

    getSuit(card) {
        return card % 4;
    }

    scoreLowCard() { // max score: 1
        let score = this.getRank(Math.min(...this.hand)) / 13;
        return score;
    }

    scoreHighCard() { // max score: 2
        let score = 1 + this.getRank(Math.max(...this.hand)) / 13;
        return score;

    }

    scorePair() { // max score: 4
        let counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        this.hand.forEach(card => {
            counts[this.getRank(card)]++;
        });
        
        let score = 0;
        for (let i = 1; i < counts.length; i++) {
            if (counts[i] >= 2) {
                let value = 3 + (i / 13);
                if (value > score) {
                    score = value
                }
            }
        }

        return score;
    }

    scoreTwoPair() { // max score: 8
        let counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        this.hand.forEach(card => {
            counts[this.getRank(card)]++;
        });

        let score1 = 0;
        let score2 = 0;
        for (let i = 1; i < counts.length; i++) {
            if (counts[i] >= 2) {
                let value = 7 + (i / 13);
                if (value >= score2) {
                    score2 = value;
                    score1 = score2;
                } else if (value > score1) {
                    score1 = value;
                }
            }
        }

        if (score1 > 0 && score2 > 0) {
            return (score1 + score2) / 2;
        } else {
            return 0;
        }

    }

    scoreThreeOfAKind() { // max score: 16
        let counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        this.hand.forEach(card => {
            counts[this.getRank(card)]++;
        });
        
        let score = 0;
        for (let i = 1; i < counts.length; i++) {
            if (counts[i] >= 3) {
                let value = 15 + (i / 13);
                if (value > score) {
                    score = value;
                }
            }
        }

        return score;
    }

    scoreStraight() { // max score: 32


    }

    scoreFlush() { // max score: 64


    }

    scoreFullHouse() { // max score: 128


    }

    scoreFourOfAKind() { // max score: 256
        let counts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        this.hand.forEach(card => {
            counts[this.getRank(card)]++;
        });
        
        let score = 0;
        for (let i = 1; i < counts.length; i++) {
            if (counts[i] >= 4) {
                let value = 255 + (i / 13);
                if (value > score) {
                    score = value
                }
            }
        }

        return score;
    }

    scoreStraightFlush() { // max score: 512


    }

    scoreRoyalFlush() { // max score: 1024


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
        this.lastAction = "...";
        this.folded = false;
        this.kickMe = false;
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
        const betAmount = newBet - this.bet;
        poker.increasePot(betAmount);
        this.chips -= betAmount;
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

    fold() {
        this.folded = true;
    }

    unfold() {
        this.folded = false;
    }

    prepareKick() {
        this.kickMe = true;
        console.log(`prepared to kick ${this.name}`);
    }

    unprepareKick() {
        this.kickMe = false;
        console.log(`unprepared to kick ${this.name}`);
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
                if (poker.gameState == 1 && clients.has(data.id)) {
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

function jsonCommunity(cards) {
    return jsonMessage("communityCards", {
        cards: cards
    })
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

function jsonDetails(details, minRaise, bet, pot, clear = false) {
    return jsonMessage("details", {
        details: details,
        minRaise: minRaise,
        bet: bet,
        pot: pot,
        clear: clear
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