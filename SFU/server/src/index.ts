import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import { createWorker } from './mediasoup/Worker.js'
import { createRouter } from './mediasoup/Router.js'
import type { Consumer, Producer, Router, WebRtcTransport } from 'mediasoup/types';
import { createWebRtcTransport } from './mediasoup/transport.js';

const app = express();

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*"
    }
});

class Room {
    public readonly id: string;
    public readonly router: Router;

    private transports = new Map<string, WebRtcTransport>()
    private producers = new Map<string, Producer>()
    private consumers = new Map<string, Consumer>();

    constructor (id: string, router: Router) {
        this.id = id;
        this.router = router;
    }

    /**
     * Stores a WebRTC transport on this room.
     * Steps when called:
     * 1. Use the transport id as the map key.
     * 2. Save the transport so later handlers can look it up.
     */
    addTransport(transport: WebRtcTransport) {
        this.transports.set(transport.id, transport);
    }

    /**
     * Finds a transport by id.
     * Steps when called:
     * 1. Look up the id in the transports map.
     * 2. Return the transport, or undefined if it is missing.
     */
    getTransport(id: string) {
        return this.transports.get(id);
    }

    /**
     * Removes a transport from this room.
     * Steps when called:
     * 1. Delete the entry with the given transport id.
     */
    removeTransport(id: string) {
        this.transports.delete(id);
    }

    /**
     * Stores a media producer (camera or mic) on this room.
     * Steps when called:
     * 1. Use the producer id as the map key.
     * 2. Save the producer so other peers can consume it.
     */
    addProducer(producer: Producer) {
        this.producers.set(producer.id, producer);
    }

    /**
     * Finds a producer by id.
     * Steps when called:
     * 1. Look up the id in the producers map.
     * 2. Return the producer, or undefined if it is missing.
     */
    getProducer(id: string) {
        return this.producers.get(id);
    }

    /**
     * Returns every producer currently in the room.
     * Steps when called:
     * 1. Copy the map values into an array.
     * 2. Return that list to the caller.
     */
    getProducers() {
        return [...this.producers.values()];
    }

    /**
     * Removes a producer from this room.
     * Steps when called:
     * 1. Delete the entry with the given producer id.
     */
    removeProducer(id: string) {
        this.producers.delete(id);
    }

    /**
     * Stores a consumer that is pulling media from a producer.
     * Steps when called:
     * 1. Use the consumer id as the map key.
     * 2. Save the consumer so resume and cleanup can find it.
     */
    addConsumer(consumer: Consumer) {
        this.consumers.set(consumer.id, consumer);
    }

    /**
     * Finds a consumer by id.
     * Steps when called:
     * 1. Look up the id in the consumers map.
     * 2. Return the consumer, or undefined if it is missing.
     */
    getConsumer(id: string) {
        return this.consumers.get(id);
    }

    /**
     * Removes a consumer from this room.
     * Steps when called:
     * 1. Delete the entry with the given consumer id.
     */
    removeConsumer(id: string) {
        this.consumers.delete(id);
    }
}


const worker = await createWorker();
const router = await createRouter(worker);
const room = new Room("room-1", router);

const socketTransports = new Map<string, string[]>();
const socketProducers  = new Map<string, string[]>();
const producerToSocket = new Map<string, string>();

io.on("connection", (socket) => {
    console.log(`user is connected ${socket.id}`);

    /**
     * Creates a mediasoup WebRTC transport for this socket.
     * Steps when called:
     * 1. Ask mediasoup to create a transport on the room router.
     * 2. Store the transport on the room and on this socket's list.
     * 3. Send ICE and DTLS parameters back so the client can build its transport.
     */
    socket.on("creteWebRtcTransport", async(_, callback) => {
        try {
            const transport = await createWebRtcTransport(room.router);

            room.addTransport(transport);

            const userTransports = socketTransports.get(socket.id) ?? [];
            userTransports.push(transport.id);
            socketTransports.set(socket.id, userTransports);

            callback({
                id: transport.id,
                iceParameters: transport.iceParameters,
                iceCandidates: transport.iceCandidates,
                dtlsParameters: transport.dtlsParameters,
            });
        } catch (error) {
            console.error("creteWebRtcTransport error:", error);
            callback({ error: "Failed to create transport" });
        }
    })

    /**
     * Returns the router's RTP capabilities.
     * Steps when called:
     * 1. Read rtpCapabilities from the room router.
     * 2. Send them to the client so it can load a mediasoup Device.
     */
    socket.on("getRtpCapabilities", (_, callback) => {
        callback({
            rtpCapabilities: room.router.rtpCapabilities
        })
    })

    /**
     * Completes DTLS handshake on a transport.
     * Steps when called:
     * 1. Find the transport by the id the client sent.
     * 2. Call transport.connect with the client's DTLS parameters.
     * 3. Tell the client the transport is connected.
     */
    socket.on("connectTransport", async(data, callback) => {
        try {
            const transport = room.getTransport(data.transportId);
            if (!transport) {
                return callback({ error: "Invalid transport id" });
            }

            await transport.connect({ dtlsParameters: data.dtlsParameters });
            callback({ connected: true });
        } catch (error) {
            console.error("connectTransport error:", error);
            callback({ error: "Failed to connect transport" });
        }
    })

    /**
     * Starts sending this peer's audio or video into the room.
     * Steps when called:
     * 1. Find the send transport for this socket.
     * 2. Create a producer with the given kind and RTP parameters.
     * 3. Remember the producer on the room, on this socket, and in producerToSocket.
     * 4. Tell other peers a new producer exists, including this socket id.
     * 5. Return the producer id to the publishing client.
     */
    socket.on("produce", async(data, callback) => {
        try {
            const transport = room.getTransport(data.transportId);
            if (!transport) {
                return callback({ error: "Transport is missing" });
            }

            const producer = await transport.produce({
                kind: data.kind,
                rtpParameters: data.rtpParameters
            });

            room.addProducer(producer);
            console.log(`Producer created: ${producer.id} (${producer.kind})`);

            const userProducers = socketProducers.get(socket.id) ?? [];
            userProducers.push(producer.id);
            socketProducers.set(socket.id, userProducers);

            producerToSocket.set(producer.id, socket.id);

            socket.broadcast.emit("newProducer", {
                producerId: producer.id,
                kind: producer.kind,
                socketId: socket.id,
            });

            callback({ id: producer.id });
        } catch (error) {
            console.error("produce error:", error);
            callback({ error: "Failed to create producer" });
        }
    })

    /**
     * Creates a consumer so this peer can receive another peer's media.
     * Steps when called:
     * 1. Find the receive transport and the producer to consume.
     * 2. Check that the router can consume this producer with the client's RTP capabilities.
     * 3. Create a paused consumer on the transport.
     * 4. Store the consumer and return its id, kind, and RTP parameters.
     */
    socket.on("consume", async(data, callback) => {
        try {
            const transport = room.getTransport(data.transportId);
            if (!transport) {
                return callback({ error: "Transport is missing" });
            }

            const producer = room.getProducer(data.producerId);
            if (!producer) {
                return callback({ error: "Producer is missing" });
            }

            if (!room.router.canConsume({
                producerId: data.producerId,
                rtpCapabilities: data.rtpCapabilities
            })) {
                return callback({ error: "Cannot consume this producer" });
            }

            const consumer = await transport.consume({
                producerId: data.producerId,
                rtpCapabilities: data.rtpCapabilities,
                paused: true,
            });

            room.addConsumer(consumer);

            callback({
                id: consumer.id,
                producerId: producer.id,
                kind: consumer.kind,
                rtpParameters: consumer.rtpParameters
            });
        } catch (error) {
            console.error("consume error:", error);
            callback({ error: "Failed to create consumer" });
        }
    })

    /**
     * Unpauses a consumer so media packets start flowing.
     * Steps when called:
     * 1. Find the consumer by id.
     * 2. Resume it.
     * 3. If it is video, request a keyframe so the first frame can decode.
     * 4. Tell the client resume succeeded.
     */
    socket.on("resumeConsume", async(data, callback) => {
        try {
            const consumer = room.getConsumer(data.consumerId);
            if (!consumer) {
                return callback({ error: "Consumer not found" });
            }

            await consumer.resume();

            if (consumer.kind === "video") {
                try {
                    await consumer.requestKeyFrame();
                    console.log(`Keyframe requested for consumer: ${consumer.id}`);
                } catch (err) {
                    console.warn(`requestKeyFrame error on consumer ${consumer.id}:`, err);
                }
            }

            callback({ resume: true });
        } catch (error) {
            console.error("resumeConsume error:", error);
            callback({ error: "Failed to resume consumer" });
        }
    })

    /**
     * Lists other peers' producers for a newly joined client.
     * Steps when called:
     * 1. Collect this socket's own producer ids so they can be skipped.
     * 2. Filter room producers down to everyone else's.
     * 3. Map each remaining producer to { producerId, socketId }.
     * 4. Send that list so the client can consume and group tracks by peer.
     */
    socket.on("getProducers", (_, callback) => {
        const ownProducerIds = new Set(socketProducers.get(socket.id) ?? []);
        const producers = room
            .getProducers()
            .filter((producer) => !ownProducerIds.has(producer.id))
            .map((producer) => ({
                producerId: producer.id,
                socketId: producerToSocket.get(producer.id) ?? "unknown",
            }));

        callback({ producers });
    });

    /**
     * Cleans up when a client disconnects.
     * Steps when called:
     * 1. Close each producer this socket owned and remove it from the room.
     * 2. Drop the producer-to-socket lookup entries.
     * 3. Tell remaining peers those producers closed, including this socket id.
     * 4. Close and remove this socket's transports.
     * 5. Delete this socket's producer and transport lists.
     */
    socket.on("disconnect", () => {
        console.log(`user is disconnected ${socket.id}`);

        const producerIds = socketProducers.get(socket.id) ?? [];
        for (const pid of producerIds) {
            try {
                const producer = room.getProducer(pid);
                if (producer) producer.close();
                room.removeProducer(pid);
                producerToSocket.delete(pid);

                socket.broadcast.emit("producerClosed", {
                    producerId: pid,
                    socketId: socket.id,
                });
                console.log(`Producer closed and broadcast: ${pid}`);
            } catch (err) {
                console.warn(`Error closing producer ${pid}:`, err);
            }
        }
        socketProducers.delete(socket.id);

        const transportIds = socketTransports.get(socket.id) ?? [];
        for (const tid of transportIds) {
            try {
                const transport = room.getTransport(tid);
                if (transport) transport.close();
                room.removeTransport(tid);
            } catch (err) {
                console.warn(`Error closing transport ${tid}:`, err);
            }
        }
        socketTransports.delete(socket.id);
    });
})

httpServer.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});
