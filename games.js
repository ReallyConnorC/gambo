// Games: two slot machines with bonuses, plus two egg games.
// Each game: { title, html(), init(api) } where api = { balance(), change(delta), rand(n) }
window.GAMBO_GAMES = {};
const $ = id => document.getElementById(id);
const wait = ms => new Promise(r => setTimeout(r, ms));
const fmt = n => n.toLocaleString();
const symHtml = s => `<span class="sym s-${s.id}">${s.icon}</span>`;
const eggHtml = (e, extra = "") => `<div class="egg e-${e.id} ${extra}"><span>${e.label}</span></div>`;

// ================= SLOT MACHINES =================
function slotGame({ key, title, theme, bonusText }) {
  const m = SlotMath.MACHINES[key];
  return {
    title,
    html: () => `
    <div class="slot-cab ${theme}">
      <div class="slot-top">
        <div class="pill">🪙 <b id="sbal"></b></div>
        <div class="slot-title">${title.toUpperCase()}</div>
        <div class="pill">WIN <b id="swin">0</b></div>
      </div>
      <div class="fs-banner" id="fsb" hidden></div>
      <div class="reels" id="reels">${[0,1,2,3,4].map(r => `<div class="reel">${[0,1,2].map(c => `<div class="cell" id="c${r}${c}"></div>`).join("")}</div>`).join("")}</div>
      <div class="slot-msg" id="smsg">${bonusText}</div>
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
    <div class="overlay" id="bonus" hidden></div>
    <dialog id="ptd"><h3>Pay table</h3>
      <p>3, 4 or 5 matching from the left on a line. Pays × bet per line. ${symHtml({ id: "wild", icon: "WILD" })} counts as any symbol.</p>
      <p>${symHtml(m.syms.find(s => s.id === "scatter"))} <b>3 or more anywhere</b>: ${bonusText}</p>
      <table>${m.syms.filter(s => s.pay).reverse().map(s => `<tr><td>${symHtml(s)}</td>${s.pay.map((p, i) => `<td>${i + 3}× <b>${p}</b></td>`).join("")}</tr>`).join("")}</table>
      <button onclick="this.closest('dialog').close()">Close</button></dialog>`,
    init(api) {
      const BETS = [1, 2, 5, 10, 25, 50, 100, 250, 500];
      let bi = 1, lines = 10, busy = false;
      const cell = (r, c) => $(`c${r}${c}`);
      const draw = (r, c, s) => (cell(r, c).innerHTML = symHtml(s));
      const ui = () => {
        $("lb").textContent = BETS[bi]; $("ln").textContent = lines;
        $("tb").textContent = fmt(BETS[bi] * lines); $("sbal").textContent = fmt(api.balance());
      };
      SlotMath.spin(m, api.rand).forEach((reel, r) => reel.forEach((s, c) => draw(r, c, s)));
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

      // One spin of the reels; returns the evaluated result with winning cells lit
      async function spinOnce(lineBet) {
        document.querySelectorAll(".cell").forEach(c => c.classList.remove("win", "scat"));
        const grid = SlotMath.spin(m, api.rand);
        const reels = document.querySelectorAll(".reel");
        reels.forEach(el => el.classList.add("spinning"));
        const tick = setInterval(() => reels.forEach((el, r) => {
          if (el.classList.contains("spinning")) for (let c = 0; c < 3; c++) draw(r, c, m.syms[api.rand(m.syms.length)]);
        }), 70);
        for (let r = 0; r < 5; r++) {
          await wait(r === 0 ? 650 : 250);
          reels[r].classList.remove("spinning");
          for (let c = 0; c < 3; c++) draw(r, c, grid[r][c]);
        }
        clearInterval(tick);
        const res = SlotMath.evaluate(grid, lines, lineBet);
        for (const w of res.wins) for (let r = 0; r < w.count; r++) cell(r, SlotMath.LINES[w.line][r]).classList.add("win");
        if (res.scatters >= 3) grid.forEach((reel, r) => reel.forEach((s, c) => s.id === "scatter" && cell(r, c).classList.add("scat")));
        return res;
      }

      async function freeSpins(lineBet) {
        const fsb = $("fsb"); let won = 0;
        fsb.hidden = false;
        for (let i = 1; i <= SlotMath.FREE_SPINS; i++) {
          fsb.textContent = `FREE SPIN ${i} / ${SlotMath.FREE_SPINS} · WINS ×${SlotMath.FREE_MULT} · 🪙 ${fmt(won)}`;
          await wait(500);
          won += (await spinOnce(lineBet)).total * SlotMath.FREE_MULT;
          $("swin").textContent = fmt(won);
        }
        fsb.textContent = `FREE SPINS WON 🪙 ${fmt(won)}`;
        await wait(1200); fsb.hidden = true;
        return won;
      }

      function eggPick(totalBet) {
        return new Promise(done => {
          const ov = $("bonus"); let picks = 0, won = 0;
          ov.hidden = false;
          ov.innerHTML = `<div class="bonus-box"><h2>🥚 GOLDEN EGG BONUS</h2><p>Pick 3 eggs!</p>
            <div class="nest">${Array.from({ length: 9 }, (_, i) => `<button class="egg e-golden pickable" data-i="${i}"><span>?</span></button>`).join("")}</div>
            <div class="slot-msg" id="bmsg">Bonus total: 🪙 0</div></div>`;
          ov.querySelector(".nest").onclick = async e => {
            const b = e.target.closest(".pickable"); if (!b || picks >= 3) return;
            picks++;
            const x = SlotMath.eggPrize(api.rand), prize = x * totalBet;
            won += prize;
            b.classList.remove("pickable"); b.classList.add("cracked");
            b.innerHTML = `<span>×${x}<br><small>🪙 ${fmt(prize)}</small></span>`;
            $("bmsg").textContent = `Bonus total: 🪙 ${fmt(won)}`;
            if (picks === 3) { await wait(1600); ov.hidden = true; done(won); }
          };
        });
      }

      $("spin").onclick = async () => {
        if (busy) return;
        const lineBet = BETS[bi], total = lineBet * lines, msg = $("smsg");
        if (total > api.balance()) return (msg.textContent = "Not enough coins — lower your bet.");
        busy = true; $("spin").disabled = true;
        $("swin").textContent = 0; msg.textContent = "Spinning…";
        api.change(-total); ui();
        const res = await spinOnce(lineBet);
        let won = res.total, bonusWon = 0;
        if (res.scatters >= 3) {
          msg.innerHTML = `<span class="good">BONUS TRIGGERED!</span>`;
          await wait(900);
          bonusWon = m.bonus === "freespins" ? await freeSpins(lineBet) : await eggPick(total);
          won += bonusWon;
        }
        if (won) {
          api.change(won);
          $("swin").textContent = fmt(won);
          msg.innerHTML = `<span class="good">${won >= total * 10 ? "BIG WIN! " : ""}You won 🪙 ${fmt(won)}${bonusWon ? ` (bonus 🪙 ${fmt(bonusWon)})` : ""}!</span>`;
        } else msg.textContent = "No win — spin again!";
        ui(); busy = false; $("spin").disabled = false;
      };
    },
  };
}

GAMBO_GAMES["/megaslots"] = slotGame({ key: "mega", title: "Mega Slots", theme: "", bonusText: `3+ FREE = ${SlotMath.FREE_SPINS} free spins with all wins ×${SlotMath.FREE_MULT}` });
GAMBO_GAMES["/goose"] = slotGame({ key: "goose", title: "Golden Goose", theme: "farm", bonusText: "3+ 🥚 = Golden Egg bonus: pick 3 eggs for prizes" });

// ================= EGG SHELF =================
const TICKETS = [10, 50, 100, 500, 1000];
GAMBO_GAMES["/eggshelf"] = {
  title: "Egg Shelf",
  html: () => `
  <div class="egg-cab">
    <div class="slot-top"><div class="pill">🪙 <b id="ebal"></b></div><div class="slot-title">EGG SHELF</div><div class="pill">WIN <b id="ewin">0</b></div></div>
    <p class="egg-help">Crack all 9 eggs. Find <b>3 matching</b> to win! 🐣 Bonus chick doubles your prize.</p>
    <div class="prizes" id="prizes"></div>
    <div class="shelf" id="shelf"></div>
    <div class="slot-msg" id="emsg">Pick a ticket price and buy a shelf.</div>
    <div class="chips" id="tickets">${TICKETS.map((v, i) => `<button class="chip c${i}${i === 2 ? " sel" : ""}" data-v="${v}">${fmt(v)}</button>`).join("")}</div>
    <div class="slot-acts two"><button class="btn-sec" id="reveal" disabled>CRACK ALL</button><button class="spin" id="buy">BUY 🪙 100</button></div>
  </div>`,
  init(api) {
    let ticket = 100, game = null, opened = 0;
    const ui = () => {
      $("ebal").textContent = fmt(api.balance());
      $("buy").textContent = `BUY 🪙 ${fmt(ticket)}`;
      $("prizes").innerHTML = SlotMath.EGGS.map(e => `<div class="prize">${eggHtml(e, "tiny")}<b>🪙 ${fmt(e.x * ticket)}</b></div>`).join("");
    };
    const blank = () => ($("shelf").innerHTML = Array.from({ length: 9 }, () => `<div class="egg e-cover"><span>?</span></div>`).join(""));
    blank(); ui();
    $("tickets").onclick = e => {
      const b = e.target.closest(".chip"); if (!b || game) return;
      document.querySelectorAll("#tickets .chip").forEach(c => c.classList.remove("sel"));
      b.classList.add("sel"); ticket = +b.dataset.v; ui();
    };
    async function finish() {
      const g = game; game = null;
      $("reveal").disabled = true; $("buy").disabled = false;
      if (g.win) {
        document.querySelectorAll(`#shelf .e-${g.win.id}`).forEach(el => el.classList.add("match"));
        const prize = g.mult * ticket;
        api.change(prize);
        $("ewin").textContent = fmt(prize);
        $("emsg").innerHTML = `<span class="good">3 ${g.win.label} eggs! You win 🪙 ${fmt(prize)}${g.chick ? " (doubled by the bonus chick!)" : ""}</span>`;
      } else $("emsg").textContent = g.chick ? "Bonus chick found, but no 3 matching eggs. Try again!" : "No 3 matching eggs this time.";
      ui();
    }
    function open(i) {
      const el = $("shelf").children[i];
      if (!game || !el.classList.contains("e-cover")) return;
      const e = game.board[i];
      el.outerHTML = e.id === "chick" ? `<div class="egg e-chick cracked"><span>🐣</span></div>` : eggHtml(e, "cracked");
      if (++opened === 9) finish();
    }
    $("shelf").onclick = e => {
      const el = e.target.closest(".egg"); if (!el) return;
      open([...$("shelf").children].indexOf(el));
    };
    $("reveal").onclick = async () => { for (let i = 0; i < 9 && game; i++) { open(i); await wait(120); } };
    $("buy").onclick = () => {
      if (game) return;
      if (ticket > api.balance()) return ($("emsg").textContent = "Not enough coins for that ticket.");
      api.change(-ticket);
      game = SlotMath.eggShelf(api.rand); opened = 0;
      blank(); $("ewin").textContent = 0;
      $("reveal").disabled = false; $("buy").disabled = true;
      $("emsg").textContent = "Tap the eggs to crack them!";
      ui();
    };
  },
};

// ================= EGG HUNT =================
GAMBO_GAMES["/egghunt"] = {
  title: "Egg Hunt",
  html: () => `
  <div class="egg-cab hunt">
    <div class="slot-top"><div class="pill">🪙 <b id="hbal"></b></div><div class="slot-title">EGG HUNT</div><div class="pill">×<b id="hmult">1.00</b></div></div>
    <p class="egg-help">Crack eggs to raise your prize. Hit a 🤢 rotten egg and you lose it all — cash out any time!</p>
    <div class="nest hunt-nest" id="nest"></div>
    <div class="slot-msg" id="hmsg">Choose your bet and how many rotten eggs.</div>
    <div class="form-row" id="hsetup">
      <label class="muted">Bet <input id="hbet" type="number" min="1" value="100"></label>
      <label class="muted">Rotten eggs <select id="hrot"><option>1</option><option selected>3</option><option>5</option></select></label>
    </div>
    <div class="slot-acts two"><button class="btn-sec" id="cash" disabled>CASH OUT</button><button class="spin" id="hstart">START</button></div>
  </div>`,
  init(api) {
    let g = null;
    const N = SlotMath.HUNT_EGGS;
    const ui = () => {
      $("hbal").textContent = fmt(api.balance());
      $("hmult").textContent = g ? SlotMath.huntMultiplier(g.rotten, g.picks).toFixed(2) : "1.00";
      $("cash").disabled = !g || !g.picks;
      if (g && g.picks) $("cash").textContent = `CASH OUT 🪙 ${fmt(Math.floor(g.bet * SlotMath.huntMultiplier(g.rotten, g.picks)))}`;
      else $("cash").textContent = "CASH OUT";
    };
    const cover = () => ($("nest").innerHTML = Array.from({ length: N }, (_, i) => `<button class="egg e-cover" data-i="${i}"><span>?</span></button>`).join(""));
    cover(); ui();
    const revealAll = () => g.eggs.forEach((bad, i) => {
      const el = $("nest").children[i];
      if (el.classList.contains("e-cover")) el.outerHTML = `<div class="egg ${bad ? "e-rotten" : "e-normal"} dim"><span>${bad ? "🤢" : ""}</span></div>`;
    });
    const end = () => { g = null; $("hstart").disabled = false; $("hsetup").hidden = false; ui(); };
    $("hstart").onclick = () => {
      const bet = Math.floor(+$("hbet").value), rotten = +$("hrot").value;
      if (!(bet >= 1)) return ($("hmsg").textContent = "Enter a bet of at least 1.");
      if (bet > api.balance()) return ($("hmsg").textContent = "Not enough coins.");
      api.change(-bet);
      g = { bet, rotten, picks: 0, eggs: SlotMath.shuffle(Array.from({ length: N }, (_, i) => i < rotten), api.rand) };
      cover(); $("hstart").disabled = true; $("hsetup").hidden = true;
      $("hmsg").textContent = `Next egg: ×${SlotMath.huntMultiplier(rotten, 1).toFixed(2)}`;
      ui();
    };
    $("nest").onclick = e => {
      const el = e.target.closest(".e-cover"); if (!el || !g) return;
      const i = +el.dataset.i;
      if (g.eggs[i]) {
        el.outerHTML = `<div class="egg e-rotten cracked"><span>🤢</span></div>`;
        $("hmsg").innerHTML = `Rotten egg! You lost 🪙 ${fmt(g.bet)}.`;
        revealAll(); end(); return;
      }
      g.picks++;
      el.outerHTML = `<div class="egg e-golden cracked"><span>×${SlotMath.huntMultiplier(g.rotten, g.picks).toFixed(2)}</span></div>`;
      if (g.picks === N - g.rotten) { $("cash").disabled = false; $("cash").click(); return; }
      $("hmsg").textContent = `Next egg: ×${SlotMath.huntMultiplier(g.rotten, g.picks + 1).toFixed(2)}`;
      ui();
    };
    $("cash").onclick = () => {
      if (!g || !g.picks) return;
      const prize = Math.floor(g.bet * SlotMath.huntMultiplier(g.rotten, g.picks));
      api.change(prize);
      $("hmsg").innerHTML = `<span class="good">Cashed out 🪙 ${fmt(prize)}!</span>`;
      revealAll(); end();
    };
  },
};
