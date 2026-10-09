const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.GAMBO_CONFIG;
// No-op lock: supabase-js's cross-tab lock can deadlock and freeze every request
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { lock: (_name, _timeout, fn) => fn() } });
const app = document.getElementById("app");
const nav = document.getElementById("nav");
let user = null, profile = null;

const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rand = n => crypto.getRandomValues(new Uint32Array(1))[0] % n;

async function loadProfile() {
  if (!user) return (profile = null);
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).single();
  profile = data;
}

async function setBalance(b) {
  profile.balance = b;
  renderNav();
  // Save in the background so a slow network never freezes a game
  sb.from("profiles").update({ balance: b }).eq("id", user.id).then(({ error }) => error && console.warn("Balance save failed", error));
}

// What the big games in games.js use to touch the balance
const api = {
  balance: () => profile.balance,
  change: delta => setBalance(profile.balance + delta),
  rand,
};

function renderNav() {
  nav.innerHTML = user
    ? `<span class="bal">🪙 ${(profile?.balance ?? 0).toLocaleString()}</span><button id="out" class="link">Log out</button>`
    : `<a href="#/login" class="link">Log in</a><a href="#/signup" class="btn-join">Join</a>`;
  const out = document.getElementById("out");
  if (out) out.onclick = async () => { await sb.auth.signOut(); location.hash = "#/"; };
}

// ---------- lobby ----------
const LOBBY = [
  { cat: "🔥 Slots", games: [
    { path: "/megaslots", name: "Mega Slots", icon: "🎰", tag: "5 reels · 10 lines", bg: "g1", hot: true },
    { path: "/slots", name: "Classic Fruits", icon: "🍒", tag: "3 reels", bg: "g2" },
  ]},
  { cat: "♠️ Table games", games: [
    { path: "/roulette", name: "Roulette", icon: "🎡", tag: "European", bg: "g3", hot: true },
    { path: "/blackjack", name: "Blackjack", icon: "🃏", tag: "Pays 3:2", bg: "g4" },
  ]},
  { cat: "⚡ Quick games", games: [
    { path: "/coinflip", name: "Coin Flip", icon: "🪙", tag: "Double or nothing", bg: "g5" },
    { path: "/dice", name: "Dice", icon: "🎲", tag: "Pick your odds", bg: "g6" },
  ]},
];
const tile = g => `<a class="tile ${g.bg}" href="#${g.path}">${g.hot ? `<span class="hot">HOT</span>` : ""}
  <span class="ticon">${g.icon}</span><span class="tname">${g.name}</span><span class="ttag">${g.tag}</span></a>`;

function lobby() {
  const hero = user
    ? `<div class="hero"><div><div class="hero-k">Welcome back</div><h1>${esc(profile?.username || "Player")}</h1>
        <div class="hero-bal">🪙 ${profile?.balance.toLocaleString()}</div>
        ${profile?.balance < 10 ? `<button class="spin" id="refill">Get 1,000 free coins</button>` : `<a class="spin" href="#/megaslots">Play Mega Slots</a>`}</div><div class="hero-art">🎰</div></div>`
    : `<div class="hero"><div><div class="hero-k">Free to play</div><h1>Spin, deal &amp; win — with fake coins</h1>
        <p>Join free and get 🪙 1,000 to play slots, roulette and blackjack.</p>
        <a class="spin" href="#/signup">Join now</a></div><div class="hero-art">🎰</div></div>`;
  return hero + LOBBY.map(s => `<h2 class="cat">${s.cat}</h2><div class="row">${s.games.map(tile).join("")}</div>`).join("");
}

// ---------- simple games ----------
const SYMBOLS = ["🍒", "🍋", "🔔", "💎", "7️⃣"];
const SLOT_PAY = { "🍒": 5, "🍋": 10, "🔔": 20, "💎": 50, "7️⃣": 100 };
const SLOT_WEIGHTS = [40, 30, 18, 9, 3];
function spinReel() {
  let r = rand(100);
  for (let i = 0; i < 5; i++) { if ((r -= SLOT_WEIGHTS[i]) < 0) return SYMBOLS[i]; }
}

const simple = {
  "/coinflip": { title: "🪙 Coin Flip", info: "Pick a side. Pays 2×.",
    controls: `<select id="pick"><option>Heads</option><option>Tails</option></select>`,
    play: bet => {
      const side = rand(2) ? "Heads" : "Tails";
      const win = side === document.getElementById("pick").value;
      return { show: side === "Heads" ? "🙂 Heads" : "🦅 Tails", payout: win ? bet * 2 : 0 };
    } },
  "/dice": { title: "🎲 Dice", info: "Roll 1–100. Win if you roll over your number. Payout = 99 ÷ win chance.",
    controls: `<label class="muted">Roll over <input id="target" type="number" min="1" max="98" value="50"></label>`,
    play: bet => {
      const t = Math.min(98, Math.max(1, +document.getElementById("target").value));
      const roll = rand(100) + 1;
      return { show: roll, payout: roll > t ? Math.floor(bet * 99 / (100 - t)) : 0 };
    } },
  "/slots": { title: "🍒 Classic Fruits", info: "3 match: 🍒5× 🍋10× 🔔20× 💎50× 7️⃣100× · 2 match: 1.5×", controls: "",
    play: bet => {
      const r = [spinReel(), spinReel(), spinReel()];
      let payout = 0;
      if (r[0] === r[1] && r[1] === r[2]) payout = bet * SLOT_PAY[r[0]];
      else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) payout = Math.floor(bet * 1.5);
      return { show: r.join(" "), payout };
    } },
};
const simpleHtml = g => `<div class="card"><h2>${g.title}</h2><p class="muted">${g.info}</p>
  <div class="big" id="result">❔</div>
  <div class="form-row"><label class="muted">Bet <input id="bet" type="number" min="1" value="10"></label>${g.controls}</div>
  <button class="spin wide" id="play">PLAY</button><p id="msg" class="slot-msg"></p></div>`;

function authForm(title, signup) {
  return `<div class="card auth"><h2>${title}</h2><form id="auth">
    ${signup ? `<input id="username" placeholder="Username" required maxlength="20">` : ""}
    <input id="email" type="email" placeholder="Email" required autocomplete="email">
    <input id="password" type="password" placeholder="Password (6+ characters)" minlength="6" required>
    <button class="spin wide">${title}</button></form><p id="msg" class="slot-msg"></p>
    <p class="muted">${signup ? `Already a member? <a href="#/login">Log in</a>` : `New here? <a href="#/signup">Join free</a>`}</p></div>`;
}

const back = `<a href="#/" class="back">‹ Lobby</a>`;

// ---------- router ----------
async function route() {
  const path = location.hash.replace(/^#/, "") || "/";
  const big = GAMBO_GAMES[path], small = simple[path];
  if ((big || small || path === "/leaderboard") && !user) { location.hash = "#/login"; return; }

  document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("on", a.dataset.t === path));
  renderNav();
  window.scrollTo(0, 0);

  if (big) { app.innerHTML = back + big.html(); big.init(api); return; }
  if (small) { app.innerHTML = back + simpleHtml(small); bindSimple(small); return; }
  if (path === "/login" || path === "/signup") { app.innerHTML = authForm(path === "/signup" ? "Join Gambo" : "Log in", path === "/signup"); bindAuth(path); return; }
  if (path === "/leaderboard") { app.innerHTML = `<div class="card"><h2>🏆 Leaderboard</h2><table class="lb" id="lb"><tr><td>Loading…</td></tr></table></div>`; loadLeaderboard(); return; }
  if (path === "/") {
    app.innerHTML = lobby();
    const refill = document.getElementById("refill");
    if (refill) refill.onclick = async () => { await setBalance(1000); route(); };
    return;
  }
  app.innerHTML = `<div class="card">Page not found. <a href="#/">Back to lobby</a></div>`;
}

function bindAuth(path) {
  const form = document.getElementById("auth");
  form.onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const email = form.email.value, password = form.password.value;
    const { error, data } = path === "/signup"
      ? await sb.auth.signUp({ email, password, options: { data: { username: form.username.value } } })
      : await sb.auth.signInWithPassword({ email, password });
    if (error) return (msg.textContent = error.message);
    if (path === "/signup" && !data.session) msg.textContent = "Check your email to confirm, then log in.";
  };
}

async function loadLeaderboard() {
  const { data } = await sb.from("profiles").select("username,balance").order("balance", { ascending: false }).limit(20);
  document.getElementById("lb").innerHTML = (data || [])
    .map((p, i) => `<tr><td>${["🥇", "🥈", "🥉"][i] || "#" + (i + 1)}</td><td>${esc(p.username)}</td><td class="bal">🪙 ${p.balance.toLocaleString()}</td></tr>`).join("");
}

function bindSimple(g) {
  const play = document.getElementById("play");
  play.onclick = async () => {
    const bet = Math.floor(+document.getElementById("bet").value);
    const msg = document.getElementById("msg"), res = document.getElementById("result");
    if (!(bet >= 1)) return (msg.textContent = "Enter a bet of at least 1.");
    if (bet > profile.balance) return (msg.textContent = "Not enough coins.");
    play.disabled = true;
    res.textContent = "…";
    await new Promise(r => setTimeout(r, 500));
    const { show, payout } = g.play(bet);
    res.textContent = show;
    await setBalance(profile.balance - bet + payout);
    msg.innerHTML = payout > 0 ? `<span class="good">You won 🪙 ${payout}!</span>` : `You lost 🪙 ${bet}.`;
    play.disabled = false;
  };
}

// Supabase calls must not be awaited inside this callback, so defer the work
sb.auth.onAuthStateChange((_e, session) => setTimeout(() => onSession(session)));
async function onSession(session) {
  const wasIn = !!user;
  user = session?.user ?? null;
  await loadProfile();
  if (user && ["#/login", "#/signup"].includes(location.hash)) location.hash = "#/";
  else if (wasIn !== !!user || !app.innerHTML) route();
}
window.addEventListener("hashchange", route);
