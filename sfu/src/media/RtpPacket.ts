export interface RtpPacket {
    version: number;
    padding: boolean;
    extension: boolean;
    marker: boolean;
    payloadType: number;
    sequenceNumber: number;
    timestamp: number;
    ssrc: number;
    csrcs: number[];
    headerExtensionProfile?: number;
    headerExtension?: Uint8Array;
    payload: Uint8Array;
}

export function parseRtpPacket(data: Uint8Array): RtpPacket {
    if (data.length < 12) {
        throw new Error("RTP packet must contain at least 12 bytes");
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const first = data[0]!;
    const second = data[1]!;
    const version = first >> 6;
    if (version !== 2) {
        throw new Error(`Unsupported RTP version: ${version}`);
    }

    const csrcCount = first & 0x0f;
    const hasExtension = (first & 0x10) !== 0;
    const hasPadding = (first & 0x20) !== 0;
    const csrcEnd = 12 + csrcCount * 4;
    if (data.length < csrcEnd) {
        throw new Error("RTP packet is shorter than its CSRC list");
    }

    const csrcs: number[] = [];
    for (let index = 0; index < csrcCount; index += 1) {
        csrcs.push(view.getUint32(12 + index * 4));
    }

    let headerEnd = csrcEnd;
    let headerExtensionProfile: number | undefined;
    let headerExtension: Uint8Array | undefined;
    if (hasExtension) {
        if (data.length < headerEnd + 4) {
            throw new Error("RTP extension header is incomplete");
        }
        headerExtensionProfile = view.getUint16(headerEnd);
        const extensionLength = view.getUint16(headerEnd + 2) * 4;
        headerEnd += 4;
        if (data.length < headerEnd + extensionLength) {
            throw new Error("RTP extension payload is incomplete");
        }
        headerExtension = data.slice(headerEnd, headerEnd + extensionLength);
        headerEnd += extensionLength;
    }

    let payloadEnd = data.length;
    if (hasPadding) {
        const paddingLength = data[data.length - 1]!;
        if (paddingLength === 0 || paddingLength > data.length - headerEnd) {
            throw new Error("Invalid RTP padding");
        }
        payloadEnd -= paddingLength;
    }

    return {
        version,
        padding: hasPadding,
        extension: hasExtension,
        marker: (second & 0x80) !== 0,
        payloadType: second & 0x7f,
        sequenceNumber: view.getUint16(2),
        timestamp: view.getUint32(4),
        ssrc: view.getUint32(8),
        csrcs,
        ...(headerExtensionProfile === undefined ? {} : { headerExtensionProfile }),
        ...(headerExtension === undefined ? {} : { headerExtension }),
        payload: data.slice(headerEnd, payloadEnd)
    };
}

export function serializeRtpPacket(packet: RtpPacket): Uint8Array {
    const csrcs = packet.csrcs ?? [];
    const extension = packet.extension || packet.headerExtension !== undefined;
    const extensionData = packet.headerExtension ?? new Uint8Array();
    if (extensionData.length % 4 !== 0) {
        throw new Error("RTP header extensions must be a multiple of four bytes");
    }

    const headerLength = 12 + csrcs.length * 4 + (extension ? 4 + extensionData.length : 0);
    const output = new Uint8Array(headerLength + packet.payload.length);
    const view = new DataView(output.buffer);
    output[0] = (packet.version << 6) | (extension ? 0x10 : 0) | csrcs.length;
    output[1] = (packet.marker ? 0x80 : 0) | (packet.payloadType & 0x7f);
    view.setUint16(2, packet.sequenceNumber);
    view.setUint32(4, packet.timestamp);
    view.setUint32(8, packet.ssrc);

    csrcs.forEach((csrc, index) => view.setUint32(12 + index * 4, csrc));
    let offset = 12 + csrcs.length * 4;
    if (extension) {
        view.setUint16(offset, packet.headerExtensionProfile ?? 0);
        view.setUint16(offset + 2, extensionData.length / 4);
        output.set(extensionData, offset + 4);
        offset += 4 + extensionData.length;
    }
    output.set(packet.payload, offset);
    return output;
}