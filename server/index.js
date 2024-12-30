const WebSocketServer = require('ws').Server;
const socket = new WebSocketServer({ 
    port: 3000, 
});

let clients = new Map();
let pokerPlayers = []
let pokerQueue = []


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
                clients.set(ws, data.name);
                console.log(`${clients.get(ws)} connected`);
            } else if (type === "requestHand") {
                console.log('Client requested hand')
                ws.send(jsonHand(ws));
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

function jsonHand(client) {
    return jsonMessage("hand", {
        hand: [Math.floor(Math.random() * 52), Math.floor(Math.random() * 52)]
    });

}