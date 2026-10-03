import { Peer } from "../peer/Peer.js";
import { Producer } from "../media/Producer.js";

export class Room {
    public readonly peers =
        new Map<string, Peer>();

    constructor(
        public readonly id: string
    ) {}

    addPeer(peer: Peer): void {
        this.peers.set(peer.id, peer);
    }

    removePeer(peerId: string): void {
        this.peers.delete(peerId);
    }

    getPeer(peerId: string): Peer | undefined {
        return this.peers.get(peerId);
    }

    getAllPeers(): Peer[] {
        return Array.from(this.peers.values());
    }

    findProducer(
        producerId: string
    ): Producer | undefined {
        for (const peer of this.peers.values()) {
            const producer =
                peer.getProducer(producerId);

            if (producer) {
                return producer;
            }
        }

        return undefined;
    }
}