export type ClientMessage =
    | {
          type: "join-room";
          roomId: string;
      }
    | {
          type: "leave-room";
      }
    | {
          type: "signal";
          targetPeerId: string;
          data: SignalData;
      };

export type SignalData =
    | {
          type: "offer";
          sdp: string;
      }
    | {
          type: "answer";
          sdp: string;
      }
    | {
          type: "ice-candidate";
          candidate: RTCIceCandidateInit;
      };

export type ServerMessage =
    | {
          type: "joined-room";
          roomId: string;
          peerId: string;
          peers: string[];
      }
    | {
          type: "peer-joined";
          peerId: string;
      }
    | {
          type: "peer-left";
          peerId: string;
      }
    | {
          type: "signal";
          fromPeerId: string;
          data: SignalData;
      }
    | {
          type: "error";
          message: string;
      };