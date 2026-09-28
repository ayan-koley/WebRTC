// server message type
type ServerMessage = |
    {type: "joined", roomId: string, initiator: boolean} |
    {type: "peer-ready"} |
    {type: "signal", roomId: string} & SignalPayload |
    {type: "error", message: string}

// signal payload type
type SignalPayload = {
    signalType: "offer" | "answer" | "ice",
    sdp?: RTCSessionDescriptionInit,
    candidate?: RTCIceCandidateInit
}

// client message
type ClientMessage = |
    {type: "join", roomId: string} |
    {type: "signal", roomId: string} & SignalPayload

// create class for store and manage connection
type Room = Set<WebSocket>;
class RoomManager {
    private readonly rooms = new Map<string, Room>();
    private readonly socketRooms = new Map<WebSocket, string>();

    // check that rooms is full or not and add socket in teh roomId
    join(socket: WebSocket, roomId: string) {
        const rooms = this.rooms.get(roomId) ?? new Set<WebSocket>();

        if(rooms.size >= 2) return false;
        rooms.add(socket);
        this.rooms.set(roomId, rooms);
        this.socketRooms.set(socket, roomId);
        return true;
    }

    // reeturn the size of the room
    getRoomSize(roomId: string) {
        return this.rooms.get(roomId)?.size ?? 0;
    } 

    // brodcast every user on the room that room is ready to provide offers 
    brodcastPeerReady(joiningSocket: WebSocket, roomId: string) {
        this.rooms.get(roomId)?.forEach(socket => {
            if(socket !== joiningSocket && socket.readyState === socket.OPEN) {
                send(socket, {type: "peer-ready"});
            }
        })
    }

    // forward SDP offer/answer to peers 
    relay(joiningSocket: WebSocket, roomId: string, payload: SignalPayload) {
        this.rooms.get(roomId)?.forEach(socket => {
            if(socket !== joiningSocket && socket.readyState === socket.OPEN) {
                send(socket, { type: "signal", roomId, ...payload } satisfies ServerMessage);
            }
        })
    }

    // remove socket from room
    leave(socket: WebSocket) {
        const roomId = this.socketRooms.get(socket);
        if(!roomId) return;
        const rooms = this.rooms.get(roomId);
        rooms?.delete(socket);
        if(!rooms || rooms.size === 0 ) this.rooms.delete(roomId);
        this.socketRooms.delete(socket);
    }
}

// interface for sending message
const send = (socket: WebSocket, message: ServerMessage) => {
    if(socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
}


import WebSocket, { WebSocketServer } from 'ws'

const wss = new WebSocketServer({port: 3001});

const rooms = new RoomManager();
wss.on("connection", (socket) => {
    let roomId: string | undefined;

    socket.on('message', (rawMessage) => {
        const message = JSON.parse(rawMessage.toString()) as ClientMessage;

        if(message.type === 'join') {
            if(roomId || !message.roomId.trim() || !rooms.join(socket, message.roomId)) {
                send(socket, {type: 'error', message: "Room is full or room ID is invalid"});
                return false;
            }
            roomId = message.roomId.trim();
            send(socket, {type: "joined", roomId, initiator: rooms.getRoomSize(roomId) === 1});
            if(rooms.getRoomSize(roomId) === 2) rooms.brodcastPeerReady(socket, roomId)

            return false;
        }

        else if(message.type === 'signal' && roomId === message.roomId) {
            const { signalType, sdp, candidate } = message;
            rooms.relay(socket, roomId, {signalType, sdp, candidate})
        }
    })

    socket.on('close', () => rooms.leave(socket))
})