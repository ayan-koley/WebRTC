import {
    WebSocketServer,
    WebSocket
} from "ws";

import { randomUUID } from "crypto";

import { RoomManager } from "../room/RoomManager.js";
import { Peer } from "../peer/Peer.js";

import type {
    ClientMessage,
    ServerMessage
} from "../types/Signaling.js";

export class SignalingServer {

    private readonly wss: WebSocketServer;

    private readonly roomManager = 
        new RoomManager();

    private readonly socketPeers =
        new Map<WebSocket, Peer>();

    constructor(
        private readonly port: number
    ) {
        this.wss =
            new WebSocketServer({
                port: this.port
            });

        this.setup();
    }

    private setup(): void {

        this.wss.on(
            "connection",
            (socket) => {

                console.log(
                    "Client connected"
                );

                socket.on(
                    "message",
                    (message) => {

                        this.handleMessage(
                            socket,
                            message.toString()
                        );
                    }
                );

                socket.on(
                    "close",
                    () => {

                        this.handleDisconnect(
                            socket
                        );
                    }
                );
            }
        );

        console.log(
            `Signaling server running on ws://localhost:${this.port}`
        );
    }

    private handleMessage(
        socket: WebSocket,
        rawMessage: string
    ): void {

        let message: ClientMessage;

        try {

            message =
                JSON.parse(rawMessage);

        } catch {

            this.send(socket, {
                type: "error",
                message: "Invalid JSON"
            });

            return;
        }

        switch (message.type) {

            case "join-room":

                this.handleJoinRoom(
                    socket,
                    message.roomId
                );

                break;

            case "leave-room":

                this.handleLeaveRoom(
                    socket
                );

                break;

            case "signal":

                this.handleSignal(
                    socket,
                    message.targetPeerId,
                    message.data
                );

                break;

            default:

                this.send(socket, {
                    type: "error",
                    message: "Unknown message type"
                });
        }
    }

    private handleJoinRoom(
        socket: WebSocket,
        roomId: string
    ): void {

        // Prevent joining multiple rooms
        const existingPeer =
            this.socketPeers.get(socket);

        if (existingPeer) {

            this.send(socket, {
                type: "error",
                message:
                    "Already joined a room"
            });

            return;
        }

        const peerId =
            randomUUID();

        const room =
            this.roomManager.getOrCreateRoom(
                roomId
            );

        // Get existing peers BEFORE adding new peer
        const existingPeers =
            room.getAllPeers();

        const peer =
            new Peer(
                peerId,
                socket,
                roomId
            );

        this.roomManager.addPeer(
            roomId,
            peer
        );

        this.socketPeers.set(
            socket,
            peer
        );

        // Tell new client it successfully joined
        this.send(socket, {
            type: "joined-room",
            roomId,
            peerId,
            peers: existingPeers.map(
                (peer: any) => peer.id
            )
        });

        // Tell existing clients about new peer
        for (const existingPeer of existingPeers) {

            this.send(
                existingPeer.socket,
                {
                    type: "peer-joined",
                    peerId
                }
            );
        }

        console.log(
            `Peer ${peerId} joined room ${roomId}`
        );
    }

    private handleLeaveRoom(
        socket: WebSocket
    ): void {

        const peer =
            this.socketPeers.get(socket);

        if (!peer) {
            return;
        }

        this.removePeer(
            socket,
            peer
        );
    }

    private handleDisconnect(
        socket: WebSocket
    ): void {

        const peer =
            this.socketPeers.get(socket);

        if (!peer) {
            return;
        }

        this.removePeer(
            socket,
            peer
        );
    }

    private removePeer(
        socket: WebSocket,
        peer: Peer
    ): void {

        const room =
            this.roomManager.getRoom(
                peer.roomId
            );

        if (room) {

            const otherPeers =
                room
                    .getAllPeers()
                    .filter(
                        (p: any) => p.id !== peer.id
                    );

            for (const otherPeer of otherPeers) {

                this.send(
                    otherPeer.socket,
                    {
                        type: "peer-left",
                        peerId: peer.id
                    }
                );
            }
        }

        this.roomManager.removePeer(
            peer.roomId,
            peer.id
        );

        this.socketPeers.delete(
            socket
        );

        console.log(
            `Peer ${peer.id} left room ${peer.roomId}`
        );
    }

    private handleSignal(
        socket: WebSocket,
        targetPeerId: string,
        data: any
    ): void {

        const sender =
            this.socketPeers.get(socket);

        if (!sender) {

            this.send(socket, {
                type: "error",
                message:
                    "You must join a room first"
            });

            return;
        }

        const room =
            this.roomManager.getRoom(
                sender.roomId
            );

        if (!room) {
            return;
        }

        const targetPeer =
            room.getPeer(
                targetPeerId
            );

        if (!targetPeer) {

            this.send(socket, {
                type: "error",
                message:
                    "Target peer not found"
            });

            return;
        }

        this.send(
            targetPeer.socket,
            {
                type: "signal",
                fromPeerId: sender.id,
                data
            }
        );
    }

    private send(
        socket: WebSocket,
        message: ServerMessage
    ): void {

        if (
            socket.readyState ===
            WebSocket.OPEN
        ) {
            socket.send(
                JSON.stringify(message)
            );
        }
    }
}