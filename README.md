# Pişti Online

Real-time multiplayer version of the Turkish card game **Pişti** — play 1v1 or 2v2 with friends via a room code, or solo against bots, with built-in peer-to-peer voice chat.

## Features
- **Rooms** for 2 or 4 players (2v2 partnerships), joined by a short room code; configurable target score (101 / 151)
- **Full rules engine**: captures, Jack rule, Pişti / Jack-Pişti bonuses, majority-of-cards scoring, end-of-deck handling
- **Bots**: play solo against a bot, or fill empty seats in a room
- **Voice chat**: WebRTC peer-to-peer mesh, with Socket.IO used for SDP/ICE signaling
- **"Pişti slam"**: charge-and-release mechanic with animation, screen shake and synthesized Web Audio effects
- **Reconnection handling** and a round summary screen

## Tech stack
| Layer | Tech |
|---|---|
| Client | React 18, Vite, Tailwind CSS 4, Framer Motion, Lucide |
| Server | Node.js 20+, Express, Socket.IO |
| Voice | Native `RTCPeerConnection` (WebRTC) |
| Tests | Node's built-in test runner |
| Hosting | Render (see `render.yaml`) |

## Project layout
```
client/            React UI (Table, Lobby, VoiceBar, hooks for room + voice state)
server/src/engine/ Game rules: cards, game state machine, scoring, bot AI
server/src/rooms.js Room / seat management
server/test/       Engine, rooms, bots, voice-signaling and end-to-end tests
```

## Run locally
```bash
npm install
npm run dev      # server on :3001, client on :5173
npm test         # server test suite
npm run build    # production client build; `npm start` serves it from the server
```

## Deployment
`render.yaml` is a Render Blueprint: one web service that builds the client and serves it together with the Socket.IO server (health check at `/health`).
