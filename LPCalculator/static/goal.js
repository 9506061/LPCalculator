"use strict";
/* goal.js -- W10 目標規劃(Goal Programming,優先順序逐層求解) */

const GP_WANT = { ge: "≥ 目標(不希望不足 → min d⁻)", le: "≤ 目標(不希望超過 → min d⁺)", eq: "= 目標(min d⁻ + d⁺)" };
const GP_EX = {
  "Beaver Creek 陶器公司": {
    vars: [["x1", "碗"], ["x2", "杯子"]],
    goals: [["勞力工時至少40小時", [1, 2], null, "ge", 40, 1, 1], ["每日至少獲利$1600", [40, 50], null, "ge", 1600, 2, 1],
      ["陶土不超過120磅", [4, 3], null, "le", 120, 3, 1], ["加班時間愈少愈好", [0, 0], [0, "+"], "le", 0, 4, 1]], hard: [] },
  "Beaver Creek 陶器公司(加入加班上限與產量目標)": {
    vars: [["x1", "碗"], ["x2", "杯子"]],
    goals: [["勞力工時至少40小時", [1, 2], null, "ge", 40, 1, 1], ["每日至少獲利$1600", [40, 50], null, "ge", 1600, 2, 1],
      ["陶土不超過120磅", [4, 3], null, "le", 120, 3, 1], ["加班不超過10小時", [0, 0], [0, "+"], "le", 10, 4, 1],
      ["碗接近30個", [1, 0], null, "ge", 30, 5, 4], ["杯子接近20個", [0, 1], null, "ge", 20, 5, 5]],
    hard: [["倉庫:碗最多30個", [1, 0], "<=", 30], ["倉庫:杯子最多20個", [0, 1], "<=", 20]] },
  "Rucklehouse 民意調查公司": {
    vars: [["x1", "電話訪員人數", "int"], ["x2", "親自訪員人數", "int"]],
    goals: [["至少訪問3000人", [80, 40], null, "ge", 3000, 1, 1], ["每天預算最多$2500", [50, 70], null, "le", 2500, 2, 1],
      ["至少1000人來自電話訪問", [80, 0], null, "ge", 1000, 3, 1]], hard: [] },
  "社區診所人力配置": {
    vars: [["x1", "一般醫生GP時數"], ["x2", "護士時數"], ["x3", "內科醫生時數"]],
    goals: [["護士至少30小時", [0, 1, 0], null, "ge", 30, 1, 1], ["每週預算$1200不超過", [40, 20, 150], null, "le", 1200, 2, 1],
      ["GP+內科至少20小時", [1, 0, 1], null, "ge", 20, 3, 1], ["內科至少6小時", [0, 0, 1], null, "ge", 6, 4, 1]], hard: [] },
};
const GP_STORY = {
  "Beaver Creek 陶器公司": [
    "Beaver Creek 陶器公司生產碗(x1)與杯子(x2)。每個碗需勞力 1 小時、陶土 4 磅,獲利 $40;每個杯子需勞力 2 小時、陶土 3 磅,獲利 $50。",
    "每天正常勞力 40 小時、陶土 120 磅。管理者依重要性訂出目標:",
    "P1 勞力工時至少用滿 40 小時(避免員工閒置);P2 每日獲利至少 $1,600;P3 陶土使用不超過 120 磅;P4 加班時間愈少愈好。"],
  "Beaver Creek 陶器公司(加入加班上限與產量目標)": [
    "延續 Beaver Creek 陶器公司:碗每個需勞力 1 小時、陶土 4 磅,獲利 $40;杯子每個需勞力 2 小時、陶土 3 磅,獲利 $50。",
    "倉庫最多只能放 30 個碗、20 個杯子。目標依序為:P1 勞力至少 40 小時;P2 每日獲利至少 $1,600;P3 陶土不超過 120 磅;P4 加班不超過 10 小時;",
    "P5 盡量生產 30 個碗與 20 個杯子,兩者的權重依獲利比例設為 4 : 5。"],
  "Rucklehouse 民意調查公司": [
    "Rucklehouse 公司要進行民意調查,可以雇用電話訪員(x1)與親自訪問的訪員(x2),人數必須是整數。",
    "電話訪員每人每天可訪問 80 人、成本 $50;親自訪員每人每天可訪問 40 人、成本 $70。",
    "目標依序為:P1 每天至少訪問 3,000 人;P2 每天預算不超過 $2,500;P3 至少 1,000 人來自電話訪問。"],
  "社區診所人力配置": [
    "社區診所要安排一般醫生(GP)、護士、內科醫生每週的工作時數,時薪分別為 $40、$20、$150。",
    "目標依序為:P1 護士每週至少 30 小時;P2 每週人事預算不超過 $1,200;P3 GP 與內科醫生合計至少 20 小時;P4 內科醫生至少 6 小時。"],
};
const GP = { vars: [], goals: [], hard: [], result: null, error: null, title: "", story: null };

function gpLoad(key) {
  const e = GP_EX[key];
  GP.vars = e.vars.map(([name, label, kind]) => ({ name, label, kind: kind || "cont" }));
  GP.goals = e.goals.map(([name, a, dev, want, target, priority, weight]) =>
    ({ name, a: [...a], dev: dev ? [{ goal: dev[0], side: dev[1], coef: 1 }] : [], want, target, priority, weight }));
  GP.hard = e.hard.map(([name, a, op, b]) => ({ name, a: [...a], op, b }));
  GP.result = null; GP.error = null;
  GP.title = key; GP.story = GP_STORY[key] || null;
}
const dn = (k, side) => `d${k + 1}${side === "-" ? "⁻" : "⁺"}`;
const undesired = g => ({ ge: ["-"], le: ["+"], eq: ["-", "+"] }[g.want]);

function gpGoalExpr(g) {
  const names = GP.vars.map(v => v.name || "?");
  let sx = g.a.some(x => Number(x)) ? exprText(g.a, names) : "";
  (g.dev || []).forEach(d => { sx = sx ? `${sx} + ${dn(d.goal, d.side)}` : dn(d.goal, d.side); });
  return sx || "0";
}
function gpModelLines() {
  const byP = {};
  GP.goals.forEach((g, k) => undesired(g).forEach(sd => {
    const w = Number(g.weight === "" ? 1 : g.weight);
    (byP[g.priority] = byP[g.priority] || []).push((w !== 1 ? fmt(w) : "") + dn(k, sd));
  }));
  const obj = Object.keys(byP).map(Number).sort((a, b) => a - b).map(p => `P${p}(${byP[p].join(" + ")})`).join(", ");
  const lines = [`min ( ${obj} )`, "subject to"];
  GP.goals.forEach((g, k) => lines.push(`    ${gpGoalExpr(g)} + ${dn(k, "-")} - ${dn(k, "+")} = ${fmt(g.target === "" ? 0 : g.target)}      (${g.name})`));
  const names = GP.vars.map(v => v.name || "?");
  GP.hard.forEach(c => lines.push(`    ${exprText(c.a, names)} ${OPSYM[c.op]} ${fmt(c.b === "" ? 0 : c.b)}      (${c.name},系統限制)`));
  lines.push(...kindLines(GP.vars));
  lines.push("    所有離差變數 dᵢ⁻, dᵢ⁺ ≥ 0");
  return lines;
}

function gpResize(n) {
  n = Math.max(1, Math.min(20, n | 0));
  while (GP.vars.length < n) { GP.vars.push({ name: `x${GP.vars.length + 1}`, label: `x${GP.vars.length + 1}`, kind: "cont" }); GP.goals.forEach(g => g.a.push(0)); GP.hard.forEach(c => c.a.push(0)); }
  while (GP.vars.length > n) { GP.vars.pop(); GP.goals.forEach(g => g.a.pop()); GP.hard.forEach(c => c.a.pop()); }
}
function gpDeleteGoal(k) {
  GP.goals.splice(k, 1);
  GP.goals.forEach(g => {
    g.dev = (g.dev || []).filter(d => d.goal !== k).map(d => ({ ...d, goal: d.goal > k ? d.goal - 1 : d.goal }));
  });
}

window.renderGoal = function renderGoal() {
  const root = $("#view-goal");
  const y = window.scrollY;
  root.replaceChildren();
  const left = h("div", {}), right = h("div", { id: "gp-result" });
  root.append(h("div", { class: "layout" }, left, right));
  const preview = h("pre", { class: "model" });
  const upd = () => { preview.textContent = gpModelLines().join("\n"); };
  const re = () => { GP.result = null; renderGoal(); };

  left.append(h("div", { class: "card tip" }, h("h2", {}, "目標規劃(Goal Programming)"), h("ul", { class: "notes" },
    h("li", {}, "每個目標寫成目標限制式:左式 + d⁻ − d⁺ = 目標值(d⁻ 不足量、d⁺ 超過量)。"),
    h("li", {}, "只最小化「管理者不希望發生」的離差:希望 ≥ 目標 → min d⁻;希望 ≤ 目標 → min d⁺。"),
    h("li", {}, "依優先順序 P1 > P2 > … 逐層求解(Preemptive);同一優先層可用權重加權。"),
    h("li", {}, "「離差項」可讓目標建立在另一個目標的離差變數上(例如加班 d1⁺ ≤ 10),即「目標中的目標」。"))));

  const sel = h("select", { "aria-label": "載入範例" }, h("option", { value: "" }, "— 選擇題目 —"), Object.keys(GP_EX).map(k => h("option", { value: k, selected: k === GP.title }, k)));
  sel.addEventListener("change", () => { if (sel.value) { gpLoad(sel.value); renderGoal(); } });
  const nIn = h("input", { type: "number", min: 1, max: 20, value: GP.vars.length, class: "num", "aria-label": "決策變數個數" });
  nIn.addEventListener("change", () => { gpResize(Number(nIn.value) || 1); re(); });
  const varTbl = h("table", { class: "grid-in" }, h("tbody", {},
    h("tr", {}, h("th", { class: "l" }, "名稱"), GP.vars.map(v => h("td", {}, textInput(() => v.name, x => v.name = x.trim(), "name", "變數名稱", upd)))),
    h("tr", {}, h("th", { class: "l" }, "說明"), GP.vars.map(v => h("td", {}, textInput(() => v.label, x => v.label = x, "name", "變數說明")))),
    kindRows(GP.vars, () => { upd(); const b = nonnegAllButton(GP.vars, renderGoal); allBtn.replaceWith(b); allBtn = b; })));
  let allBtn = nonnegAllButton(GP.vars, renderGoal);
  left.append(h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "1. 決策變數"), allBtn),
    h("div", { class: "row" }, h("label", { class: "field" }, "範例題目", sel), h("label", { class: "field" }, "決策變數個數", nIn)),
    h("div", { class: "scroll-x" }, varTbl)));
  if (GP.story) left.insertBefore(problemCard(GP.title, GP.story, () => { GP.story = null; renderGoal(); }), left.lastChild);

  // 目標
  const gBody = h("tbody", {});
  GP.goals.forEach((g, k) => {
    const want = h("select", { "aria-label": "目標型態" }, Object.entries(GP_WANT).map(([v, t]) => h("option", { value: v, selected: g.want === v }, t)));
    want.addEventListener("change", () => { g.want = want.value; upd(); });
    const devSel = h("select", { "aria-label": "附加離差項" }, h("option", { value: "" }, "—"),
      GP.goals.flatMap((_, j) => j === k ? [] : ["+", "-"].map(sd => h("option", { value: `${j}${sd}`,
        selected: (g.dev || []).some(d => d.goal === j && d.side === sd) }, `+ ${dn(j, sd)}`))));
    devSel.addEventListener("change", () => {
      const v = devSel.value;
      g.dev = v ? [{ goal: Number(v.slice(0, -1)), side: v.slice(-1), coef: 1 }] : []; upd();
    });
    gBody.append(h("tr", {},
      h("td", {}, h("span", { class: "pri" }, "P"), numInput(() => g.priority, v => g.priority = v, { label: "優先順序", onChange: upd })),
      h("td", { class: "l" }, textInput(() => g.name, v => g.name = v, "wide", "目標名稱", upd)),
      GP.vars.map((_, j) => h("td", {}, numInput(() => g.a[j], v => g.a[j] = v, { label: "係數", onChange: upd }))),
      h("td", {}, devSel), h("td", {}, want), h("td", {}, numInput(() => g.target, v => g.target = v, { label: "目標值", onChange: upd })),
      h("td", {}, numInput(() => g.weight, v => g.weight = v, { label: "權重", onChange: upd })),
      h("td", {}, h("button", { class: "btn icon", title: "刪除", "aria-label": "刪除這個目標", onclick: () => { gpDeleteGoal(k); re(); } }, "✕"))));
  });
  left.append(h("div", { class: "card" }, h("h2", {}, "2. 目標(Goal Constraints)"),
    h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, h("tr", {}, h("th", {}, "優先"), h("th", { class: "l" }, "名稱"),
      GP.vars.map(v => h("th", {}, v.name)), h("th", {}, "離差項"), h("th", {}, "型態"), h("th", {}, "目標值"), h("th", {}, "權重"), h("th", {}, ""))), gBody)),
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", onclick: () => {
      const p = GP.goals.reduce((m, g) => Math.max(m, Number(g.priority) || 0), 0) + 1;
      GP.goals.push({ name: `目標${GP.goals.length + 1}`, a: GP.vars.map(() => 0), dev: [], want: "ge", target: 0, priority: p, weight: 1 }); re();
    } }, "+ 新增目標"))));

  // 系統限制
  const hBody = h("tbody", {});
  GP.hard.forEach((c, ci) => {
    const op = h("select", { "aria-label": "符號" }, ["<=", "=", ">="].map(o => h("option", { value: o, selected: c.op === o }, OPSYM[o])));
    op.addEventListener("change", () => { c.op = op.value; upd(); });
    hBody.append(h("tr", {}, h("td", { class: "l" }, textInput(() => c.name, v => c.name = v, "wide", "名稱", upd)),
      GP.vars.map((_, j) => h("td", {}, numInput(() => c.a[j], v => c.a[j] = v, { label: "係數", onChange: upd }))),
      h("td", {}, op), h("td", {}, numInput(() => c.b, v => c.b = v, { label: "右端常數", onChange: upd })),
      h("td", {}, h("button", { class: "btn icon", title: "刪除", "aria-label": "刪除這條限制式", onclick: () => { GP.hard.splice(ci, 1); re(); } }, "✕"))));
  });
  left.append(h("div", { class: "card" }, h("h2", {}, "3. 系統限制式(不可違反,選填)"),
    h("p", { class: "hint" }, "例如倉庫空間限制「碗最多 30 個」。與目標不同,這類限制一定要滿足。"),
    GP.hard.length ? h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, "名稱"),
      GP.vars.map(v => h("th", {}, v.name)), h("th", {}, ""), h("th", {}, "RHS"), h("th", {}, ""))), hBody)) : null,
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", onclick: () => {
      GP.hard.push({ name: `系統限制${GP.hard.length + 1}`, a: GP.vars.map(() => 0), op: "<=", b: 0 }); re(); } }, "+ 新增系統限制式"))));

  upd();
  const btn = h("button", { class: "btn primary" }, "逐層求解 (Solve)");
  btn.addEventListener("click", async () => {
    btn.disabled = true; btn.textContent = "求解中…";
    try {
      GP.result = await api("/api/goal", { vars: GP.vars, hard: GP.hard,
        goals: GP.goals.map(g => ({ ...g, dev: (g.dev || []).map(d => ({ ...d })) })) });
      GP.error = null;
    } catch (e) { GP.result = null; GP.error = e.message; }
    gpShowResult(); btn.disabled = false; btn.textContent = "逐層求解 (Solve)";
  });
  left.append(h("div", { class: "card" }, h("h2", {}, "4. 完整目標規劃模式"), preview, h("div", { class: "row", style: "margin-top:12px" }, btn)));
  gpShowResult();
  window.scrollTo(0, y);
};

// 一個目標 → 容量條 + 白話結論
function goalItem(g) {
  const pct = v => (clamp(v, 0, 1) * 100).toFixed(2) + "%";
  const neg = g.value < -1e-9 || g.target < -1e-9;
  const word = { ge: "至少", le: "不超過", eq: "剛好" }[g.want] || "";
  const diff = Math.abs(g.value - g.target);
  let track = null, say;
  if (!neg && Math.max(g.value, g.target) > 1e-12) {
    const mx = Math.max(g.value, g.target) * 1.08;
    track = h("div", { class: "cap-track" },
      h("div", { class: "cap-used" + (g.achieved ? "" : " hot"), style: `width:${pct(g.value / mx)}` }, g.value / mx > 0.18 ? `實際 ${fmt(g.value)}` : ""),
      h("div", { class: "cap-mark", style: `left:${pct(g.target / mx)}` }, h("span", {}, `目標 ${fmt(g.target)}`)));
  }
  if (g.achieved) say = diff < 1e-9 ? `達成:剛好等於目標 ${fmt(g.target)}。` : `達成:實際 ${fmt(g.value)},${g.want === "le" ? `比上限少 ${fmt(diff)}` : `比目標多 ${fmt(diff)}`}。`;
  else say = g.dminus > 1e-9 ? `未達成:實際 ${fmt(g.value)},還差 ${fmt(g.dminus)} 才到目標。` : `未達成:實際 ${fmt(g.value)},超過目標 ${fmt(g.dplus)}。`;
  if (!g.achieved) say += " 因為要先滿足優先順序更高的目標,這個目標只能讓步。";
  const item = h("div", { class: "cap" },
    h("div", { class: "cap-head" }, h("span", { class: "pri-tag" }, `P${g.priority}`), h("b", {}, g.name),
      h("span", { class: "pill " + (g.achieved ? "good" : "bind") }, g.achieved ? "達成" : "未達成"),
      h("span", { class: "cap-val" }, `實際 ${fmt(g.value)} / 目標 ${word} ${fmt(g.target)}`)),
    track, h("div", { class: "cap-say" }, say));
  tipOn(item, `${g.name}(P${g.priority}${g.weight !== 1 ? `,權重 ${fmt(g.weight)}` : ""})\n${g.text}\nd⁻ = ${fmt(g.dminus)},d⁺ = ${fmt(g.dplus)}`);
  return item;
}

// ---------- 兩個變數時的目標規劃圖(可拖曳目標線、試算點)
function gpGraphCard(r) {
  if (GP.vars.length !== 2) return null;
  const num = v => Number(v) || 0;
  const names = GP.vars.map(v => v.name || "?");
  const sol = [r.x[0].value, r.x[1].value];
  const nn = GP.vars.map(v => isNonneg(v.kind));
  const hard = GP.hard.map(c => ({ name: c.name, a: [num(c.a[0]), num(c.a[1])], op: c.op, b: num(c.b) }));
  GP.vars.forEach((v, j) => {
    const e = j ? [0, 1] : [1, 0];
    if (nn[j]) hard.push({ name: `${v.name} ≥ 0`, a: e, op: ">=", b: 0, bound: true });
    if (v.kind === "bin") hard.push({ name: `${v.name} ≤ 1`, a: e, op: "<=", b: 1, bound: true });
  });
  // 只畫「只含決策變數」的目標(含其他離差項的目標,例如加班,無法畫成一條線)
  const goals = GP.goals.map((g, k) => ({ k, name: g.name, p: g.priority, want: g.want, a: [num(g.a[0]), num(g.a[1])], t0: num(g.target), t: num(g.target), res: r.goals[k] }))
    .filter(o => !(GP.goals[o.k].dev || []).length && (Math.abs(o.a[0]) > 1e-12 || Math.abs(o.a[1]) > 1e-12));
  if (!goals.length) return null;

  // 視窗:各線與座標軸的交點 + 解
  const lines = [...hard.filter(c => !c.bound), ...goals.map(o => ({ a: o.a, b: o.t }))];
  const pts = [sol];
  lines.forEach(l => { if (Math.abs(l.a[0]) > 1e-12) pts.push([l.b / l.a[0], 0]); if (Math.abs(l.a[1]) > 1e-12) pts.push([0, l.b / l.a[1]]); });
  const fin = pts.filter(p => isFinite(p[0]) && isFinite(p[1]));
  const xs = fin.map(p => p[0]), ys = fin.map(p => p[1]);
  let xl = nn[0] ? 0 : Math.min(0, ...xs), xh = Math.max(...xs, 1), yl = nn[1] ? 0 : Math.min(0, ...ys), yh = Math.max(...ys, 1);
  const w = { xl: xl - (nn[0] ? 0.04 : 0.1) * (xh - xl), xh: xh + 0.15 * (xh - xl), yl: yl - (nn[1] ? 0.04 : 0.1) * (yh - yl), yh: yh + 0.15 * (yh - yl) };

  const W = 760, H = 520, M = { l: 64, r: 24, t: 20, b: 56 };
  const sx = x => M.l + ((x - w.xl) / (w.xh - w.xl)) * (W - M.l - M.r);
  const sy = y => H - M.b - ((y - w.yl) / (w.yh - w.yl)) * (H - M.t - M.b);
  const ix = px => w.xl + ((px - M.l) / (W - M.l - M.r)) * (w.xh - w.xl);
  const iy = py => w.yl + ((H - M.b - py) / (H - M.t - M.b)) * (w.yh - w.yl);
  const svg = s("svg", { class: "plot drag", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "目標規劃圖形(可拖曳目標線與試算點)" });
  const nice = (lo, hi) => {
    const raw = (hi - lo) / 7, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map(m => m * p).find(v => v >= raw), out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(parseFloat(v.toFixed(8)));
    return out;
  };
  nice(w.xl, w.xh).forEach(v => { svg.append(s("line", { x1: sx(v), x2: sx(v), y1: M.t, y2: H - M.b, stroke: "var(--line-soft)" }), s("text", { class: "tick", x: sx(v), y: H - M.b + 16, "text-anchor": "middle" }, fmt(v))); });
  nice(w.yl, w.yh).forEach(v => { svg.append(s("line", { y1: sy(v), y2: sy(v), x1: M.l, x2: W - M.r, stroke: "var(--line-soft)" }), s("text", { class: "tick", x: M.l - 8, y: sy(v) + 4, "text-anchor": "end" }, fmt(v))); });
  svg.append(s("line", { x1: M.l, x2: W - M.r, y1: sy(0), y2: sy(0), stroke: "var(--ink-2)" }), s("line", { y1: M.t, y2: H - M.b, x1: sx(0), x2: sx(0), stroke: "var(--ink-2)" }));
  svg.append(s("text", { x: (M.l + W - M.r) / 2, y: H - 12, "text-anchor": "middle", "font-size": 14 }, `${names[0]}(${GP.vars[0].label})`));
  svg.append(s("text", { x: 16, y: (M.t + H - M.b) / 2, "text-anchor": "middle", "font-size": 14, transform: `rotate(-90 16 ${(M.t + H - M.b) / 2})` }, `${names[1]}(${GP.vars[1].label})`));

  // 系統限制形成的可行區域(固定)
  const region = regionIn(hard, w);
  if (region.length >= 3 && hard.some(c => !c.bound))
    svg.append(s("polygon", { points: region.map(p => `${sx(p[0])},${sy(p[1])}`).join(" "), fill: "var(--feasible-soft)", stroke: "var(--feasible)", "stroke-width": 1.5, "pointer-events": "none" }));
  hard.filter(c => !c.bound).forEach(c => {
    const seg = clipToWindow(c.a[0], c.a[1], c.b, w);
    if (!seg) return;
    const pos = { x1: sx(seg[0][0]), y1: sy(seg[0][1]), x2: sx(seg[1][0]), y2: sy(seg[1][1]) };
    const g_ = s("g", { class: "cline" }, s("line", { class: "vis", ...pos, stroke: "var(--feasible)", "stroke-width": 1.6 }), s("line", { class: "hit", ...pos }));
    tipOn(g_, `系統限制:${c.name}\n${exprText(c.a, names)} ${OPSYM[c.op]} ${fmt(c.b)}`);
    svg.append(g_);
  });

  const layer = s("g", {});
  svg.append(layer);
  let newSol = null;
  const metAt = (o, p) => {
    const v = o.a[0] * p[0] + o.a[1] * p[1], eps = 1e-7 * (1 + Math.abs(o.t));
    return o.want === "ge" ? v >= o.t - eps : o.want === "le" ? v <= o.t + eps : Math.abs(v - o.t) <= eps;
  };
  const paint = active => {
    layer.replaceChildren();
    goals.forEach((o, gi) => {
      const seg = clipToWindow(o.a[0], o.a[1], o.t, w);
      if (!seg) return;
      const moved = Math.abs(o.t - o.t0) > 1e-12;
      const ok = metAt(o, newSol || sol);
      const col = ok ? "var(--objective)" : "var(--optimum)";
      const pos = { x1: sx(seg[0][0]), y1: sy(seg[0][1]), x2: sx(seg[1][0]), y2: sy(seg[1][1]) };
      const grp = s("g", { class: "cline movable" + (gi === active ? " active" : ""), "data-g": gi },
        s("line", { class: "vis", ...pos, stroke: moved ? "var(--ink)" : col, "stroke-width": moved ? 2.6 : 2, "stroke-dasharray": moved ? null : "7 4" }),
        s("line", { class: "hit", ...pos }));
      tipOn(grp, () => `P${o.p} ${o.name}\n${exprText(o.a, names)} ${{ ge: "≥", le: "≤", eq: "=" }[o.want]} ${fmt(o.t)}${moved ? `\n(原本目標 ${fmt(o.t0)})` : ""}\n↔ 按住拖曳可改變目標值`);
      layer.append(grp);
      // 標籤 + 指向「希望的一側」的小箭頭
      const t = 0.18 + 0.64 * ((gi * 0.37) % 1), mx_ = seg[0][0] + (seg[1][0] - seg[0][0]) * t, my_ = seg[0][1] + (seg[1][1] - seg[0][1]) * t;
      const nx = o.a[0] / (w.xh - w.xl), ny = o.a[1] / (w.yh - w.yl), nl = Math.hypot(nx, ny) || 1;
      const sign = o.want === "le" ? -1 : 1, ux = (sign * nx) / nl, uy = (-sign * ny) / nl;
      const px = sx(mx_), py = sy(my_);
      if (o.want !== "eq") {
        layer.append(s("line", { x1: px, y1: py, x2: px + ux * 22, y2: py + uy * 22, stroke: col, "stroke-width": 2, "pointer-events": "none" }),
          s("circle", { cx: px + ux * 22, cy: py + uy * 22, r: 3, fill: col, "pointer-events": "none" }));
      }
      layer.append(s("text", { class: "halo", x: px - ux * 8, y: py - uy * 8 - 4, "font-size": 12, "font-weight": 700, fill: col, "text-anchor": "middle", "pointer-events": "none" },
        `P${o.p} ${o.name}${moved ? `(${fmt(o.t0)}→${fmt(o.t)})` : ""}`));
    });
    const dot = (p, cls) => {
      layer.append(s("circle", { cx: sx(p[0]), cy: sy(p[1]), r: 8, fill: cls === "new" ? "var(--panel)" : "var(--optimum)", stroke: "var(--optimum)", "stroke-width": cls === "new" ? 3 : 2.5, "pointer-events": "none" }),
        s("text", { class: "halo", x: sx(p[0]) + 11, y: sy(p[1]) + 20, "font-size": 12, "font-weight": 700, "pointer-events": "none" }, `${cls === "new" ? "新解 " : "最滿意解 "}(${r2(p[0])}, ${r2(p[1])})`));
    };
    dot(sol, "sol");
    if (newSol && Math.hypot(newSol[0] - sol[0], newSol[1] - sol[1]) > 1e-7 * (1 + Math.abs(sol[0]) + Math.abs(sol[1]))) dot(newSol, "new");
  };

  // 試算點
  const out = h("div", { class: "probe-out", "aria-live": "polite" });
  const knobDot = s("circle", { class: "ring", r: 9, fill: "var(--objective)", stroke: "var(--panel)", "stroke-width": 2.5 });
  const knob = s("g", { class: "probe drag", tabindex: 0, role: "slider", "aria-label": "試算點" }, s("circle", { r: 18, fill: "transparent" }), knobDot);
  svg.append(knob);
  let cur = [...sol];
  const show = () => {
    knob.setAttribute("transform", `translate(${sx(cur[0])},${sy(cur[1])})`);
    const feas = probeEval({ c: [0, 0], hps: hard, integer: null }, cur[0], cur[1]);
    knobDot.setAttribute("fill", feas.feasible ? "var(--objective)" : "var(--ink-2)");
    out.replaceChildren(...[h("span", {}, "試算點 ", h("b", {}, `${names[0]} = ${r2(cur[0])},${names[1]} = ${r2(cur[1])}`)),
      ...goals.map(o => h("span", { class: "pill " + (metAt(o, cur) ? "ok" : "bad") }, `P${o.p} ${o.name} ${metAt(o, cur) ? "✓" : "✗"}`)),
      feas.feasible ? null : h("span", { class: "hint", style: "margin:0" }, "違反系統限制:" + feas.bad.join("、")),
      h("button", { class: "btn icon", type: "button", onclick: () => { cur = [...sol]; show(); } }, "回到最滿意解")].filter(Boolean));
  };
  const xStep = GP.vars[0].kind !== "cont" && GP.vars[0].kind !== "free" ? 1 : Math.pow(10, Math.floor(Math.log10((w.xh - w.xl) / 100)));
  const yStep = GP.vars[1].kind !== "cont" && GP.vars[1].kind !== "free" ? 1 : Math.pow(10, Math.floor(Math.log10((w.yh - w.yl) / 100)));
  const snapTo = (v, st) => parseFloat((Math.round(v / st) * st).toFixed(10));

  // 假設分析:放開目標線後重新逐層求解
  const what = h("div", { class: "whatif", hidden: true, "aria-live": "polite" });
  const resolve = async () => {
    const changed = goals.filter(o => Math.abs(o.t - o.t0) > 1e-12);
    if (!changed.length) { newSol = null; what.hidden = true; paint(); return; }
    what.hidden = false; what.replaceChildren(h("span", {}, "重新求解中…"));
    try {
      const body = { vars: GP.vars, hard: GP.hard, goals: GP.goals.map((g, k) => {
        const o = goals.find(q => q.k === k);
        return { ...g, target: o ? o.t : g.target, dev: (g.dev || []).map(d => ({ ...d })) };
      }) };
      const nr = await api("/api/goal", body);
      newSol = [nr.x[0].value, nr.x[1].value];
      const nOk = nr.goals.filter(g => g.achieved).length, oOk = r.goals.filter(g => g.achieved).length;
      what.replaceChildren(
        h("div", {}, h("b", {}, "假設分析:"), changed.map((o, i) => h("span", {}, `${i ? "、" : ""}${o.name} 目標 ${fmt(o.t0)} → `, h("b", {}, fmt(o.t))))),
        h("div", { class: "whatif-res" }, h("span", {}, "新的最滿意解 ", h("b", {}, `${names[0]} = ${r2(newSol[0])},${names[1]} = ${r2(newSol[1])}`),
          Math.hypot(newSol[0] - sol[0], newSol[1] - sol[1]) < 1e-7 * (1 + Math.abs(sol[0]) + Math.abs(sol[1])) ? "(解不變)" : null),
          h("span", {}, `達成 ${nOk} / ${nr.goals.length} 個目標`, nOk !== oOk ? h("span", { class: "delta " + (nOk > oOk ? "up" : "down") }, `(原本 ${oOk} 個)`) : null),
          h("span", { class: "hint", style: "margin:0" }, "未達成:" + (nr.goals.filter(g => !g.achieved).map(g => `P${g.priority} ${g.name}`).join("、") || "無"))),
        h("div", { class: "row", style: "margin:6px 0 0" },
          h("button", { class: "btn icon", type: "button", onclick: () => { goals.forEach(o => { o.t = o.t0; }); newSol = null; what.hidden = true; paint(); } }, "還原目標"),
          h("button", { class: "btn icon", type: "button", onclick: () => {
            changed.forEach(o => { GP.goals[o.k].target = o.t; });
            renderGoal(); $("#view-goal button.primary").click();
          } }, "套用到左邊的模型")));
    } catch (e) { newSol = null; what.replaceChildren(h("span", { class: "pill bad" }, e.message)); }
    paint();
  };

  let mode = null;
  dragOn(svg, svg, (pt, phase) => {
    if (phase === "end") { const m_ = mode; mode = null; if (m_ && m_.g != null) resolve(); return; }
    if (mode.g != null) {
      if (phase === "start") return;
      const o = goals[mode.g];
      const dlt = (o.a[0] * ix(pt.x) + o.a[1] * iy(pt.y)) - (o.a[0] * ix(mode.p0.x) + o.a[1] * iy(mode.p0.y));
      const scale = Math.max(Math.abs(o.t0), Math.abs(o.a[0]) * (w.xh - w.xl), Math.abs(o.a[1]) * (w.yh - w.yl), 1e-9);
      const stp = Math.pow(10, Math.floor(Math.log10(scale)) - 1);
      o.t = parseFloat((Math.round((mode.b0 + dlt) / stp) * stp).toFixed(10));
      paint(mode.g);
    } else { cur = [snapTo(clamp(ix(pt.x), w.xl, w.xh), xStep), snapTo(clamp(iy(pt.y), w.yl, w.yh), yStep)]; show(); }
  }, e => {
    const cl = e.target.closest(".cline.movable");
    mode = cl ? { g: Number(cl.dataset.g), p0: svgPoint(svg, e), b0: goals[Number(cl.dataset.g)].t } : { g: null };
    return true;
  });
  knob.addEventListener("keydown", e => {
    const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
    if (!k) return;
    e.preventDefault();
    const m_ = e.shiftKey ? 10 : 1;
    cur = [snapTo(cur[0] + k[0] * xStep * m_, xStep), snapTo(cur[1] + k[1] * yStep * m_, yStep)]; show();
  });
  paint(); show();

  const skipped = GP.goals.length - goals.length;
  return h("div", { class: "card" }, h("h2", {}, "圖形化分析(可互動)"),
    h("p", { class: "hint" }, "每條虛線是一個目標,小箭頭指向「希望的那一側」;橘色 = 最滿意解有達成,紅色 = 沒達成。① 按住目標線拖曳可以改變目標值,放開後會重新逐層求解。② 在其他地方拖曳可移動試算點,檢查那一點滿足哪些目標。"),
    svg, what, out,
    h("div", { class: "legend" },
      h("span", {}, h("i", { style: "border-color:var(--objective);border-top-style:dashed" }), "已達成的目標"),
      h("span", {}, h("i", { style: "border-color:var(--optimum);border-top-style:dashed" }), "未達成的目標"),
      hard.some(c => !c.bound) && h("span", {}, h("i", { class: "box" }), "系統限制的可行區域")),
    skipped > 0 && h("p", { class: "hint" }, `另有 ${skipped} 個目標含有其他離差變數(例如加班時數),無法畫成一條直線,請參考上方的達成情形。`));
}

function gpShowResult() {
  const box = $("#gp-result");
  box.replaceChildren();
  if (GP.error) { box.append(h("div", { class: "banner err" }, GP.error)); return; }
  const r = GP.result;
  if (!r) { box.append(h("div", { class: "empty" }, "設定目標與優先順序後按「逐層求解」,會依 P1 → P2 → … 的順序求出最滿意解。")); return; }

  // 1. 最滿意解
  const ans = h("div", { class: "answer" });
  r.x.forEach(v => ans.append(h("div", { class: "cell" }, h("small", {}, v.label !== v.name ? `${v.label}(${v.name})` : v.name), h("b", {}, fmt(v.value)))));
  const nOk = r.goals.filter(g => g.achieved).length;
  box.append(h("div", { class: "card" }, h("h2", {}, "最滿意解(Most Satisfactory Solution)"),
    h("div", { class: nOk === r.goals.length ? "banner ok" : "banner warn" },
      `${r.is_integer ? "已求得最滿意整數解" : "已求得最滿意解"}:${r.goals.length} 個目標中達成 ${nOk} 個。`), ans,
    h("h3", {}, "結果解讀"), h("ul", { class: "notes" }, r.summary.map(t => h("li", {}, t)))));

  // 2. 圖形(兩個變數時)
  const gc = gpGraphCard(r);
  if (gc) box.append(gc);

  // 3. 各目標達成情形
  const goals = r.goals.map((g, i) => ({ g, i })).sort((a, b) => a.g.priority - b.g.priority || a.i - b.i).map(o => o.g);
  box.append(h("div", { class: "card" }, h("h2", {}, "各目標達成情形"),
    h("div", { class: "cap-legend" },
      h("span", {}, h("i", { class: "sw used" }), "實際值(達成)"),
      h("span", {}, h("i", { class: "sw hot" }), "實際值(未達成)"),
      h("span", {}, h("i", { class: "sw mark" }), "目標值")),
    h("p", { class: "hint" }, "依優先順序排列(P1 最重要)。系統會先滿足高優先的目標,再在不犧牲它的前提下照顧較低優先的目標。"),
    h("div", { class: "caps" }, goals.map(goalItem))));

  // 4. 系統限制
  if (r.hard.length) box.append(h("div", { class: "card" }, h("h2", {}, "系統限制使用情形"),
    h("div", { class: "caps" }, r.hard.map(c => constraintBar({ name: c.name, lhs: c.lhs, rhs: c.rhs, op: c.op, binding: c.binding,
      slack: Math.abs(c.rhs - c.lhs), shadow: null, text: c.text })))));

  // 5. 公式與逐層過程(預設收合)
  const steps = h("table", { class: "data" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, "求解次序"), h("th", { class: "l" }, "優先層"),
    h("th", { class: "l" }, "最小化"), h("th", {}, "最小值"), h("th", { class: "l" }, "之後新增的限制"), h("th", { class: "l" }, "狀態"))),
    h("tbody", {}, r.levels.map((lv, i) => h("tr", {}, h("td", { class: "l" }, `第 ${i + 1} 次`), h("td", { class: "l" }, `P${lv.priority}`),
      h("td", { class: "l" }, `min ${lv.expr}`), h("td", {}, fmt(lv.value)), h("td", { class: "l mono" }, `${lv.expr} = ${fmt(lv.value)}`),
      h("td", { class: "l" }, h("span", { class: "pill " + (lv.achieved ? "good" : "bind") }, lv.achieved ? "完全達成" : "未完全達成"))))));
  const gt = h("table", { class: "data" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, "優先"), h("th", { class: "l" }, "目標"),
    h("th", { class: "l" }, "目標式"), h("th", {}, "實際值"), h("th", {}, "d⁻ 不足"), h("th", {}, "d⁺ 超過"), h("th", { class: "l" }, "最小化"), h("th", { class: "l" }, "狀態"))),
    h("tbody", {}, r.goals.map(g => h("tr", {}, h("td", { class: "l" }, `P${g.priority}${g.weight !== 1 ? ` ×${fmt(g.weight)}` : ""}`), h("td", { class: "l" }, g.name),
      h("td", { class: "l" }, g.text), h("td", {}, fmt(g.value)), h("td", {}, fmt(g.dminus)), h("td", {}, fmt(g.dplus)), h("td", { class: "l" }, g.minimize),
      h("td", { class: "l" }, h("span", { class: "pill " + (g.achieved ? "good" : "bind") }, g.achieved ? "達成" : "未達成"))))));
  box.append(h("details", { class: "card more" },
    h("summary", {}, "數學模式與逐層求解過程", h("small", {}, "(公式、離差變數表)")),
    h("h3", {}, "數學模式"), h("pre", { class: "model" }, r.model_lines.join("\n")),
    h("h3", {}, "逐層求解過程(Lexicographic)"),
    h("p", { class: "hint" }, "先求最高優先層的最佳值並固定下來,再於「不犧牲較高優先目標」的條件下改善下一層,依此類推(同 Excel Solver 的操作步驟)。"),
    h("div", { class: "scroll-x" }, steps),
    h("h3", {}, "各目標的離差變數"), h("div", { class: "scroll-x" }, gt),
    h("p", { class: "hint" }, "定理:最佳解中同一目標的 d⁻ 與 d⁺ 不會同時為正(dᵢ⁻·dᵢ⁺ = 0)。")));
}

gpLoad(Object.keys(GP_EX)[1]);
