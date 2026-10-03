import { RoomManager } from "../room/RoomManager.js";
import { Producer } from "../media/Producer.js";
import { Consumer } from "../media/Consumer.js";
import { RtpRouter } from "../media/RtpRouter.js";

export class SFU {
    constructor(
        private readonly roomManager: RoomManager,
        private readonly router?: RtpRouter
    ) {}

    createProducer(
        roomId: string,
        peerId: string,
        producer: Producer
    ): void {
        const room = this.roomManager.getRoom(roomId);

        if (!room) {
            throw new Error("Room not found");
        }

        const peer = room.getPeer(peerId);

        if (!peer) {
            throw new Error("Peer not found");
        }

        peer.addProducer(producer);

        const transport = peer.getTransport(producer.transportId);
        if (!transport) {
            throw new Error("Producer transport not found");
        }
        if (this.router) {
            transport.onPacket((packet) => this.router?.routeRaw(producer, packet));
        }

        console.log(
            `Producer ${producer.id} created by ${peerId}`
        );
    }

    createConsumer(
        roomId: string,
        peerId: string,
        consumer: Consumer
    ): void {
        const room = this.roomManager.getRoom(roomId);

        if (!room) {
            throw new Error("Room not found");
        }

        const peer = room.getPeer(peerId);

        if (!peer) {
            throw new Error("Peer not found");
        }

        const producer =
            room.findProducer(consumer.producerId);

        if (!producer) {
            throw new Error("Producer not found");
        }

        peer.addConsumer(consumer);
        this.router?.addConsumer(consumer);

        console.log(
            `Consumer ${consumer.id} created for producer ${producer.id}`
        );
    }
}