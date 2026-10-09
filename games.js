// Big games: Mega Slots, Roulette, Blackjack.
// Each game: { title, html(), init(api) } where api = { balance(), change(delta), rand(n) }
window.GAMBO_GAMES = {};
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));

// ================= MEGA SLOTS =================
GAMBO_GAMES["/megaslots"] = {
  title: "Mega Slots",
  html: () => `
  <div class="slot-cab">
    <div class="slot-top">
      <div class="pill">🪙 <b id="sbal"></b></div>
      <div class="slot-title">MEGA SLOTS</div>
      <div class="pill">WIN <b id="swin">0</b></div>
    </div>
    <div class="reels" id="reels">${[0,1,2,3,4].map(r => `<div class="reel">${[0,1,2].map(c => `<div class="cell" id="c${r}${c}"></div>`).join("")}</div>`).join("")}</div>
    <div class="slot-msg" id="smsg">Pick your bet and spin!</div>
    <div class="slot-ctrls">
      <div class="ctl"><label>BET / LINE</label><div class="stepper"><button id="bm">−</button><b id="lb"></b><button id="bp">+</button></div></div>
      <div class="ctl"><label>LINES</label><div class="stepper"><button id="lm">−</button><b id="ln"></b><button id="lp">+</button></div></div>
      <div class="ctl"><label>TOTAL BET</label><div class="stepper"><b id="tb"></b></div></div>
    </div>
    <div class="slot-acts">
      <button class="btn-sec" id="pt">PAY TABLE</button>
      <button class="spin" id="spin">SPIN</button>
      <button class="btn-sec" id="max">BET MAX</button>
    </div>
  </div>
  <dialog id="ptd"><h3>Pay table</h3><p>3, 4 or 5 matching from the left on a line. Pays × bet per line. <span class="sym s-wild">WILD</span> counts as any symbol.</p>
    <table>${SlotMath.SYMS.filter(s => s.id !== "wild").reverse().map(s => `<tr><td><span class="sym s-${s.id}">${s.icon}</span></td>${s.pay.map((p, i) => `<td>${i + 3}× <b>${p}</b></td>`).join("")}</tr>`).join("")}</table>
    <button onclick="this.closest('dialog').close()">Close</button></dialog>`,
  init(api) {
    const BETS = [1, 2, 5, 10, 25, 50, 100];
    let bi = 1, lines = 10, busy = false;
    const cell = (r, c) => $(`c${r}${c}`);
    const draw = (r, c, s) => (cell(r, c).innerHTML = `<span class="sym s-${s.id}">${s.icon}</span>`);
    const ui = () => {
      $("lb").textContent = BETS[bi]; $("ln").textContent = lines;
      $("tb").textContent = BETS[bi] * lines; $("sbal").textContent = api.balance();
    };
    SlotMath.spin(api.rand).forEach((reel, r) => reel.forEach((s, c) => draw(r, c, s)));
    ui();
    $("bm").onclick = () => { if (!busy && bi > 0) bi--; ui(); };
    $("bp").onclick = () => { if (!busy && bi < BETS.length - 1) bi++; ui(); };
    $("lm").onclick = () => { if (!busy && lines > 1) lines--; ui(); };
    $("lp").onclick = () => { if (!busy && lines < 10) lines++; ui(); };
    $("max").onclick = () => {
      if (busy) return;
      lines = 10; bi = 0;
      while (bi < BETS.length - 1 && BETS[bi + 1] * 10 <= api.balance()) bi++;
      ui();
    };
    $("pt").onclick = () => $("ptd").showModal();
    $("spin").onclick = async () => {
      if (busy) return;
      const total = BETS[bi] * lines, msg = $("smsg");
      if (total > api.balance()) return (msg.textContent = "Not enough coins — lower your bet.");
      busy = true; $("spin").disabled = true;
      document.querySelectorAll(".cell").forEach(c => c.classList.remove("win"));
      $("swin").textContent = 0; msg.textContent = "Spinning…";
      await api.change(-total); ui();
      const grid = SlotMath.spin(api.rand);
      const reels = document.querySelectorAll(".reel");
      reels.forEach(el => el.classList.add("spinning"));
      const tick = setInterval(() => {
        reels.forEach((el, r) => { if (el.classList.contains("spinning")) for (let c = 0; c < 3; c++) draw(r, c, SlotMath.SYMS[api.rand(SlotMath.SYMS.length)]); });
      }, 70);
      for (let r = 0; r < 5; r++) {
        await wait(r === 0 ? 700 : 280);
        reels[r].classList.remove("spinning");
        for (let c = 0; c < 3; c++) draw(r, c, grid[r][c]);
      }
      clearInterval(tick);
      const { wins, total: won } = SlotMath.evaluate(grid, lines, BETS[bi]);
      for (const w of wins) for (let r = 0; r < w.count; r++) cell(r, SlotMath.LINES[w.line][r]).classList.add("win");
      if (won) {
        await api.change(won);
        $("swin").textContent = won;
        msg.innerHTML = `<span class="good">${won >= total * 10 ? "BIG WIN! " : ""}You won 🪙 ${won} on ${wins.length} line${wins.length > 1 ? "s" : ""}!</span>`;
      } else msg.textContent = "No win — spin again!";
      ui(); busy = false; $("spin").disabled = false;
    };
  },
};

// ================= ROULETTE =================
const REDS = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const colorOf = n => (n === 0 ? "green" : REDS.has(n) ? "red" : "black");
const OUTSIDE = {
  "1-18": [n => n >= 1 && n <= 18, 2], "EVEN": [n => n && n % 2 === 0, 2], "RED": [n => REDS.has(n), 2],
  "BLACK": [n => n && !REDS.has(n), 2], "ODD": [n => n % 2 === 1, 2], "19-36": [n => n >= 19, 2],
  "1st 12": [n => n >= 1 && n <= 12, 3], "2nd 12": [n => n >= 13 && n <= 24, 3], "3rd 12": [n => n >= 25, 3],
};
GAMBO_GAMES["/roulette"] = {
  title: "Roulette",
  html: () => `
  <div class="table-felt">
    <div class="rl-head">
      <div class="rl-ball" id="ball">–</div>
      <div><div class="muted">Last results</div><div class="hist" id="hist"></div></div>
    </div>
    <div class="chips" id="chips">${[1,5,25,100,500].map((v, i) => `<button class="chip c${i}${i === 1 ? " sel" : ""}" data-v="${v}">${v}</button>`).join("")}</div>
    <div class="rl-board">
      <button class="rb green" data-k="0">0</button>
      <div class="rl-nums">${Array.from({ length: 36 }, (_, i) => `<button class="rb ${colorOf(i + 1)}" data-k="${i + 1}">${i + 1}</button>`).join("")}</div>
      <div class="rl-out">${Object.keys(OUTSIDE).map(k => `<button class="rb out ${k === "RED" ? "red" : k === "BLACK" ? "black" : ""}" data-k="${k}">${k}</button>`).join("")}</div>
    </div>
    <div class="rl-bar"><span>Bet: 🪙 <b id="rtot">0</b></span><button class="btn-sec" id="rclr">Clear</button><button class="spin" id="rspin">SPIN</button></div>
    <div class="slot-msg" id="rmsg">Tap a chip, then tap the table to bet.</div>
  </div>`,
  init(api) {
    let chip = 5, bets = {}, busy = false;
    const total = () => Object.values(bets).reduce((a, b) => a + b, 0);
    const paint = () => {
      document.querySelectorAll(".rb").forEach(b => {
        const v = bets[b.dataset.k];
        b.querySelector(".stake")?.remove();
        if (v) b.insertAdjacentHTML("beforeend", `<span class="stake">${v}</span>`);
      });
      $("rtot").textContent = total();
    };
    $("chips").onclick = e => {
      const b = e.target.closest(".chip"); if (!b) return;
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("sel"));
      b.classList.add("sel"); chip = +b.dataset.v;
    };
    document.querySelector(".rl-board").onclick = e => {
      const b = e.target.closest(".rb"); if (!b || busy) return;
      if (total() + chip > api.balance()) return ($("rmsg").textContent = "Not enough coins for that chip.");
      bets[b.dataset.k] = (bets[b.dataset.k] || 0) + chip; paint();
    };
    $("rclr").onclick = () => { if (!busy) { bets = {}; paint(); } };
    $("rspin").onclick = async () => {
      const t = total(), msg = $("rmsg"), ball = $("ball");
      if (busy) return;
      if (!t) return (msg.textContent = "Place a bet first.");
      if (t > api.balance()) return (msg.textContent = "Not enough coins.");
      busy = true; $("rspin").disabled = true; msg.textContent = "No more bets…";
      await api.change(-t);
      const n = api.rand(37);
      for (let i = 0, d = 40; i < 22; i++, d += 6) {
        const k = api.rand(37); ball.textContent = k; ball.className = "rl-ball spin-" + colorOf(k); await wait(d);
      }
      ball.textContent = n; ball.className = "rl-ball " + colorOf(n);
      let won = 0;
      for (const [k, v] of Object.entries(bets)) {
        if (OUTSIDE[k]) { if (OUTSIDE[k][0](n)) won += v * OUTSIDE[k][1]; }
        else if (+k === n) won += v * 36;
      }
      if (won) await api.change(won);
      $("hist").insertAdjacentHTML("afterbegin", `<span class="h ${colorOf(n)}">${n}</span>`);
      [...$("hist").children].slice(10).forEach(x => x.remove());
      msg.innerHTML = won ? `<span class="good">${n} ${colorOf(n)} — you won 🪙 ${won}!</span>` : `${n} ${colorOf(n)} — no win this time.`;
      busy = false; $("rspin").disabled = false;
    };
  },
};

// ================= BLACKJACK =================
const SUITS = ["♠", "♥", "♦", "♣"], RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
function handValue(h) {
  let v = 0, aces = 0;
  for (const c of h) { v += c.r === "A" ? 11 : ["J","Q","K"].includes(c.r) ? 10 : +c.r; if (c.r === "A") aces++; }
  while (v > 21 && aces--) v -= 10;
  return v;
}
const cardHtml = (c, hidden) => hidden
  ? `<div class="card back"></div>`
  : `<div class="card ${c.s === "♥" || c.s === "♦" ? "redc" : ""}"><span>${c.r}</span><span class="suit">${c.s}</span></div>`;
GAMBO_GAMES["/blackjack"] = {
  title: "Blackjack",
  html: () => `
  <div class="table-felt bj">
    <div class="muted">DEALER <b id="dv"></b></div><div class="hand" id="dh"></div>
    <div class="bj-mid">Blackjack pays 3 to 2 · Dealer stands on 17</div>
    <div class="hand" id="ph"></div><div class="muted">YOU <b id="pv"></b></div>
    <div class="slot-msg" id="bmsg">Choose your bet and deal.</div>
    <div id="betting">
      <div class="chips" id="bchips">${[5,10,25,100,500].map((v, i) => `<button class="chip c${i}${i === 1 ? " sel" : ""}" data-v="${v}">${v}</button>`).join("")}</div>
      <button class="spin wide" id="deal">DEAL</button>
    </div>
    <div id="acts" class="bj-acts" hidden>
      <button class="btn-sec" id="hit">HIT</button><button class="spin" id="stand">STAND</button><button class="btn-sec" id="dbl">DOUBLE</button>
    </div>
  </div>`,
  init(api) {
    let bet = 10, player = [], dealer = [], hideHole = true;
    const draw = () => ({ r: RANKS[api.rand(13)], s: SUITS[api.rand(4)] });
    const render = () => {
      $("ph").innerHTML = player.map(c => cardHtml(c)).join("");
      $("dh").innerHTML = dealer.map((c, i) => cardHtml(c, i === 1 && hideHole)).join("");
      $("pv").textContent = player.length ? handValue(player) : "";
      $("dv").textContent = dealer.length ? (hideHole ? handValue([dealer[0]]) : handValue(dealer)) : "";
    };
    const phase = playing => { $("betting").hidden = playing; $("acts").hidden = !playing; };
    $("bchips").onclick = e => {
      const b = e.target.closest(".chip"); if (!b) return;
      document.querySelectorAll("#bchips .chip").forEach(c => c.classList.remove("sel"));
      b.classList.add("sel"); bet = +b.dataset.v;
    };
    async function finish(doubled) {
      hideHole = false; phase(false); render();
      const p = handValue(player), stake = doubled ? bet * 2 : bet;
      if (p <= 21) while (handValue(dealer) < 17) { await wait(500); dealer.push(draw()); render(); }
      const d = handValue(dealer);
      let back = 0, text;
      if (p > 21) text = `Bust with ${p}. You lose 🪙 ${stake}.`;
      else if (d > 21 || p > d) { back = stake * 2; text = `<span class="good">You win 🪙 ${stake}! (${p} vs ${d})</span>`; }
      else if (p === d) { back = stake; text = `Push — ${p} each. Bet returned.`; }
      else text = `Dealer wins, ${d} vs ${p}.`;
      if (back) await api.change(back);
      $("bmsg").innerHTML = text;
    }
    $("deal").onclick = async () => {
      if (bet > api.balance()) return ($("bmsg").textContent = "Not enough coins for that bet.");
      await api.change(-bet);
      player = [draw(), draw()]; dealer = [draw(), draw()]; hideHole = true;
      $("bmsg").textContent = "Hit or stand?"; phase(true); render();
      const pBJ = handValue(player) === 21, dBJ = handValue(dealer) === 21;
      if (pBJ || dBJ) {
        hideHole = false; phase(false); render();
        if (pBJ && dBJ) { await api.change(bet); $("bmsg").textContent = "Both blackjack — push."; }
        else if (pBJ) { await api.change(Math.floor(bet * 2.5)); $("bmsg").innerHTML = `<span class="good">BLACKJACK! You win 🪙 ${Math.floor(bet * 1.5)}!</span>`; }
        else $("bmsg").textContent = "Dealer has blackjack.";
      }
      $("dbl").disabled = bet > api.balance();
    };
    $("hit").onclick = () => {
      player.push(draw()); render(); $("dbl").disabled = true;
      if (handValue(player) >= 21) finish(false);
    };
    $("stand").onclick = () => finish(false);
    $("dbl").onclick = async () => {
      if (bet > api.balance()) return;
      await api.change(-bet); player.push(draw()); render(); finish(true);
    };
    render();
  },
};
