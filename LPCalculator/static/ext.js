"use strict";
/* ext.js -- W6 整數規劃、W8 網路模式 範本的輸入介面、結果表格與網路圖 */

// ---------------------------------------------------------------- 預設資料(課堂例題)
const APS_CITIES = ["Atlanta", "Boston", "Charlotte", "Cincinnati", "Detroit", "Indianapolis", "Milwaukee", "Nashville",
  "New York", "Pittsburgh", "Richmond", "St. Louis"];
const APS_COVER = ["1,3,8", "2,9", "1,3,11", "4,5,8,10", "4,5,6,7,10", "4,5,6,7,8,12", "5,6,7", "1,4,6,8,12", "2,9,11",
  "4,5,10,11", "3,9,10,11", "6,8,12"];
const SEL_EXAMPLES = {
  "社區休閒設施規劃": () => ({ sense: "max", obj_name: "每日使用人次",
    items: [["游泳池", 300], ["網球中心", 90], ["運動場", 400], ["體育館", 150]].map(([name, value]) => ({ name, value })),
    resources: [{ name: "預算($)", usage: [35000, 10000, 25000, 90000], op: "<=", avail: 120000 },
      { name: "土地(英畝)", usage: [4, 2, 7, 3], op: "<=", avail: 12 }],
    rules: [{ type: "exclusive", items: [0, 1], k: 1, p: 0, q: 1 }] }),
  "大學校園建設計畫": () => ({ sense: "min", obj_name: "興建數量",
    items: ["醫療中心", "停車場", "研究大樓", "宿舍"].map(name => ({ name, value: 1 })), resources: [],
    rules: [{ type: "exclusive", items: [0, 2], k: 1, p: 0, q: 2 }, { type: "if_then", items: [], k: 1, p: 2, q: 1 },
      { type: "coreq", items: [], k: 1, p: 0, q: 3 }, { type: "at_least", items: [0, 1, 2, 3], k: 2, p: 0, q: 1 },
      { type: "at_most", items: [0, 1, 2, 3], k: 3, p: 0, q: 1 }] }),
  "智慧校園建設計畫": () => ({ sense: "min", obj_name: "建設數量",
    items: ["智慧教室", "AI運算中心", "雲端資料中心", "智慧停車系統", "校園APP平台"].map(name => ({ name, value: 1 })), resources: [],
    rules: [{ type: "if_then", items: [], k: 1, p: 1, q: 2 }, { type: "coreq", items: [], k: 1, p: 0, q: 4 },
      { type: "at_least", items: [3, 4], k: 1, p: 0, q: 1 }, { type: "at_least", items: [0, 1, 2, 3, 4], k: 3, p: 0, q: 1 },
      { type: "at_most", items: [0, 1, 2, 3, 4], k: 4, p: 0, q: 1 }] }),
};
// ---------------------------------------------------------------- 題目敘述
const SEL_STORY = {
  "社區休閒設施規劃": ["市政府考慮興建游泳池、網球中心、運動場、體育館四項設施,預算 $120,000,可用土地 12 英畝。",
    "游泳池:成本 $35,000、土地 4 英畝、每日 300 人次;網球中心:$10,000、2 英畝、90 人次;運動場:$25,000、7 英畝、400 人次;體育館:$90,000、3 英畝、150 人次。",
    "游泳池與網球中心最多只能蓋其中一個。請問該蓋哪些設施,每日使用人次最多?"],
  "大學校園建設計畫": ["學校評估興建醫療中心、停車場、研究大樓、宿舍四項建設,需符合下列條件:",
    "(1) 醫療中心與研究大樓最多只能蓋一個;(2) 若蓋研究大樓,就必須蓋停車場;(3) 醫療中心與宿舍必須同時蓋或同時不蓋;(4) 至少要蓋 2 項、最多蓋 3 項。",
    "請建立 0-1 邏輯限制式,並找出興建數量最少的可行方案。"],
  "智慧校園建設計畫": ["學校規劃智慧教室、AI 運算中心、雲端資料中心、智慧停車系統、校園 APP 平台五項建設,需符合下列條件:",
    "(1) 若建 AI 運算中心,就必須建雲端資料中心;(2) 智慧教室與校園 APP 平台必須同時建或同時不建;(3) 智慧停車系統與校園 APP 平台至少要建一個;(4) 總共至少建 3 項、最多建 4 項。",
    "請建立 0-1 邏輯限制式,並找出建設數量最少的可行方案。"],
};
Object.assign(T_STORY, {
  transport: { title: "三工廠四地區的運輸規劃", story: [
    "公司有 S1、S2、S3 三座工廠,每月供應量分別為 300、300、200 單位;四個需求地區 A、B、C、D 的需求量分別為 150、250、200、200 單位。",
    "各工廠運送 1 單位到各地區的運費如成本矩陣所示。請問該如何安排運送量,才能滿足需求並使總運費最低?"] },
  assignment: { title: "三位員工的工作指派", story: [
    "主管要把三份工作分派給甲、乙、丙三位員工,每人恰做一份工作、每份工作恰由一人負責。",
    "每位員工完成各工作的成本如矩陣所示。請問該如何指派,總成本最低?"] },
  blending: { title: "飼料配方混合問題", story: [
    "飼料廠要用玉米(每公斤 $3)與大豆(每公斤 $5)混合出 100 公斤的飼料。",
    "每公斤玉米含蛋白質 0.09 公斤、纖維 0.02 公斤;每公斤大豆含蛋白質 0.5 公斤、纖維 0.06 公斤。",
    "整批飼料至少要含 20 公斤蛋白質、纖維最多 5 公斤。請問兩種原料各用多少,成本最低?"] },
  production: { title: "產品組合問題", story: [
    "工廠生產產品 A 與產品 B,每單位利潤分別為 $20 與 $15。",
    "生產 1 單位 A 需人力 2 小時、原料 1 單位;生產 1 單位 B 需人力 1 小時、原料 3 單位。每天可用人力 20 小時、原料 35 單位。",
    "請問各生產多少,利潤最大?"] },
  selection: { title: "社區休閒設施規劃", story: SEL_STORY["社區休閒設施規劃"] },
  facility: { title: "One Potato, Two Potato 農場選址", story: [
    "洋芋片公司要從 6 座候選農場中決定要和哪些農場簽約,供應馬鈴薯給 Atlanta、Baton Rouge、Chicago 三座加工廠(需求量分別為 12、10、14 百萬磅)。",
    "每座農場簽約都要支付固定費用,且有各自的供應上限;從各農場運到各工廠的單位成本如成本矩陣所示。",
    "請問該選哪些農場、各運多少,才能滿足需求並使「固定費用 + 運輸成本」最低?"] },
  covering: { title: "12 城市服務據點設置", story: [
    "公司要在 Atlanta、Boston、Charlotte…等 12 座城市中選擇設置服務據點的地點。",
    "每個據點只能服務在規定時間內可到達的城市(可涵蓋的城市編號列在表中)。",
    "請問最少要設置幾個據點、設在哪些城市,才能讓 12 座城市全部被涵蓋?"] },
  transship: { title: "Walsh 公司轉運問題", story: [
    "Walsh 公司在 Ohio、Pennsylvania、New York 有三座工廠,產能分別為 72、105、83 單位。",
    "產品先運到 Indiana 或 Georgia 的倉庫轉運,再送到 Virginia、Kentucky、Louisiana 三地,需求量分別為 90、80、120 單位。",
    "各路線的單位運費如弧線表所示。總供給 260 小於總需求 290(供不應求),請問該如何運送,總運費最低?"] },
  shortest: { title: "道路網路的最短路徑", story: [
    "下圖是 7 個地點之間的道路網路,弧線上的數字是兩地之間的距離。",
    "請問從地點 1 出發到地點 7,應走哪條路線,總距離最短?"] },
  maxflow: { title: "包裹配送網路的最大流量", story: [
    "物流公司要把包裹從配送中心(節點 1)經由道路網路送到目的地(節點 7)。",
    "每條道路每小時能通過的包裹數有上限(容量),部分道路雙向通行但兩個方向的容量不同。",
    "請問每小時最多能送出多少包裹?各條道路該分配多少流量?"] },
});

const mkArcs = (list, key) => list.map(([a, b, v]) => ({ from: a - 1, to: b - 1, [key]: v }));
Object.assign(T, {
  selection: SEL_EXAMPLES["社區休閒設施規劃"](),
  facility: {
    facilities: [[405, 11.2], [390, 10.5], [450, 12.8], [368, 9.3], [520, 10.8], [465, 9.6]].map(([fixed, cap], i) => ({ name: `農場${i + 1}`, fixed, cap })),
    customers: [["Atlanta", 12], ["Baton Rouge", 10], ["Chicago", 14]].map(([name, demand]) => ({ name, demand })),
    cost: [[18, 15, 12], [13, 10, 17], [16, 14, 18], [19, 15, 16], [17, 19, 12], [14, 16, 12]] },
  covering: { sites: APS_CITIES.map((name, i) => ({ name, cost: 1, covers: APS_COVER[i] })) },
  transship: {
    nodes: [["Ohio", "supply", 72], ["Pennsylvania", "supply", 105], ["New York", "supply", 83], ["Indiana", "trans", 0],
      ["Georgia", "trans", 0], ["Virginia", "demand", 90], ["Kentucky", "demand", 80], ["Louisiana", "demand", 120]]
      .map(([name, type, amount]) => ({ name, type, amount })),
    arcs: mkArcs([[1, 4, 16], [1, 5, 21], [2, 4, 18], [2, 5, 16], [3, 4, 22], [3, 5, 25],
      [4, 6, 23], [4, 7, 15], [4, 8, 29], [5, 6, 20], [5, 7, 17], [5, 8, 24]], "cost") },
  shortest: { both: false, start: 0, end: 6, nodes: [1, 2, 3, 4, 5, 6, 7].map(i => ({ name: String(i) })),
    arcs: mkArcs([[1, 2, 21], [1, 3, 17], [1, 4, 30], [2, 4, 10], [2, 5, 25], [3, 4, 12], [3, 6, 25], [4, 5, 18],
      [4, 6, 10], [4, 7, 9], [5, 7, 12], [6, 7, 15]], "cost") },
  maxflow: { start: 0, end: 6, nodes: [1, 2, 3, 4, 5, 6, 7].map(i => ({ name: String(i) })),
    arcs: mkArcs([[1, 2, 6], [1, 3, 5], [3, 1, 1], [2, 4, 2], [4, 2, 1], [2, 6, 3], [6, 2, 4], [3, 4, 7], [4, 3, 2],
      [3, 5, 3], [3, 7, 4], [4, 5, 2], [5, 4, 6], [4, 6, 4], [6, 4, 2], [5, 7, 9], [6, 7, 4]], "cap") },
});

// ---------------------------------------------------------------- 共用
const reT = () => { T.result = null; T.preview = null; renderTemplate(); };
const xn = i => `x${i + 1}`;
function hintCard(title, lines) {
  return h("div", { class: "card tip" }, h("h2", {}, title), h("ul", { class: "notes" }, lines.map(t => h("li", { html: t }))));
}
function nodeSelect(names, get, set, label) {
  const el = h("select", { "aria-label": label }, names.map((n, i) => h("option", { value: i, selected: Number(get()) === i }, n || `節點${i + 1}`)));
  el.addEventListener("change", () => set(Number(el.value)));
  return el;
}
function exampleSelect(examples, onPick, current) {
  const el = h("select", { "aria-label": "載入範例題目" }, h("option", { value: "" }, "— 選擇題目 —"), Object.keys(examples).map(k => h("option", { value: k, selected: k === current }, k)));
  el.addEventListener("change", () => { if (el.value) onPick(el.value); });
  return h("label", { class: "field" }, "範例題目", el);
}
function dataTable(heads, rows) {
  return h("div", { class: "scroll-x" }, h("table", { class: "data" },
    h("thead", {}, h("tr", {}, heads.map((t, i) => h("th", { class: i === 0 || String(t).startsWith("·") ? "l" : "" }, String(t).replace(/^·/, ""))))),
    h("tbody", {}, rows)));
}
const pill = (ok, yes, no, badCls = "non") => h("span", { class: "pill " + (ok ? "good" : badCls) }, ok ? yes : no);

// =====================================================================
// W6 0-1 方案選擇
// =====================================================================
const RULE_TYPES = {
  exclusive: "互斥:至多選 1 個(Σx ≤ 1)", choose_one: "強制選擇:恰選 1 個(Σx = 1)",
  exactly: "恰好選 k 個(Σx = k)", at_most: "至多選 k 個(Σx ≤ k)", at_least: "至少選 k 個(Σx ≥ k)",
  if_then: "條件:若選 P 則必選 Q(x_P ≤ x_Q)", if_not: "若選 A 則不得選 B(x_A + x_B ≤ 1)",
  coreq: "共軛:同時選或同時不選(x_A = x_B)",
};
const PAIR = new Set(["if_then", "if_not", "coreq"]);
function ruleFormula(r, n) {
  if (PAIR.has(r.type)) {
    const p = xn(Number(r.p)), q = xn(Number(r.q));
    return r.type === "if_then" ? `${p} ≤ ${q}` : r.type === "if_not" ? `${p} + ${q} ≤ 1` : `${p} = ${q}`;
  }
  const lhs = (r.items || []).filter(i => i < n).sort((a, b) => a - b).map(xn).join(" + ") || "(請勾選)";
  const rhs = { exclusive: "≤ 1", choose_one: "= 1", exactly: `= ${r.k}`, at_most: `≤ ${r.k}`, at_least: `≥ ${r.k}` }[r.type];
  return `${lhs} ${rhs}`;
}

EXT_INPUTS.selection = (left, d) => {
  left.append(hintCard("模型說明(W6 0-1 整數規劃)", [
    "決策變數 x<sub>i</sub> = 1 表示選擇(執行)方案 i,0 表示不選。",
    "資源限制:例如預算、土地;邏輯限制:互斥、條件(若 P 則 Q)、共軛、至少/至多 k 個…",
    "沒有資源資料的練習題(只建立邏輯限制式)可把目標係數都設為 1,用「最小化」找出最少的可行組合。"]));
  const n = d.items.length;
  const sense = (val, text) => h("label", { class: "inline" }, h("input", { type: "radio", name: "selsense", checked: d.sense === val, onchange: () => { d.sense = val; } }), text);
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 2:問題規模"),
    h("div", { class: "row" }, exampleSelect(SEL_EXAMPLES, k => { T.selection = SEL_EXAMPLES[k](); T_STORY.selection = { title: k, story: SEL_STORY[k] }; reT(); }, T_STORY.selection && T_STORY.selection.title)),
    h("div", { class: "row" },
      sizeInput("方案數量", () => n, m => {
        while (d.items.length < m) d.items.push({ name: `方案${d.items.length + 1}`, value: 0 });
        d.items.length = m;
        d.resources.forEach(r => { while (r.usage.length < m) r.usage.push(0); r.usage.length = m; });
        d.rules = d.rules.filter(r => PAIR.has(r.type) ? r.p < m && r.q < m : true);
        d.rules.forEach(r => r.items = (r.items || []).filter(i => i < m));
      }),
      sizeInput("資源限制數量", () => d.resources.length || 1, m => {
        while (d.resources.length < m) d.resources.push({ name: `資源${d.resources.length + 1}`, usage: d.items.map(() => 0), op: "<=", avail: 0 });
        d.resources.length = m;
      }),
      d.resources.length ? h("button", { class: "btn", onclick: () => { d.resources = []; reT(); } }, "移除所有資源限制") : null),
    h("div", { class: "row" }, sense("max", "最大化"), sense("min", "最小化"),
      h("label", { class: "field" }, "目標名稱", textInput(() => d.obj_name, v => d.obj_name = v, "wide", "目標名稱")))));

  const head = h("tr", {}, h("th", { class: "l" }, ""), d.items.map((_, j) => h("th", {}, xn(j))), h("th", {}, ""), h("th", {}, "可用量"));
  const names = h("tr", {}, h("th", { class: "l" }, "方案名稱"), d.items.map(it => h("td", {}, textInput(() => it.name, v => it.name = v, "name", "方案名稱"))), h("td"), h("td"));
  const obj = h("tr", {}, h("th", { class: "l" }, "目標係數"), d.items.map(it => h("td", {}, numInput(() => it.value, v => it.value = v))), h("td"), h("td"));
  const rows = d.resources.map(r => {
    const op = h("select", { "aria-label": "符號" }, ["<=", "=", ">="].map(o => h("option", { value: o, selected: (r.op || "<=") === o }, OPSYM[o])));
    op.addEventListener("change", () => r.op = op.value);
    return h("tr", {}, h("td", { class: "l" }, textInput(() => r.name, v => r.name = v, "name", "資源名稱")),
      r.usage.map((_, j) => h("td", {}, numInput(() => r.usage[j], v => r.usage[j] = v))), h("td", {}, op), h("td", {}, numInput(() => r.avail, v => r.avail = v)));
  });
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 3:方案資料與資源限制"),
    h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, head), h("tbody", {}, names, obj, rows)))));

  // 邏輯限制式
  const list = h("div", { class: "rules" });
  d.rules.forEach((r, ri) => {
    const formula = h("code", { class: "formula" }, ruleFormula(r, n));
    const upd = () => formula.textContent = ruleFormula(r, n);
    const type = h("select", { "aria-label": "邏輯限制類型" }, Object.entries(RULE_TYPES).map(([k, t]) => h("option", { value: k, selected: r.type === k }, t)));
    type.addEventListener("change", () => { r.type = type.value; if (PAIR.has(r.type) && r.p === r.q) r.q = (r.p + 1) % n; reT(); });
    let body;
    if (PAIR.has(r.type)) {
      const lab = r.type === "if_then" ? ["若選 P", "則必選 Q"] : ["A", "B"];
      const itemNames = d.items.map((it, j) => `${xn(j)} ${it.name}`);
      body = h("div", { class: "row" }, h("label", { class: "field" }, lab[0], nodeSelect(itemNames, () => r.p, v => { r.p = v; upd(); }, lab[0])),
        h("label", { class: "field" }, lab[1], nodeSelect(itemNames, () => r.q, v => { r.q = v; upd(); }, lab[1])));
    } else {
      r.items = r.items || [];
      body = h("div", { class: "row chips" }, d.items.map((it, j) => h("label", { class: "chip" },
        h("input", { type: "checkbox", checked: r.items.includes(j), onchange: e => {
          r.items = e.target.checked ? [...new Set([...r.items, j])] : r.items.filter(i => i !== j); upd(); } }), `${xn(j)} ${it.name}`)),
        ["exactly", "at_most", "at_least"].includes(r.type) && h("label", { class: "field" }, "k =", numInput(() => r.k, v => { r.k = v; upd(); })));
    }
    list.append(h("div", { class: "rule" }, h("div", { class: "row" }, h("b", {}, `邏輯限制 ${ri + 1}`), type,
      h("button", { class: "btn icon", title: "刪除", "aria-label": "刪除這條邏輯限制", onclick: () => { d.rules.splice(ri, 1); reT(); } }, "✕")), body, formula));
  });
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 3b:邏輯限制式"),
    h("p", { class: "hint" }, "把「是否選擇、必須選擇、不能同時選擇、先決條件、配套措施」轉換成 0-1 變數之間的關係。"), list,
    h("button", { class: "btn", onclick: () => { d.rules.push({ type: "exclusive", items: [], k: 1, p: 0, q: Math.min(1, n - 1) }); reT(); } }, "+ 新增邏輯限制")));
};

EXT_EXTRA.selection = (res, box) => {
  const ex = res.extra;
  box.append(h("div", { class: "card" }, h("h2", {}, "最佳選擇方案"),
    h("div", { class: "answer" }, h("div", { class: "cell z" }, h("small", {}, `${res.model.obj_name} Z*`), h("b", {}, fmt(res.z)))),
    dataTable(["方案", "目標係數", "·決策"], ex.table.map((t, j) => h("tr", {}, h("td", { class: "l" }, `${xn(j)} ${t.name}`), h("td", {}, fmt(t.value)),
      h("td", { class: "l" }, pill(t.pick, "選擇 (x=1)", "不選 (x=0)"))))),
    h("ul", { class: "notes" }, ex.text.map(t => h("li", {}, t)))));
};

// =====================================================================
// W6 固定費用與設施區位
// =====================================================================
EXT_INPUTS.facility = (left, d) => {
  left.append(hintCard("模型說明(Fixed-Charge Facility Location)", [
    "y<sub>i</sub> ∈ {0,1}:是否設置(購買)設施 i;x<sub>ij</sub> ≥ 0:由 i 運到 j 的數量(連續變數)→ 混合整數規劃。",
    "目標:min Σ c<sub>ij</sub>x<sub>ij</sub> + Σ f<sub>i</sub>y<sub>i</sub>(運輸成本 + 固定成本)。",
    "連結限制式(Linking Constraint):Σ<sub>j</sub> x<sub>ij</sub> ≤ 產能<sub>i</sub> × y<sub>i</sub>,y<sub>i</sub> = 0 時完全不能運出。",
    "固定成本與運輸成本請用同一單位(例如課本例題的固定成本以「千元」輸入 405、運輸量以千噸計)。"]));
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 2:問題規模"), h("div", { class: "row" },
    sizeInput("候選設施數", () => d.facilities.length, n => { while (d.facilities.length < n) d.facilities.push({ name: `F${d.facilities.length + 1}`, fixed: 100, cap: 10 }); d.facilities.length = n; resizeMatrix(d.cost, n, d.customers.length, 10); }),
    sizeInput("需求點數", () => d.customers.length, n => { while (d.customers.length < n) d.customers.push({ name: `C${d.customers.length + 1}`, demand: 10 }); d.customers.length = n; resizeMatrix(d.cost, d.facilities.length, n, 10); }))));
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 3:輸入資料"), h("h3", {}, "名稱"), namesRow(d.facilities, "設施"), namesRow(d.customers, "需求點"),
    h("h3", {}, "單位運輸成本、固定成本、產能、需求量"),
    matrixTable(d.facilities, d.customers, d.cost, [
      { title: "固定成本", cell: i => numInput(() => d.facilities[i].fixed, v => d.facilities[i].fixed = v) },
      { title: "產能", cell: i => numInput(() => d.facilities[i].cap, v => d.facilities[i].cap = v) }],
      { title: "需求量", cell: j => numInput(() => d.customers[j].demand, v => d.customers[j].demand = v) }, "設施＼需求點")));
};

EXT_EXTRA.facility = (res, box) => {
  const ex = res.extra;
  const flow = h("table", { class: "data flow" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, ""), ex.dests.map(n => h("th", {}, n)))),
    h("tbody", {}, ex.sources.map((n, i) => h("tr", {}, h("th", { class: "l" }, n), ex.dests.map((_, j) => h("td", { class: ex.flow[i][j] > 1e-9 ? "hit" : "" }, fmt(ex.flow[i][j])))))));
  box.append(h("div", { class: "card" }, h("h2", {}, "最佳設施區位方案"),
    h("div", { class: "answer" }, h("div", { class: "cell z" }, h("small", {}, "最小總成本 Z*"), h("b", {}, fmt(res.z))),
      h("div", { class: "cell" }, h("small", {}, "固定成本"), h("b", {}, fmt(ex.fixed_total))),
      h("div", { class: "cell" }, h("small", {}, "運輸成本"), h("b", {}, fmt(ex.trans_total)))),
    dataTable(["設施", "·是否設置", "固定成本", "產能", "運出量"], ex.rows.map(r => h("tr", {}, h("td", { class: "l" }, r.name),
      h("td", { class: "l" }, pill(r.open, "設置 (y=1)", "不設置 (y=0)")), h("td", {}, fmt(r.fixed)), h("td", {}, fmt(r.cap)), h("td", {}, fmt(r.ship))))),
    h("h3", {}, "運送量矩陣 x_ij"), h("div", { class: "scroll-x" }, flow),
    h("ul", { class: "notes" }, ex.text.map(t => h("li", {}, t)))));
};

// =====================================================================
// W6 區域涵蓋
// =====================================================================
EXT_INPUTS.covering = (left, d) => {
  left.append(hintCard("模型說明(Set Covering Problem)", [
    "x<sub>j</sub> = 1 表示在地點 j 設立據點;a<sub>ij</sub> = 1 表示設在 j 可涵蓋 i。",
    "min Σ x<sub>j</sub>(若各地點設置成本不同,則為 min Σ c<sub>j</sub>x<sub>j</sub>)。",
    "每個地點都必須被涵蓋:Σ<sub>j</sub> a<sub>ij</sub>x<sub>j</sub> ≥ 1。",
    "「可涵蓋的地點」請輸入編號並以逗號分隔,例如 1,3,8(包含自己)。"]));
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 2:問題規模"), h("div", { class: "row" },
    sizeInput("地點數量", () => d.sites.length, n => {
      while (d.sites.length < n) d.sites.push({ name: `地點${d.sites.length + 1}`, cost: 1, covers: String(d.sites.length + 1) });
      d.sites.length = n; }))));
  const rows = d.sites.map((st, j) => h("tr", {}, h("td", {}, String(j + 1)),
    h("td", { class: "l" }, textInput(() => st.name, v => st.name = v, "wide", "地點名稱")),
    h("td", {}, numInput(() => st.cost ?? 1, v => st.cost = v)),
    h("td", { class: "l" }, textInput(() => st.covers, v => st.covers = v, "wide", "可涵蓋的地點"))));
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 3:涵蓋關係表"),
    h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, h("tr", {}, h("th", {}, "編號"), h("th", { class: "l" }, "地點"),
      h("th", {}, "設置成本"), h("th", { class: "l" }, "設在此處可涵蓋的地點編號"))), h("tbody", {}, rows)))));
};

EXT_EXTRA.covering = (res, box) => {
  const ex = res.extra, n = ex.names.length;
  const t = h("table", { class: "data flow cover" },
    h("thead", {}, h("tr", {}, h("th", { class: "l" }, "需求點＼據點"), ex.names.map((_, j) => h("th", { class: ex.pick[j] ? "pick" : "" }, String(j + 1))))),
    h("tbody", {}, ex.matrix.map((row, i) => h("tr", {}, h("th", { class: "l" }, `${i + 1} ${ex.names[i]}`),
      row.map((a, j) => h("td", { class: (ex.pick[j] ? "pickcol " : "") + (a && ex.pick[j] ? "hit" : "") }, String(a)))))));
  box.append(h("div", { class: "card" }, h("h2", {}, "最佳據點配置"),
    h("div", { class: "answer" }, h("div", { class: "cell z" }, h("small", {}, `${res.model.obj_name} Z*`), h("b", {}, fmt(res.z))),
      ...ex.names.map((nm, j) => ex.pick[j] ? h("div", { class: "cell" }, h("small", {}, `x${j + 1} = 1`), h("b", { class: "small" }, nm)) : null)),
    h("h3", {}, "涵蓋矩陣 a_ij(被選中的據點欄位以顏色標示)"), h("div", { class: "scroll-x" }, t),
    h("ul", { class: "notes" }, ex.text.map(s_ => h("li", {}, s_))),
    n > 0 && h("p", { class: "hint" }, "注意:區域涵蓋問題常有多組最佳解(據點數相同但位置不同),Solver 可能找到與課本不同但同樣最少的組合。")));
};

// =====================================================================
// W8 網路模式:節點/弧線編輯器
// =====================================================================
function networkInputs(left, d, mode) {
  const nNodes = d.nodes.length;
  const names = d.nodes.map((nd, i) => nd.name || String(i + 1));
  const sizeCard = h("div", { class: "card" }, h("h2", {}, "Step 2:網路規模"), h("div", { class: "row" },
    sizeInput("節點數量", () => nNodes, n => {
      while (d.nodes.length < n) d.nodes.push({ name: String(d.nodes.length + 1), type: "trans", amount: 0 });
      d.nodes.length = n;
      d.arcs = d.arcs.filter(a => a.from < n && a.to < n);
      if (d.start >= n) d.start = 0;
      if (d.end >= n) d.end = n - 1;
    })));
  if (mode !== "transship") {
    const lab = mode === "maxflow" ? ["來源點 Source", "目的地 Sink"] : ["起點", "終點"];
    sizeCard.append(h("div", { class: "row" },
      h("label", { class: "field" }, lab[0], nodeSelect(names, () => d.start, v => d.start = v, lab[0])),
      h("label", { class: "field" }, lab[1], nodeSelect(names, () => d.end, v => d.end = v, lab[1])),
      mode === "shortest" && h("label", { class: "inline" }, h("input", { type: "checkbox", checked: !!d.both, onchange: e => d.both = e.target.checked }), "道路為雙向(自動加入反向弧)")));
  }
  left.append(sizeCard);

  const nodeCard = h("div", { class: "card" }, h("h2", {}, "Step 3:節點"));
  if (mode === "transship") {
    const rows = d.nodes.map(nd => {
      const tp = h("select", { "aria-label": "節點類型" }, [["supply", "供應點"], ["trans", "轉運點"], ["demand", "需求點"]].map(([v, t]) => h("option", { value: v, selected: nd.type === v }, t)));
      tp.addEventListener("change", () => { nd.type = tp.value; reT(); });
      return h("tr", {}, h("td", { class: "l" }, textInput(() => nd.name, v => nd.name = v, "wide", "節點名稱")), h("td", {}, tp),
        h("td", {}, nd.type === "trans" ? h("span", { class: "hint" }, "流入=流出") : numInput(() => nd.amount, v => nd.amount = v)));
    });
    nodeCard.append(h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, "名稱"), h("th", {}, "類型"), h("th", {}, "供應量/需求量"))), h("tbody", {}, rows))));
  } else {
    nodeCard.append(namesRow(d.nodes, "節點"));
  }
  left.append(nodeCard);

  const val = mode === "maxflow" ? { key: "cap", title: "容量" } : { key: "cost", title: mode === "shortest" ? "距離" : "單位成本" };
  const rows = d.arcs.map((a, k) => h("tr", {},
    h("td", {}, String(k + 1)),
    h("td", {}, nodeSelect(names, () => a.from, v => a.from = v, "起點")), h("td", {}, "→"),
    h("td", {}, nodeSelect(names, () => a.to, v => a.to = v, "終點")),
    h("td", {}, numInput(() => a[val.key], v => a[val.key] = v, { label: val.title })),
    mode === "transship" && h("td", {}, numInput(() => a.cap ?? "", v => a.cap = v, { label: "容量上限" })),
    h("td", {}, h("button", { class: "btn icon", title: "刪除", "aria-label": "刪除這條弧線", onclick: () => { d.arcs.splice(k, 1); reT(); } }, "✕"))));
  left.append(h("div", { class: "card" }, h("h2", {}, `Step 3b:弧線(共 ${d.arcs.length} 條)`),
    mode === "maxflow" && h("p", { class: "hint" }, "雙向道路請輸入兩條弧線(正向與反向容量);反向容量為 0 的可以不輸入。"),
    mode === "transship" && h("p", { class: "hint" }, "容量上限可留空(表示不限制)。"),
    h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "起點"), h("th", {}, ""), h("th", {}, "終點"),
      h("th", {}, val.title), mode === "transship" && h("th", {}, "容量上限"), h("th", {}, ""))), h("tbody", {}, rows))),
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", onclick: () => {
      d.arcs.push({ from: 0, to: Math.min(1, nNodes - 1), [val.key]: mode === "maxflow" ? 1 : 0 }); reT(); } }, "+ 新增弧線"))));
  // 即時網路圖預覽
  const preview = { nodes: names, kinds: mode === "transship" ? d.nodes.map(n => n.type) : null,
    src: mode === "transship" ? null : d.start, dst: mode === "transship" ? null : d.end,
    arcs: d.arcs.filter(a => a.from !== a.to).map(a => ({ from: a.from, to: a.to, label: fmt(a[val.key]), flow: 0 })) };
  left.append(h("div", { class: "card" }, h("h2", {}, "網路圖預覽"), drawNetwork(preview, mode, true)));
}

EXT_INPUTS.transship = (left, d) => {
  left.append(hintCard("模型說明(Transshipment Model)", [
    "貨物可經過中繼站:供應點 → 轉運點 → 需求點;轉運點本身不生產也不消耗。",
    "轉運點限制:<b>流入量 = 流出量</b>。",
    "供不應求時:供應點「= 供應量」(全部運出)、需求點「≤ 需求量」;供過於求時相反。系統會自動判斷。"]));
  networkInputs(left, d, "transship");
};
EXT_INPUTS.shortest = (left, d) => {
  left.append(hintCard("模型說明(最短路徑問題)", [
    "x<sub>ij</sub> = 1 表示路徑經過弧線 (i, j),目標 min Σ 距離 × x<sub>ij</sub>。",
    "起點:流出 = 1;終點:流入 = 1;中間節點:流入 = 流出(路徑連續性)。",
    "課本例題的弧線方向由小編號往大編號;若道路可雙向通行,請勾選「雙向」。"]));
  networkInputs(left, d, "shortest");
};
EXT_INPUTS.maxflow = (left, d) => {
  left.append(hintCard("模型說明(最大流量問題)", [
    "x<sub>ij</sub> = 由 i 流向 j 的流量,F = 總流量,目標 max F。",
    "Source:流出 − 流入 = F;Sink:流入 − 流出 = F;中間節點:流入 = 流出(Flow Conservation)。",
    "容量限制 0 ≤ x<sub>ij</sub> ≤ u<sub>ij</sub>;保留所有反向弧,是否使用由最佳解決定。"]));
  networkInputs(left, d, "maxflow");
};

// ---------------------------------------------------------------- 網路圖(節點可拖曳)
const NET_POS = new Map();   // 使用者拖曳後的節點位置;預覽圖與結果圖共用,改資料重畫時也會保留
let netId = 0;
function drawNetwork(net, mode, preview = false) {
  const n = net.nodes.length, id = ++netId;
  const out = Array.from({ length: n }, () => []), und = Array.from({ length: n }, () => []);
  net.arcs.forEach(a => { out[a.from].push(a.to); und[a.from].push(a.to); und[a.to].push(a.from); });
  const layer = Array(n).fill(-1);
  let seeds = net.kinds ? net.kinds.map((k, i) => k === "supply" ? i : -1).filter(i => i >= 0) : [net.src ?? 0];
  if (!seeds.length) seeds = [0];
  const bfs = (adj, starts) => {
    const q = [...starts];
    starts.forEach(s0 => { if (layer[s0] < 0) layer[s0] = 0; });
    while (q.length) { const u = q.shift(); adj[u].forEach(v => { if (layer[v] < 0) { layer[v] = layer[u] + 1; q.push(v); } }); }
  };
  bfs(out, seeds);
  for (let i = 0; i < n; i++) if (layer[i] < 0) { const nb = und[i].find(v => layer[v] >= 0); layer[i] = nb != null ? layer[nb] + 1 : 0; }
  if (net.dst != null && n > 1) layer[net.dst] = Math.max(...layer.filter((_, i) => i !== net.dst)) + 1;
  if (net.src != null) layer[net.src] = 0;
  const L = Math.max(...layer) + 1;
  const cols = Array.from({ length: L }, () => []);
  layer.forEach((l, i) => cols[l].push(i));
  const maxCol = Math.max(...cols.map(c => c.length));
  const W = 760, H = Math.max(240, maxCol * 92 + 40), mx = 70;
  const def = [];
  cols.forEach((c, l) => c.forEach((v, k) => {
    def[v] = { x: L === 1 ? W / 2 : mx + (l * (W - 2 * mx)) / (L - 1), y: (H * (k + 1)) / (c.length + 1) };
  }));
  const key = `${mode}|${net.nodes.join("\u0001")}`;
  const saved = NET_POS.get(key);
  const pos = saved && saved.pos.length === n ? saved.pos.map(p => ({ x: p.x, y: clamp(p.y * H / saved.H, 22, H - 36) })) : def.map(p => ({ ...p }));
  const save = () => NET_POS.set(key, { H, pos: pos.map(p => ({ ...p })) });

  const textW = t => [...t].reduce((s0, ch) => s0 + (ch.charCodeAt(0) > 255 ? 14 : 7.6), 0);
  const half = net.nodes.map(t => Math.max(20, textW(t) / 2 + 12));

  const svg = s("svg", { class: "plot net", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "網路圖(節點可拖曳)" });
  const defs = s("defs");
  [["a", "var(--ink-2)"], ["b", "var(--optimum)"]].forEach(([k, col]) => defs.append(
    s("marker", { id: `m${id}${k}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" },
      s("path", { d: "M0,0 L10,5 L0,10 z", style: `fill:${col}` }))));
  const arcLayer = s("g"), labelLayer = s("g", { "pointer-events": "none" }), nodeLayer = s("g");
  svg.append(defs, arcLayer, labelLayer, nodeLayer);

  const has = new Set(net.arcs.map(a => `${a.from}-${a.to}`));
  const valWord = mode === "maxflow" ? "容量" : mode === "shortest" ? "距離" : "單位成本";
  const arcTip = a => {
    let t = `${net.nodes[a.from]} → ${net.nodes[a.to]}\n${valWord} ${a.label}`;
    if (!preview) {
      const used = a.flow > 1e-9;
      if (mode === "maxflow") t += `\n流量 ${fmt(a.flow)}${used && Math.abs(a.flow - Number(a.label)) < 1e-6 ? "(滿載)" : ""}`;
      else if (mode === "transship") t += `\n運送量 ${fmt(a.flow)}${used ? `,小計 ${fmt(a.flow * Number(a.label))}` : ""}`;
      else t += used ? "\n✓ 在最短路徑上" : "\n未經過";
    }
    return t;
  };
  // 邊界:由中心往外,到節點外框的距離(橢圓近似)
  const edge = (v, ux, uy) => { const rx = half[v], ry = 20; return 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry)); };
  const arcEls = [];
  const paintArcs = () => {
    arcLayer.replaceChildren(); labelLayer.replaceChildren(); arcEls.length = 0;
    net.arcs.forEach(a => {
      const p = pos[a.from], q = pos[a.to];
      const dx = q.x - p.x, dy = q.y - p.y; const len = Math.hypot(dx, dy) || 1; const ux = dx / len, uy = dy / len;
      const twin = has.has(`${a.to}-${a.from}`), off = twin ? 7 : 0;
      const ox = -uy * off, oy = ux * off;
      const r1 = edge(a.from, ux, uy), r2_ = edge(a.to, ux, uy) + 3;
      const x1 = p.x + ux * r1 + ox, y1 = p.y + uy * r1 + oy, x2 = q.x - ux * r2_ + ox, y2 = q.y - uy * r2_ + oy;
      const used = a.flow > 1e-9;
      const grp = s("g", { class: "arc" },
        s("line", { class: "vis", x1, y1, x2, y2, style: `stroke:${used ? "var(--optimum)" : "var(--ink-2)"}`,
          "stroke-width": used ? 3 : 1.3, opacity: used || preview ? 1 : 0.5, "marker-end": `url(#m${id}${used ? "b" : "a"})` }),
        s("line", { class: "hit", x1, y1, x2, y2 }));
      tipOn(grp, () => arcTip(a));
      arcLayer.append(grp); arcEls.push({ a, grp });
      const t = twin ? 0.32 : 0.5;
      let txt = a.label;
      if (!preview && used) txt = mode === "maxflow" ? `${fmt(a.flow)}/${a.label}` : mode === "transship" ? `${fmt(a.flow)} @${a.label}` : a.label;
      else if (mode === "transship") txt = `@${a.label}`;
      labelLayer.append(s("text", { class: "halo", x: x1 + (x2 - x1) * t + ox * 1.6, y: y1 + (y2 - y1) * t + oy * 1.6 - 3, "text-anchor": "middle",
        "font-size": 12, "font-weight": used ? 700 : 400, style: used ? "fill:var(--optimum)" : null }, txt));
    });
  };

  const KCAP = { supply: "供應點", trans: "轉運點", demand: "需求點" };
  const nodeEls = net.nodes.map((nm, v) => {
    const special = v === net.src || v === net.dst;
    const kind = net.kinds && net.kinds[v];
    const strokeVar = special ? "var(--optimum)" : kind === "trans" ? "var(--objective)" : "var(--feasible)";
    const cap = kind ? KCAP[kind] : v === net.src ? (mode === "maxflow" ? "Source" : "起點") : v === net.dst ? (mode === "maxflow" ? "Sink" : "終點") : null;
    const grp = s("g", { class: "drag node", tabindex: 0, "aria-label": `節點 ${nm}(可拖曳)` },
      s("rect", { x: -half[v], y: -20, width: half[v] * 2, height: 40, rx: 20, style: `fill:var(--panel);stroke:${strokeVar}`, "stroke-width": 2.5 }),
      s("text", { x: 0, y: 5, "text-anchor": "middle", "font-size": 14, "font-weight": 700 }, nm),
      cap && s("text", { class: "tick halo", x: 0, y: 34, "text-anchor": "middle" }, cap));
    const fin = net.arcs.filter(a => a.to === v).reduce((t, a) => t + (a.flow || 0), 0);
    const fout = net.arcs.filter(a => a.from === v).reduce((t, a) => t + (a.flow || 0), 0);
    tipOn(grp, () => `${nm}${cap ? `(${cap})` : ""}\n` + (preview
      ? `連出 ${net.arcs.filter(a => a.from === v).length} 條、連入 ${net.arcs.filter(a => a.to === v).length} 條弧線`
      : `流入 ${fmt(fin)} · 流出 ${fmt(fout)}`) + "\n(可拖曳調整位置)");
    const hl = on => arcEls.forEach(e => e.grp.classList.toggle("hl", on && (e.a.from === v || e.a.to === v)));
    grp.addEventListener("pointerenter", () => hl(true));
    grp.addEventListener("pointerleave", () => hl(false));
    let off = null;
    dragOn(grp, svg, (pt, phase) => {
      if (phase === "start") off = { x: pos[v].x - pt.x, y: pos[v].y - pt.y };
      if (phase === "end") { save(); hl(true); return; }
      pos[v] = { x: clamp(pt.x + off.x, half[v] + 2, W - half[v] - 2), y: clamp(pt.y + off.y, 22, H - 36) };
      place(v); paintArcs(); hl(true);
    });
    grp.addEventListener("keydown", e => {
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!k) return;
      e.preventDefault();
      const st = e.shiftKey ? 40 : 10;
      pos[v] = { x: clamp(pos[v].x + k[0] * st, half[v] + 2, W - half[v] - 2), y: clamp(pos[v].y + k[1] * st, 22, H - 36) };
      place(v); paintArcs(); save();
    });
    nodeLayer.append(grp);
    return grp;
  });
  const place = v => nodeEls[v].setAttribute("transform", `translate(${pos[v].x},${pos[v].y})`);
  nodeEls.forEach((_, v) => place(v));
  paintArcs();

  const reset = h("button", { class: "btn icon", type: "button", onclick: () => {
    NET_POS.delete(key); def.forEach((p, v) => { pos[v] = { ...p }; place(v); }); paintArcs();
  } }, "重設版面");
  return h("div", {}, svg, h("div", { class: "net-tools" },
    h("p", { class: "hint" }, "可拖曳節點調整版面(或選取節點後用方向鍵);滑鼠移到弧線或節點上可查看數量。"), reset));
}

EXT_EXTRA.network = (res, box) => {
  const ex = res.extra, card = h("div", { class: "card" });
  const title = { transship: "最佳轉運方案", shortest: "最短路徑", maxflow: "最大流量方案" }[ex.mode];
  const zl = { transship: "最小總運輸成本 Z*", shortest: "最短距離 Z*", maxflow: "最大流量 F*" }[ex.mode];
  card.append(h("h2", {}, title), h("div", { class: "answer" }, h("div", { class: "cell z" }, h("small", {}, zl), h("b", {}, fmt(res.z)))));
  if (ex.mode === "shortest") card.append(h("div", { class: "pathline" }, ex.legs.length ? [ex.legs[0].from, ...ex.legs.map(l => l.to)].join(" → ") : "—"));
  card.append(drawNetwork(ex.net, ex.mode));
  card.append(h("div", { class: "legend" }, h("span", {}, h("i", { style: "border-color:var(--optimum)" }),
    ex.mode === "maxflow" ? "有流量的弧線(流量/容量)" : ex.mode === "shortest" ? "最短路徑經過的弧線" : "有運送的路線(運量 @單位成本)"),
    h("span", {}, h("i", { style: "border-color:var(--ink-2);opacity:.5" }), "未使用的弧線")));
  if (ex.mode === "transship") {
    card.append(h("h3", {}, "各路線運送量"), dataTable(["·起點", "·終點", "運送量", "單位成本", "小計"],
      ex.plan.map(p => h("tr", {}, h("td", { class: "l" }, p.from), h("td", { class: "l" }, p.to), h("td", {}, fmt(p.qty)), h("td", {}, fmt(p.cost)), h("td", {}, fmt(p.subtotal))))));
    const TN = { supply: "供應點", trans: "轉運點", demand: "需求點" };
    card.append(h("h3", {}, "流量平衡檢查"), dataTable(["節點", "·類型", "供應/需求量", "流入", "流出"],
      ex.balance.map(b => h("tr", {}, h("td", { class: "l" }, b.name), h("td", { class: "l" }, TN[b.type]),
        h("td", {}, b.type === "trans" ? "—" : fmt(b.amount)), h("td", {}, fmt(b.in)), h("td", {}, fmt(b.out))))));
  } else if (ex.mode === "shortest") {
    card.append(h("h3", {}, "路徑明細"), dataTable(["·弧線", "距離"],
      ex.legs.map(l => h("tr", {}, h("td", { class: "l" }, `${l.from} → ${l.to}`), h("td", {}, fmt(l.dist))))));
  } else {
    card.append(h("h3", {}, "各弧線流量"), dataTable(["·弧線", "流量", "容量", "·狀態"],
      ex.plan.map(p => h("tr", {}, h("td", { class: "l" }, `${p.from} → ${p.to}`), h("td", {}, fmt(p.qty)), h("td", {}, fmt(p.cap)),
        h("td", { class: "l" }, pill(!p.full, "尚有容量", "滿載", "bind"))))));
  }
  card.append(h("ul", { class: "notes" }, ex.text.map(t => h("li", {}, t))));
  box.append(card);
};
