# WebRTC Peer Room

A small peer-to-peer video calling demo built with React, TypeScript, WebSocket signaling, and the browser WebRTC API.

The signaling server only helps two browsers discover each other and exchange WebRTC metadata. After the connection is established, audio and video flow directly between the peers.

## What is included

- React + Vite client in `client/`
- TypeScript WebSocket signaling server in `server/`
- Two-person rooms identified by a room ID
- Camera and microphone access through `getUserMedia`
- WebRTC offer, answer, and ICE candidate exchange
- Google STUN server for local peer discovery

## Prerequisites

- Node.js 18 or newer
- A modern browser such as Chrome, Edge, or Firefox
- Camera and microphone access

## Install

Install dependencies in both workspaces:

```powershell
cd client
npm install

cd ..\server
npm install
```

## Run the server and client

Use two terminals from the project root.

### Terminal 1: signaling server

```powershell
cd server
npx tsc -b
node .\dist\signaling.server.js
```

The WebSocket server listens on:

```text
ws://localhost:3001
```

### Terminal 2: React client

```powershell
cd client
npm run dev
```

Open the URL printed by Vite, usually:

```text
http://localhost:5173
```

## Try a call

1. Open the client URL in two browser windows or tabs.
2. Enter the same room ID in both windows, for example `demo-42`.
3. Click **Join room** in both windows.
4. Allow camera and microphone access when the browser asks.
5. Keep both windows open while testing the call.

Each room supports a maximum of two peers. Use a different room ID for a new call.



For a deeper explanation of WebRTC concepts and the signaling flow, see the project notes in [WebRTC: Web Real-Time Communication](https://app.notion.com/p/WebRTC-Web-Real-Time-Communication-3e9c0f32e3c68034b436f1518a46e749?source=copy_link).

## Project structure

```text
.
|-- client/
|   |-- src/App.tsx        # Video call UI and WebRTC client logic
|   |-- package.json
|   `-- vite.config.ts
|-- server/
|   |-- src/signaling.server.ts      # WebSocket signaling server
|   |-- tsconfig.json
|   `-- package.json
`-- README.MD
```
