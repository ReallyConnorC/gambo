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

// Change the balance by an amount. The UI updates at once; the server applies the
// same change and its answer becomes the truth (so gifts from others aren't overwritten).
function changeBalance(delta) {
  profile.balance = Math.max(0, profile.balance + delta);
  renderNav();
  pending++;
  sb.rpc("add_balance", { delta }).then(({ data, error }) => {
    pending--;
    // Database function not installed yet: fall back to saving the whole balance
    if (error && error.code === "PGRST202") return sb.from("profiles").update({ balance: profile.balance }).eq("id", user.id).then(() => {});
    if (error) return console.warn("Balance save failed", error);
    // Only trust the server once every in-flight change has landed
    if (typeof data === "number" && !pending) { profile.balance = data; renderNav(); }
  });
}
let pending = 0;

// What the big games in games.js use to touch the balance
const api = {
  balance: () => profile.balance,
  change: changeBalance,
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
  { cat: "🎰 Slots", games: [
    { path: "/megaslots", name: "Mega Slots", icon: "🎰", tag: "Free spins bonus", bg: "g1", hot: true },
    { path: "/goose", name: "Golden Goose", icon: "🪿", tag: "Golden egg bonus", bg: "g2", hot: true },
  ]},
  { cat: "🥚 Egg games", games: [
    { path: "/eggshelf", name: "Egg Shelf", icon: "🥚", tag: "Match 3 to win", bg: "g5" },
    { path: "/egghunt", name: "Egg Hunt", icon: "🧺", tag: "Avoid the rotten egg", bg: "g6" },
  ]},
];
const tile = g => `<a class="tile ${g.bg}" href="#${g.path}">${g.hot ? `<span class="hot">BONUS</span>` : ""}
  <span class="ticon">${g.icon}</span><span class="tname">${g.name}</span><span class="ttag">${g.tag}</span></a>`;

function lobby() {
  const hero = user
    ? `<div class="hero"><div><div class="hero-k">Welcome back</div><h1>${esc(profile?.username || "Player")}</h1>
        <div class="hero-bal">🪙 ${profile?.balance.toLocaleString()}</div>
        ${profile?.balance < 10 ? `<button class="spin" id="refill">Get 1,000 free coins</button>` : `<a class="spin" href="#/megaslots">Play Mega Slots</a>`}</div><div class="hero-art">🎰</div></div>`
    : `<div class="hero"><div><div class="hero-k">Free to play</div><h1>Spin, crack &amp; win — with fake coins</h1>
        <p>Join free and get 🪙 1,000 to play slots and egg games.</p>
        <a class="spin" href="#/signup">Join now</a></div><div class="hero-art">🎰</div></div>`;
  return hero + LOBBY.map(s => `<h2 class="cat">${s.cat}</h2><div class="row">${s.games.map(tile).join("")}</div>`).join("");
}

function authForm(title, signup) {
  return `<div class="card auth"><h2>${title}</h2><form id="auth">
    ${signup ? `<input id="username" placeholder="Username" required maxlength="20">` : ""}
    <input id="email" type="email" placeholder="Email" required autocomplete="email">
    <input id="password" type="password" placeholder="Password (6+ characters)" minlength="6" required>
    <button class="spin wide">${title}</button></form><p id="msg" class="slot-msg"></p>
    <p class="muted">${signup ? `Already a member? <a href="#/login">Log in</a>` : `New here? <a href="#/signup">Join free</a>`}</p></div>`;
}

function sendPage() {
  return `<div class="card send"><h2>💸 Send coins</h2><p class="muted">Gift coins to another player by their username.</p>
    <form id="sendf">
      <input id="to" placeholder="Player username" required list="players" autocomplete="off"><datalist id="players"></datalist>
      <input id="amt" type="number" min="1" placeholder="Amount" required>
      <div class="quick">${[100, 1000, 5000].map(v => `<button type="button" class="btn-sec" data-v="${v}">${v.toLocaleString()}</button>`).join("")}</div>
      <button class="spin wide">SEND</button></form><p id="msg" class="slot-msg"></p></div>`;
}

function bindSend() {
  const f = document.getElementById("sendf"), msg = document.getElementById("msg");
  sb.from("profiles").select("username").neq("id", user.id).limit(200).then(({ data }) => {
    document.getElementById("players").innerHTML = (data || []).map(p => `<option value="${esc(p.username)}">`).join("");
  });
  f.querySelector(".quick").onclick = e => { if (e.target.dataset.v) f.amt.value = e.target.dataset.v; };
  f.onsubmit = async e => {
    e.preventDefault();
    const amount = Math.floor(+f.amt.value), to = f.to.value.trim();
    if (!(amount >= 1)) return (msg.textContent = "Enter an amount of at least 1.");
    if (amount > profile.balance) return (msg.textContent = "You don't have that many coins.");
    if (!confirm(`Send 🪙 ${amount.toLocaleString()} to ${to}?`)) return;
    f.querySelector("button.spin").disabled = true;
    const { data, error } = await sb.rpc("send_coins", { to_username: to, amount });
    f.querySelector("button.spin").disabled = false;
    if (error) return (msg.textContent = error.message);
    profile.balance = data; renderNav();
    msg.innerHTML = `<span class="good">Sent 🪙 ${amount.toLocaleString()} to ${esc(to)}!</span>`;
    f.reset();
  };
}

const back = `<a href="#/" class="back">‹ Lobby</a>`;

// ---------- router ----------
async function route() {
  const path = location.hash.replace(/^#/, "") || "/";
  const big = GAMBO_GAMES[path];
  if ((big || path === "/leaderboard" || path === "/send") && !user) { location.hash = "#/login"; return; }

  document.querySelectorAll(".tabbar a").forEach(a => a.classList.toggle("on", a.dataset.t === path));
  renderNav();
  window.scrollTo(0, 0);

  if (big) { app.innerHTML = back + big.html(); big.init(api); return; }
  if (path === "/send") { app.innerHTML = sendPage(); bindSend(); return; }
  if (path === "/login" || path === "/signup") { app.innerHTML = authForm(path === "/signup" ? "Join Gambo" : "Log in", path === "/signup"); bindAuth(path); return; }
  if (path === "/leaderboard") { app.innerHTML = `<div class="card"><h2>🏆 Leaderboard</h2><table class="lb" id="lb"><tr><td>Loading…</td></tr></table></div>`; loadLeaderboard(); return; }
  if (path === "/") {
    app.innerHTML = lobby();
    const refill = document.getElementById("refill");
    if (refill) refill.onclick = () => { changeBalance(1000 - profile.balance); route(); };
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
