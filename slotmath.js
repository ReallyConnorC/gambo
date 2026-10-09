// Game maths, shared by the page and the payout simulator (node sim.js)
(function (g) {
  const LINES = [
    [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
    [0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[1,0,1,2,1],
  ];

  // ---------- 5x3 slot machines ----------
  // pay = wins for 3/4/5 in a row (x line bet). "wild" substitutes, "scatter" pays anywhere via bonus.
  const MACHINES = {
    mega: {
      syms: [
        { id: "cherry", icon: "🍒", w: 30, pay: [6, 14, 46] },
        { id: "lemon", icon: "🍋", w: 27, pay: [7, 18, 58] },
        { id: "melon", icon: "🍉", w: 22, pay: [12, 29, 92] },
        { id: "bell", icon: "🔔", w: 16, pay: [19, 58, 185] },
        { id: "clover", icon: "🍀", w: 12, pay: [29, 92, 290] },
        { id: "bar", icon: "BAR", w: 8, pay: [46, 140, 580] },
        { id: "diamond", icon: "💎", w: 5, pay: [80, 290, 1400] },
        { id: "seven", icon: "7", w: 3, pay: [140, 700, 2900] },
        { id: "wild", icon: "WILD", w: 5 },
        { id: "scatter", icon: "FREE", w: 4 },
      ],
      bonus: "freespins", // 3+ scatters: 8 free spins, all wins x2
    },
    goose: {
      syms: [
        { id: "corn", icon: "🌽", w: 30, pay: [6, 14, 46] },
        { id: "carrot", icon: "🥕", w: 27, pay: [7, 18, 58] },
        { id: "pig", icon: "🐷", w: 22, pay: [12, 29, 92] },
        { id: "cow", icon: "🐮", w: 16, pay: [19, 58, 185] },
        { id: "tractor", icon: "🚜", w: 12, pay: [29, 92, 290] },
        { id: "barn", icon: "🏡", w: 8, pay: [46, 140, 580] },
        { id: "rooster", icon: "🐓", w: 5, pay: [80, 290, 1400] },
        { id: "goose", icon: "🪿", w: 3, pay: [140, 700, 2900] },
        { id: "wild", icon: "WILD", w: 5 },
        { id: "scatter", icon: "🥚", w: 4 },
      ],
      bonus: "eggpick", // 3+ golden eggs: pick 3 of 9 eggs, each a multiplier of total bet
    },
  };
  const EGG_PRIZES = [ // multiplier of total bet, weight
    [1, 30], [2, 30], [3, 20], [5, 12], [10, 6], [25, 1.6], [50, 0.4],
  ];
  const FREE_SPINS = 8, FREE_MULT = 2;

  function weighted(list, rand, wOf) {
    const total = list.reduce((a, x) => a + wOf(x), 0);
    let r = rand(1e9) / 1e9 * total;
    for (const x of list) if ((r -= wOf(x)) < 0) return x;
    return list[list.length - 1];
  }
  function spin(m, rand) {
    return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => weighted(m.syms, rand, s => s.w)));
  }
  function evaluate(grid, lines, lineBet) {
    const wins = [];
    for (let l = 0; l < lines; l++) {
      const cells = LINES[l].map((row, reel) => grid[reel][row]);
      const base = cells.find(s => s.id !== "wild");
      if (!base || base.id === "scatter") continue;
      let n = 0;
      while (n < 5 && (cells[n].id === base.id || cells[n].id === "wild")) n++;
      if (n >= 3) wins.push({ line: l, count: n, sym: base, amount: base.pay[n - 3] * lineBet });
    }
    const scatters = grid.flat().filter(s => s.id === "scatter").length;
    return { wins, total: wins.reduce((a, w) => a + w.amount, 0), scatters };
  }
  const eggPrize = rand => weighted(EGG_PRIZES, rand, p => p[1])[0];

  // ---------- Egg Shelf: 9 eggs, 3 matching = win ----------
  const EGGS = [ // id, label, prize x ticket, chance per game
    { id: "mini", label: "Mini", x: 2, p: 0.18 },
    { id: "normal", label: "Normal", x: 5, p: 0.05 },
    { id: "large", label: "Large", x: 20, p: 0.01 },
    { id: "golden", label: "Golden", x: 100, p: 0.0005 },
    { id: "rainbow", label: "Rainbow", x: 1000, p: 0.00002 },
  ];
  const CHICK_CHANCE = 0.08; // bonus chick egg doubles any win
  function shuffle(a, rand) {
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function eggShelf(rand) {
    let r = rand(1e9) / 1e9, win = null;
    for (const e of EGGS) { if (r < e.p) { win = e; break; } r -= e.p; }
    const chick = rand(1e6) / 1e6 < CHICK_CHANCE;
    const board = win ? [win, win, win] : [];
    if (chick) board.push({ id: "chick", label: "Bonus" });
    const count = {};
    while (board.length < 9) { // fill without making a second set of 3
      const e = weighted(EGGS, rand, x => 1 / x.x + 0.05);
      if (e === win || (count[e.id] || 0) >= 2) continue;
      count[e.id] = (count[e.id] || 0) + 1;
      board.push(e);
    }
    return { board: shuffle(board, rand), win, chick, mult: win ? win.x * (chick ? 2 : 1) : 0 };
  }

  // ---------- Egg Hunt: avoid rotten eggs, cash out any time ----------
  const HUNT_EGGS = 12, HUNT_EDGE = 0.96;
  function huntMultiplier(rotten, picks) {
    let m = HUNT_EDGE;
    for (let i = 0; i < picks; i++) m *= (HUNT_EGGS - i) / (HUNT_EGGS - rotten - i);
    return picks ? Math.floor(m * 100) / 100 : 1;
  }

  g.SlotMath = { LINES, MACHINES, FREE_SPINS, FREE_MULT, EGG_PRIZES, spin, evaluate, eggPrize,
    EGGS, eggShelf, HUNT_EGGS, huntMultiplier, shuffle };
})(typeof window !== "undefined" ? window : globalThis);
