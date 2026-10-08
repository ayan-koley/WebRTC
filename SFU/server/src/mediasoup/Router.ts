import * as mediasoup from 'mediasoup'
import type { types } from 'mediasoup'

/**
 * Creates a mediasoup router with the codecs this SFU supports.
 * Steps when called:
 * 1. Call worker.createRouter with Opus audio and VP8 video codecs.
 * 2. Include video RTCP feedback so keyframes and congestion control work.
 * 3. Log the router and return it.
 */
export const createRouter = async (worker: any) => {
    const router = await worker.createRouter(
        {
            mediaCodecs: [
                {
                    kind: "audio",
                    mimeType: "audio/opus",
                    clockRate: 48000,
                    channels: 2,
                },
                {
                    kind: "video",
                    mimeType: "video/VP8",
                    clockRate: 90000,
                    rtcpFeedback: [
                        { type: "nack" },
                        { type: "nack", parameter: "pli" },
                        { type: "ccm", parameter: "fir" },
                        { type: "goog-remb" },
                        { type: "transport-cc" },
                    ],
                },
            ]
        }
    )

    console.log(`Mediasoup router created ${router}`);

    return router;
}
