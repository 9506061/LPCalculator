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

  // 2. 各目標達成情形(長條:實際值;刻度:目標值)
  const WANT = { ge: "希望至少", le: "希望不超過", eq: "希望剛好" };
  const goals = r.goals.map((g, i) => ({ g, i })).sort((a, b) => a.g.priority - b.g.priority || a.i - b.i).map(o => o.g);
  const goalBar = g => {
    const neg = g.value < -1e-9 || g.target < -1e-9;
    const mx = Math.max(Math.abs(g.value), Math.abs(g.target)) || 1;
    const dev = [g.dminus > 1e-9 && `不足 ${fmt(g.dminus)}`, g.dplus > 1e-9 && `超過 ${fmt(g.dplus)}`].filter(Boolean).join("、");
    const sub = `${g.achieved ? "✓ 達成" : "✗ 未達成"}${dev ? `(${dev})` : ""} · ${WANT[g.want] || "目標"} ${fmt(g.target)}`;
    return barRow({ name: `P${g.priority} ${g.name}`, frac: neg ? 0 : Math.abs(g.value) / mx, mark: neg ? null : Math.abs(g.target) / mx,
      cls: g.achieved ? "" : "hot", val: `${fmt(g.value)} / ${fmt(g.target)}`, sub,
      tip: `${g.name}(P${g.priority}${g.weight !== 1 ? `,權重 ${fmt(g.weight)}` : ""})\n${g.text}\nd⁻ = ${fmt(g.dminus)},d⁺ = ${fmt(g.dplus)}` });
  };
  box.append(h("div", { class: "card" }, h("h2", {}, "各目標達成情形"),
    h("p", { class: "hint" }, "依優先順序排列。長條 = 實際值;黑色刻度 = 目標值;紅色表示未達成。高優先目標會先被滿足,再在不犧牲它的前提下照顧較低優先的目標。"),
    h("div", { class: "bars" }, goals.map(goalBar))));

  // 3. 系統限制
  if (r.hard.length) box.append(h("div", { class: "card" }, h("h2", {}, "系統限制使用情形"),
    h("div", { class: "caps" }, r.hard.map(c => constraintBar({ name: c.name, lhs: c.lhs, rhs: c.rhs, op: c.op, binding: c.binding,
      slack: Math.abs(c.rhs - c.lhs), shadow: null, text: c.text })))));

  // 4. 公式與逐層過程(預設收合)
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
