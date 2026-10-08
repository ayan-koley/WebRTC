import { useCallback, useEffect, useRef, useState } from "react"
import { Socket, io } from 'socket.io-client'
import * as mediasoupClient from 'mediasoup-client'
import { consumeProducer, createDevice, getExistingProducers, receiveTransport, sendTransport } from "./index.ts";

const socket: Socket = io("http://localhost:3000");

interface RemoteVideoProps {
  peerId: string;
  stream: MediaStream;
}

/**
 * Renders one remote peer's audio and video in a single video element.
 * Steps when called / when the stream changes:
 * 1. Attach the MediaStream to the video element as srcObject.
 * 2. Try to play it.
 * 3. Listen for addtrack so play runs again if audio or video arrives later.
 * 4. Remove that listener on cleanup.
 */
function RemoteVideo({ peerId, stream }: RemoteVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.srcObject = stream;
    video.play().catch((err) => {
      console.warn(`[RemoteVideo ${peerId}] Playback failed:`, err);
    });

    const handleAddTrack = () => video.play().catch(() => {});
    stream.addEventListener("addtrack", handleAddTrack);

    return () => {
      stream.removeEventListener("addtrack", handleAddTrack);
    };
  }, [stream, peerId]);

  return (
    <div className="flex flex-col items-center gap-2 bg-gray-800 rounded-xl p-3 shadow-lg">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-64 h-48 rounded-lg bg-black object-cover"
      />
      <span className="text-xs text-gray-400 font-mono truncate max-w-[16rem]">
        peer: {peerId.slice(0, 8)}…
      </span>
    </div>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());

  const deviceRef = useRef<mediasoupClient.types.Device | null>(null);
  const sendTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const recvTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  /**
   * Adds a remote track into the MediaStream for that peer's tile.
   * Steps when called:
   * 1. Copy the remoteStreams map.
   * 2. Get or create the MediaStream keyed by the peer's socket id.
   * 3. Remove any existing track of the same kind so duplicates are not stacked.
   * 4. Add the new track and save the stream back on that socket id.
   */
  const mergeTrackIntoPeerStream = useCallback(
    (socketId: string, track: MediaStreamTrack) => {
      setRemoteStreams((prev) => {
        const next = new Map(prev);

        let stream = next.get(socketId);
        if (!stream) {
          stream = new MediaStream();
        }

        if (track.kind === "video") {
          stream.getVideoTracks().forEach((t) => stream!.removeTrack(t));
        } else {
          stream.getAudioTracks().forEach((t) => stream!.removeTrack(t));
        }

        stream.addTrack(track);
        next.set(socketId, stream);
        return next;
      });
    },
    []
  );

  /**
   * Removes a remote peer's tile when they leave.
   * Steps when called:
   * 1. Copy the remoteStreams map.
   * 2. Stop every track on that peer's stream.
   * 3. Delete the map entry for their socket id.
   */
  const removeRemoteStream = useCallback((socketId: string) => {
    setRemoteStreams((prev) => {
      const next = new Map(prev);
      const stream = next.get(socketId);
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      next.delete(socketId);
      return next;
    });
  }, []);

  /**
   * Wires socket events for connect, disconnect, new producers, and closed producers.
   * Steps when this effect runs:
   * 1. On connect, mark connected and auto-join the room.
   * 2. On disconnect, mark disconnected.
   * 3. On newProducer, consume that producer and merge tracks into the peer's stream.
   * 4. On producerClosed, remove that peer's tile.
   * 5. On unmount, remove all of those listeners.
   */
  useEffect(() => {
    socket.on('connect', async () => {
      console.log(`Socket is connected ${socket.id}`);
      setConnected(true);

      try {
        await joinRoom();
      } catch (err) {
        console.error("Auto joinRoom error:", err);
      }
    });

    socket.on("disconnect", () => {
      console.log("Socket disconnected");
      setConnected(false);
    });

    socket.on("newProducer", async ({ producerId, socketId }: { producerId: string; kind: string; socketId: string }) => {
      console.log(`New producer from peer ${socketId}: ${producerId}`);
      if (deviceRef.current && recvTransportRef.current) {
        const stream = await consumeProducer(deviceRef.current, recvTransportRef.current, socket, producerId);
        if (stream) {
          stream.getTracks().forEach((track) => mergeTrackIntoPeerStream(socketId, track));
        }
      }
    });

    socket.on("producerClosed", ({ socketId }: { producerId: string; socketId: string }) => {
      console.log(`Peer disconnected: ${socketId}`);
      removeRemoteStream(socketId);
    });

    return () => {
      socket.off('connect');
      socket.off("disconnect");
      socket.off("newProducer");
      socket.off("producerClosed");
    }
  }, [mergeTrackIntoPeerStream, removeRemoteStream])

  /**
   * Publishes this user's camera and microphone to the room.
   * Steps when called:
   * 1. Join the room so the device and receive transport exist.
   * 2. Create a send transport and store it.
   * 3. Request camera and mic from the browser.
   * 4. Show the local stream on the local video element.
   * 5. Produce the video track and the audio track on the send transport.
   */
  async function startCamera() {
    try {
      const { device } = await joinRoom();

      const transport = await sendTransport(device, socket);
      sendTransportRef.current = transport;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        await localVideoRef.current.play().catch((error: unknown) => {
          console.warn("Local video autoplay was blocked:", error);
        });
      }

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      const videoProducer = await transport.produce({ track: videoTrack });
      const audioProducer = await transport.produce({ track: audioTrack });

      console.log("Published producers:", { videoId: videoProducer.id, audioId: audioProducer.id });
    } catch (error) {
      console.error("Failed to start camera:", error);
    }
  }

  /**
   * Loads the mediasoup device, receive transport, and existing remote media.
   * Steps when called:
   * 1. Create and cache a Device if one is not already loaded.
   * 2. Create and cache a receive transport if one does not exist yet.
   * 3. Ask the server for other peers' producers.
   * 4. Consume each producer and merge its track into that peer's MediaStream.
   * 5. Return the device for callers such as startCamera.
   */
  async function joinRoom() {
    let device = deviceRef.current;
    if (!device) {
      device = await createDevice(socket);
      deviceRef.current = device;
    }

    if (!recvTransportRef.current) {
      const rectransport = await receiveTransport(device, socket);
      recvTransportRef.current = rectransport;

      const producers = await getExistingProducers(socket);
      for (const { producerId, socketId } of producers) {
        const remoteStream = await consumeProducer(device, rectransport, socket, producerId);
        if (remoteStream) {
          remoteStream.getTracks().forEach((track) => mergeTrackIntoPeerStream(socketId, track));
        }
      }
    }

    return { device };
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">🎥 Mediasoup SFU</h1>
        <span className={`text-sm font-medium px-3 py-1 rounded-full ${connected ? "bg-green-800 text-green-300" : "bg-red-900 text-red-300"}`}>
          {connected ? "🟢 Connected" : "🔴 Disconnected"}
        </span>
      </div>

      <div className="flex gap-3">
        <button
          onClick={joinRoom}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-semibold transition-colors"
        >
          Join Room
        </button>
        <button
          onClick={startCamera}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-semibold transition-colors"
        >
          Start Camera
        </button>
      </div>

      <div className="flex flex-col items-start gap-2">
        <h2 className="text-lg font-semibold text-gray-300">Local</h2>
        <div className="bg-gray-800 rounded-xl p-3 shadow-lg">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="w-64 h-48 rounded-lg bg-black object-cover"
          />
          <p className="mt-1 text-xs text-gray-500 text-center">You</p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-gray-300">
          Remote Peers
          <span className="ml-2 text-sm font-normal text-gray-500">
            ({remoteStreams.size} peer{remoteStreams.size !== 1 ? "s" : ""})
          </span>
        </h2>

        {remoteStreams.size === 0 ? (
          <p className="text-sm text-gray-600 italic">
            No remote peers yet. Ask someone to join and start their camera.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from(remoteStreams.entries()).map(([socketId, stream]) => (
              <RemoteVideo
                key={socketId}
                peerId={socketId}
                stream={stream}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
