export type MediaKind = "audio" | "video";

export class Producer {
    constructor(
        public readonly id: string,
        public readonly peerId: string,
        public readonly kind: MediaKind,
        public readonly codec: string,
        public readonly transportId: string,
    ) {}
}