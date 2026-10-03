import { Consumer } from "./Consumer.js";
import { serializeRtpPacket, type RtpPacket } from "./RtpPacket.js";
import { Transport } from "../transport/Transport.js";

export class PacketForwarder {
    constructor(
        private readonly transports = new Map<string, Transport>()
    ) {}

    forward(
        consumer: Consumer,
        packet: RtpPacket
    ): boolean {

        if (consumer.isPaused() || consumer.isActive() === false) {
            return false;
        }

        const transport = this.transports.get(consumer.transportId);
        if (!transport) {
            throw new Error(`Transport not found for consumer ${consumer.id}`);
        }

        const forwardedPacket: RtpPacket = {
            ...packet,
            sequenceNumber: consumer.getNextSequenceNumber(),
            ssrc: consumer.outputSsrc || packet.ssrc,
            csrcs: [...packet.csrcs],
            payload: packet.payload.slice()
        };
        transport.sendPacket(serializeRtpPacket(forwardedPacket));
        return true;
    }
}