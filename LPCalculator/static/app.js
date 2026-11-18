"use strict";
/* 線性規劃計算器 前端:輸入 → 即時模型 → 呼叫 /api → 顯示結果、敏感度、圖形 */

// ---------- 小工具 ----------
const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "html") el.innerHTML = v;
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const svgNS = "http://www.w3.org/2000/svg";
function s(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(svgNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, v);
  for (const kid of kids.flat()) if (kid != null) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
function fmt(x) {
  if (x == null) return "—";
  x = Number(x);
  if (Math.abs(x) < 1e-9) return "0";
  return String(parseFloat(x.toFixed(6)));
}
const r2 = x => String(parseFloat(Number(x).toFixed(2)));
const OPSYM = { "<=": "≤", ">=": "≥", "=": "=" };

async function api(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({ error: "伺服器回應格式錯誤。" }));
  if (!r.ok) throw new Error(j.error || "發生未知錯誤。");
  return j;
}

function numInput(get, set, opts = {}) {
  const el = h("input", { type: "number", step: "any", class: "num", value: get(), "aria-label": opts.label || "數值" });
  el.addEventListener("input", () => { set(el.value === "" ? "" : Number(el.value)); opts.onChange && opts.onChange(); });
  return el;
}
function textInput(get, set, cls, label, onChange) {
  const el = h("input", { type: "text", class: cls, value: get(), "aria-label": label });
  el.addEventListener("input", () => { set(el.value); onChange && onChange(); });
  return el;
}

// ---------- 提示框、拖曳、主題 ----------
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TIP = h("div", { class: "tooltip", role: "tooltip", hidden: true });
document.body.append(TIP);
function moveTip(e) {
  TIP.style.left = Math.max(8, Math.min(e.clientX + 14, innerWidth - TIP.offsetWidth - 8)) + "px";
  TIP.style.top = (e.clientY + 18 + TIP.offsetHeight > innerHeight ? e.clientY - TIP.offsetHeight - 10 : e.clientY + 18) + "px";
}
function tipOn(el, text) {
  el.addEventListener("pointerenter", e => {
    if (e.pointerType === "touch" || document.querySelector("svg.dragging")) return;
    TIP.textContent = typeof text === "function" ? text() : text; TIP.hidden = false; moveTip(e);
  });
  el.addEventListener("pointermove", e => { if (!TIP.hidden) moveTip(e); });
  el.addEventListener("pointerleave", () => { TIP.hidden = true; });
}
function svgPoint(svg, e) {
  const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  return p.matrixTransform(svg.getScreenCTM().inverse());
}
// 在 el 上按下後拖曳:onMove(svg 座標點, "start"|"move"|"end")。accept(e) 回傳 false 時不啟動。
function dragOn(el, svg, onMove, accept = () => true) {
  el.addEventListener("pointerdown", e => {
    if (e.button !== 0 || !accept(e)) return;
    e.preventDefault(); e.stopPropagation();
    el.setPointerCapture(e.pointerId); svg.classList.add("dragging"); TIP.hidden = true;
    onMove(svgPoint(svg, e), "start");
    const mv = ev => onMove(svgPoint(svg, ev), "move");
    const up = () => {
      el.removeEventListener("pointermove", mv); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up);
      svg.classList.remove("dragging"); onMove(null, "end");
    };
    el.addEventListener("pointermove", mv); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
  });
}
function initTheme() {
  const btn = $("#theme-toggle"), root = document.documentElement;
  if (!btn) return;
  const paint = () => { btn.textContent = root.dataset.theme === "dark" ? "☀ 淺色模式" : "☾ 深色模式"; };
  if (!root.dataset.theme) root.dataset.theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  btn.addEventListener("click", () => {
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("theme", root.dataset.theme); } catch (e) { /* 無痕模式等情況:只是不記住 */ }
    paint();
  });
  paint();
}

// ---------- 變數型態與非負限制 ----------
// kind:cont(連續 ≥0)、free(連續、無限制)、int(整數 ≥0)、ifree(整數、無限制)、bin(0-1)
const KIND_BASE = { cont: "cont", free: "cont", int: "int", ifree: "int", bin: "bin" };
const isNonneg = k => k !== "free" && k !== "ifree";
function setKind(v, base, nonneg) {
  v.kind = base === "bin" ? "bin" : base === "cont" ? (nonneg ? "cont" : "free") : (nonneg ? "int" : "ifree");
}
// 回傳兩列表格:「型態」下拉選單、「非負限制」勾選框
function kindRows(vars, onChange) {
  const types = h("tr", {}, h("th", { class: "l" }, "型態"));
  const signs = h("tr", {}, h("th", { class: "l" }, "非負限制"));
  vars.forEach(v => {
    const sel = h("select", { "aria-label": `${v.name} 的型態` },
      [["cont", "連續"], ["int", "整數"], ["bin", "0 或 1"]].map(([val, t]) => h("option", { value: val, selected: KIND_BASE[v.kind] === val }, t)));
    const box = h("input", { type: "checkbox", checked: isNonneg(v.kind), disabled: v.kind === "bin", "aria-label": `${v.name} ≥ 0` });
    const tag = h("span", {}, `${v.name || "?"} ≥ 0`);
    sel.addEventListener("change", () => {
      setKind(v, sel.value, sel.value === "bin" || box.checked);
      box.disabled = v.kind === "bin"; box.checked = isNonneg(v.kind); onChange();
    });
    box.addEventListener("change", () => { setKind(v, KIND_BASE[v.kind], box.checked); onChange(); });
    types.append(h("td", {}, sel));
    signs.append(h("td", {}, h("label", { class: "nonneg" }, box, tag)));
  });
  return [types, signs];
}
function nonnegAllButton(vars, rerender) {
  const all = vars.every(v => isNonneg(v.kind));
  return h("button", { class: "btn", type: "button", onclick: () => {
    vars.forEach(v => { if (v.kind !== "bin") setKind(v, KIND_BASE[v.kind], !all); }); rerender();
  } }, all ? "全部取消 ≥ 0" : "全部勾選 ≥ 0");
}
function kindLines(vars) {
  const g = { cont: [], int: [], bin: [], free: [], ifree: [] };
  vars.forEach(v => g[v.kind].push(v.name || "?"));
  const T = { cont: "≥ 0", int: "≥ 0 且為整數", bin: "∈ {0, 1}", free: "無正負限制", ifree: "為整數(無正負限制)" };
  return Object.keys(T).filter(k => g[k].length).map(k => `    ${g[k].join(", ")} ${T[k]}`);
}

// ---------- 模型文字(即時預覽) ----------
function termText(k, name) {
  const a = Math.abs(k);
  const num = Math.abs(a - 1) < 1e-12 ? "" : fmt(a);
  return num && !/^[A-Za-z]/.test(name) ? `${num}×${name}` : `${num}${name}`;
}
function exprText(coefs, names) {
  const parts = [];
  coefs.forEach((k, i) => {
    k = Number(k);
    if (!k) return;
    const t = termText(k, names[i]);
    parts.push(parts.length ? (k < 0 ? "- " : "+ ") + t : (k < 0 ? "-" : "") + t);
  });
  return parts.length ? parts.join(" ") : "0";
}
function modelTextLines(m) {
  const names = m.vars.map(v => v.name || "?");
  const lines = [`${m.sense} Z = ${exprText(m.c, names)}`, "subject to"];
  m.cons.forEach(c => lines.push(`    ${exprText(c.a, names)} ${OPSYM[c.op]} ${fmt(c.b === "" ? 0 : c.b)}`));
  return lines.concat(kindLines(m.vars));
}

// ---------- 圖形(可互動) ----------
function clipToWindow(a1, a2, b, w) {
  const pts = [];
  if (Math.abs(a2) > 1e-12) for (const x of [w.xl, w.xh]) { const y = (b - a1 * x) / a2; if (y >= w.yl - 1e-9 && y <= w.yh + 1e-9) pts.push([x, y]); }
  if (Math.abs(a1) > 1e-12) for (const y of [w.yl, w.yh]) { const x = (b - a2 * y) / a1; if (x >= w.xl - 1e-9 && x <= w.xh + 1e-9) pts.push([x, y]); }
  const tol = 1e-9 * (1 + Math.abs(w.xh - w.xl) + Math.abs(w.yh - w.yl));
  const out = [];
  pts.forEach(p => { if (!out.some(q => Math.abs(q[0] - p[0]) < tol && Math.abs(q[1] - p[1]) < tol)) out.push(p); });
  return out.length >= 2 ? [out[0], out[out.length - 1]] : null;
}
function probeEval(g, x, y) {
  const z = g.c[0] * x + g.c[1] * y, bad = [];
  (g.hps || []).forEach(hp => {
    const v = hp.a[0] * x + hp.a[1] * y, tol = 1e-7 * (1 + Math.abs(hp.b));
    if ((hp.op === "<=" && v > hp.b + tol) || (hp.op === ">=" && v < hp.b - tol) || (hp.op === "=" && Math.abs(v - hp.b) > tol)) bad.push(hp.name);
  });
  const nonInt = (g.integer || []).some((f, j) => f && Math.abs([x, y][j] - Math.round([x, y][j])) > 1e-9);
  return { x, y, z, bad, nonInt, feasible: !bad.length && !nonInt };
}

function drawGraph(g, onProbe) {
  const W = 760, H = 560, M = { l: 64, r: 24, t: 20, b: 56 };
  const w = g.window;
  const sx = x => M.l + ((x - w.xl) / (w.xh - w.xl)) * (W - M.l - M.r);
  const sy = y => H - M.b - ((y - w.yl) / (w.yh - w.yl)) * (H - M.t - M.b);
  const ix = px => w.xl + ((px - M.l) / (W - M.l - M.r)) * (w.xh - w.xl);
  const iy = py => w.yl + ((H - M.b - py) / (H - M.t - M.b)) * (w.yh - w.yl);
  const interactive = !!(onProbe && g.c && g.hps);
  const svg = s("svg", { class: "plot" + (interactive ? " drag" : ""), viewBox: `0 0 ${W} ${H}`, role: "img",
    "aria-label": "可行區域與最佳解圖形(可拖曳試算點)" });

  const nice = (lo, hi) => {
    const raw = (hi - lo) / 7, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 5, 10].map(m => m * p).find(v => v >= raw);
    const out = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(parseFloat(v.toFixed(8)));
    return out;
  };
  nice(w.xl, w.xh).forEach(v => {
    svg.append(s("line", { x1: sx(v), x2: sx(v), y1: M.t, y2: H - M.b, stroke: "var(--line-soft)" }));
    svg.append(s("text", { class: "tick", x: sx(v), y: H - M.b + 16, "text-anchor": "middle" }, fmt(v)));
  });
  nice(w.yl, w.yh).forEach(v => {
    svg.append(s("line", { y1: sy(v), y2: sy(v), x1: M.l, x2: W - M.r, stroke: "var(--line-soft)" }));
    svg.append(s("text", { class: "tick", x: M.l - 8, y: sy(v) + 4, "text-anchor": "end" }, fmt(v)));
  });
  svg.append(s("line", { x1: M.l, x2: W - M.r, y1: sy(0), y2: sy(0), stroke: "var(--ink-2)" }));
  svg.append(s("line", { y1: M.t, y2: H - M.b, x1: sx(0), x2: sx(0), stroke: "var(--ink-2)" }));
  svg.append(s("text", { x: (M.l + W - M.r) / 2, y: H - 12, "text-anchor": "middle", "font-size": 14 }, `${g.names[0]}(${g.labels[0]})`));
  svg.append(s("text", { x: 16, y: (M.t + H - M.b) / 2, "text-anchor": "middle", "font-size": 14,
    transform: `rotate(-90 16 ${(M.t + H - M.b) / 2})` }, `${g.names[1]}(${g.labels[1]})`));

  if (g.polygon.length >= 3)
    svg.append(s("polygon", { points: g.polygon.map(p => `${sx(p[0])},${sy(p[1])}`).join(" "),
      fill: "var(--feasible-soft)", stroke: "var(--feasible)", "stroke-width": 2 }));

  // 限制式邊界:滑鼠移上去會變色並顯示名稱與式子
  g.lines.forEach(l => {
    const pos = { x1: sx(l.p[0][0]), y1: sy(l.p[0][1]), x2: sx(l.p[1][0]), y2: sy(l.p[1][1]) };
    const grp = s("g", { class: "cline" },
      s("line", { class: "vis", ...pos, stroke: "var(--ink-2)", "stroke-width": l.bound ? 1 : 1.6, "stroke-dasharray": l.bound ? "2 4" : "6 4" }),
      s("line", { class: "hit", ...pos }));
    tipOn(grp, l.text ? `${l.label}\n${l.text}` : l.label);
    svg.append(grp);
  });
  g.lines.filter(l => !l.bound).forEach(l => {
    const [a, b] = l.p; const t = 0.86;
    svg.append(s("text", { class: "halo", x: sx(a[0] + (b[0] - a[0]) * t), y: sy(a[1] + (b[1] - a[1]) * t) - 6,
      "font-size": 12, "text-anchor": "middle", "pointer-events": "none" }, l.label));
  });

  g.iso.forEach(l => {
    svg.append(s("line", { x1: sx(l.p[0][0]), y1: sy(l.p[0][1]), x2: sx(l.p[1][0]), y2: sy(l.p[1][1]),
      stroke: l.optimal ? "var(--optimum)" : "var(--objective)", "stroke-width": l.optimal ? 2.6 : 1.2,
      "stroke-dasharray": l.optimal ? null : "7 4", opacity: l.optimal ? 1 : 0.55, "pointer-events": "none" }));
    if (l.optimal) {
      const [a, b] = l.p;
      svg.append(s("text", { class: "halo", x: sx((a[0] + b[0]) / 2) + 6, y: sy((a[1] + b[1]) / 2) - 6, "font-size": 12,
        fill: "var(--optimum)", "pointer-events": "none" }, `Z* = ${fmt(l.z)}`));
    }
  });

  g.lattice.forEach(p => svg.append(s("circle", { cx: sx(p[0]), cy: sy(p[1]), r: 2.6, fill: "var(--feasible)", opacity: 0.7, "pointer-events": "none" })));

  // 目標改善方向箭頭
  const [ix0, iy0] = g.improve, len = Math.hypot(ix0, iy0);
  if (len > 1e-12) {
    const ox = W - M.r - 90, oy = M.t + 70, ux = ix0 / len, uy = -iy0 / len;
    svg.append(s("line", { x1: ox - ux * 34, y1: oy - uy * 34, x2: ox + ux * 34, y2: oy + uy * 34, stroke: "var(--objective)", "stroke-width": 3 }));
    const ex = ox + ux * 34, ey = oy + uy * 34;
    svg.append(s("polygon", { points: `${ex},${ey} ${ex - ux * 10 - uy * 6},${ey - uy * 10 + ux * 6} ${ex - ux * 10 + uy * 6},${ey - uy * 10 - ux * 6}`, fill: "var(--objective)" }));
    svg.append(s("text", { class: "halo", x: ox, y: oy + 52, "text-anchor": "middle", "font-size": 12 }, g.sense === "max" ? "Z 增大方向" : "Z 減小方向"));
  }

  // 試算點:拖曳後即時顯示通過它的等值線
  let setProbe = null;
  if (interactive) {
    const guide = s("path", { stroke: "var(--objective)", "stroke-dasharray": "2 3", fill: "none", opacity: 0.7, "pointer-events": "none" });
    const pIso = s("line", { stroke: "var(--objective)", "stroke-width": 2.2, "stroke-dasharray": "8 5", "pointer-events": "none" });
    const pLab = s("text", { class: "halo", "font-size": 13, "font-weight": 700, fill: "var(--objective)", "pointer-events": "none" });
    svg.append(guide, pIso, pLab);
    const xStep = g.integer && g.integer[0] ? 1 : Math.pow(10, Math.floor(Math.log10((w.xh - w.xl) / 100)));
    const yStep = g.integer && g.integer[1] ? 1 : Math.pow(10, Math.floor(Math.log10((w.yh - w.yl) / 100)));
    const snapTo = (v, st) => parseFloat((Math.round(v / st) * st).toFixed(10));
    setProbe = (x, y) => {
      x = clamp(x, w.xl, w.xh); y = clamp(y, w.yl, w.yh);
      const p = probeEval(g, x, y);
      knob.setAttribute("transform", `translate(${sx(x)},${sy(y)})`);
      knobDot.setAttribute("fill", p.feasible ? "var(--objective)" : "var(--ink-2)");
      const x0 = sx(clamp(0, w.xl, w.xh)), y0 = sy(clamp(0, w.yl, w.yh));
      guide.setAttribute("d", `M${sx(x)},${sy(y)} V${y0} M${sx(x)},${sy(y)} H${x0}`);
      const seg = clipToWindow(g.c[0], g.c[1], p.z, w);
      if (seg) {
        [["x1", sx(seg[0][0])], ["y1", sy(seg[0][1])], ["x2", sx(seg[1][0])], ["y2", sy(seg[1][1])]].forEach(([k, v]) => pIso.setAttribute(k, v));
        pIso.removeAttribute("visibility");
      } else pIso.setAttribute("visibility", "hidden");
      const lx = sx(x) + 14, ly = sy(y) - 14;
      pLab.setAttribute("x", Math.min(lx, W - M.r - 90)); pLab.setAttribute("y", Math.max(ly, M.t + 14));
      pLab.textContent = `Z = ${r2(p.z)}`;
      knob.setAttribute("aria-valuetext", `${g.names[0]} = ${r2(x)}, ${g.names[1]} = ${r2(y)}, Z = ${r2(p.z)}${p.feasible ? ",可行" : ",不可行"}`);
      onProbe(p);
    };
    const fromPixel = (px, py) => {
      for (const v of g.vertices) if (Math.hypot(sx(v.x) - px, sy(v.y) - py) < 11) return [v.x, v.y];
      return [snapTo(ix(px), xStep), snapTo(iy(py), yStep)];
    };
    const knobDot = s("circle", { class: "ring", r: 9, fill: "var(--objective)", stroke: "var(--panel)", "stroke-width": 2.5 });
    const knob = s("g", { class: "probe drag", tabindex: 0, role: "slider", "aria-label": "試算點:拖曳或用方向鍵移動" },
      s("circle", { r: 18, fill: "transparent" }), knobDot);
    let cur = g.optimum ? [g.optimum.x, g.optimum.y] : g.vertices.length ? [g.vertices[0].x, g.vertices[0].y] : [(w.xl + w.xh) / 2, (w.yl + w.yh) / 2];
    const home = [...cur];
    const go = (x, y) => { cur = [x, y]; setProbe(x, y); };
    // 在圖上任一處按下並拖曳都能移動試算點(角點除外,點角點會直接跳過去)
    dragOn(svg, svg, (pt, phase) => { if (pt) go(...fromPixel(pt.x, pt.y)); if (phase === "end") knob.focus({ preventScroll: true }); },
      e => !e.target.closest(".vtx"));
    knob.addEventListener("keydown", e => {
      const k = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!k) return;
      e.preventDefault();
      const m = e.shiftKey ? 10 : 1;
      go(snapTo(cur[0] + k[0] * xStep * m, xStep), snapTo(cur[1] + k[1] * yStep * m, yStep));
    });
    svg.resetProbe = () => go(...home);
    svg.goProbe = go;
    // 角點:放在最上層,可點擊跳轉
    g.vertices.forEach((v, i) => {
      const grp = s("g", { class: "vtx" },
        s("circle", { cx: sx(v.x), cy: sy(v.y), r: v.optimal ? 8 : 5.5, fill: v.optimal ? "var(--optimum)" : "var(--panel)",
          stroke: v.optimal ? "var(--panel)" : "var(--feasible)", "stroke-width": 2.5 }),
        s("text", { class: "halo", x: sx(v.x) + 10, y: sy(v.y) + (v.optimal ? 20 : 16), "font-size": 12,
          "font-weight": v.optimal ? 700 : 400 }, `(${r2(v.x)}, ${r2(v.y)})`));
      tipOn(grp, `角點 P${i + 1}(${r2(v.x)}, ${r2(v.y)})\nZ = ${fmt(v.z)}${v.optimal ? "\n★ 最佳解" : ""}\n(點一下把試算點移過來)`);
      grp.addEventListener("click", () => go(v.x, v.y));
      svg.append(grp);
    });
    svg.append(knob);
    setTimeout(() => setProbe(...cur));
  } else {
    g.vertices.forEach(v => {
      svg.append(s("circle", { cx: sx(v.x), cy: sy(v.y), r: v.optimal ? 8 : 5, fill: v.optimal ? "var(--optimum)" : "var(--panel)",
        stroke: v.optimal ? "var(--panel)" : "var(--feasible)", "stroke-width": 2.5 }));
      svg.append(s("text", { class: "halo", x: sx(v.x) + 10, y: sy(v.y) + (v.optimal ? 20 : 16), "font-size": 12,
        "font-weight": v.optimal ? 700 : 400 }, `(${r2(v.x)}, ${r2(v.y)})`));
    });
  }
  return svg;
}

function graphCard(g) {
  const out = h("div", { class: "probe-out", "aria-live": "polite" });
  const svg = drawGraph(g, p => {
    let rel = null;
    if (p.feasible && g.optimum) {
      const d = g.optimum.z - p.z;
      rel = Math.abs(d) < 1e-9 * (1 + Math.abs(g.optimum.z)) ? "= 最佳值 Z*"
        : `與最佳值 Z* 相差 ${r2(Math.abs(d))}`;
    }
    out.replaceChildren(...[
      h("span", {}, "試算點 ", h("b", {}, `${g.names[0]} = ${r2(p.x)},${g.names[1]} = ${r2(p.y)}`)),
      h("span", {}, `${g.obj_name} Z = `, h("b", {}, r2(p.z))),
      h("span", { class: "pill " + (p.feasible ? "ok" : "bad") }, p.feasible ? "可行" : p.bad.length ? "不可行" : "不是整數"),
      p.bad.length ? h("span", { class: "hint", style: "margin:0" }, "違反:" + p.bad.join("、")) : null,
      rel && h("span", { class: "hint", style: "margin:0" }, rel),
      g.optimum && h("button", { class: "btn icon", type: "button", onclick: () => svg.resetProbe() }, "回到最佳解")].filter(Boolean));
  });
  const card = h("div", { class: "card" }, h("h2", {}, "圖形化分析(可互動)"),
    h("p", { class: "hint" }, g.optimum
      ? `在圖上按住拖曳(或選取後用方向鍵,Shift 加速)移動「試算點」:橘色虛線是通過它的等${g.obj_name}線,下方即時顯示 Z 與是否可行。點角點可直接跳過去;滑鼠移到邊界線上可看限制式。`
      : "此問題沒有最佳解,圖中顯示的是可行區域(若為無界,區域向外延伸)。可拖曳試算點檢查任一點是否可行。"));
  card.append(svg);
  if (svg.resetProbe) card.append(out);
  card.append(h("div", { class: "legend" },
    h("span", {}, h("i", { class: "box" }), "可行區域"),
    h("span", {}, h("i", { style: "border-color:var(--ink-2);border-top-style:dashed" }), "限制式邊界"),
    h("span", {}, h("i", { style: "border-color:var(--objective);border-top-style:dashed" }), `等${g.obj_name}線`),
    g.optimum && h("span", {}, h("i", { style: "border-color:var(--optimum)" }), "通過最佳解的等值線")));
  if (g.vertices.length) {
    const t = h("table", { class: "data" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, "角點"),
      h("th", {}, g.names[0]), h("th", {}, g.names[1]), h("th", {}, "Z"), h("th", { class: "l" }, ""))),
      h("tbody", {}, g.vertices.map((v, i) => h("tr", {}, h("td", { class: "l" }, `P${i + 1}`), h("td", {}, fmt(v.x)),
        h("td", {}, fmt(v.y)), h("td", {}, fmt(v.z)), h("td", { class: "l" }, v.optimal ? h("span", { class: "pill good" }, "最佳") : "")))));
    card.append(h("details", { class: "more inline-more" }, h("summary", {}, `可行區域的角點(共 ${g.vertices.length} 個,最佳解一定出現在角點)`),
      h("div", { class: "scroll-x" }, t)));
  }
  return card;
}

// ---------- 結果顯示(以決策為主,公式收在最下方) ----------
function barRow({ name, frac, mark, cls, val, sub, tip }) {
  const pct = v => (clamp(v, 0, 1) * 100).toFixed(2) + "%";
  const row = h("div", { class: "bar-row" }, h("span", { class: "nm", title: name }, name),
    h("div", { class: "bar-track" }, h("div", { class: "bar-fill " + (cls || ""), style: `width:${pct(frac)}` }),
      mark != null && h("div", { class: "bar-mark", style: `left:${pct(mark)}` })),
    h("span", { class: "val" }, val), sub && h("div", { class: "sub" }, sub));
  if (tip) tipOn(row, tip);
  return row;
}

function decisionCard(res, compact) {
  const m = res.model, sw = m.sense === "max" ? "最大" : "最小";
  const card = h("div", { class: "card" }, h("h2", {}, "最佳決策"),
    h("div", { class: "banner ok" }, res.is_integer ? "已找到最佳整數解。" : "已找到最佳解。"));
  const nz = res.x.filter(v => Math.abs(v.value) > 1e-9);
  const many = res.x.length > 12;
  if (!compact) {
    const ans = h("div", { class: "answer" });
    (many ? nz : res.x).forEach(v => ans.append(h("div", { class: "cell" },
      h("small", {}, v.label !== v.name ? `${v.label}(${v.name})` : v.name), h("b", {}, fmt(v.value)))));
    ans.append(h("div", { class: "cell z" }, h("small", {}, `${sw}${m.obj_name} Z*`), h("b", {}, fmt(res.z))));
    card.append(ans);
    if (many) card.append(h("p", { class: "hint" }, `共 ${res.x.length} 個決策變數,此處只列出不為 0 的 ${nz.length} 個。`));
  }
  const terms = res.x.map((v, j) => ({ name: v.label || v.name, c: m.c[j], x: v.value, val: m.c[j] * v.value }))
    .filter(t => Math.abs(t.val) > 1e-9).sort((a, b) => Math.abs(b.val) - Math.abs(a.val));
  if (terms.length >= 2) {
    const mx = Math.abs(terms[0].val), tot = terms.reduce((a, t) => a + t.val, 0), sameSign = terms.every(t => Math.sign(t.val) === Math.sign(terms[0].val));
    card.append(h("h3", {}, `各決策對${m.obj_name}的貢獻`),
      h("div", { class: "bars" }, terms.slice(0, 12).map(t => barRow({ name: t.name, frac: Math.abs(t.val) / mx, cls: t.val < 0 ? "mid" : "",
        val: fmt(t.val) + (sameSign && Math.abs(tot) > 1e-9 ? `(${Math.round((t.val / tot) * 100)}%)` : ""),
        tip: `${t.name}\n係數 ${fmt(t.c)} × 決策值 ${fmt(t.x)} = ${fmt(t.val)}` }))));
    if (terms.length > 12) card.append(h("p", { class: "hint" }, `另有 ${terms.length - 12} 項較小的貢獻未列出。`));
    if (!sameSign) card.append(h("p", { class: "hint" }, "橘色長條表示對目標值的貢獻為負。"));
  }
  card.append(h("h3", {}, "結果解讀(管理意涵)"), h("ul", { class: "notes" }, res.summary.map(t => h("li", {}, t))));
  return card;
}

function constraintBar(r) {
  const neg = r.lhs < -1e-9 || r.rhs < -1e-9, eq = r.op === "=";
  const mx = Math.max(Math.abs(r.lhs), Math.abs(r.rhs)) || 1;
  const word = r.op === "≤" ? "上限" : r.op === "≥" ? "下限" : "右端值";
  let sub;
  if (r.shadow != null && Math.abs(r.shadow) > 1e-9) sub = `${eq ? "" : "瓶頸 · "}${word}每增加 1,Z ${r.shadow > 0 ? "增加" : "減少"} ${fmt(Math.abs(r.shadow))}`;
  else if (r.binding) sub = eq ? "等式成立" : "瓶頸(等號成立)";
  else sub = r.op === "≤" ? `尚有剩餘 ${fmt(r.slack)}` : `超出下限 ${fmt(r.slack)}`;
  if (r.op === "≤" && r.rhs > 1e-9 && !neg) sub += ` · 使用率 ${Math.round((r.lhs / r.rhs) * 100)}%`;
  return barRow({ name: r.name, frac: neg ? 0 : Math.abs(r.lhs) / mx, mark: neg ? null : Math.abs(r.rhs) / mx,
    cls: r.binding && !eq ? "hot" : "", val: `${fmt(r.lhs)} ${r.op} ${fmt(r.rhs)}`, sub, tip: r.text });
}

function resourceCard(res) {
  if (!res.rows.length) return null;
  const rank = r => (r.op === "=" ? 2 : r.binding ? 0 : 1);
  const rows = res.rows.map((r, i) => ({ r, i })).sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i).map(o => o.r);
  const show = rows.slice(0, 12), rest = rows.slice(12);
  const nb = res.rows.filter(r => r.binding && r.op !== "=").length;
  const card = h("div", { class: "card" }, h("h2", {}, "資源使用與瓶頸"),
    h("p", { class: "hint" }, `長條 = 最佳解下的實際數量;黑色刻度 = 限制值。紅色是等號成立的瓶頸限制(共 ${nb} 條),放寬它才能改善目標。`),
    h("div", { class: "bars" }, show.map(constraintBar)));
  if (rest.length) card.append(h("details", { class: "more inline-more" }, h("summary", {}, `其他 ${rest.length} 條限制式`),
    h("div", { class: "bars" }, rest.map(constraintBar))));
  if (res.is_integer) card.append(h("p", { class: "hint" }, "整數規劃沒有嚴格意義的影子價格,因此只顯示用量與剩餘。"));
  return card;
}

function detailCard(res) {
  const d = h("details", { class: "card more" },
    h("summary", {}, "數學模型與詳細數據", h("small", {}, "(公式、限制式表、敏感度表)")),
    h("h3", {}, "數學模型"), h("pre", { class: "model" }, res.model_lines.join("\n")));
  if (res.status !== "optimal") return d;
  const bigTable = res.rows.length > 12;
  d.append(h("h3", {}, "限制式分析"), h("div", { class: "scroll-x" }, h("table", { class: "data" },
    h("thead", {}, h("tr", {}, h("th", { class: "l" }, "限制式"), h("th", { class: "l" }, "式子"), h("th", {}, "左側值"), h("th", {}, "右側值"),
      h("th", {}, "鬆弛/剩餘"), h("th", {}, "Shadow Price"), h("th", { class: "l" }, "狀態"))),
    h("tbody", {}, res.rows.map(r => h("tr", {}, h("td", { class: "l" }, r.name),
      h("td", { class: "l" }, bigTable ? "" : r.text), h("td", {}, fmt(r.lhs)), h("td", {}, fmt(r.rhs)), h("td", {}, fmt(r.slack)),
      h("td", {}, r.shadow == null ? "不適用" : fmt(r.shadow)),
      h("td", { class: "l" }, h("span", { class: "pill " + (r.binding ? "bind" : "non") }, r.binding ? "Binding" : "Non-binding"))))))),
    h("h3", {}, "敏感度分析說明"), h("ul", { class: "notes" }, res.sensitivity_notes.map(t => h("li", {}, t))));
  return d;
}

function resultCards(res, opts = {}) {
  const box = h("div", {});
  if (res.note) box.append(h("div", { class: "banner warn" }, res.note));
  if (res.status !== "optimal") {
    box.append(h("div", { class: "banner err" }, res.message));
    if (res.graph) box.append(graphCard(res.graph));
    box.append(detailCard(res));
    return box;
  }
  box.append(decisionCard(res, opts.compact));
  if (res.graph) box.append(graphCard(res.graph));
  const rc = resourceCard(res);
  if (rc) box.append(rc);
  box.append(detailCard(res));
  return box;
}

// =====================================================================
// 一般線性規劃
// =====================================================================
const EXAMPLES = {
  "產品組合問題": { sense: "max", obj_name: "利潤", unit: "單位",
    story: ["某工廠生產產品 A 與產品 B,每單位利潤分別為 $20 與 $15。",
      "生產 1 單位 A 需要人力 2 小時、原料 1 單位;生產 1 單位 B 需要人力 1 小時、原料 3 單位。",
      "工廠每天可用人力 20 小時、原料 35 單位。請問 A、B 各生產多少單位,才能使每日利潤最大?"],
    vars: [["x1", "cont", "產品A"], ["x2", "cont", "產品B"]], c: [20, 15],
    cons: [["人力限制", [2, 1], "<=", 20], ["原料限制", [1, 3], "<=", 35]] },
  "最低成本飲食搭配": { sense: "min", obj_name: "成本", unit: "份",
    story: ["營養師要用食物 A(每份 $3)與食物 B(每份 $8)搭配每日餐點。",
      "為了達到營養需求,每天兩種食物合計至少要吃 4 份;為了均衡,食物 A 的份數最多只能比食物 B 多 2 份。",
      "請問 A、B 各吃幾份,才能以最低成本滿足需求?"],
    vars: [["x1", "cont", "食物A"], ["x2", "cont", "食物B"]], c: [3, 8],
    cons: [["營養需求", [1, 1], ">=", 4], ["比例限制", [1, -1], "<=", 2]] },
  "機型生產排程(整數台數)": { sense: "max", obj_name: "利潤", unit: "台",
    story: ["工廠生產機型 A 與機型 B,每台利潤分別為 5 千元與 4 千元,且產量必須是整數台。",
      "每台 A 需組裝 6 小時、測試 1 小時;每台 B 需組裝 4 小時、測試 2 小時。",
      "每天組裝工時 24 小時、測試工時 6 小時。請問各生產幾台,利潤最大?"],
    vars: [["x1", "int", "機型A"], ["x2", "int", "機型B"]], c: [5, 4],
    cons: [["組裝工時", [6, 4], "<=", 24], ["測試工時", [1, 2], "<=", 6]] },
  "Nancy 的投資問題": { sense: "max", obj_name: "一年後報酬", unit: "",
    story: ["Nancy 有 $250,000 可以投資在公寓、土地與債券三種標的:",
      "公寓每間 $50,000,一年報酬 $9,000,最多可買 4 間;土地每英畝 $12,000,一年報酬 $1,500,最多 15 英畝;債券每張 $8,000,一年報酬 $1,000,最多 20 張。",
      "公寓與債券只能買整數單位,土地可以分割。請問該如何投資,一年後的報酬最大?(混合整數規劃)"],
    vars: [["x1", "int", "公寓(間)"], ["x2", "cont", "土地(英畝)"], ["x3", "int", "債券(張)"]], c: [9000, 1500, 1000],
    cons: [["投資預算", [50000, 12000, 8000], "<=", 250000], ["公寓上限", [1, 0, 0], "<=", 4],
      ["土地上限", [0, 1, 0], "<=", 15], ["債券上限", [0, 0, 1], "<=", 20]] },
  "社區休閒設施規劃": { sense: "max", obj_name: "每日使用人次", unit: "",
    story: ["市政府考慮興建游泳池、網球中心、運動場、體育館四項設施,預算 $120,000,可用土地 12 英畝。",
      "游泳池:成本 $35,000、土地 4 英畝、每日 300 人次;網球中心:$10,000、2 英畝、90 人次;運動場:$25,000、7 英畝、400 人次;體育館:$90,000、3 英畝、150 人次。",
      "游泳池與網球中心最多只能蓋其中一個。每項設施只能選擇蓋或不蓋,請問該蓋哪些,每日使用人次最多?(0-1 整數規劃)"],
    vars: [["x1", "bin", "游泳池"], ["x2", "bin", "網球中心"], ["x3", "bin", "運動場"], ["x4", "bin", "體育館"]], c: [300, 90, 400, 150],
    cons: [["預算限制", [35000, 10000, 25000, 90000], "<=", 120000], ["土地限制", [4, 2, 7, 3], "<=", 12], ["互斥限制", [1, 1, 0, 0], "<=", 1]] },
  "五種產品的生產規劃": { sense: "max", obj_name: "利潤", unit: "單位",
    story: ["工廠生產 5 種產品,每單位利潤分別為 $8、$6、$9、$5、$7。",
      "每單位所需機器工時為 2、1、3、1、2 小時(每天共 40 小時);人工工時為 1、2、1、2、1 小時(每天共 30 小時);原料為 3、1、2、2、1 單位(每天共 50 單位)。",
      "請問各產品生產多少,總利潤最大?"],
    vars: [1, 2, 3, 4, 5].map(i => [`x${i}`, "cont", `產品${i}`]), c: [8, 6, 9, 5, 7],
    cons: [["機器工時", [2, 1, 3, 1, 2], "<=", 40], ["人工工時", [1, 2, 1, 2, 1], "<=", 30], ["原料", [3, 1, 2, 2, 1], "<=", 50]] },
};

const G = { sense: "max", obj_name: "利潤", unit: "單位", vars: [], c: [], cons: [], result: null, error: null, busy: false, title: "", story: null };

function loadExample(key) {
  const e = EXAMPLES[key];
  G.sense = e.sense; G.obj_name = e.obj_name; G.unit = e.unit;
  G.vars = e.vars.map(([name, kind, label]) => ({ name, kind, label }));
  G.c = [...e.c];
  G.cons = e.cons.map(([name, a, op, b]) => ({ name, a: [...a], op, b }));
  G.result = null; G.error = null;
  G.title = key; G.story = e.story || null;
}

// 題目敘述卡片(載入範例時顯示)
function problemCard(title, story, onClose) {
  return h("div", { class: "card problem" },
    h("div", { class: "card-head" }, h("h2", {}, `題目:${title}`),
      onClose && h("button", { class: "btn icon", type: "button", title: "隱藏題目", "aria-label": "隱藏題目", onclick: onClose }, "✕")),
    [].concat(story).map(t => h("p", {}, t)));
}

function resizeVars(n) {
  n = Math.max(1, Math.min(30, n | 0));
  while (G.vars.length < n) {
    const i = G.vars.length + 1;
    G.vars.push({ name: `x${i}`, kind: "cont", label: `x${i}` }); G.c.push(0); G.cons.forEach(c => c.a.push(0));
  }
  while (G.vars.length > n) { G.vars.pop(); G.c.pop(); G.cons.forEach(c => c.a.pop()); }
}

function renderGeneral() {
  const root = $("#view-general");
  const keep = { scroll: window.scrollY };
  root.replaceChildren();
  const left = h("div", {}), right = h("div", { id: "g-result" });
  root.append(h("div", { class: "layout" }, left, right));

  const preview = h("pre", { class: "model" });
  const updatePreview = () => {
    preview.textContent = modelTextLines({ sense: G.sense, vars: G.vars, c: G.c, cons: G.cons }).join("\n");
  };

  // 範例
  const sel = h("select", { "aria-label": "載入範例題目" }, h("option", { value: "" }, "— 選擇題目 —"), Object.keys(EXAMPLES).map(k => h("option", { value: k, selected: k === G.title }, k)));
  sel.addEventListener("change", () => { if (sel.value) { loadExample(sel.value); renderGeneral(); } });

  // 1. 問題類型 + 變數個數
  const nIn = h("input", { type: "number", min: 1, max: 30, value: G.vars.length, class: "num", "aria-label": "決策變數個數" });
  nIn.addEventListener("change", () => { resizeVars(Number(nIn.value) || 1); G.result = null; renderGeneral(); });
  const sense = (val, text) => h("label", { class: "inline" }, h("input", { type: "radio", name: "sense", value: val, checked: G.sense === val,
    onchange: () => { G.sense = val; if (!G._objTouched) G.obj_name = val === "max" ? "利潤" : "成本"; renderGeneral(); } }), text);
  left.append(h("div", { class: "card" }, h("h2", {}, "1. 問題設定"),
    h("div", { class: "row" }, sense("max", "Maximization(最大化)"), sense("min", "Minimization(最小化)")),
    h("div", { class: "row" },
      h("label", { class: "field" }, "決策變數個數", nIn),
      h("label", { class: "field" }, "目標名稱(用於結果解讀)", textInput(() => G.obj_name, v => { G.obj_name = v; G._objTouched = true; }, "wide", "目標名稱")),
      h("label", { class: "field" }, "數量單位", textInput(() => G.unit, v => G.unit = v, "name", "單位"))),
    h("div", { class: "row" }, h("label", { class: "field" }, "範例題目", sel))));
  if (G.story) left.append(problemCard(G.title, G.story, () => { G.story = null; renderGeneral(); }));

  // 2. 變數
  const varTbl = h("table", { class: "grid-in" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, ""), G.vars.map((_, i) => h("th", {}, `變數 ${i + 1}`))),
  ), h("tbody", {},
    h("tr", {}, h("th", { class: "l" }, "名稱"), G.vars.map(v => h("td", {}, textInput(() => v.name, x => v.name = x.trim(), "name", "變數名稱", updatePreview)))),
    h("tr", {}, h("th", { class: "l" }, "說明"), G.vars.map(v => h("td", {}, textInput(() => v.label, x => v.label = x, "name", "變數說明")))),
    kindRows(G.vars, () => { updatePreview(); const b = nonnegAllButton(G.vars, renderGeneral); allBtn.replaceWith(b); allBtn = b; })));
  let allBtn = nonnegAllButton(G.vars, renderGeneral);
  left.append(h("div", { class: "card" }, h("div", { class: "card-head" }, h("h2", {}, "2. 決策變數"), allBtn),
    h("p", { class: "hint" }, "勾選「≥ 0」就是加上非負限制;取消勾選表示該變數可正可負。型態可選連續、整數或 0-1。"), h("div", { class: "scroll-x" }, varTbl)));

  // 3. 目標函數
  left.append(h("div", { class: "card" }, h("h2", {}, "3. 目標函數"),
    h("div", { class: "row" }, G.vars.map((v, i) => h("label", { class: "field" }, `${v.name || "?"} 的係數`, numInput(() => G.c[i], x => G.c[i] = x, { label: "目標係數", onChange: updatePreview }))))));

  // 4. 限制式
  const conBody = h("tbody", {});
  G.cons.forEach((c, ci) => {
    const op = h("select", { "aria-label": "限制符號" }, ["<=", "=", ">="].map(o => h("option", { value: o, selected: c.op === o }, OPSYM[o])));
    op.addEventListener("change", () => { c.op = op.value; updatePreview(); });
    conBody.append(h("tr", {}, h("td", { class: "l" }, textInput(() => c.name, v => c.name = v, "name", "限制式名稱")),
      G.vars.map((_, j) => h("td", {}, numInput(() => c.a[j], x => c.a[j] = x, { label: "限制式係數", onChange: updatePreview }))),
      h("td", {}, op), h("td", {}, numInput(() => c.b, x => c.b = x, { label: "右端常數", onChange: updatePreview })),
      h("td", {}, h("button", { class: "btn icon", title: "刪除這條限制式", "aria-label": "刪除這條限制式", onclick: () => { G.cons.splice(ci, 1); renderGeneral(); } }, "✕"))));
  });
  const conTbl = h("table", { class: "grid-in" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, "名稱"), G.vars.map(v => h("th", {}, v.name || "?")), h("th", {}, ""), h("th", {}, "RHS"), h("th", {}, ""))), conBody);
  left.append(h("div", { class: "card" }, h("h2", {}, "4. 限制式"), h("div", { class: "scroll-x" }, conTbl),
    h("div", { class: "row", style: "margin-top:10px" }, h("button", { class: "btn", onclick: () => {
      G.cons.push({ name: `限制式${G.cons.length + 1}`, a: G.vars.map(() => 0), op: "<=", b: 0 }); renderGeneral();
    } }, "+ 新增限制式"))));

  // 5. 模型 + 求解
  updatePreview();
  const btn = h("button", { class: "btn primary", id: "g-solve" }, G.busy ? "求解中…" : "求解 (Solve)");
  btn.addEventListener("click", async () => {
    btn.disabled = true; btn.textContent = "求解中…";
    try {
      G.result = await api("/api/solve", { sense: G.sense, obj_name: G.obj_name, unit: G.unit, vars: G.vars, c: G.c,
        constraints: G.cons.map(c => ({ name: c.name, a: c.a, op: c.op, b: c.b })) });
      G.error = null;
    } catch (e) { G.result = null; G.error = e.message; }
    showGeneralResult(); btn.disabled = false; btn.textContent = "求解 (Solve)";
  });
  left.append(h("div", { class: "card" }, h("h2", {}, "5. 完整數學模型"), preview, h("div", { class: "row", style: "margin-top:12px" }, btn)));
  showGeneralResult();
  window.scrollTo(0, keep.scroll);
}

function showGeneralResult() {
  const box = $("#g-result");
  box.replaceChildren();
  if (G.error) box.append(h("div", { class: "banner err" }, G.error));
  else if (G.result) box.append(resultCards(G.result));
  else box.append(h("div", { class: "empty" }, "填好左邊的資料後,按下「求解」,結果、敏感度分析與圖形會顯示在這裡。"));
}

// =====================================================================
// 管理科學範本
// =====================================================================
const T = {
  kind: "transport", result: null, error: null, preview: null,
  transport: { sources: [{ name: "S1", supply: 300 }, { name: "S2", supply: 300 }, { name: "S3", supply: 200 }],
    dests: [{ name: "A", demand: 150 }, { name: "B", demand: 250 }, { name: "C", demand: 200 }, { name: "D", demand: 200 }],
    cost: [[16, 18, 11, 20], [14, 12, 13, 17], [13, 15, 17, 18]] },
  assignment: { sense: "min", workers: [{ name: "甲" }, { name: "乙" }, { name: "丙" }], jobs: [{ name: "工作1" }, { name: "工作2" }, { name: "工作3" }],
    cost: [[9, 2, 7], [6, 4, 3], [5, 8, 1]] },
  blending: { total: 100, ingredients: [{ name: "玉米", cost: 3 }, { name: "大豆", cost: 5 }],
    nutrients: [{ name: "蛋白質", content: [0.09, 0.5], op: ">=", req: 20 }, { name: "纖維", content: [0.02, 0.06], op: "<=", req: 5 }] },
  production: { integer: false, products: [{ name: "產品A", profit: 20 }, { name: "產品B", profit: 15 }],
    resources: [{ name: "人力", usage: [2, 1], avail: 20 }, { name: "原料", usage: [1, 3], avail: 35 }] },
};
const T_GROUPS = [
  ["基本模型", { transport: "運輸問題", assignment: "指派問題", blending: "混合問題", production: "生產計劃問題" }],
  ["W6 整數規劃", { selection: "0-1 方案選擇(邏輯限制式)", facility: "固定費用與設施區位", covering: "區域涵蓋問題(Set Covering)" }],
  ["W8 網路模式", { transship: "轉運模式(Transshipment)", shortest: "最短路徑問題", maxflow: "最大流量問題" }],
];
const T_NAMES = Object.assign({}, ...T_GROUPS.map(g => g[1]));
const T_STORY = {};     // 各範本預設資料的題目敘述(由 ext.js 填入)
const EXT_INPUTS = {};   // 由 ext.js 註冊:kind -> (left, d) => void
const EXT_EXTRA = {};    // 由 ext.js 註冊:extra.type -> (res, box) => void

function resizeMatrix(m, rows, cols, fill = 0) {
  while (m.length < rows) m.push([]);
  m.length = rows;
  m.forEach(r => { while (r.length < cols) r.push(fill); r.length = cols; });
}
function sizeInput(label, get, set) {
  const el = h("input", { type: "number", min: 1, max: 12, class: "num", value: get(), "aria-label": label });
  el.addEventListener("change", () => { set(Math.max(1, Math.min(12, Number(el.value) || 1))); T.result = null; T.preview = null; renderTemplate(); });
  return h("label", { class: "field" }, label, el);
}
function matrixTable(rowNames, colNames, M, extraRight, extraBottom, corner = "") {
  const ers = extraRight ? [].concat(extraRight) : [];
  const head = h("tr", {}, h("th", { class: "l" }, corner), colNames.map(c => h("th", {}, c.name || "")), ers.map(e => h("th", {}, e.title)));
  const body = rowNames.map((r, i) => h("tr", {}, h("th", { class: "l" }, r.name || ""),
    colNames.map((_, j) => h("td", {}, numInput(() => M[i][j], v => M[i][j] = v, { label: "矩陣數值" }))),
    ers.map(e => h("td", {}, e.cell(i)))));
  const foot = extraBottom && h("tr", {}, h("th", { class: "l" }, extraBottom.title), colNames.map((_, j) => h("td", {}, extraBottom.cell(j))), ers.map(() => h("td", {})));
  return h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, head), h("tbody", {}, body, foot)));
}
function namesRow(list, label, key = "name") {
  return h("div", { class: "row" }, list.map((it, i) => h("label", { class: "field" }, `${label} ${i + 1}`, textInput(() => it[key], v => { it[key] = v; }, "name", label, null))));
}

function renderTemplate() {
  const root = $("#view-template");
  root.replaceChildren();
  const left = h("div", {}), right = h("div", { id: "t-result" });
  root.append(h("div", { class: "layout" }, left, right));

  const kinds = h("select", { "aria-label": "選擇範本" }, T_GROUPS.map(([g, items]) =>
    h("optgroup", { label: g }, Object.entries(items).map(([k, n]) => h("option", { value: k, selected: T.kind === k }, n)))));
  kinds.addEventListener("change", () => { T.kind = kinds.value; T.result = null; T.error = null; T.preview = null; renderTemplate(); });
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 1:選擇範本"), h("div", { class: "row" }, h("label", { class: "field" }, "範本", kinds)),
    h("div", { class: "steps" }, ["資料輸入", "建立模型", "求解", "結果分析"].map((t, i) => h("span", { class: i === 0 ? "on" : "" }, `${i + 1}. ${t}`)))));

  const st = T_STORY[T.kind];
  if (st && !st.hidden) left.append(problemCard(st.title, st.story, () => { st.hidden = true; renderTemplate(); }));

  const d = T[T.kind];
  if (EXT_INPUTS[T.kind]) {
    EXT_INPUTS[T.kind](left, d);
  } else if (T.kind === "transport") {
    const m = d.sources.length, k = d.dests.length;
    left.append(h("div", { class: "card" }, h("h2", {}, "Step 2:問題規模"), h("div", { class: "row" },
      sizeInput("供給地數量", () => m, n => { while (d.sources.length < n) d.sources.push({ name: `S${d.sources.length + 1}`, supply: 100 }); d.sources.length = n; resizeMatrix(d.cost, n, d.dests.length, 10); }),
      sizeInput("需求地數量", () => k, n => { while (d.dests.length < n) d.dests.push({ name: `D${d.dests.length + 1}`, demand: 100 }); d.dests.length = n; resizeMatrix(d.cost, d.sources.length, n, 10); }))));
    left.append(h("div", { class: "card" }, h("h2", {}, "Step 3:輸入資料"), h("h3", {}, "名稱"), namesRow(d.sources, "供給地"), namesRow(d.dests, "需求地"),
      h("h3", {}, "運輸成本矩陣、供應量、需求量"),
      matrixTable(d.sources, d.dests, d.cost, { title: "供應量", cell: i => numInput(() => d.sources[i].supply, v => d.sources[i].supply = v) },
        { title: "需求量", cell: j => numInput(() => d.dests[j].demand, v => d.dests[j].demand = v) }, "成本")));
  } else if (T.kind === "assignment") {
    const m = d.workers.length, k = d.jobs.length;
    const sense = (val, text) => h("label", { class: "inline" }, h("input", { type: "radio", name: "asense", checked: d.sense === val, onchange: () => { d.sense = val; } }), text);
    left.append(h("div", { class: "card" }, h("h2", {}, "Step 2:問題規模"), h("div", { class: "row" },
      sizeInput("人員數量", () => m, n => { while (d.workers.length < n) d.workers.push({ name: `人員${d.workers.length + 1}` }); d.workers.length = n; resizeMatrix(d.cost, n, d.jobs.length, 0); }),
      sizeInput("工作數量", () => k, n => { while (d.jobs.length < n) d.jobs.push({ name: `工作${d.jobs.length + 1}` }); d.jobs.length = n; resizeMatrix(d.cost, d.workers.length, n, 0); })),
      h("div", { class: "row" }, sense("min", "最小化成本"), sense("max", "最大化效益"))));
    left.append(h("div", { class: "card" }, h("h2", {}, "Step 3:輸入資料"), namesRow(d.workers, "人員"), namesRow(d.jobs, "工作"),
      h("h3", {}, "成本/效益矩陣"), matrixTable(d.workers, d.jobs, d.cost, null, null, "人員＼工作"),
      h("p", { class: "hint" }, "人員與工作數量不同時,數量較少的一方會全部被指派,較多的一方最多指派一次。")));
  } else if (T.kind === "blending") {
    const nI = d.ingredients.length, nN = d.nutrients.length;
    left.append(h("div", { class: "card" }, h("h2", {}, "Step 2:問題規模"), h("div", { class: "row" },
      sizeInput("原料種類", () => nI, n => { while (d.ingredients.length < n) d.ingredients.push({ name: `原料${d.ingredients.length + 1}`, cost: 1 }); d.ingredients.length = n; d.nutrients.forEach(t => { while (t.content.length < n) t.content.push(0); t.content.length = n; }); }),
      sizeInput("成分限制數量", () => nN, n => { while (d.nutrients.length < n) d.nutrients.push({ name: `成分${d.nutrients.length + 1}`, content: d.ingredients.map(() => 0), op: ">=", req: 0 }); d.nutrients.length = n; }))));
    const head = h("tr", {}, h("th", { class: "l" }, "成分"), d.ingredients.map(g => h("th", {}, g.name)), h("th", {}, ""), h("th", {}, "需求量"));
    const costRow = h("tr", {}, h("th", { class: "l" }, "單位成本"), d.ingredients.map((g, j) => h("td", {}, numInput(() => g.cost, v => g.cost = v))), h("td"), h("td"));
    const rows = d.nutrients.map(t => {
      const op = h("select", { "aria-label": "符號" }, ["<=", "=", ">="].map(o => h("option", { value: o, selected: t.op === o }, OPSYM[o])));
      op.addEventListener("change", () => t.op = op.value);
      return h("tr", {}, h("td", { class: "l" }, textInput(() => t.name, v => t.name = v, "name", "成分名稱")),
        t.content.map((_, j) => h("td", {}, numInput(() => t.content[j], v => t.content[j] = v))), h("td", {}, op), h("td", {}, numInput(() => t.req, v => t.req = v)));
    });
    left.append(h("div", { class: "card" }, h("h2", {}, "Step 3:輸入資料"), namesRow(d.ingredients, "原料"),
      h("div", { class: "row" }, h("label", { class: "field" }, "混合總量(留空表示不限制)", numInput(() => d.total ?? "", v => d.total = v))),
      h("h3", {}, "每單位原料所含的成分、單位成本"), h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, head), h("tbody", {}, costRow, rows)))));
  } else {
    const nP = d.products.length, nR = d.resources.length;
    left.append(h("div", { class: "card" }, h("h2", {}, "Step 2:問題規模"), h("div", { class: "row" },
      sizeInput("產品數量", () => nP, n => { while (d.products.length < n) d.products.push({ name: `產品${d.products.length + 1}`, profit: 10 }); d.products.length = n; d.resources.forEach(r => { while (r.usage.length < n) r.usage.push(1); r.usage.length = n; }); }),
      sizeInput("資源種類", () => nR, n => { while (d.resources.length < n) d.resources.push({ name: `資源${d.resources.length + 1}`, usage: d.products.map(() => 1), avail: 100 }); d.resources.length = n; })),
      h("div", { class: "row" }, h("label", { class: "inline" }, h("input", { type: "checkbox", checked: !!d.integer, onchange: e => d.integer = e.target.checked }), "產量必須是整數(整數規劃)"))));
    const head = h("tr", {}, h("th", { class: "l" }, "資源"), d.products.map(p => h("th", {}, p.name)), h("th", {}, "可用量"));
    const profit = h("tr", {}, h("th", { class: "l" }, "單位利潤"), d.products.map(p => h("td", {}, numInput(() => p.profit, v => p.profit = v))), h("td"));
    const rows = d.resources.map(r => h("tr", {}, h("td", { class: "l" }, textInput(() => r.name, v => r.name = v, "name", "資源名稱")),
      r.usage.map((_, j) => h("td", {}, numInput(() => r.usage[j], v => r.usage[j] = v))), h("td", {}, numInput(() => r.avail, v => r.avail = v))));
    left.append(h("div", { class: "card" }, h("h2", {}, "Step 3:輸入資料"), namesRow(d.products, "產品"),
      h("h3", {}, "單位利潤與各資源的單位用量"), h("div", { class: "scroll-x" }, h("table", { class: "grid-in" }, h("thead", {}, head), h("tbody", {}, profit, rows)))));
  }

  const pv = h("div", {});
  if (T.preview) pv.append(h("details", { class: "more", open: !T.result, style: "margin:12px 0 0" },
    h("summary", {}, "數學模型", h("small", {}, `(共 ${T.preview.n_vars} 個決策變數、${T.preview.n_constraints} 條限制式)`)),
    h("pre", { class: "model" }, T.preview.model_lines.join("\n"))));
  if (T.preview && T.preview.note) pv.append(h("div", { class: "banner warn" }, T.preview.note));
  const run = async (action, btn) => {
    btn.disabled = true;
    try {
      const r = await api(`/api/template/${T.kind}`, { action, data: d });
      T.error = null;
      if (action === "build") T.preview = r; else { T.result = r; T.preview = { model_lines: r.model_lines, n_vars: r.model.vars.length, n_constraints: r.model.constraints.length, note: r.note }; }
    } catch (e) { T.error = e.message; if (action === "solve") T.result = null; }
    renderTemplate();
  };
  const b1 = h("button", { class: "btn" }, "建立模型"), b2 = h("button", { class: "btn primary" }, "求解 (Solve)");
  b1.addEventListener("click", () => run("build", b1)); b2.addEventListener("click", () => run("solve", b2));
  left.append(h("div", { class: "card" }, h("h2", {}, "Step 4–6:建立模型與求解"), h("div", { class: "row" }, b1, b2), pv));

  const out = right;
  if (T.error) out.append(h("div", { class: "banner err" }, T.error));
  if (T.result) { out.append(templateExtra(T.result)); out.append(resultCards(T.result, { compact: !!T.result.extra })); }
  else if (!T.error) out.append(h("div", { class: "empty" }, "輸入資料後按「建立模型」查看自動產生的數學模型,按「求解」取得最佳方案與分析。"));
}

function templateExtra(res) {
  const ex = res.extra, box = h("div", {});
  if (!ex) return box;
  if (EXT_EXTRA[ex.type]) {
    EXT_EXTRA[ex.type](res, box);
  } else if (ex.type === "transport") {
    const plan = h("table", { class: "data" }, h("thead", {}, h("tr", {}, ["來源地", "目的地", "最佳運輸量", "單位成本", "小計"].map((t, i) => h("th", { class: i < 2 ? "l" : "" }, t)))),
      h("tbody", {}, ex.plan.map(p => h("tr", {}, h("td", { class: "l" }, p.from), h("td", { class: "l" }, p.to), h("td", {}, fmt(p.qty)), h("td", {}, fmt(p.cost)), h("td", {}, fmt(p.subtotal))))));
    const flow = h("table", { class: "data flow" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, ""), ex.dests.map(n => h("th", {}, n)))),
      h("tbody", {}, ex.sources.map((n, i) => h("tr", {}, h("th", { class: "l" }, n), ex.dests.map((_, j) => h("td", { class: ex.flow[i][j] > 1e-9 ? "hit" : "" }, fmt(ex.flow[i][j])))))));
    const sup = h("table", { class: "data" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, "供給地"), h("th", {}, "供應量"), h("th", {}, "運出"), h("th", {}, "剩餘"))),
      h("tbody", {}, ex.supply_rows.map(r => h("tr", {}, h("td", { class: "l" }, r.name), h("td", {}, fmt(r.supply)), h("td", {}, fmt(r.used)), h("td", {}, fmt(r.left))))));
    const dem = h("table", { class: "data" }, h("thead", {}, h("tr", {}, h("th", { class: "l" }, "需求地"), h("th", {}, "需求量"), h("th", {}, "收到"), h("th", { class: "l" }, "是否滿足"))),
      h("tbody", {}, ex.demand_rows.map(r => h("tr", {}, h("td", { class: "l" }, r.name), h("td", {}, fmt(r.demand)), h("td", {}, fmt(r.received)), h("td", { class: "l" }, h("span", { class: "pill " + (r.met ? "good" : "bind") }, r.met ? "滿足" : "未滿足"))))));
    box.append(h("div", { class: "card" }, h("h2", {}, "最佳運輸方案"), h("div", { class: "answer" }, h("div", { class: "cell z" }, h("small", {}, "最小總運輸成本 Z*"), h("b", {}, fmt(res.z)))),
      h("div", { class: "scroll-x" }, plan), h("h3", {}, "運輸量矩陣"), h("div", { class: "scroll-x" }, flow),
      h("h3", {}, "供給與需求分析"), h("div", { class: "scroll-x" }, sup), h("div", { class: "scroll-x", style: "margin-top:10px" }, dem),
      h("ul", { class: "notes" }, ex.text.map(t => h("li", {}, t)))));
  } else if (ex.type === "assignment") {
    box.append(h("div", { class: "card" }, h("h2", {}, "最佳指派方案"), h("div", { class: "answer" }, h("div", { class: "cell z" }, h("small", {}, "Z*"), h("b", {}, fmt(res.z)))),
      h("ul", { class: "notes" }, ex.text.map(t => h("li", {}, t)))));
  }
  return box;
}

// ---------- 分頁與啟動 ----------
const TAB_RENDER = { general: () => renderGeneral(), template: () => renderTemplate(), goal: () => window.renderGoal && window.renderGoal() };
function showTab(which) {
  for (const k of Object.keys(TAB_RENDER)) {
    $(`#tab-${k}`).setAttribute("aria-selected", k === which);
    $(`#view-${k}`).hidden = k !== which;
  }
  if (!$(`#view-${which}`).childElementCount) TAB_RENDER[which]();
}
for (const k of Object.keys(TAB_RENDER)) $(`#tab-${k}`).addEventListener("click", () => showTab(k));
initTheme();
loadExample(Object.keys(EXAMPLES)[0]);
renderGeneral();
