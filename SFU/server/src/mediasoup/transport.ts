import type {
  Router,
  WebRtcTransport,
} from "mediasoup/types";

/**
 * Creates a mediasoup WebRTC transport on the given router.
 * Steps when called:
 * 1. Ask the router to create a transport that listens on localhost UDP and TCP.
 * 2. Prefer UDP, keep TCP as a fallback, and attach empty appData.
 * 3. Log the transport and return it to the caller.
 */
export async function createWebRtcTransport(
  router: Router
): Promise<WebRtcTransport> {
  const transport = await router.createWebRtcTransport({
    listenInfos: [
      {
        protocol: "udp",
        ip: "127.0.0.1",
      },
      {
        protocol: "tcp",
        ip: "127.0.0.1",
      },
    ],

    enableUdp: true,
    enableTcp: true,
    preferUdp: true,

    appData: {},
  });

  console.log("Transport created:", transport);

  return transport;
}
