import { Producer } from "./Producer.js";
import { Consumer } from "./Consumer.js";
import type { RtpPacket } from "./RtpPacket.js";
import { parseRtpPacket } from "./RtpPacket.js";
import { PacketForwarder } from "./PacketForwarder.js";

export class RtpRouter {

    private consumersByProducer =
        new Map<string, Set<Consumer>>();

    constructor(
        private readonly packetForwarder: PacketForwarder
    ) {}

    addConsumer(consumer: Consumer): void {

        let consumers =
            this.consumersByProducer.get(
                consumer.producerId
            );

        if (!consumers) {
            consumers = new Set<Consumer>();

            this.consumersByProducer.set(
                consumer.producerId,
                consumers
            );
        }

        consumers.add(consumer);
    }

    removeConsumer(consumer: Consumer): void {

        const consumers =
            this.consumersByProducer.get(
                consumer.producerId
            );

        if (!consumers) {
            return;
        }

        consumers.delete(consumer);

        if (consumers.size === 0) {
            this.consumersByProducer.delete(
                consumer.producerId
            );
        }
    }

    route(
        producer: Producer,
        packet: RtpPacket
    ): void {

        const consumers =
            this.consumersByProducer.get(
                producer.id
            );

        if (!consumers) {
            return;
        }

        for (const consumer of consumers) {

            this.packetForwarder.forward(
                consumer,
                packet
            );
        }
    }

    routeRaw(producer: Producer, packet: Uint8Array): void {
        this.route(producer, parseRtpPacket(packet));
    }
}