import { Room } from "./Room.js";
import { Peer } from "../peer/Peer.js";

export class RoomManager {
    private readonly rooms =
        new Map<string, Room>();

    getRoom(roomId: string): Room | undefined {
        return this.rooms.get(roomId);
    }

    createRoom(roomId: string): Room {
        const room = new Room(roomId);

        this.rooms.set(roomId, room);

        return room;
    }

    getOrCreateRoom(roomId: string): Room {
        let room = this.rooms.get(roomId);

        if (!room) {
            room = this.createRoom(roomId);
        }

        return room;
    }

    addPeer(
        roomId: string,
        peer: Peer
    ): Room {
        const room =
            this.getOrCreateRoom(roomId);

        room.addPeer(peer);

        return room;
    }

    removePeer(
        roomId: string,
        peerId: string
    ): void {
        const room =
            this.rooms.get(roomId);

        if (!room) {
            return;
        }

        room.removePeer(peerId);

        // Delete empty room
        if (room.peers.size === 0) {
            this.rooms.delete(roomId);
        }
    }
}