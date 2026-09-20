# 💞 DuoConnect

A private web app for couples — play together, grow closer.

## Two sections

**🎮 Game Hub** — the "regular" side:
- 10 playable pass-and-play games: Trivia Battle, Draw & Guess, Memory Match, Sync Quiz, Hearts & Halves, Tic-Tac-Toe Duels, Photo Scavenger Hunt, Story Builder, Playlist Swap, Recipe Roulette
- Customizable challenges: Love Language Quiz, Date Night Spinner, Conversation Starters
- Achievements, milestones & relationship goals
- Private couple leaderboard and couple-friends list

**🔒 Private Couple's Space** — PIN-gated, end-to-end encrypted in production terms:
- Encrypted chat with auto-delete option
- Truth or Dare with 4 tiers — Sweet 💌, Spicy 🌶️, Bold 🔥, and **Inferno 💥** (requires typed dual consent)
- After Dark packs for dice & would-you-rather (same dual-consent gate)
- Sensation Spinner, Fantasy Builder, Kiss Roulette, Roll the Dice, Seven Minutes, Anticipation Countdown
- Shared lists (fantasies, bucket list, preferences) with mutual opt-in
- Personal encrypted vault
- Mood & availability calendar

## 💞 Couple Link — play from anywhere

Two people on **any two devices, anywhere in the world** can link up:

1. One partner clicks **🔗 Not linked → Create a room code**
2. The other clicks **Join** and enters the code
3. Connected — everything either of you does (chat, games, drawings, calendar marks, countdowns) updates live on the other's screen. **Both can control; both can see.**

The connection is a direct peer-to-peer WebRTC data channel (end-to-end encrypted via DTLS) using PeerJS for signaling. No DuoConnect server ever sees your data.

## Run it

It's a pure static site — no build step:

```bash
# any static server works
npx serve .
# or: python -m http.server, or just open index.html
```

State lives in each device's localStorage. The Private Space PIN is per-device by design.

## Honest limitations (prototype)

- "Encryption" in the Private Space is represented in the UI; real E2E for stored data would use WebCrypto with device-held keys
- PIN reset should wipe encrypted data in production
- Games are pass-and-play; the Couple Link syncs actions/results live but full game-state rooms (private hands per player) are the next step

---
Built as a prototype. Consent features (Inferno, After Dark, shared lists) require explicit dual opt-in by design.
