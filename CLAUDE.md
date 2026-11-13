# Project: Pişti Online (Multiplayer Turkish Card Game)

## Tech Stack
- **Frontend:** Next.js (App Router) or React + Vite, Tailwind CSS, Framer Motion (for card physics/animations), Lucide Icons.
- **Backend / Realtime:** Node.js + Socket.io (for game state, room codes, and WebRTC signaling).
- **Voice Chat:** Peer-to-peer WebRTC (mesh network for 2 or 4 players) using native browser `RTCPeerConnection` and Socket.io for SDP/ICE candidate exchange.
- **Audio:** Web Audio API (synthesized or loaded sound effects for card deal, soft place, and variable-intensity table slam + screen shake).

## Game Rules (Standard Turkish Pişti)
- **Deck:** Standard 52-card deck.
- **Players:** 2 or 4 players (2v2 partnerships in 4-player mode).
- **Setup:** 4 cards dealt to the center pile (3 face-down, 1 top card face-up). 4 cards dealt to each player. When hands empty, deal 4 more until deck runs out.
- **Gameplay:** Players play 1 card per turn.
  - **Capture:** Playing a card matching the rank of the top center card captures the entire center pile.
  - **Jack (Vale) Rule:** Playing any Jack captures the entire center pile regardless of the top card.
  - **Pişti:** If the center pile has **only 1 card** and the active player matches its rank (without using a Jack, unless the single card on the table is also a Jack), it is a **Pişti**.
  - **End of Deck:** Any remaining cards on the table after the final hand go to the last player who made a capture.
- **Scoring:**
  - Each Ace (A): **1 pt**
  - Each Jack (J): **1 pt**
  - 2 of Clubs (Sinek 2): **2 pts**
  - 10 of Diamonds (Karo 10): **3 pts**
  - Majority of cards (27+ cards): **3 pts** (0 if tied at 26-26)
  - Standard Pişti: **10 pts**
  - Jack Pişti (matching a single Jack with a Jack): **20 pts**
  - **Target Score:** First to 101 or 151 points (configurable in room lobby).

## Signature Mechanic: The "Pişti Slam"
1. **Detection:** When a player selects a card from their hand that will legally trigger a Pişti (1 card on table, matching rank), the client detects this immediately.
2. **Face-Down Hover/Placement:** Instead of immediately revealing and capturing, the card animates onto the table **face-down** (or hovers primed over the pile) in a "ready to slam" state, visible to all players via socket events (`pişti:charging`).
3. **Charge & Release:**
   - Holding mouse-down / touch-hold charges a visual tension meter (0% to 100% over ~1.5 seconds) with subtle card vibration and rising pitch audio.
   - Releasing triggers `pişti:slam` with the `chargeLevel` (0.0 to 1.0).
   - **Impact:** The card flips face-up and slams onto the table. Animation speed, impact scale, particle burst, screen shake intensity, and slam sound volume/bass scale dynamically with `chargeLevel`.
   - Include a 4-second auto-slam fallback timer in case a player disconnects or forgets to release.

## Visual & UX Guidelines
- **Aesthetic:** Cozy, modern Turkish *Kahvehane* / classic green or warm crimson felt table texture, crisp vector playing cards with clear suits, subtle drop shadows, and smooth spring physics.
- **Table Layout:** Radial layout (bottom = local player, top = opponent/partner, left/right = opponents in 4P). Center pile shows a slightly messy, organic stack of cards (slight random rotation per card) so players can visually tell when only 1 card is on the table.