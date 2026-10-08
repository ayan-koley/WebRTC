import * as mediasoupClient from 'mediasoup-client'
import type { Socket } from 'socket.io-client';

/**
 * Loads a mediasoup Device with this server's RTP capabilities.
 * Steps when called:
 * 1. Create a new mediasoup-client Device.
 * 2. Ask the server for router RTP capabilities via getRtpCapabilities.
 * 3. Load those capabilities into the device.
 * 4. Return the ready device.
 */
export const createDevice = async(socket: Socket) => {
    const device: mediasoupClient.types.Device = new mediasoupClient.Device();

    const routerRtpCapabilities = await new Promise<any>(resolve => {
      socket.emit("getRtpCapabilities", {}, (res: any) => resolve(res.rtpCapabilities))
    });

    await device.load({routerRtpCapabilities});
    return device;
}

/**
 * Asks the server for parameters to build a local WebRTC transport.
 * Steps when called:
 * 1. Confirm a device exists.
 * 2. Emit creteWebRtcTransport and wait for the server reply.
 * 3. Return ICE, DTLS, and transport id params.
 */
export const createTransport = async(deviceRef: mediasoupClient.types.Device, socket: Socket) => {
    const device = deviceRef;
    if(!device) {
      throw new Error("Device not connected");
    }

    const params = await new Promise<any>(resolve => {
      socket.emit("creteWebRtcTransport", {}, (res: any) => resolve(res) )
    })

    return params;
}

/**
 * Builds a send transport used to publish local camera and mic.
 * Steps when called:
 * 1. Fetch transport params from the server.
 * 2. Create a send transport on the device.
 * 3. On connect, send DTLS parameters to connectTransport.
 * 4. On produce, send kind and RTP parameters to produce and return the producer id.
 * 5. Return the transport so the caller can produce tracks.
 */
export const sendTransport = async(device: mediasoupClient.types.Device, socket: Socket): Promise<mediasoupClient.types.Transport> => {
  const params = await createTransport(device, socket);
  const transport =  device.createSendTransport(params);

    transport.on("connect", ({dtlsParameters}, callback, errback) => {
      socket.emit("connectTransport", {
        transportId: transport.id,
        dtlsParameters: dtlsParameters
      }, (res: any) => {
        if(res?.error) {
          errback(new Error(res.error));
          return;
        }
        console.log(`Connected send transport ? ${res?.connected}`);
        callback();
      })
    })

    transport.on('produce', (paramter, callbakc, errback) => {
        socket.emit("produce", {
          transportId: transport.id,
          kind: paramter.kind,
          rtpParameters: paramter.rtpParameters
        }, (res: any) => {
          if(res?.error) {
            errback(new Error(res));
            return;
          }
          console.log(`Producer id is ${res.id}`);

          callbakc({
            id: res.id
          })
        })
    })

    return transport;
}

/**
 * Builds a receive transport used to pull other peers' media.
 * Steps when called:
 * 1. Fetch transport params from the server.
 * 2. Create a recv transport on the device.
 * 3. On connect, send DTLS parameters to connectTransport.
 * 4. Return the transport so the caller can consume producers.
 */
export const receiveTransport = async(device: mediasoupClient.types.Device, socket: Socket): Promise<mediasoupClient.types.Transport> => {
    const params = await createTransport(device, socket);
    const transport =  device.createRecvTransport(params);

    transport.on("connect", ({ dtlsParameters }, callback, errback) => {
      socket.emit("connectTransport", {
        transportId: transport.id,
        dtlsParameters: dtlsParameters
      }, (res: any) => {
        if(res?.error) {
          errback(new Error(res.error));
          return;
        }
         console.log(`Connected receive transport ? ${res?.connected}`);
        callback();
      })
    })

    return transport;
}

/**
 * Subscribes to one remote producer and returns a stream with that track.
 * Steps when called:
 * 1. Stop if the device or receive transport is missing.
 * 2. Emit consume with transport id, producer id, and recv RTP capabilities.
 * 3. Create a local consumer from the server's consumer params.
 * 4. Emit resumeConsume so the server starts sending packets.
 * 5. Wrap the consumer track in a MediaStream and return it.
 */
export const consumeProducer = async(device: mediasoupClient.types.Device, transport: mediasoupClient.types.Transport, socket: Socket, producerId: string) => {

    if (!device || !transport) {
        console.log("Receive transport not ready");
        return;
    }

    const response = await new Promise<any>((resolve) => {
        socket.emit(
            "consume",
            {
                transportId: transport.id,
                producerId,
                rtpCapabilities: device.recvRtpCapabilities
            },
            (response: any) => resolve(response));
        });

        if (response.error) {
            console.error(response.error);
            return;
        }
    const consumer = await transport.consume({
        id: response.id,
        producerId: response.producerId,
        kind: response.kind,
        rtpParameters: response.rtpParameters,
    });

    console.log('Consumer created:', consumer);

    await new Promise<void>((resolve) => {
        socket.emit(
            "resumeConsume",
            {
                consumerId: consumer.id,
            },
            (response: any) => {
                if (response?.error) {
                    console.error("Resume consumer error:", response.error);
                } else {
                    console.log("Consumer resumed:", consumer.id);
                }
                resolve();
            }
        );
    });

    const stream = new MediaStream();
    stream.addTrack(consumer.track);

    return stream;
}

/**
 * Fetches producers that already exist in the room (other peers).
 * Steps when called:
 * 1. Emit getProducers to the server.
 * 2. Wait for the list of { producerId, socketId } objects.
 * 3. Return that list, or an empty array if none exist.
 */
export const getExistingProducers = async(socket: Socket): Promise<{ producerId: string; socketId: string }[]> => {
    const response = await new Promise<any>((resolve) => {
      socket.emit(
        "getProducers",
        {},
        (response: any) => {
          resolve(response?.producers || []);
        }
      );
    });

    return response || [];
}
