import {WebSocketServer} from 'ws'
import { RoomManager } from './room/RoomManager.js';
import { Room } from './room/Room.js';

const wss = new WebSocketServer({port: 3000});

wss.on("connection", (socket) => {
    let roomId: string | undefined;

    socket.on('message', (rawMessage) => {
        const message = JSON.parse(rawMessage.toString());

        if(message.type === 'join-room') {
            
        }

        else if(message.type === 'signal' && roomId === message.roomId) {
          
        }
    })

    socket.on('close', () => {})
})