export type TransportState =
    | "new"
    | "connecting"
    | "connected"
    | "failed"
    | "closed";

export class Transport {
    private readonly packetListeners = new Set<(packet: Uint8Array) => void>();
    private readonly sentPackets: Uint8Array[] = [];

    constructor(
        public readonly id: string,
        public readonly peerId: string,
        public state: TransportState = "new"
    ) {}

    connect(): void {
        if (this.state === "closed") {
            throw new Error("Cannot connect a closed transport");
        }

        this.state = "connected";
    }

    fail(): void {
        this.state = "failed";
    }

    close(): void {
        this.state = "closed";
    }

    isConnected(): boolean {
        return this.state === "connected";
    }

    onPacket(listener: (packet: Uint8Array) => void): () => void {
        this.packetListeners.add(listener);
        return () => this.packetListeners.delete(listener);
    }

    receivePacket(packet: Uint8Array): void {
        if (!this.isConnected()) {
            throw new Error("Cannot receive a packet on a disconnected transport");
        }
        for (const listener of this.packetListeners) {
            listener(packet);
        }
    }

    sendPacket(packet: Uint8Array): void {
        if (!this.isConnected()) {
            throw new Error("Cannot send a packet on a disconnected transport");
        }
        this.sentPackets.push(packet.slice());
    }

    getSentPackets(): readonly Uint8Array[] {
        return this.sentPackets;
    }
}