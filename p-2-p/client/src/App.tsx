import { useEffect, useRef, useState } from 'react'
import type { SubmitEventHandler } from 'react'
import './App.css'

type SignalMessage = {
  type: 'signal'
  signalType: 'offer' | 'answer' | 'ice'
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

export default function App() {
  const socketRef = useRef<WebSocket | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const roomRef = useRef('')
  const [roomId, setRoomId] = useState('')
  const [status, setStatus] = useState('Disconnected')
  const [connected, setConnected] = useState(false)
  const [hasRemoteStream, setHasRemoteStream] = useState(false)

  const send = (message: object) => {
    const socket = socketRef.current
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
  }

  const createPeerConnection = async (initiator: boolean) => {
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    peerRef.current = peer

    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    if (localVideoRef.current) localVideoRef.current.srcObject = stream
    stream.getTracks().forEach((track) => peer.addTrack(track, stream))

    peer.ontrack = ({ streams }) => {
      console.log(`ontrack streams ${streams[0]}`);
      if (remoteVideoRef.current && streams[0]) {
        remoteVideoRef.current.srcObject = streams[0]
        setHasRemoteStream(true)
      }
    }
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) send({ type: 'signal', roomId: roomRef.current, signalType: 'ice', candidate })
    }
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === 'connected') setStatus('Connected')
      if (peer.connectionState === 'failed') setStatus('Peer connection failed')
    }

    if (initiator) {
      const offer = await peer.createOffer()
      await peer.setLocalDescription(offer)
      send({ type: 'signal', roomId: roomRef.current, signalType: 'offer', sdp: peer.localDescription })
    }
  }

  const handleSignal = async (message: SignalMessage) => {
    const peer = peerRef.current
    if (!peer) return
    if (message.signalType === 'offer') {
      await peer.setRemoteDescription(message.sdp!)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      send({ type: 'signal', roomId: roomRef.current, signalType: 'answer', sdp: peer.localDescription })
    } else if (message.signalType === 'answer') {
      await peer.setRemoteDescription(message.sdp!)
    } else if (message.candidate) {
      await peer.addIceCandidate(message.candidate)
    }
  }

  const configureSocket = (socket: WebSocket) => {
    socket.onopen = () => {
      setConnected(true)
      setStatus('Connected to signaling')
      send({ type: 'join', roomId: roomRef.current })
    }
    socket.onmessage = async ({ data }) => {
      const message = JSON.parse(String(data))
      if (message.type === 'joined') {
        setStatus(message.initiator ? 'Waiting for another peer' : 'Joining peer')
        if (!message.initiator) await createPeerConnection(false)
      } else if (message.type === 'peer-ready') {
        setStatus('Starting camera')
        await createPeerConnection(true)
      } else if (message.type === 'signal') {
        await handleSignal(message as SignalMessage)
      } else if (message.type === 'error') {
        setStatus(message.message)
      }
    }
    socket.onerror = () => setStatus('Signaling connection failed')
    socket.onclose = () => {
      setConnected(false)
      setStatus('Disconnected')
    }
  }

  const connect = () => {
    if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) return
    setStatus('Connecting to signaling')
    const socket = new WebSocket('ws://localhost:3001')
    socketRef.current = socket
    configureSocket(socket)
  }

  const handleJoin: SubmitEventHandler<HTMLFormElement> = (event) => {
    event?.preventDefault()
    const trimmedRoomId = roomId.trim()
    if (!trimmedRoomId) {
      setStatus('Enter a room ID first')
      return
    }
    roomRef.current = trimmedRoomId
    connect()
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      send({ type: 'join', roomId: trimmedRoomId })
    }
  }

  useEffect(() => () => {
    peerRef.current?.close()
    socketRef.current?.close()
    const stream = localVideoRef.current?.srcObject as MediaStream | null
    stream?.getTracks().forEach((track) => track.stop())
  }, [])

  // console.log(`localvideo ref - ${localVideoRef.current.} \n remotevideoref - ${remoteVideoRef.current}`)

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">PRIVATE PEER NETWORK</p>
          <h1>Peer room</h1>
        </div>
        <span className={`status-pill ${connected ? 'online' : ''}`}>{status}</span>
      </section>

      <section className="control-panel">
        <form onSubmit={handleJoin}>
          <label htmlFor="room-id">Room ID</label>
          <div className="join-row">
            <input id="room-id" value={roomId} onChange={(event) => setRoomId(event.target.value)} placeholder="e.g. 42" autoComplete="off" />
            <button type="submit">Join room</button>
          </div>
        </form>
        <p className="hint">Open this page in a second browser window and join the same room.</p>
      </section>

      <section className="video-grid" aria-label="Video call">
        <article className="video-card local-card">
          <div className="video-label"><span>YOU</span><span className="live-dot" /></div>
          <video ref={localVideoRef} autoPlay muted playsInline />
          <p className="video-placeholder">Your camera preview will appear here</p>
        </article>
        <article className="video-card remote-card">
          <div className="video-label"><span>REMOTE PEER</span></div>
          <video ref={remoteVideoRef} autoPlay playsInline />
          {!hasRemoteStream && <p className="video-placeholder">Waiting for another person to join</p>}
        </article>
      </section>
    </main>
  )
}

