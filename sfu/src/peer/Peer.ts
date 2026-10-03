import { Producer } from "../media/Producer.js";
import { Consumer } from "../media/Consumer.js";
import { Transport } from "../transport/Transport.js";

import WebSocket from "ws";

export class Peer {
    public readonly transports =
        new Map<string, Transport>();

    public readonly producers =
        new Map<string, Producer>();

    public readonly consumers =
        new Map<string, Consumer>();

    constructor(
        public readonly id: string,
        public readonly socket: WebSocket,
        public readonly roomId: string
    ) {}

    addTransport(transport: Transport): void {
        this.transports.set(transport.id, transport);
    }

    getTransport(
        transportId: string
    ): Transport | undefined {
        return this.transports.get(transportId);
    }

    removeTransport(transportId: string): void {
        this.transports.delete(transportId);
    }

    addProducer(producer: Producer): void {
        this.producers.set(producer.id, producer);
    }

    getProducer(
        producerId: string
    ): Producer | undefined {
        return this.producers.get(producerId);
    }

    removeProducer(producerId: string): void {
        this.producers.delete(producerId);
    }

    addConsumer(consumer: Consumer): void {
        this.consumers.set(consumer.id, consumer);
    }

    getConsumer(
        consumerId: string
    ): Consumer | undefined {
        return this.consumers.get(consumerId);
    }

    removeConsumer(consumerId: string): void {
        this.consumers.delete(consumerId);
    }
}