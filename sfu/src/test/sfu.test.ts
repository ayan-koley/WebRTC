import test from "node:test";
import assert from "node:assert/strict";
import { Consumer } from "../media/Consumer.js";
import { PacketForwarder } from "../media/PacketForwarder.js";
import { Producer } from "../media/Producer.js";
import { parseRtpPacket, serializeRtpPacket, type RtpPacket } from "../media/RtpPacket.js";
import { RtpRouter } from "../media/RtpRouter.js";
import { Transport } from "../transport/Transport.js";

test("RTP packets round-trip through the binary codec", () => {
    const packet: RtpPacket = {
        version: 2,
        padding: false,
        extension: true,
        marker: true,
        payloadType: 96,
        sequenceNumber: 100,
        timestamp: 123456,
        ssrc: 12345,
        csrcs: [99],
        headerExtensionProfile: 0xbede,
        headerExtension: new Uint8Array([1, 2, 3, 4]),
        payload: new Uint8Array([5, 6, 7])
    };

    assert.deepEqual(parseRtpPacket(serializeRtpPacket(packet)), packet);
});

test("the router forwards an incoming packet to active consumers", () => {
    const bobTransport = new Transport("transport-bob", "bob");
    bobTransport.connect();
    const transports = new Map([[bobTransport.id, bobTransport]]);
    const router = new RtpRouter(new PacketForwarder(transports));
    const producer = new Producer("producer-alice-video", "alice", "video", "VP8", "transport-alice");
    const consumer = new Consumer("consumer-bob", "bob", producer.id, bobTransport.id, 54321);
    consumer.resume();
    router.addConsumer(consumer);

    const packet: RtpPacket = {
        version: 2, padding: false, extension: false, marker: false,
        payloadType: 96, sequenceNumber: 100, timestamp: 123456, ssrc: 12345,
        csrcs: [], payload: new Uint8Array([1, 2, 3, 4])
    };
    router.route(producer, packet);

    assert.equal(bobTransport.getSentPackets().length, 1);
    const forwarded = parseRtpPacket(bobTransport.getSentPackets()[0]!);
    assert.equal(forwarded.ssrc, 54321);
    assert.deepEqual(forwarded.payload, packet.payload);
});
