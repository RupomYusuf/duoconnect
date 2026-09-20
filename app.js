/* ===== DuoConnect prototype logic (demo state lives in localStorage) ===== */
"use strict";

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem("duo_" + key)) ?? fallback; }
    catch { return fallback; }
  },
  set(key, value) { localStorage.setItem("duo_" + key, JSON.stringify(value)); }
};

function toast(text) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 2400);
}

/* ================= Couple Link: live two-person sync (WebRTC/PeerJS) =================
   One partner creates a room code, the other joins with it. The connection is a
   peer-to-peer, end-to-end encrypted data channel — it works across the internet
   with no DuoConnect server. Both sides can act; both sides see. */
const NET = { peer: null, conn: null, code: null, connected: false, named: false };
const ROOM_PREFIX = "duoconnect-v1-";

function partnerLabel() { return NET.named ? PLAYER_NAMES[1] : "your partner"; }

function netSend(type, payload) {
  if (NET.connected && NET.conn && NET.conn.open) {
    NET.conn.send({ type, payload });
  }
}

function netChip() {
  const chip = $("#linkChip");
  chip.textContent = NET.connected ? `💞 Linked · ${NET.code}` : "🔗 Not linked";
  chip.classList.toggle("on", NET.connected);
}

function netStatus(text) { $("#linkChip").textContent = text; }

function randomCode(len) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function netCreate() {
  netTeardown();
  const code = randomCode(5);
  netStart(code, true);
}

function netJoin(code) {
  netTeardown();
  netStart(code.toUpperCase(), false);
}

function netTeardown() {
  if (NET.conn) { try { NET.conn.close(); } catch {} }
  if (NET.peer) { try { NET.peer.destroy(); } catch {} }
  NET.conn = NET.peer = null;
  NET.connected = false;
  netChip();
}

function netStart(code, host) {
  if (typeof Peer === "undefined") return toast("Link library failed to load — check your internet");
  NET.code = code;
  netStatus("Connecting…");
  NET.peer = new Peer(host ? ROOM_PREFIX + code : undefined);
  NET.peer.on("open", () => {
    if (host) {
      netStatus(`Room ${code} — waiting for partner…`);
    } else {
      netAttach(NET.peer.connect(ROOM_PREFIX + code, { reliable: true }));
    }
  });
  NET.peer.on("connection", (c) => netAttach(c));
  NET.peer.on("error", (err) => {
    if (err.type === "unavailable-id") toast("That room code is already in use — make a new one");
    else if (err.type === "peer-unavailable") toast("No room found with that code");
    else toast("Link error: " + err.type);
    netTeardown();
  });
  if (host) netChip();
}

function netAttach(conn) {
  NET.conn = conn;
  conn.on("open", () => {
    NET.connected = true;
    netChip();
    netSend("hello", { name: PLAYER_NAMES[0] });
    toast("Partner linked — what you do, they see 💞");
  });
  conn.on("data", (d) => { if (d && d.type) netReceive(d.type, d.payload || {}); });
  conn.on("close", () => {
    NET.connected = false;
    netChip();
    toast("Partner disconnected");
  });
}

function netReceive(type, p) {
  switch (type) {
    case "hello": {
      NET.named = true;
      setPartnerName(p.name);
      toast(`${p.name} joined — names are now shared 💞`);
      break;
    }
    case "chat": {
      const msgs = store.get("chat", []);
      msgs.push({ from: "them", text: p.text, t: p.t, ephemeral: p.ephemeral });
      store.set("chat", msgs);
      renderChat();
      if (!$("#tab-chat").classList.contains("active")) toast("💌 New private message");
      break;
    }
    case "tod": $("#todResult").textContent = p.text; break;
    case "dice": $("#diceResult").textContent = p.text; break;
    case "kiss": $("#kissResult").textContent = p.text; break;
    case "wyr": $("#wyrResult").textContent = p.text; break;
    case "sens": $("#sensResult").textContent = p.text; break;
    case "fant": $("#fantResult").textContent = p.text; break;
    case "spinner": $("#spinnerResult").textContent = p.text; break;
    case "starter": {
      starterIdx = ((p.index % STARTERS.length) + STARTERS.length) % STARTERS.length;
      $("#starterText").textContent = `“${STARTERS[starterIdx]}”`;
      break;
    }
    case "mood": {
      const marks = store.get("moods", {});
      if (p.mood) marks[p.key] = p.mood; else delete marks[p.key];
      store.set("moods", marks);
      renderCalendar();
      toast(`${partnerLabel()} marked a day on your shared calendar`);
      break;
    }
    case "list": {
      store.set("list_" + p.id, p.items);
      renderLists();
      toast(`${partnerLabel()} updated a shared list`);
      break;
    }
    case "countdown": {
      clearInterval(cdTimer);
      let remain = p.minutes * 60;
      if (p.hint) toast(`${partnerLabel()} sent a hint: “${p.hint}”`);
      const tick = () => {
        const el = $("#countdownDisplay");
        if (!el) return;
        el.textContent = fmt(remain);
        if (remain-- <= 0) { clearInterval(cdTimer); el.textContent = "It's time 🎉"; }
      };
      tick();
      cdTimer = setInterval(tick, 1000);
      break;
    }
    case "countdownStop": clearInterval(cdTimer); $("#countdownDisplay").textContent = "00:00"; break;
    case "seven": {
      clearInterval(sevenTimer);
      if (!p.on) { $("#sevenDisplay").textContent = "07:00"; break; }
      let remain = 7 * 60;
      toast(`${partnerLabel()} started Seven Minutes ⏱️`);
      const tick = () => {
        const el = $("#sevenDisplay");
        if (!el) return;
        el.textContent = fmt(remain);
        if (remain-- <= 0) { clearInterval(sevenTimer); el.textContent = "Time's up ⏰"; }
      };
      tick();
      sevenTimer = setInterval(tick, 1000);
      break;
    }
    case "todLevel": {
      const btn = $$(".level-btn").find(b => b.dataset.level === p.level);
      if (btn) { todLevel = p.level; $$(".level-btn").forEach(b => b.classList.toggle("on", b === btn)); }
      break;
    }
    case "snap": {
      addSnap({
        id: p.id, kind: "snap", from: "them", img: p.img, t: p.t,
        expiresAt: p.minutes ? Date.now() + p.minutes * 60000 : null
      });
      toast(`📸 New snap from ${partnerLabel()}`);
      break;
    }
    case "dareRequest": {
      addSnap({ id: p.id, kind: "dare", from: "them", text: p.text, status: "pending", t: p.t });
      toast("🎯 New snap dare — accept or decline, your call");
      if (!$("#tab-snaps").classList.contains("active")) toast("Check 📸 Snaps");
      break;
    }
    case "dareFulfilled": {
      const list = snapsList();
      const entry = list.find(s => s.id === p.id);
      if (entry) { entry.status = "fulfilled"; saveSnaps(list); renderSnaps(); }
      toast(`${partnerLabel()} fulfilled your dare 👀`);
      break;
    }
    case "dareDeclined": {
      const list = snapsList();
      const entry = list.find(s => s.id === p.id);
      if (entry) { entry.status = "declined"; saveSnaps(list); renderSnaps(); }
      toast(`${partnerLabel()} declined 🤍 — never ask twice`);
      break;
    }
    case "tab": {
      if (document.body.dataset.mode === "private") {
        const btn = $$(".subnav-btn").find(b => b.dataset.tab === p.tab);
        if (btn) btn.click();
      } else {
        toast(`${partnerLabel()} is in their Private Space 🔒`);
      }
      break;
    }
  }
}

/* ---- Couple Link modal ---- */
$("#linkChip").addEventListener("click", () => {
  if (NET.connected || NET.peer) {
    openModal(`
      <h3>💞 Couple Link</h3>
      <p class="panel-sub">Room <b>${NET.code || "—"}</b> · ${NET.connected ? "partner linked. Everything you do on this device updates theirs live — both of you can control." : "waiting for partner to join…"}</p>
      <button class="btn ghost" id="netDisconnect">Disconnect</button>`);
    $("#netDisconnect").addEventListener("click", () => { netTeardown(); closeModal(); });
    return;
  }
  openModal(`
    <h3>💞 Couple Link</h3>
    <p class="panel-sub">Link your two devices over the internet — direct, encrypted, no account needed. One creates a code, the other joins.</p>
    <input type="text" id="netName" placeholder="Your name (so your partner knows it's you)" value="${(PLAYER_NAMES[0] && PLAYER_NAMES[0] !== "Alex") ? PLAYER_NAMES[0] : ""}" autocomplete="off" style="margin-bottom:10px">
    <button class="btn primary" id="netCreate" style="width:100%;margin-bottom:10px">Create a room code</button>
    <div id="netCreateBox" class="hidden" style="margin-bottom:14px">
      <div class="dice-result" id="netCode" style="font-size:26px"></div>
      <p class="panel-sub" style="text-align:center">Share this code with your partner — they tap “Join”.</p>
    </div>
    <div class="btn-row">
      <input type="text" id="netJoinCode" placeholder="Join code (e.g. K7X2M)" style="text-transform:uppercase" maxlength="5" autocomplete="off">
      <button class="btn primary" id="netJoinBtn">Join</button>
    </div>`);
  $("#netCreate").addEventListener("click", () => {
    const name = $("#netName").value.trim() || "Me";
    setMyName(name);
    $("#netCreateBox").classList.remove("hidden");
    const code = randomCode(5);
    $("#netCode").textContent = code;
    netStart(code, true);
  });
  $("#netJoinBtn").addEventListener("click", () => {
    const code = $("#netJoinCode").value.trim();
    if (code.length < 4) return toast("Enter the code your partner shared");
    const name = $("#netName").value.trim() || "Me";
    setMyName(name);
    netJoin(code);
  });
});

/* ================= Private Space gate ================= */
const PIN_KEY = "pin";
let pinBuffer = "";
let pinStage = "create"; // verify -> create -> confirm -> unlock
let pendingPin = "";
let changingPin = false;

function lockTitleFor(stage) {
  return {
    create: "Set your Private Space PIN",
    confirm: "Confirm your PIN",
    verify: "Enter your current PIN",
    unlock: "Enter your Private Space PIN"
  }[stage];
}

function openLock(change) {
  changingPin = !!change;
  pinStage = store.get(PIN_KEY) ? (change ? "verify" : "unlock") : "create";
  pinBuffer = "";
  pendingPin = "";
  $("#lockTitle").textContent = lockTitleFor(pinStage);
  $("#pinForgot").classList.toggle("hidden", pinStage !== "unlock");
  $("#lockScreen").classList.remove("hidden");
  renderPinDots();
}

function renderPinDots() {
  $("#pinDots").innerHTML = Array.from({ length: 4 }, (_, i) =>
    `<span class="pin-dot ${i < pinBuffer.length ? "filled" : ""}"></span>`).join("");
}

function renderPinPad() {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];
  $("#pinPad").innerHTML = keys.map(k =>
    k === "" ? `<span></span>` :
    k === "del" ? `<button class="pin-key" data-key="del">⌫</button>` :
    `<button class="pin-key" data-key="${k}">${k}</button>`).join("");
}

$("#pinPad").addEventListener("click", (e) => {
  const key = e.target.closest(".pin-key");
  if (!key) return;
  const v = key.dataset.key;
  if (v === "del") { pinBuffer = pinBuffer.slice(0, -1); }
  else if (v === "ok") { submitPin(); return; }
  else if (pinBuffer.length < 4) { pinBuffer += v; }
  renderPinDots();
  if (pinBuffer.length === 4 && v !== "ok") setTimeout(submitPin, 150);
});

function submitPin() {
  if (pinStage === "create") {
    pendingPin = pinBuffer; pinStage = "confirm"; pinBuffer = "";
  }
  else if (pinStage === "verify") {
    if (pinBuffer === store.get(PIN_KEY)) { pinStage = "create"; pinBuffer = ""; }
    else { toast("Wrong PIN"); pinBuffer = ""; }
  }
  else if (pinStage === "confirm") {
    if (pinBuffer === pendingPin) {
      store.set(PIN_KEY, pendingPin);
      if (changingPin) {
        changingPin = false;
        $("#lockScreen").classList.add("hidden");
        toast("Private Space PIN updated 🔒");
      } else {
        enterPrivate();
      }
    }
    else { toast("PINs didn't match — start over"); pinStage = "create"; pinBuffer = pendingPin = ""; }
  }
  else if (pinStage === "unlock") {
    if (pinBuffer === store.get(PIN_KEY)) enterPrivate();
    else { toast("Wrong PIN"); pinBuffer = ""; }
  }
  $("#lockTitle").textContent = lockTitleFor(pinStage);
  $("#pinForgot").classList.toggle("hidden", pinStage !== "unlock");
  pinBuffer = pinStage === "unlock" ? "" : pinBuffer;
  renderPinDots();
}

$("#pinForgot").addEventListener("click", () => {
  openModal(`
    <h3>Reset Private Space PIN?</h3>
    <p class="panel-sub">This removes the PIN from this device so you can set a new one. In a production build this step would also securely wipe the encrypted private data — that's what makes forgetting the PIN safe.</p>
    <input type="text" id="resetWord" placeholder="Type RESET to confirm" autocomplete="off" style="margin-bottom:12px">
    <div class="btn-row" style="justify-content:center">
      <button class="btn primary" id="resetGo">Reset PIN</button>
      <button class="btn ghost" id="resetCancel">Cancel</button>
    </div>`);
  $("#resetCancel").addEventListener("click", closeModal);
  $("#resetGo").addEventListener("click", () => {
    if ($("#resetWord").value.trim().toUpperCase() !== "RESET") return toast("Type RESET to confirm");
    localStorage.removeItem("duo_" + PIN_KEY);
    closeModal();
    exitToHub();
    toast("PIN removed — you'll set a new one next time");
  });
});

$("#changePinBtn").addEventListener("click", () => openLock(true));

function enterPrivate() {
  $("#lockScreen").classList.add("hidden");
  document.body.dataset.mode = "private";
  $("#view-hub").classList.remove("active");
  $("#view-private").classList.add("active");
  $$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === "private"));
  renderPrivate();
}

function exitToHub() {
  document.body.dataset.mode = "hub";
  $("#lockScreen").classList.add("hidden");
  $("#view-private").classList.remove("active");
  $("#view-hub").classList.add("active");
  $$(".mode-btn").forEach(b => b.classList.toggle("active", b.dataset.mode === "hub"));
}
$("#pinCancel").addEventListener("click", exitToHub);

$("#modeSwitch").addEventListener("click", (e) => {
  const btn = e.target.closest(".mode-btn");
  if (!btn) return;
  if (btn.dataset.mode === "private") openLock();
  else exitToHub();
});

/* ================= Game Hub ================= */
// Every hub game is playable as a pass-and-play modal
const GAMES = {
  memory: openMemory, sync: openSync, trivia: triviaBattle, draw: drawGuess,
  puzzle: halvesPuzzle, strategy: tictactoeDuel, scavenger: scavengerHunt,
  story: storyBuilder, playlist: playlistSwap, recipe: recipeRoulette
};
$("#gameGrid").addEventListener("click", (e) => {
  const card = e.target.closest(".game-card");
  if (card && GAMES[card.dataset.game]) GAMES[card.dataset.game]();
});

const PLAYER_NAMES = ["Alex", "Jordan"]; // [you, partner] — replaced with real names on link
function setMyName(name) {
  PLAYER_NAMES[0] = name || "You";
  store.set("playerNames", PLAYER_NAMES);
}
function setPartnerName(name) {
  PLAYER_NAMES[1] = name || PLAYER_NAMES[1];
  store.set("playerNames", PLAYER_NAMES);
  updatePartnerUI();
}
function updatePartnerUI() {
  const title = $("#chatTitle");
  if (title) title.textContent = "Encrypted chat with " + PLAYER_NAMES[1];
  renderSnaps();
}

/* ---- Modal plumbing ---- */
function openModal(html) {
  $("#gameModalBody").innerHTML = `<button class="modal-close" id="modalClose">✕</button>` + html;
  $("#gameModal").classList.remove("hidden");
  $("#modalClose").addEventListener("click", closeModal);
}
function closeModal() { $("#gameModal").classList.add("hidden"); }
$("#gameModal").addEventListener("click", (e) => { if (e.target.id === "gameModal") closeModal(); });
let dgDrawing = false; // shared flag so the window pointerup listener below stays bound once
window.addEventListener("pointerup", () => { dgDrawing = false; });

/* ---- Memory Match (co-op) ---- */
function openMemory() {
  const emojis = ["💋", "🌹", "🍷", "🌙", "🎶", "🍫"];
  const deck = [...emojis, ...emojis].sort(() => Math.random() - 0.5);
  openModal(`
    <h3>🃏 Memory Match</h3>
    <p class="panel-sub">Take turns flipping — match all six pairs together.</p>
    <div class="mem-meta"><span id="memMoves">Moves: 0</span><span id="memPairs">Pairs: 0/6</span></div>
    <div class="mem-grid">${deck.map(e => `<div class="mem-card" data-e="${e}"></div>`).join("")}</div>
    <button class="btn ghost small" id="memRestart">Restart</button>`);
  let first = null, lock = false, moves = 0, pairs = 0;
  const cards = [...$("#gameModalBody").querySelectorAll(".mem-card")];
  function flip(card) {
    if (lock || card.classList.contains("flip") || card.classList.contains("done")) return;
    card.classList.add("flip");
    card.textContent = card.dataset.e;
    if (!first) { first = card; return; }
    moves++; $("#memMoves").textContent = "Moves: " + moves;
    if (first.dataset.e === card.dataset.e) {
      first.classList.add("done"); card.classList.add("done");
      first = null; pairs++; $("#memPairs").textContent = `Pairs: ${pairs}/6`;
      if (pairs === 6) { toast(`Matched in ${moves} moves! 💞`); addAchievement("puzzle"); }
    } else {
      lock = true;
      setTimeout(() => {
        [first, card].forEach(c => { c.classList.remove("flip"); c.textContent = ""; });
        first = null; lock = false;
      }, 700);
    }
  }
  cards.forEach(c => c.addEventListener("click", () => flip(c)));
  $("#memRestart").addEventListener("click", openMemory);
}

/* ---- Sync Quiz (co-op) ---- */
const SYNC_QUESTIONS = [
  { q: "What's my go-to comfort food?", a: ["Pizza", "Chocolate", "Soup", "Ice cream"], correct: 1 },
  { q: "Which of these would I pick for a dream trip?", a: ["Beach resort", "Mountain cabin", "City food tour", "Road trip with no plan"], correct: 3 },
  { q: "What's my favorite way to spend a free evening?", a: ["Movie night", "Going out", "Cooking together", "Quiet reading side by side"], correct: 0 },
  { q: "What small gift would make my day?", a: ["Flowers", "My favorite snack", "A handwritten note", "A playlist"], correct: 2 },
  { q: "What's my love language, really?", a: ["Words", "Time", "Touch", "Acts of service"], correct: 1 }
];
let syncScore = 0, syncIndex = 0;
function openSync() {
  syncScore = 0; syncIndex = 0;
  openModal(`
    <h3>🪞 Sync Quiz</h3>
    <p class="panel-sub">Guess what Jordan answered. 5 rounds — how in sync are you?</p>
    <div id="syncBody"></div>`);
  renderSync();
}
function renderSync() {
  const body = $("#syncBody");
  if (syncIndex >= SYNC_QUESTIONS.length) {
    const pct = Math.round(syncScore / SYNC_QUESTIONS.length * 100);
    $("#syncStat").textContent = pct + "% synced";
    body.innerHTML = `<div class="sync-reveal">You're ${pct}% in sync — ${syncScore}/5 correct 💞</div>
      <button class="btn primary" id="syncAgain">Play again</button>`;
    $("#syncAgain").addEventListener("click", openSync);
    if (pct >= 80) addAchievement("heart");
    return;
  }
  const { q, a } = SYNC_QUESTIONS[syncIndex];
  body.innerHTML = `<p class="sync-q">${syncIndex + 1}. ${q}</p>
    <div class="sync-opts">${a.map((o, i) => `<button class="btn ghost sync-opt" data-i="${i}">${o}</button>`).join("")}</div>`;
  body.querySelectorAll(".sync-opt").forEach(btn => btn.addEventListener("click", () => {
    const right = +btn.dataset.i === SYNC_QUESTIONS[syncIndex].correct;
    if (right) syncScore++;
    body.querySelectorAll(".sync-opt").forEach(b => b.disabled = true);
    btn.style.borderColor = right ? "#67c587" : "#ff4d6d";
    const reveal = document.createElement("div");
    reveal.className = "sync-reveal";
    reveal.textContent = right ? "In sync! ✅ Jordan picked: " + a[SYNC_QUESTIONS[syncIndex].correct]
                               : "Not quite — Jordan picked: " + a[SYNC_QUESTIONS[syncIndex].correct];
    body.appendChild(reveal);
    const next = document.createElement("button");
    next.className = "btn primary"; next.textContent = "Next";
    next.addEventListener("click", () => { syncIndex++; renderSync(); });
    body.appendChild(next);
  }));
}

/* ---- Trivia Battle (pass-and-play versus) ---- */
const TRIVIA_BANK = [
  { q: "What's the capital of Australia?", a: ["Sydney", "Canberra", "Melbourne", "Perth"], c: 1 },
  { q: "How many hearts does an octopus have?", a: ["1", "2", "3", "4"], c: 2 },
  { q: "Which planet is the hottest in our solar system?", a: ["Mercury", "Venus", "Mars", "Jupiter"], c: 1 },
  { q: "Which country invented tea?", a: ["India", "Japan", "China", "England"], c: 2 },
  { q: "What's the largest ocean on Earth?", a: ["Atlantic", "Indian", "Arctic", "Pacific"], c: 3 },
  { q: "Which element has the symbol 'Fe'?", a: ["Gold", "Silver", "Iron", "Lead"], c: 2 },
  { q: "How many keys are on a standard piano?", a: ["76", "88", "96", "108"], c: 1 },
  { q: "What's the national animal of Scotland?", a: ["Lion", "Stag", "Unicorn", "Eagle"], c: 2 }
];
function triviaBattle() {
  const qs = [...TRIVIA_BANK].sort(() => Math.random() - 0.5).slice(0, 5);
  let idx = 0, scores = [0, 0], locked = false;
  openModal(`
    <h3>🎯 Trivia Battle</h3>
    <p class="panel-sub">Pass-and-play: alternate turns, 5 questions. Winner picks the next date night!</p>
    <div class="mem-meta"><span id="tvScore">${PLAYER_NAMES[0]} 0 – 0 ${PLAYER_NAMES[1]}</span><span id="tvTurn"></span></div>
    <div id="tvBody"></div>`);
  render();
  function render() {
    if (idx >= qs.length) {
      const [a, b] = scores;
      const msg = a === b ? "It's a tie — sudden-death date-night negotiation!" : `${a > b ? PLAYER_NAMES[0] : PLAYER_NAMES[1]} wins ${Math.max(a, b)}–${Math.min(a, b)}! 🏆 They pick the next date night.`;
      $("#tvBody").innerHTML = `<div class="sync-reveal">${msg}</div><button class="btn primary" id="tvAgain">Play again</button>`;
      $("#tvAgain").addEventListener("click", triviaBattle);
      if (a !== b) addAchievement("trivia");
      return;
    }
    const { q, a: opts, c } = qs[idx];
    $("#tvTurn").textContent = PLAYER_NAMES[idx % 2] + "'s turn";
    $("#tvBody").innerHTML = `<p class="sync-q">${idx + 1}. ${q}</p>
      <div class="sync-opts">${opts.map((o, i) => `<button class="btn ghost tv-opt" data-i="${i}">${o}</button>`).join("")}</div>
      <div class="sync-reveal" id="tvReveal"></div>`;
    locked = false;
    $("#tvBody").querySelectorAll(".tv-opt").forEach(btn => btn.addEventListener("click", () => {
      if (locked) return; locked = true;
      const right = +btn.dataset.i === c;
      if (right) scores[idx % 2]++;
      $("#tvScore").textContent = `${PLAYER_NAMES[0]} ${scores[0]} – ${scores[1]} ${PLAYER_NAMES[1]}`;
      $("#tvReveal").textContent = right ? "Correct! ✅ " + opts[c] : "Wrong — the answer was: " + opts[c];
      $("#tvBody").querySelectorAll(".tv-opt").forEach(b => b.disabled = true);
      const next = document.createElement("button");
      next.className = "btn primary"; next.textContent = "Next";
      next.addEventListener("click", () => { idx++; render(); });
      $("#tvBody").appendChild(next);
    }));
  }
}

/* ---- Draw & Guess (pass-and-play co-op) ---- */
const DRAW_WORDS = ["sunflower", "guitar", "lighthouse", "penguin", "rollercoaster", "cupcake", "telescope", "mermaid", "tornado", "campfire", "hot air balloon", "snorkeling"];
function drawGuess() {
  openModal(`
    <h3>🎨 Draw &amp; Guess</h3>
    <p class="panel-sub"><span id="dgDrawer">Alex</span> draws — <span id="dgGuesser">Jordan</span> guesses. Drawer taps the word to peek.</p>
    <div class="dg-word" id="dgWord">?</div>
    <canvas id="dgCanvas" width="380" height="260"></canvas>
    <div class="btn-row" style="justify-content:center">
      <button class="btn ghost small" id="dgClear">Clear canvas</button>
      <button class="btn ghost small" id="dgSkip">Skip word</button>
    </div>
    <form class="chat-input" id="dgForm" style="margin-top:10px">
      <input type="text" id="dgGuess" placeholder="Type your guess…" autocomplete="off">
      <button class="btn primary" type="submit">Guess</button>
    </form>
    <div class="sync-reveal" id="dgStatus"></div>`);
  let word = "", rounds = 0, solved = 0;
  const canvas = $("#dgCanvas"), ctx = canvas.getContext("2d");
  ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.strokeStyle = "#e0557a";
  const pos = (e) => {
    const r = canvas.getBoundingClientRect();
    return [(e.clientX - r.left) * canvas.width / r.width, (e.clientY - r.top) * canvas.height / r.height];
  };
  canvas.addEventListener("pointerdown", (e) => { dgDrawing = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); });
  canvas.addEventListener("pointermove", (e) => { if (!dgDrawing) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); });
  $("#dgClear").addEventListener("click", () => ctx.clearRect(0, 0, canvas.width, canvas.height));
  $("#dgWord").addEventListener("click", () => $("#dgWord").classList.toggle("show"));
  function newWord() {
    if (!$("#dgWord")) return; // modal was closed
    let next; do { next = DRAW_WORDS[Math.floor(Math.random() * DRAW_WORDS.length)]; } while (next === word);
    word = next;
    const drawer = rounds % 2, guesser = 1 - drawer;
    $("#dgWord").textContent = word;
    $("#dgWord").classList.remove("show");
    $("#dgDrawer").textContent = PLAYER_NAMES[drawer];
    $("#dgGuesser").textContent = PLAYER_NAMES[guesser];
    $("#dgGuess").placeholder = PLAYER_NAMES[guesser] + ", type your guess…";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    $("#dgStatus").textContent = "";
  }
  $("#dgSkip").addEventListener("click", () => { rounds++; newWord(); });
  $("#dgForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const guess = $("#dgGuess").value.trim().toLowerCase();
    if (!guess) return;
    $("#dgGuess").value = "";
    if (guess === word.toLowerCase()) {
      solved++; rounds++;
      $("#dgStatus").textContent = `Guessed it! 🎉 ${solved} solved — roles swap…`;
      setTimeout(() => { if ($("#dgWord")) newWord(); }, 1300);
    } else {
      $("#dgStatus").textContent = "Not it — keep guessing!";
    }
  });
  newWord();
}

/* ---- Hearts & Halves (co-op word matching) ---- */
const HALVES = [["heart", "beat"], ["sun", "shine"], ["honey", "moon"], ["key", "board"], ["star", "light"], ["rain", "bow"], ["butter", "fly"], ["fire", "work"]];
function halvesPuzzle() {
  const picks = [...HALVES].sort(() => Math.random() - 0.5).slice(0, 6);
  const lorder = picks.map((_, i) => i).sort(() => Math.random() - 0.5);
  const rorder = picks.map((_, i) => i).sort(() => Math.random() - 0.5);
  openModal(`
    <h3>🧩 Hearts &amp; Halves</h3>
    <p class="panel-sub">Co-op: tap a piece on the left, then its match on the right — build all six words together.</p>
    <div class="mem-meta"><span id="hpMoves">Tries: 0</span><span id="hpPairs">Words: 0/6</span></div>
    <div class="match-cols" id="hpWrap">
      <div id="hpLeft">${lorder.map(pi => `<button class="btn ghost hp-piece" data-side="L" data-p="${pi}">${picks[pi][0]}</button>`).join("")}</div>
      <div id="hpRight">${rorder.map(pi => `<button class="btn ghost hp-piece" data-side="R" data-p="${pi}">${picks[pi][1]}</button>`).join("")}</div>
    </div>
    <div class="sync-reveal" id="hpMsg"></div>`);
  let selL = null, tries = 0, pairs = 0;
  $("#hpWrap").addEventListener("click", (e) => {
    const piece = e.target.closest(".hp-piece");
    if (!piece || piece.disabled) return;
    if (piece.dataset.side === "L") {
      $("#hpLeft").querySelectorAll(".hp-piece").forEach(b => b.classList.remove("primary"));
      piece.classList.add("primary"); selL = +piece.dataset.p;
      return;
    }
    if (selL === null) { $("#hpMsg").textContent = "Pick a left piece first!"; return; }
    tries++; $("#hpMoves").textContent = "Tries: " + tries;
    if (+piece.dataset.p === selL) {
      const L = picks[selL];
      piece.disabled = true; piece.classList.add("hp-done"); piece.textContent = L[1];
      $("#hpLeft").querySelectorAll(".hp-piece").forEach(b => {
        if (+b.dataset.p === selL) { b.disabled = true; b.classList.add("hp-done"); b.textContent = L[0] + " ✓"; }
      });
      selL = null; pairs++; $("#hpPairs").textContent = `Words: ${pairs}/6`;
      $("#hpMsg").textContent = L.join("") + " ✓";
      if (pairs === 6) {
        const best = store.get("halvesBest", 999);
        $("#hpMsg").textContent = `Complete in ${tries} tries! 🎉` + (tries < best ? " New best!" : "");
        if (tries < best) store.set("halvesBest", tries);
        addAchievement("puzzle");
      }
    } else {
      $("#hpMsg").textContent = `“${picks[selL][0]}${picks[+piece.dataset.p][1]}” isn't a word — try again!`;
      selL = null;
    }
  });
}

/* ---- Strategy Duels: Tic-Tac-Toe (pass-and-play) ---- */
function tictactoeDuel() {
  openModal(`
    <h3>♟️ Tic-Tac-Toe Duel</h3>
    <p class="panel-sub">Pass-and-play. First to 3 round-wins takes the duel!</p>
    <div class="mem-meta"><span id="ttScore">${PLAYER_NAMES[0]} 0 – 0 ${PLAYER_NAMES[1]}</span><span id="ttTurn"></span></div>
    <div class="tt-grid" id="ttGrid"></div>
    <div class="sync-reveal" id="ttMsg"></div>`);
  const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  let board, cur, starter = 0, wins = [0, 0], over = false;
  function newRound() {
    if (!$("#ttGrid")) return; // modal closed
    board = Array(9).fill(""); cur = starter; over = false;
    $("#ttMsg").textContent = "";
    $("#ttTurn").textContent = `${PLAYER_NAMES[cur]}'s turn (${cur === 0 ? "X" : "O"})`;
    drawBoard();
  }
  function drawBoard() {
    $("#ttGrid").innerHTML = board.map((v, i) => `<button class="tt-cell" data-i="${i}" ${v || over ? "disabled" : ""}>${v}</button>`).join("");
  }
  $("#ttGrid").addEventListener("click", (e) => {
    const cell = e.target.closest(".tt-cell");
    if (!cell || over) return;
    board[+cell.dataset.i] = cur === 0 ? "X" : "O";
    const win = LINES.find(l => board[l[0]] && l.every(i => board[i] === board[l[0]]));
    if (win) {
      over = true; wins[cur]++; starter = 1 - starter;
      $("#ttScore").textContent = `${PLAYER_NAMES[0]} ${wins[0]} – ${wins[1]} ${PLAYER_NAMES[1]}`;
      const duelOver = wins[cur] >= 3;
      $("#ttMsg").textContent = duelOver ? `${PLAYER_NAMES[cur]} wins the duel! 🏆` : `${PLAYER_NAMES[cur]} takes the round!`;
      setTimeout(() => {
        if (!$("#ttGrid")) return;
        if (duelOver) { wins = [0, 0]; $("#ttScore").textContent = `${PLAYER_NAMES[0]} 0 – 0 ${PLAYER_NAMES[1]}`; }
        newRound();
      }, 1600);
    } else if (board.every(Boolean)) {
      over = true; starter = 1 - starter;
      $("#ttMsg").textContent = "Draw! Running it back…";
      setTimeout(() => { if ($("#ttGrid")) newRound(); }, 1200);
    } else {
      cur = 1 - cur;
      $("#ttTurn").textContent = `${PLAYER_NAMES[cur]}'s turn (${cur === 0 ? "X" : "O"})`;
    }
    drawBoard();
  });
  newRound();
}

/* ---- Photo Scavenger Hunt ---- */
const MISSIONS = [
  "A photo of the sky right now", "Something that smells like your partner",
  "Your favorite spot in the house", "The last thing that made you laugh",
  "A texture you both love", "Something in your favorite color",
  "The view from your window", "Your shared snack stash",
  "Something old that you both love", "Hands doing your favorite hobby"
];
function scavengerHunt() {
  const done = new Set(store.get("scavengerDone", []));
  let current = store.get("scavengerCurrent", null);
  if (!current || current.length !== 5) current = shuffle();
  openModal(`
    <h3>📸 Photo Scavenger Hunt</h3>
    <p class="panel-sub">Five missions for the week — snap each one together, then tick it off.</p>
    <div class="goal-bar" style="margin-bottom:14px"><i id="scBar"></i></div>
    <div id="scList" style="text-align:left"></div>
    <button class="btn ghost small" id="scShuffle" style="margin-top:12px">Shuffle missions</button>`);
  function shuffle() {
    const m = [...MISSIONS].sort(() => Math.random() - 0.5).slice(0, 5);
    store.set("scavengerCurrent", m);
    return m;
  }
  function render() {
    $("#scList").innerHTML = current.map(m =>
      `<label class="toggle" style="justify-content:flex-start;margin:8px 0">
        <input type="checkbox" data-m="${m}" ${done.has(m) ? "checked" : ""}> ${m}
      </label>`).join("");
    const n = current.filter(m => done.has(m)).length;
    $("#scBar").style.width = (n / 5 * 100) + "%";
    if (n === 5) toast("Hunt complete! 📸💕");
  }
  $("#scList").addEventListener("change", (e) => {
    const m = e.target.dataset.m;
    if (e.target.checked) done.add(m); else done.delete(m);
    store.set("scavengerDone", [...done]);
    render();
  });
  $("#scShuffle").addEventListener("click", () => { current = shuffle(); render(); });
  render();
}

/* ---- Story Builder ---- */
function storyBuilder() {
  const SEEDS = [
    "It started with a knock at the door at 3 a.m.",
    "The letter had no stamp — only a pressed rose.",
    "Nobody expected the lighthouse keeper to retire like that.",
    "Our cat brought home something impossible.",
    "The farmer's market was closing when the sky turned green."
  ];
  let story = store.get("storyCurrent", null);
  if (!story) story = { seed: SEEDS[Math.floor(Math.random() * SEEDS.length)], lines: [] };
  openModal(`
    <h3>📖 Story Builder</h3>
    <p class="panel-sub">Take turns adding one sentence each — the wilder, the better.</p>
    <div class="mem-meta"><span id="sbTurn"></span><span id="sbCount"></span></div>
    <div class="story-box" id="sbStory"></div>
    <form class="chat-input" id="sbForm">
      <input type="text" id="sbInput" placeholder="Add one sentence…" autocomplete="off">
      <button class="btn primary" type="submit">Add</button>
    </form>
    <div class="btn-row" style="justify-content:center;margin-top:10px">
      <button class="btn ghost small" id="sbUndo">Undo last</button>
      <button class="btn ghost small" id="sbNew">New story</button>
    </div>`);
  function render() {
    $("#sbStory").innerHTML = `<p>${story.seed}</p>` +
      story.lines.map((l, i) => `<p>${l} <span class="sb-by">— ${PLAYER_NAMES[i % 2]}</span></p>`).join("");
    $("#sbTurn").textContent = PLAYER_NAMES[story.lines.length % 2] + "'s turn";
    $("#sbCount").textContent = story.lines.length + " lines";
    const box = $("#sbStory"); box.scrollTop = box.scrollHeight;
  }
  $("#sbForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#sbInput").value.trim();
    if (!v) return;
    story.lines.push(v); store.set("storyCurrent", story);
    $("#sbInput").value = ""; render();
    if (story.lines.length >= 10) toast("Ten lines — a perfect little story 📖");
  });
  $("#sbUndo").addEventListener("click", () => { story.lines.pop(); store.set("storyCurrent", story); render(); });
  $("#sbNew").addEventListener("click", () => {
    story = { seed: SEEDS[Math.floor(Math.random() * SEEDS.length)], lines: [] };
    store.set("storyCurrent", story); render();
  });
  render();
}

/* ---- Playlist Swap ---- */
function playlistSwap() {
  openModal(`
    <h3>🎵 Playlist Swap</h3>
    <p class="panel-sub">Each of you secretly builds a 5-song playlist. Hide, build, then reveal together.</p>
    <div class="btn-row" style="justify-content:center" id="plWho">
      <button class="btn small pl-tab primary" data-w="0">${PLAYER_NAMES[0]}'s list</button>
      <button class="btn small pl-tab" data-w="1">${PLAYER_NAMES[1]}'s list</button>
    </div>
    <form class="chat-input" id="plForm" style="margin-top:10px">
      <input type="text" id="plInput" placeholder="Song — artist" autocomplete="off">
      <button class="btn primary" type="submit">Add</button>
    </form>
    <div id="plList" style="text-align:left;margin-top:12px"></div>
    <div class="btn-row" style="justify-content:center;margin-top:6px">
      <button class="btn primary" id="plReveal">Reveal both lists 🎁</button>
      <button class="btn ghost small" id="plHide">Hide again</button>
    </div>`);
  let who = 0, revealed = false;
  const lists = () => store.get("playlists", { 0: [], 1: [] });
  function render() {
    const l = lists();
    $$(".pl-tab").forEach((b, i) => b.classList.toggle("primary", i === who && !revealed));
    $("#plForm").style.visibility = revealed ? "hidden" : "visible";
    $("#plList").innerHTML = revealed
      ? `<div class="match-cols">
          <div><b>${PLAYER_NAMES[0]} picked:</b><ol class="saved-list">${l[0].map(s => `<li>${s}</li>`).join("") || "<li><i>nothing yet</i></li>"}</ol></div>
          <div><b>${PLAYER_NAMES[1]} picked:</b><ol class="saved-list">${l[1].map(s => `<li>${s}</li>`).join("") || "<li><i>nothing yet</i></li>"}</ol></div>
        </div>`
      : `<ul class="saved-list">${l[who].map(s => `<li>🎵 ${s}</li>`).join("") || "<li><i>No songs yet</i></li>"}</ul>`;
  }
  $("#plWho").addEventListener("click", (e) => {
    const b = e.target.closest(".pl-tab");
    if (b) { who = +b.dataset.w; render(); }
  });
  $("#plForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("#plInput").value.trim();
    if (!v) return;
    const l = lists(); l[who].push(v); store.set("playlists", l);
    $("#plInput").value = ""; render();
  });
  $("#plReveal").addEventListener("click", () => { revealed = true; render(); });
  $("#plHide").addEventListener("click", () => { revealed = false; render(); });
  render();
}

/* ---- Recipe Roulette ---- */
const RECIPES = [
  ["Homemade ramen", "Japanese"], ["Wood-fired margherita", "Italian"], ["Chicken mole", "Mexican"],
  ["Butter chicken", "Indian"], ["Dutch baby pancake", "Breakfast-for-dinner"], ["Dumplings from scratch", "Chinese"],
  ["Paella", "Spanish"], ["Shakshuka", "Middle Eastern"], ["Beef bourguignon", "French"], ["Pad thai", "Thai"]
];
function recipeRoulette() {
  const cooked = () => store.get("recipesCooked", 0);
  openModal(`
    <h3>🍳 Recipe Roulette</h3>
    <p class="panel-sub">One rolls the recipe, the kitchen decides the roles. No takeout escape routes!</p>
    <div class="dice-result" id="rrResult">Ready to roll?</div>
    <p class="panel-sub" id="rrRoles" style="text-align:center;margin:6px 0"></p>
    <div class="btn-row" style="justify-content:center">
      <button class="btn primary" id="rrRoll">Roll a recipe</button>
      <button class="btn ghost small" id="rrSwap">Swap roles</button>
      <button class="btn ghost small" id="rrCooked">We cooked it! 🍽️</button>
    </div>
    <p class="panel-sub" style="margin-top:12px;text-align:center" id="rrCount"></p>`);
  let chef = 0, current = null;
  function render() {
    $("#rrCount").textContent = `Meals cooked together so far: ${cooked()}`;
    $("#rrRoles").textContent = current ? `${PLAYER_NAMES[chef]} is head chef, ${PLAYER_NAMES[1 - chef]} is sous-chef 👨‍🍳` : "";
    const stat = $("#recipeStat");
    if (stat) stat.textContent = cooked() + " recipes cooked";
  }
  $("#rrRoll").addEventListener("click", () => {
    current = RECIPES[Math.floor(Math.random() * RECIPES.length)];
    $("#rrResult").innerHTML = `${current[0]}<br><small style="font-weight:400">${current[1]} cuisine</small>`;
    chef = Math.random() < 0.5 ? 0 : 1;
    render();
  });
  $("#rrSwap").addEventListener("click", () => { chef = 1 - chef; render(); });
  $("#rrCooked").addEventListener("click", () => {
    if (!current) return toast("Roll a recipe first!");
    store.set("recipesCooked", cooked() + 1);
    render(); toast("Another one for the books 🍽️");
  });
  render();
}

/* ---- Love language quiz ---- */
const LOVE_LANG_QUESTIONS = [
  { q: "After a long week, what helps most?", a: { words: "Hearing 'I'm proud of you'", time: "Undistracted time together", gifts: "A small thoughtful surprise", acts: "Chores handled for me", touch: "A long hug" } },
  { q: "You feel most appreciated when your partner…", a: { words: "Says it out loud", time: "Plans a day just for us", gifts: "Brings home my favorite treat", acts: "Does something on my list", touch: "Reaches for my hand" } },
  { q: "Which would hurt most to go without?", a: { words: "Compliments and praise", time: "Our weekly date", gifts: "Little mementos", acts: "Shared everyday tasks", touch: "Casual affection" } },
  { q: "On a tough day, your partner should…", a: { words: "Reassure me with words", time: "Sit with me quietly", gifts: "Bring home comfort food", acts: "Take something off my plate", touch: "Hold me" } },
  { q: "Your ideal grand gesture is…", a: { words: "A heartfelt letter", time: "A surprise weekend away", gifts: "Something saved up for", acts: "A day where I do nothing", touch: "Dancing close in the kitchen" } }
];
let llIndex = -1;
let llAnswers = { you: {}, partner: {} }; // partner answers pre-filled for the demo

$("#loveLangStart").addEventListener("click", () => { llIndex = 0; renderLoveLang(); });

function renderLoveLang() {
  const body = $("#loveLangBody");
  if (llIndex < 0) return;
  if (llIndex >= LOVE_LANG_QUESTIONS.length) {
    const counts = Object.values(llAnswers.you).reduce((acc, v) => (acc[v] = (acc[v] || 0) + 1, acc), {});
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
    const labels = { words: "Words of Affirmation 💬", time: "Quality Time ⏰", gifts: "Gifts 🎁", acts: "Acts of Service 🛠️", touch: "Physical Touch 🤝" };
    const pCounts = Object.values(llAnswers.partner).reduce((acc, v) => (acc[v] = (acc[v] || 0) + 1, acc), {});
    const pTop = Object.entries(pCounts).sort((a, b) => b[1] - a[1])[0][0];
    body.innerHTML = `
      <p><b>Your love language:</b> ${labels[top]}</p>
      <p style="margin:8px 0"><b>Jordan's:</b> ${labels[pTop]}</p>
      <p class="panel-sub" style="margin-bottom:10px">Compare with your partner and talk about one way to speak each other's language this week.</p>
      <button class="btn ghost" id="llRetake">Retake</button>`;
    $("#llRetake").addEventListener("click", () => { llIndex = 0; renderLoveLang(); });
    addAchievement("heart");
    toast("Achievement unlocked: Know Thy Partner 🎖️");
    return;
  }
  const { q, a } = LOVE_LANG_QUESTIONS[llIndex];
  body.innerHTML = `
    <p class="panel-sub">Question ${llIndex + 1} of ${LOVE_LANG_QUESTIONS.length}</p>
    <p style="margin-bottom:12px"><b>${q}</b></p>
    <div class="btn-row" style="flex-direction:column;align-items:stretch">
      ${Object.entries(a).map(([k, label]) => `<button class="btn ghost ll-opt" data-k="${k}" style="text-align:left">${label}</button>`).join("")}
    </div>`;
  body.querySelectorAll(".ll-opt").forEach(btn => btn.addEventListener("click", () => {
    llAnswers.you[llIndex] = btn.dataset.k;
    llIndex++; renderLoveLang();
  }));
}

/* ---- Date night spinner ---- */
const DEFAULT_SPINNER = ["Cook a new recipe together", "Movie night, partner's pick", "Sunset walk + ice cream", "Board game café", "Try a new cuisine", "Recreate our first date"];
function spinnerOptions() { return store.get("spinner", DEFAULT_SPINNER); }

$("#spinnerSpin").addEventListener("click", () => {
  const opts = spinnerOptions();
  if (!opts.length) return toast("Add some options first");
  const wheel = $("#spinnerWheel");
  let spins = 0, finalPick = opts[0];
  const iv = setInterval(() => {
    spins++;
    finalPick = opts[Math.floor(Math.random() * opts.length)];
    $("#spinnerResult").textContent = finalPick;
    wheel.style.transform = `rotate(${spins * 137}deg) scale(${1 + (spins % 3) * 0.06})`;
    if (spins > 12) { clearInterval(iv); wheel.style.transform = ""; toast("Date night decided! 🎡"); netSend("spinner", { text: finalPick }); }
  }, 90);
});
$("#spinnerSave").addEventListener("click", () => {
  const opts = $("#spinnerOptions").value.split("\n").map(s => s.trim()).filter(Boolean);
  store.set("spinner", opts.length ? opts : DEFAULT_SPINNER);
  $("#spinnerOptions").value = (opts.length ? opts : DEFAULT_SPINNER).join("\n");
  toast("Spinner options saved");
});

/* ---- Conversation starters ---- */
const STARTERS = [
  "What's a small thing I do that makes your day better?",
  "What's a memory of us you replay the most?",
  "If we could teleport anywhere for dinner tonight, where?",
  "What's something you want to learn together this year?",
  "When did you first know you liked me?",
  "What does your perfect lazy Sunday with me look like?",
  "What's a dream you haven't told me about yet?"
];
let starterIdx = 0;
const savedStarters = () => store.get("starters", []);
$("#starterNext").addEventListener("click", () => {
  starterIdx = (starterIdx + 1) % STARTERS.length;
  $("#starterText").textContent = `“${STARTERS[starterIdx]}”`;
  netSend("starter", { index: starterIdx });
});
$("#starterFav").addEventListener("click", () => {
  const list = savedStarters();
  const text = STARTERS[starterIdx];
  if (list.includes(text)) return toast("Already saved");
  list.push(text); store.set("starters", list); renderSavedStarters();
  toast("Saved to favorites ♡");
});
function renderSavedStarters() {
  const list = savedStarters();
  $("#starterCount").textContent = list.length;
  $("#starterSaved").innerHTML = list.map(s => `<li>♡ ${s}</li>`).join("") || "<li><i>Nothing saved yet</i></li>";
}

/* ---- Milestones & achievements ---- */
let milestones = () => store.get("milestones", [
  { icon: "💍", label: "First date", when: "Mar 2023" },
  { icon: "🏠", label: "Moved in together", when: "Jan 2024" },
  { icon: "✈️", label: "First trip abroad", when: "Sep 2024" },
  { icon: "🎂", label: "3-year anniversary", when: "in 174 days" }
]);
function renderMilestones() {
  $("#milestoneList").innerHTML = milestones().map(m =>
    `<li><span>${m.icon}</span><span>${m.label}</span><span class="when">${m.when}</span></li>`).join("");
}
$("#addMilestone").addEventListener("click", () => {
  const label = prompt("Milestone (e.g. 'Anniversary dinner')");
  if (!label) return;
  const list = milestones(); list.push({ icon: "⭐", label, when: "today" });
  store.set("milestones", list); renderMilestones(); toast("Milestone added 🏆");
});

const ACHIEVEMENTS = [
  { id: "streak", ico: "🔥", label: "7-day streak", locked: false },
  { id: "trivia", ico: "🎯", label: "Trivia winner", locked: false },
  { id: "heart", ico: "💗", label: "Know Thy Partner", locked: true },
  { id: "puzzle", ico: "🧩", label: "Puzzle masters", locked: false },
  { id: "night", ico: "🌙", label: "10 date nights", locked: true },
  { id: "vault", ico: "🗝️", label: "Vault keeper", locked: true }
];
function renderAchievements() {
  $("#achGrid").innerHTML = ACHIEVEMENTS.map(a =>
    `<div class="ach ${a.locked ? "locked" : ""}" id="ach-${a.id}"><span class="ico">${a.ico}</span>${a.label}</div>`).join("");
}
function addAchievement(id) {
  const a = ACHIEVEMENTS.find(x => x.id === id);
  if (a) a.locked = false;
  renderAchievements();
}

/* ---- Social ---- */
function renderSocial() {
  const board = store.get("leaderboard", [
    { name: "Mia & Sam", pts: 4820 }, { name: "Alex & Jordan (you)", pts: 4310, me: true },
    { name: "Rae & Kim", pts: 3990 }, { name: "Dan & Lou", pts: 3520 }, { name: "Zoe & Max", pts: 3100 }
  ]);
  $("#leaderboard").innerHTML = board.map(r =>
    `<li class="${r.me ? "me" : ""}"><span>${r.name}</span><span class="pts">${r.pts.toLocaleString()} pts</span></li>`).join("");
  const friends = store.get("friends", [
    { ico: "🦊", name: "Mia & Sam", note: "online · playing Trivia" },
    { ico: "🐨", name: "Rae & Kim", note: "streak: 12 days" },
    { ico: "🐧", name: "Dan & Lou", note: "invited you to Draw & Guess" }
  ]);
  $("#friendList").innerHTML = friends.map(f => `<li><span style="font-size:22px">${f.ico}</span><div><b>${f.name}</b><div style="color:var(--muted);font-size:12px">${f.note}</div></div></li>`).join("");
  const goals = store.get("goals", [
    { label: "Weekly date night", pct: 80 }, { label: "Read together", pct: 45 },
    { label: "Save for Japan trip", pct: 62 }, { label: "Cook 12 new recipes", pct: 25 }
  ]);
  $("#goalList").innerHTML = goals.map(g =>
    `<li><span style="width:120px">${g.label}</span><span class="goal-bar"><i style="width:${g.pct}%"></i></span><span style="color:var(--muted);font-size:12px">${g.pct}%</span></li>`).join("");
}
$("#inviteFriends").addEventListener("click", () => toast("Invite link copied (demo)"));
$("#addGoal").addEventListener("click", () => {
  const label = prompt("New relationship goal");
  if (!label) return;
  const goals = store.get("goals", []); goals.push({ label, pct: 0 });
  store.set("goals", goals); renderSocial();
});

/* ================= Private Space ================= */
function renderPrivate() { /* content is rendered on demand per tab */ }

$("#privateNav").addEventListener("click", (e) => {
  const btn = e.target.closest(".subnav-btn");
  if (!btn) return;
  $$(".subnav-btn").forEach(b => b.classList.toggle("active", b === btn));
  $$("#view-private .tab").forEach(t => t.classList.toggle("active", t.id === "tab-" + btn.dataset.tab));
  netSend("tab", { tab: btn.dataset.tab });
});

/* ---- Encrypted chat (local demo) ---- */
const chatLog = $("#chatLog");
function renderChat() {
  const msgs = store.get("chat", [
    { from: "them", text: "That photo from last night 😍", t: "21:04", ephemeral: true },
    { from: "me", text: "Shhh, that stays between us 😏", t: "21:05" }
  ]);
  chatLog.innerHTML = msgs.map(m =>
    `<div class="msg ${m.from} ${m.ephemeral ? "ephemeral" : ""}">${m.text}<span class="t">🔑 ${m.t}${m.ephemeral ? " · vanishes in 24h" : ""}</span></div>`).join("");
  chatLog.scrollTop = chatLog.scrollHeight;
}
$("#chatForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("#chatText").value.trim();
  if (!text) return;
  const msgs = store.get("chat", []);
  const autoDelete = $("#autoDeleteToggle").checked;
  const msg = { from: "me", text, t: new Date().toTimeString().slice(0, 5), ephemeral: autoDelete };
  msgs.push(msg);
  store.set("chat", msgs); renderChat();
  netSend("chat", { text, t: msg.t, ephemeral: autoDelete });
  $("#chatText").value = "";
  if (NET.connected) return; // real partner is on the other end — no demo replies
  setTimeout(() => {
    const replies = ["Only for you 💕", "Saving that one 😌", "See you tonight then 😏", "You always know what to say"];
    const rmsg = { from: "them", text: replies[Math.floor(Math.random() * replies.length)], t: new Date().toTimeString().slice(0, 5), ephemeral: autoDelete };
    msgs.push(rmsg);
    store.set("chat", msgs); renderChat();
  }, 1200);
});

/* ---- Truth or dare ---- */
const TOD = {
  sweet: {
    truth: ["What was your first impression of me?", "What's a moment with me you'll never forget?", "What do you find cutest about me that I don't know?"],
    dare: ["Write me a 3-line poem right now", "Send me your favorite photo of us", "Give me a 30-second shoulder massage"]
  },
  spicy: {
    truth: ["What's a compliment you wish I'd give you more often?", "When do you feel most wanted by me?", "What's a date idea you've been too shy to suggest?"],
    dare: ["Slow dance with me to one song", "Whisper your favorite thing about me", "Kiss me somewhere you haven't in a while"]
  },
  bold: {
    truth: ["What's something new you'd like us to try together?", "What memory of us makes you smile every time?", "What do you think about when we're apart?"],
    dare: ["Let me pick your outfit for our next date", "Trade one fantasy idea each — no judgment, just listening", "Set the mood: you control lights, music and candles tonight"]
  },
  inferno: {
    truth: ["What's a scenario you've imagined for us but never dared to say out loud?", "What's the most daring place you'd want to kiss me?", "Describe your perfect night with me — no filters, no limits.", "What's one thing you've wanted me to do but been too shy to ask?"],
    dare: ["Trade control for one hour: one of you calls every shot, the other says yes", "Blindfold your partner and surprise them with three different sensations", "Take a shower together — phones stay outside", "Give a slow full-body massage, no talking, music only — no reciprocation expected", "Recreate your first kiss — but slower, and somewhere new"]
  }
};
let todLevel = null;
$("#todLevels").addEventListener("click", (e) => {
  const btn = e.target.closest(".level-btn");
  if (!btn) return;
  if (btn.dataset.level === "bold" && !btn.classList.contains("on")) {
    if (!confirm("Both partners must consent to unlock the Bold level. Continue?")) return;
  }
  if (btn.dataset.level === "inferno" && !btn.classList.contains("on")) {
    openInfernoGate(btn);
    return;
  }
  todLevel = btn.dataset.level;
  $$(".level-btn").forEach(b => b.classList.toggle("on", b === btn));
  $("#todResult").textContent = "Level ready — draw Truth or Dare.";
  netSend("todLevel", { level: todLevel });
});
/* ---- Inferno typed-consent gate ---- */
function openInfernoGate(btn) {
  openModal(`
    <h3>💥 Unlock Inferno</h3>
    <p class="panel-sub">This level contains extremely spicy content. It stays locked until <b>both partners</b> actively opt in — every session, on every device.</p>
    <label class="toggle" style="justify-content:center;margin-bottom:10px">
      <input type="checkbox" id="infernoMine"> I consent to this level
    </label>
    <label class="toggle" style="justify-content:center;margin-bottom:14px">
      <input type="checkbox" id="infernoTheirs"> My partner has consented to this level
    </label>
    <input type="text" id="infernoWord" placeholder="Type YES to confirm" autocomplete="off" style="margin-bottom:12px">
    <div class="btn-row" style="justify-content:center">
      <button class="btn primary" id="infernoConfirm">Unlock</button>
      <button class="btn ghost" id="infernoCancel">Keep it locked</button>
    </div>`);
  $("#infernoCancel").addEventListener("click", closeModal);
  $("#infernoConfirm").addEventListener("click", () => {
    const word = $("#infernoWord").value.trim().toUpperCase();
    if (!$("#infernoMine").checked || !$("#infernoTheirs").checked || word !== "YES") {
      return toast("Both checkboxes and a typed YES are required");
    }
    store.set("infernoConsent", true);
    todLevel = "inferno";
    $$(".level-btn").forEach(b => b.classList.toggle("on", b === btn));
    $("#todResult").textContent = "Inferno ready — draw Truth or Dare.";
    closeModal();
    toast("Inferno unlocked for this couple 💥");
  });
}

function drawTod(kind) {
  if (!todLevel) return toast("Pick a level first");
  const pool = TOD[todLevel][kind];
  const text = pool[Math.floor(Math.random() * pool.length)];
  $("#todResult").textContent = text;
  netSend("tod", { text });
}
$("#todTruth").addEventListener("click", () => drawTod("truth"));
$("#todDare").addEventListener("click", () => drawTod("dare"));

/* ---- Countdown / anticipation ---- */
let cdTimer = null;
function fmt(sec) {
  const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function startCountdown(minutes, hint) {
  clearInterval(cdTimer);
  let remain = minutes * 60;
  if (hint) toast(`Hint sent to ${partnerLabel()}: “${hint}”`);
  const tick = () => {
    const el = $("#countdownDisplay");
    if (!el) return;
    el.textContent = fmt(remain);
    if (remain-- <= 0) { clearInterval(cdTimer); el.textContent = "It's time 🎉"; toast("Countdown finished — time to reveal!"); }
  };
  tick();
  cdTimer = setInterval(tick, 1000);
}
$("#countdownStart").addEventListener("click", () => {
  const minutes = parseInt($("#countdownMinutes").value, 10);
  const hint = $("#countdownHint").value.trim();
  startCountdown(minutes, hint);
  netSend("countdown", { minutes, hint });
});
$("#countdownStop").addEventListener("click", () => { clearInterval(cdTimer); $("#countdownDisplay").textContent = "00:00"; netSend("countdownStop"); });

/* ---- Roll the dice (with After Dark pack) ---- */
const DICE_WHERE = ["neck", "lips", "shoulder", "back", "hand", "ear"];
const DICE_HOW = ["a slow kiss", "a gentle massage", "a whispered compliment", "a fingertip trace", "a warm breath", "10 adoring seconds"];
const DICE_HOW_DARK = ["a trail of slow kisses", "a 60-second embrace with no words", "a whispered fantasy", "a slow, deliberate undressing of one layer", "hands tracing every curve you love", "a kiss that lingers just long enough"];
$("#diceRoll").addEventListener("click", () => {
  const dark = $("#diceAfterDark").checked;
  const hows = dark ? [...DICE_HOW, ...DICE_HOW_DARK] : DICE_HOW;
  const where = DICE_WHERE[Math.floor(Math.random() * DICE_WHERE.length)];
  const how = hows[Math.floor(Math.random() * hows.length)];
  const text = `${how.charAt(0).toUpperCase() + how.slice(1)} — on the ${where} 💞`;
  $("#diceResult").textContent = text;
  netSend("dice", { text });
});

/* ---- Kiss roulette ---- */
const KISSES = ["The slow kiss", "The surprise kiss from behind", "The forehead kiss", "The 10-second kiss", "The upside-down kiss (lying down)", "The butterfly kiss (eyelashes!)", "The lingering goodnight kiss", "The kiss + one honest compliment"];
$("#kissSpin").addEventListener("click", () => {
  const kisses = KISSES.filter(k => k !== $("#kissResult").textContent);
  const text = kisses[Math.floor(Math.random() * kisses.length)] + " 😘";
  $("#kissResult").textContent = text;
  netSend("kiss", { text });
});

/* ---- Would you rather (with After Dark pack) ---- */
const WYR = [
  "…wake up to a kiss or fall asleep in a hug?",
  "…have a surprise date night or plan one together?",
  "…recreate your first date or invent a brand-new tradition?",
  "…get a love letter or a surprise gift?",
  "…dance in the kitchen at 2am or watch the sunrise together?",
  "…never argue again or never have a boring day again?"
];
const WYR_DARK = [
  "…be in charge tonight or hand over control completely?",
  "…be teased all day with nothing more, or get everything all at once?",
  "…have a night where anything goes, or a night of slow anticipation?",
  "…kiss somewhere you never have, or be kissed somewhere you never have?",
  "…tell me your biggest fantasy or act out mine first?",
  "…stay up until sunrise together or be woken up at 3am?"
];
$("#wyrNext").addEventListener("click", () => {
  const pool = $("#wyrAfterDark").checked ? [...WYR, ...WYR_DARK] : WYR;
  const text = "Would you rather " + pool[Math.floor(Math.random() * pool.length)];
  $("#wyrResult").textContent = text;
  netSend("wyr", { text });
});

/* ---- Sensation spinner ---- */
const SENS_HOW = ["A feather-light fingertip touch", "A trail of warm breath", "An ice cube held in lips", "A silk ribbon drawn slowly", "A whisper against skin", "A slow two-hand massage", "Ten seconds of only goosebumps", "A blindfolded mystery touch"];
const SENS_WHERE = ["along the neck", "down the spine", "across the shoulders", "on the inner wrist", "over the collarbone", "on the palm", "behind the knee", "across the lips"];
$("#sensSpin").addEventListener("click", () => {
  const how = SENS_HOW[Math.floor(Math.random() * SENS_HOW.length)];
  const where = SENS_WHERE[Math.floor(Math.random() * SENS_WHERE.length)];
  const text = `${how} — ${where} 🌡️`;
  $("#sensResult").textContent = text;
  netSend("sens", { text });
});

/* ---- Fantasy builder ---- */
const FANT_A = ["A rainy cabin night", "A candlelit kitchen at midnight", "A hotel room in a city neither of you knows", "A slow morning with nowhere to be", "A summer storm on the porch", "A locked bedroom and a do-not-disturb sign"];
const FANT_B = ["…where you're completely in charge", "…with a blindfold and a playlist", "…with dessert eaten very slowly", "…where every request starts with 'will you…'", "…with phones off until sunrise", "…where you trade three fantasies out loud"];
$("#fantBlend").addEventListener("click", () => {
  const text = FANT_A[Math.floor(Math.random() * FANT_A.length)] + FANT_B[Math.floor(Math.random() * FANT_B.length)] + " 🔮";
  $("#fantResult").textContent = text;
  netSend("fant", { text });
});

/* ---- After Dark toggles require the same typed dual consent as Inferno ---- */
[["#diceAfterDark", "the After Dark dice pack"], ["#wyrAfterDark", "the After Dark Would-You-Rather pack"]].forEach(([sel, label]) => {
  $(sel).addEventListener("change", (e) => {
    if (!e.target.checked || e.target.dataset.unlocked === "1") return;
    e.target.checked = false;
    openModal(`
      <h3>🌙 Unlock ${label}?</h3>
      <p class="panel-sub">This pack contains extremely spicy content. Both partners must opt in.</p>
      <label class="toggle" style="justify-content:center;margin-bottom:10px"><input type="checkbox" id="adMine"> I consent</label>
      <label class="toggle" style="justify-content:center;margin-bottom:14px"><input type="checkbox" id="adTheirs"> My partner has consented</label>
      <input type="text" id="adWord" placeholder="Type YES to confirm" autocomplete="off" style="margin-bottom:12px">
      <div class="btn-row" style="justify-content:center">
        <button class="btn primary" id="adGo">Unlock</button>
        <button class="btn ghost" id="adCancel">Keep it locked</button>
      </div>`);
    $("#adCancel").addEventListener("click", closeModal);
    $("#adGo").addEventListener("click", () => {
      if (!$("#adMine").checked || !$("#adTheirs").checked || $("#adWord").value.trim().toUpperCase() !== "YES") {
        return toast("Both checkboxes and a typed YES are required");
      }
      $(sel).dataset.unlocked = "1";
      $(sel).checked = true;
      closeModal();
      toast(`${label} unlocked 🌙`);
    });
  });
});

/* ---- Snap feed, snaps & dare requests (private space) ---- */
const SNAP_DARES = [
  "A photo that shows exactly how you're dressed right now",
  "The view from where you'd want my hands to be",
  "Your best 'come here' look — lips included",
  "A sneak preview of what's under today's outfit",
  "The part of you you most want me to kiss tonight",
  "A mirror shot of whatever (or whoever) you're wearing",
  "Something you'd only dare to show me",
  "Your lips, mid-thought about tonight",
  "The first thing you'd take off if I were there",
  "Whatever pose makes you feel dangerous"
];
let currentSnapDare = null;

function snapsList() { return store.get("snaps", []); }
function saveSnaps(list) { store.set("snaps", list); }

function purgeSnaps() {
  const list = snapsList();
  const kept = list.filter(s => !s.expiresAt || s.expiresAt > Date.now());
  if (kept.length !== list.length) saveSnaps(kept);
  return kept;
}

function renderSnaps() {
  const feed = $("#snapFeed");
  if (!feed) return;
  const list = purgeSnaps();
  if (!list.length) {
    feed.innerHTML = `<p class="panel-sub" style="text-align:center">Nothing here yet — send something 📸</p>`;
    return;
  }
  feed.innerHTML = list.slice().reverse().map(s => {
    const when = s.t || "";
    if (s.kind === "dare") {
      const incoming = s.from === "them";
      let body;
      if (s.status === "pending") {
        body = incoming
          ? `<p class="snap-dare-text">"${s.text}"</p>
             <div class="btn-row" style="justify-content:center">
               <button class="btn primary small" data-dare-accept="${s.id}">Accept — I'll send it 💕</button>
               <button class="btn ghost small" data-dare-decline="${s.id}">Decline</button>
             </div>`
          : `<p class="snap-dare-text">You dared: "${s.text}"</p><p class="panel-sub" style="text-align:center">waiting for their answer…</p>`;
      } else if (s.status === "declined") {
        body = `<p class="snap-dare-text">"${s.text}"</p><p class="panel-sub" style="text-align:center">${incoming ? "you declined — all good 🤍" : PLAYER_NAMES[1] + " declined — never ask twice 🤍"}</p>`;
      } else if (s.status === "fulfilled") {
        body = `<p class="snap-dare-text">"${s.text}"</p><p class="panel-sub" style="text-align:center">${incoming ? "they sent it 👀" : "you fulfilled it 💕"}</p>`;
      }
      return `<div class="snap-card dare">${body}<span class="snap-when">${when}</span></div>`;
    }
    return `<div class="snap-card">
      <img src="${s.img}" alt="snap" class="snap-img">
      <span class="snap-when">${s.from === "them" ? "from " + PLAYER_NAMES[1] : "from you"} · ${when}${s.expiresAt ? " · auto-deletes" : ""}</span>
    </div>`;
  }).join("");
}

function addSnap(entry) {
  const list = snapsList();
  list.push(entry);
  saveSnaps(list);
  renderSnaps();
}

function resizeImageFile(file, cb) {
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      const max = 720;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      cb(canvas.toDataURL("image/jpeg", 0.75));
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function sendSnapImage(dataURL) {
  const minutes = parseInt($("#snapDeleteTimer").value, 10);
  const entry = {
    id: "s" + Date.now() + Math.floor(Math.random() * 999),
    kind: "snap", from: "me", img: dataURL,
    t: new Date().toTimeString().slice(0, 5),
    expiresAt: minutes ? Date.now() + minutes * 60000 : null
  };
  addSnap(entry);
  netSend("snap", { id: entry.id, img: dataURL, t: entry.t, minutes });
  toast("Snap sent — device to device, encrypted 🔐");
}

$("#snapFile").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  resizeImageFile(file, sendSnapImage);
  e.target.value = "";
});

// test hook (also used for programmatic sends): window.sendSnapData(dataURL)
window.sendSnapData = sendSnapImage;

$("#snapGateOpen").addEventListener("click", () => {
  openModal(`
    <h3>🔞 Unlock Snap Dares?</h3>
    <p class="panel-sub">Extremely spicy photo dares. Both partners must opt in — and consent is per dare: either of you can decline any request, any time, no questions asked.</p>
    <label class="toggle" style="justify-content:center;margin-bottom:10px"><input type="checkbox" id="sgMine"> I consent</label>
    <label class="toggle" style="justify-content:center;margin-bottom:14px"><input type="checkbox" id="sgTheirs"> My partner has consented</label>
    <input type="text" id="sgWord" placeholder="Type YES to confirm" autocomplete="off" style="margin-bottom:12px">
    <div class="btn-row" style="justify-content:center">
      <button class="btn primary" id="sgGo">Unlock</button>
      <button class="btn ghost" id="sgCancel">Keep it locked</button>
    </div>`);
  $("#sgCancel").addEventListener("click", closeModal);
  $("#sgGo").addEventListener("click", () => {
    if (!$("#sgMine").checked || !$("#sgTheirs").checked || $("#sgWord").value.trim().toUpperCase() !== "YES") {
      return toast("Both checkboxes and a typed YES are required");
    }
    store.set("snapsConsent", true);
    unlockSnapDares();
    closeModal();
    toast("Snap Dares unlocked 🔞");
  });
});

function unlockSnapDares() {
  if (!store.get("snapsConsent", false)) return;
  $("#snapGate").classList.add("hidden");
  $("#snapDareUI").classList.remove("hidden");
}

$("#snapDareDraw").addEventListener("click", () => {
  let dare; do { dare = SNAP_DARES[Math.floor(Math.random() * SNAP_DARES.length)]; } while (dare === currentSnapDare);
  currentSnapDare = dare;
  $("#snapDareText").textContent = `"${dare}"`;
  $("#snapDareSend").style.display = "";
});

$("#snapDareSend").addEventListener("click", () => {
  if (!currentSnapDare) return;
  const entry = {
    id: "d" + Date.now(), kind: "dare", from: "me",
    text: currentSnapDare, status: "pending",
    t: new Date().toTimeString().slice(0, 5)
  };
  addSnap(entry);
  netSend("dareRequest", { id: entry.id, text: currentSnapDare, t: entry.t });
  $("#snapDareSend").style.display = "none";
  currentSnapDare = null;
  toast("Dare sent — it's their call 💞");
});

$("#snapFeed").addEventListener("click", (e) => {
  const accept = e.target.closest("[data-dare-accept]");
  const decline = e.target.closest("[data-dare-decline]");
  if (!accept && !decline) return;
  const list = snapsList();
  const entry = list.find(s => s.id === (accept || decline).dataset.dareAccept || s.id === (accept || decline).dataset.dareDecline);
  if (!entry) return;
  if (accept) {
    entry.status = "fulfilled";
    netSend("dareFulfilled", { id: entry.id });
    toast("Dare accepted — the camera button is right there 📸");
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      // hand the user straight to their camera roll via the file input
      $("#snapFile").click();
    }
  } else {
    entry.status = "declined";
    netSend("dareDeclined", { id: entry.id });
    toast("Declined — no explanation needed 🤍");
  }
  saveSnaps(list);
  renderSnaps();
});

setInterval(() => {
  const before = snapsList().length;
  if (purgeSnaps().length !== before) renderSnaps();
}, 30000);

/* ---- Seven minutes ---- */
let sevenTimer = null;
$("#sevenStart").addEventListener("click", () => {
  clearInterval(sevenTimer);
  let remain = 7 * 60;
  const tick = () => {
    const el = $("#sevenDisplay");
    if (!el) return;
    el.textContent = fmt(remain);
    if (remain-- <= 0) { clearInterval(sevenTimer); el.textContent = "Time's up ⏰"; toast("Seven minutes are over 😌"); }
  };
  tick();
  sevenTimer = setInterval(tick, 1000);
  netSend("seven", { on: true });
});
$("#sevenStop").addEventListener("click", () => { clearInterval(sevenTimer); $("#sevenDisplay").textContent = "07:00"; netSend("seven", { on: false }); });

/* ---- Shared lists ---- */
const LISTS = [
  { id: "fantasies", ico: "💫", title: "Fantasies", note: "mutual opt-in required", seed: ["Weekend cabin getaway", "Recreate our honeymoon night", "Role-swap date planning"] },
  { id: "bucket", ico: "🌍", title: "Bucket List", note: "shared", seed: ["Aurora hunting in Norway", "Take a couples cooking class", "Sleep under the stars"] },
  { id: "preferences", ico: "🔓", title: "Preferences", note: "consent-gated", seed: ["More slow mornings together", "Try a surprise date format", "One phone-free evening a week"] }
];
function renderLists() {
  $("#listPanels").innerHTML = LISTS.map(l => {
    const items = store.get("list_" + l.id, l.seed.map(t => ({ t, ok: l.id === "bucket" })));
    return `<div class="panel">
      <h3>${l.ico} ${l.title} <span class="lock-note">${l.note}</span></h3>
      ${items.map((it, i) => `<div class="list-item"><span>${it.t}</span>
        <button class="status ${it.ok ? "ok" : "wait"}" data-list="${l.id}" data-i="${i}">${it.ok ? "both agreed ✓" : "awaiting both ✋"}</button></div>`).join("")}
      <div class="list-add"><input type="text" placeholder="Add an item…" data-list="${l.id}" id="add-${l.id}">
        <button class="btn small" data-add="${l.id}">Add</button></div>
    </div>`;
  }).join("");
}
$("#listPanels").addEventListener("click", (e) => {
  const agree = e.target.closest(".status");
  const add = e.target.closest("[data-add]");
  if (agree) {
    const items = store.get("list_" + agree.dataset.list, []);
    items[+agree.dataset.i].ok = true;
    store.set("list_" + agree.dataset.list, items);
    renderLists();
    netSend("list", { id: agree.dataset.list, items });
    toast("Both partners opted in ✓");
  }
  if (add) {
    const input = $(`#add-${add.dataset.add}`);
    if (!input.value.trim()) return;
    const items = store.get("list_" + add.dataset.add, []);
    items.push({ t: input.value.trim(), ok: false });
    store.set("list_" + add.dataset.add, items);
    renderLists();
    netSend("list", { id: add.dataset.add, items });
  }
});

/* ---- Vault ---- */
function renderVault() {
  const items = store.get("vault", [
    { ico: "🖼️", label: "Anniversary shoot" }, { ico: "🎬", label: "Beach day clip" },
    { ico: "💌", label: "Letters to each other" }, { ico: "🔒", label: "Just for us" }
  ]);
  $("#vaultCount").textContent = items.length;
  $("#vaultGrid").innerHTML = items.map((it, i) =>
    `<div class="vault-item" data-i="${i}"><span class="ico">${it.ico}</span>${it.label}<span style="font-size:10px">🔒 encrypted</span></div>`).join("");
}
$("#vaultGrid").addEventListener("click", (e) => {
  const item = e.target.closest(".vault-item");
  if (item) toast("Decrypting… (demo: biometric unlock in production)");
});
$("#vaultAdd").addEventListener("click", () => {
  const label = prompt("Name for the new encrypted item");
  if (!label) return;
  const items = store.get("vault", []); items.push({ ico: "📦", label });
  store.set("vault", items); renderVault(); addAchievement("vault"); toast("Added & encrypted 🔐");
});

/* ---- Mood & availability calendar ---- */
const MOODS = [
  { id: "mood", color: "#e58aa0", label: "In the mood" },
  { id: "free", color: "#7fa8e0", label: "Just available" },
  { id: "busy", color: "#9aa3ad", label: "Busy / need space" },
  { id: "date", color: "#67c587", label: "Date planned" }
];
let calMonth = new Date().getFullYear() * 100 + new Date().getMonth();
function renderCalendar() {
  const y = Math.floor(calMonth / 100), m = calMonth % 100;
  const first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
  const marks = store.get("moods", {});
  $("#calHead").innerHTML =
    `<button class="btn small" id="calPrev">‹</button>
     <span>${first.toLocaleString("en", { month: "long", year: "numeric" })}</span>
     <button class="btn small" id="calNext">›</button>`;
  let html = MOODS ? ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => `<div class="cal-dow">${d}</div>`).join("") : "";
  for (let i = 0; i < first.getDay(); i++) html += `<div class="cal-day other"></div>`;
  const today = new Date();
  for (let d = 1; d <= days; d++) {
    const key = `${y}-${m}-${d}`;
    const mood = marks[key];
    const isToday = today.getFullYear() === y && today.getMonth() === m && today.getDate() === d;
    html += `<div class="cal-day ${isToday ? "today" : ""}" data-day="${key}">${d}
      ${mood ? `<span class="dot" style="background:${MOODS.find(x => x.id === mood).color}"></span>` : ""}</div>`;
  }
  $("#calGrid").innerHTML = html;
  $("#calPrev").addEventListener("click", () => { calMonth = m === 0 ? (y - 1) * 100 + 11 : y * 100 + (m - 1); renderCalendar(); });
  $("#calNext").addEventListener("click", () => { calMonth = m === 11 ? (y + 1) * 100 : y * 100 + (m + 1); renderCalendar(); });
}
$("#calGrid").addEventListener("click", (e) => {
  const day = e.target.closest(".cal-day[data-day]");
  if (!day) return;
  const marks = store.get("moods", {});
  const key = day.dataset.day;
  const current = marks[key];
  const nextIdx = MOODS.findIndex(x => x.id === current) + 1;
  if (nextIdx >= MOODS.length) delete marks[key]; else marks[key] = MOODS[nextIdx].id;
  store.set("moods", marks); renderCalendar();
  netSend("mood", { key, mood: marks[key] || null });
  toast(`Marked ${MOODS[nextIdx % MOODS.length].label} (visible to partner per your share settings)`);
});

/* ================= Boot ================= */
renderPinPad();
purgeSnaps();
renderSnaps();
unlockSnapDares();
{
  const saved = store.get("playerNames", null);
  if (saved) { PLAYER_NAMES[0] = saved[0] || PLAYER_NAMES[0]; PLAYER_NAMES[1] = saved[1] || PLAYER_NAMES[1]; }
  updatePartnerUI();
}
$("#spinnerOptions").value = spinnerOptions().join("\n");
renderSavedStarters();
renderMilestones();
renderAchievements();
renderSocial();
renderChat();
renderLists();
renderVault();
renderCalendar();
