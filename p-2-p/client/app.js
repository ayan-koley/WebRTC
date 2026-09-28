const roomInput = document.querySelector("#room");
const joinButton = document.querySelector("#join");
const status = document.querySelector("#status");
const localVideo = document.querySelector("#local");
const remoteVideo = document.querySelector("#remote");

let socket;
let peerConnection;
let localStream;

function setStatus(message) {
    status.textContent = message;
}

function send(message) {
    socket.send(JSON.stringify(message));
}

async function createPeerConnection(roomId, initiator) {
    peerConnection = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });

    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    localVideo.srcObject = localStream;
    localStream.getTracks().forEach((track) => peerConnection.addTrack(track, localStream));
    peerConnection.ontrack = ({ streams }) => { remoteVideo.srcObject = streams[0]; };
    peerConnection.onicecandidate = ({ candidate }) => {
        if (candidate) send({ type: "signal", roomId, signalType: "ice", candidate });
    };

    if (initiator) {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        send({ type: "signal", roomId, signalType: "offer", sdp: peerConnection.localDescription });
    }
}

async function handleSignal(message, roomId) {
    if (message.signalType === "offer") {
        await peerConnection.setRemoteDescription(message.sdp);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        send({ type: "signal", roomId, signalType: "answer", sdp: peerConnection.localDescription });
    } else if (message.signalType === "answer") {
        await peerConnection.setRemoteDescription(message.sdp);
    } else if (message.signalType === "ice" && message.candidate) {
        await peerConnection.addIceCandidate(message.candidate);
    }
}

joinButton.addEventListener("click", async () => {
    joinButton.disabled = true;
    const roomId = roomInput.value.trim();
    socket = new WebSocket(`ws://${location.host}`);
    socket.onopen = () => send({ type: "join", roomId });
    socket.onmessage = async ({ data }) => {
        const message = JSON.parse(data);
        if (message.type === "joined") {
            setStatus(message.initiator ? "Waiting for another peer" : "Joining peer");
            if (!message.initiator) await createPeerConnection(roomId, false);
        } else if (message.type === "peer-ready") {
            setStatus("Connecting");
            await createPeerConnection(roomId, true);
        } else if (message.type === "signal") {
            await handleSignal(message, roomId);
            setStatus("Connected");
        } else if (message.type === "error") {
            setStatus(message.message);
            joinButton.disabled = false;
        }
    };
    socket.onerror = () => setStatus("Signaling connection failed");
});