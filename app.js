const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.GAMBO_CONFIG;
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
  await sb.from("profiles").update({ balance: b }).eq("id", user.id);
  renderNav();
}

function renderNav() {
  nav.innerHTML = user
    ? `<span class="bal">🪙 ${profile?.balance ?? 0}</span><a href="#/leaderboard">Leaderboard</a><button id="out">Log out</button>`
    : `<a href="#/login">Log in</a><a href="#/signup">Sign up</a>`;
  const out = document.getElementById("out");
  if (out) out.onclick = async () => { await sb.auth.signOut(); location.hash = "#/"; };
}

// ---------- pages ----------
const pages = {
  "/": () => user ? `
    <div class="card"><h2>Hi ${esc(profile?.username || "")}!</h2>
    <p>Balance: <span class="bal">🪙 ${profile?.balance}</span></p>
    ${profile?.balance < 10 ? `<button id="refill">Broke? Get 1000 free coins</button>` : ""}</div>
    <div class="grid"><a href="#/coinflip">🪙 Coin Flip</a><a href="#/dice">🎲 Dice</a><a href="#/slots">🎰 Slots</a></div>`
    : `<div class="card"><h1>Welcome to Gambo</h1><p>Free casino games with fake coins. Sign up and get 🪙 1000 to start.</p>
       <a href="#/signup"><button>Sign up</button></a> <a href="#/login"><button>Log in</button></a></div>`,

  "/login": () => authForm("Log in", false),
  "/signup": () => authForm("Sign up", true),

  "/leaderboard": () => `<div class="card"><h2>🏆 Leaderboard</h2><table id="lb"><tr><td>Loading…</td></tr></table></div>`,

  "/coinflip": () => game("🪙 Coin Flip", `<select id="pick"><option>Heads</option><option>Tails</option></select>`, "Pays 2x"),
  "/dice": () => game("🎲 Dice", `Roll over <input id="target" type="number" min="1" max="98" value="50" style="width:80px">`, "Roll 1–100. Payout = 99 / win chance"),
  "/slots": () => game("🎰 Slots", "", "3 match: 🍒5x 🍋10x 🔔20x 💎50x 7️⃣100x · 2 match: 1.5x"),
};

function authForm(title, signup) {
  return `<div class="card"><h2>${title}</h2><form id="auth">
    ${signup ? `<input id="username" placeholder="Username" required><br>` : ""}
    <input id="email" type="email" placeholder="Email" required><br>
    <input id="password" type="password" placeholder="Password (6+ chars)" minlength="6" required><br>
    <button>${title}</button></form><p id="msg"></p></div>`;
}

function game(title, controls, info) {
  return `<div class="card"><h2>${title}</h2><p>${info}</p>
    <div class="big" id="result">❔</div>
    Bet <input id="bet" type="number" min="1" value="10" style="width:100px"> ${controls}
    <button id="play">Play</button><p id="msg"></p></div>`;
}

// ---------- game logic ----------
const SYMBOLS = ["🍒", "🍋", "🔔", "💎", "7️⃣"];
const SLOT_PAY = { "🍒": 5, "🍋": 10, "🔔": 20, "💎": 50, "7️⃣": 100 };
const SLOT_WEIGHTS = [40, 30, 18, 9, 3];
function spinReel() {
  let r = rand(100);
  for (let i = 0; i < 5; i++) { if ((r -= SLOT_WEIGHTS[i]) < 0) return SYMBOLS[i]; }
}

const games = {
  "/coinflip": bet => {
    const side = rand(2) ? "Heads" : "Tails";
    const win = side === document.getElementById("pick").value;
    return { show: side === "Heads" ? "🙂 Heads" : "🦅 Tails", payout: win ? bet * 2 : 0 };
  },
  "/dice": bet => {
    const t = Math.min(98, Math.max(1, +document.getElementById("target").value));
    const roll = rand(100) + 1;
    const mult = 99 / (100 - t);
    return { show: roll, payout: roll > t ? Math.floor(bet * mult) : 0 };
  },
  "/slots": bet => {
    const r = [spinReel(), spinReel(), spinReel()];
    let payout = 0;
    if (r[0] === r[1] && r[1] === r[2]) payout = bet * SLOT_PAY[r[0]];
    else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) payout = Math.floor(bet * 1.5);
    return { show: r.join(" "), payout };
  },
};

// ---------- router ----------
async function route() {
  const path = location.hash.replace(/^#/, "") || "/";
  const needsAuth = path in games || path === "/leaderboard";
  if (needsAuth && !user) { location.hash = "#/login"; return; }
  app.innerHTML = (pages[path] || (() => `<div class="card">Not found</div>`))();
  renderNav();

  const form = document.getElementById("auth");
  if (form) form.onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById("msg");
    const email = form.email.value, password = form.password.value;
    const { error, data } = path === "/signup"
      ? await sb.auth.signUp({ email, password, options: { data: { username: form.username.value } } })
      : await sb.auth.signInWithPassword({ email, password });
    if (error) return (msg.textContent = error.message);
    if (path === "/signup" && !data.session) msg.textContent = "Check your email to confirm, then log in.";
  };

  const refill = document.getElementById("refill");
  if (refill) refill.onclick = async () => { await setBalance(1000); route(); };

  if (path === "/leaderboard") {
    const { data } = await sb.from("profiles").select("username,balance").order("balance", { ascending: false }).limit(20);
    document.getElementById("lb").innerHTML = (data || [])
      .map((p, i) => `<tr><td>#${i + 1}</td><td>${esc(p.username)}</td><td class="bal">🪙 ${p.balance}</td></tr>`).join("");
  }

  const play = document.getElementById("play");
  if (play) play.onclick = async () => {
    const bet = Math.floor(+document.getElementById("bet").value);
    const msg = document.getElementById("msg"), res = document.getElementById("result");
    if (!(bet >= 1)) return (msg.textContent = "Enter a bet of at least 1.");
    if (bet > profile.balance) return (msg.textContent = "Not enough coins.");
    play.disabled = true;
    res.textContent = "…";
    await new Promise(r => setTimeout(r, 500));
    const { show, payout } = games[path](bet);
    res.textContent = show;
    await setBalance(profile.balance - bet + payout);
    msg.innerHTML = payout > 0
      ? `<span class="win">You won 🪙 ${payout}!</span>`
      : `<span class="lose">You lost 🪙 ${bet}.</span>`;
    play.disabled = false;
  };
}

sb.auth.onAuthStateChange(async (_e, session) => {
  user = session?.user ?? null;
  await loadProfile();
  if (user && ["#/login", "#/signup"].includes(location.hash)) location.hash = "#/";
  else route();
});
window.addEventListener("hashchange", route);
