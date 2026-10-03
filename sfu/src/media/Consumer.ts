export type ConsumerState =
    | "new"
    | "active"
    | "paused"
    | "closed";

export class Consumer {

    private state: ConsumerState = "new";
    private nextSequenceNumber = 0;

    constructor(
        public readonly id: string,
        public readonly peerId: string,
        public readonly producerId: string,
        public readonly transportId: string,
        public readonly outputSsrc = 0
    ) {}

    pause(): void {
        if (this.state === "closed") {
            return;
        }

        this.state = "paused";
    }

    resume(): void {
        if (this.state === "closed") {
            return;
        }

        this.state = "active";
    }

    close(): void {
        this.state = "closed";
    }

    isPaused(): boolean {
        return this.state === "paused";
    }

    isActive(): boolean {
        return this.state === "active";
    }

    getNextSequenceNumber(): number {
        const sequenceNumber = this.nextSequenceNumber;
        this.nextSequenceNumber = (sequenceNumber + 1) & 0xffff;
        return sequenceNumber;
    }
}