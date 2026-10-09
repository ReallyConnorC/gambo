// 5x3 slot maths, shared by the page and the payout simulator
(function (g) {
  const SYMS = [
    // id, display, weight, pays for 3/4/5 in a row (x line bet)
    { id: "cherry", icon: "🍒", w: 30, pay: [6, 15, 50] },
    { id: "lemon", icon: "🍋", w: 27, pay: [7, 18, 60] },
    { id: "melon", icon: "🍉", w: 22, pay: [12, 30, 100] },
    { id: "bell", icon: "🔔", w: 16, pay: [20, 60, 200] },
    { id: "clover", icon: "🍀", w: 12, pay: [30, 100, 300] },
    { id: "bar", icon: "BAR", w: 8, pay: [50, 150, 600] },
    { id: "diamond", icon: "💎", w: 5, pay: [80, 300, 1500] },
    { id: "seven", icon: "7", w: 3, pay: [150, 800, 3000] },
    { id: "wild", icon: "WILD", w: 5, pay: [0, 0, 0] }, // substitutes for anything
  ];
  const LINES = [
    [1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],
    [0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[1,0,1,2,1],
  ];
  const TOTAL = SYMS.reduce((a, s) => a + s.w, 0);
  function pick(rand) {
    let r = rand(TOTAL);
    for (const s of SYMS) if ((r -= s.w) < 0) return s;
  }
  // grid[reel][row]
  function spin(rand) {
    return Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => pick(rand)));
  }
  function evaluate(grid, lines, lineBet) {
    const wins = [];
    for (let l = 0; l < lines; l++) {
      const cells = LINES[l].map((row, reel) => grid[reel][row]);
      const base = cells.find(s => s.id !== "wild");
      if (!base) continue; // all wilds: no pay (keeps maths simple)
      let n = 0;
      while (n < 5 && (cells[n].id === base.id || cells[n].id === "wild")) n++;
      if (n >= 3) wins.push({ line: l, count: n, sym: base, amount: base.pay[n - 3] * lineBet });
    }
    return { wins, total: wins.reduce((a, w) => a + w.amount, 0) };
  }
  g.SlotMath = { SYMS, LINES, spin, evaluate };
})(typeof window !== "undefined" ? window : globalThis);
