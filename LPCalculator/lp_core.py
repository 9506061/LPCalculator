"""
lp_core.py  --  線性規劃 / 整數規劃 核心模組(不依賴網頁框架,可單獨測試)

資料流程:  使用者資料 → 模型字典 (model) → 求解 (HiGHS) → 結果字典 → 管理意涵

model 格式(純 dict,方便 JSON 傳遞):
{
  "sense": "max" | "min",
  "obj_name": "利潤", "unit": "單位",
  "vars": [{"name": "x1", "kind": "cont", "label": "產品A"}, ...],
        # kind: cont=連續且>=0, free=連續無限制, int=非負整數, ifree=整數無正負限制, bin=0-1
  "c": [20, 15],
  "constraints": [{"name": "預算限制", "a": [2, 1], "op": "<=", "b": 20}, ...]
}
"""
from __future__ import annotations

import math

import numpy as np
from scipy.optimize import linprog

TOL = 1e-6
KINDS = ("cont", "free", "int", "ifree", "bin")
BOUNDS = {"cont": (0, None), "free": (None, None), "int": (0, None), "ifree": (None, None), "bin": (0, 1)}
OPS = {"<=": "<=", "≤": "<=", ">=": ">=", "≥": ">=", "=": "=", "==": "="}
OP_SYMBOL = {"<=": "≤", ">=": "≥", "=": "="}


class ModelError(ValueError):
    """使用者輸入的模型有問題(會以友善訊息回傳給網頁)。"""


def clean(x):
    if x is None:
        return None
    x = float(x)
    return 0.0 if abs(x) < 1e-9 else round(x, 9)


def fmt_num(x) -> str:
    if x is None:
        return "—"
    x = float(x)
    if abs(x) < 1e-9:
        return "0"
    s = f"{round(x, 6):.6f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def _to_float(v, what):
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ModelError(f"{what} 必須是數字(目前是「{v}」)。")
    if math.isnan(f) or math.isinf(f):
        raise ModelError(f"{what} 必須是有限的數字。")
    return f


def term_text(coef, name):
    num = "" if abs(abs(coef) - 1) < 1e-12 else fmt_num(abs(coef))
    if num and not (name[:1].isascii() and name[:1].isalpha()):
        return f"{num}×{name}"
    return f"{num}{name}"


def expr_text(coeffs, names):
    parts = []
    for k, nm in zip(coeffs, names):
        if abs(k) < 1e-12:
            continue
        t = term_text(k, nm)
        if not parts:
            parts.append(("-" if k < 0 else "") + t)
        else:
            parts.append(("- " if k < 0 else "+ ") + t)
    return " ".join(parts) if parts else "0"


def normalize_model(raw: dict) -> dict:
    if not isinstance(raw, dict):
        raise ModelError("模型資料格式錯誤。")
    sense = raw.get("sense", "max")
    if sense not in ("max", "min"):
        raise ModelError("問題類型必須是最大化(max)或最小化(min)。")

    vars_raw = raw.get("vars") or []
    if not vars_raw:
        raise ModelError("至少需要 1 個決策變數。")
    if len(vars_raw) > 300:
        raise ModelError("決策變數最多 300 個。")
    vars_, seen = [], set()
    for i, v in enumerate(vars_raw, 1):
        name = str(v.get("name", "")).strip()
        if not name:
            raise ModelError(f"第 {i} 個決策變數的名稱不能空白。")
        if name in seen:
            raise ModelError(f"決策變數名稱「{name}」重複了。")
        seen.add(name)
        kind = v.get("kind", "cont")
        if kind not in KINDS:
            raise ModelError(f"變數 {name} 的型態不正確。")
        vars_.append({"name": name, "kind": kind, "label": str(v.get("label") or name)})
    n = len(vars_)

    c_raw = raw.get("c") or []
    if len(c_raw) != n:
        raise ModelError("目標函數係數的個數與決策變數不一致。")
    c = [_to_float(x, f"目標函數中 {vars_[j]['name']} 的係數") for j, x in enumerate(c_raw)]

    cons = []
    for i, con in enumerate(raw.get("constraints") or [], 1):
        a_raw = con.get("a") or []
        if len(a_raw) != n:
            raise ModelError(f"第 {i} 條限制式的係數個數與決策變數不一致。")
        op = OPS.get(str(con.get("op", "<=")).strip())
        if op is None:
            raise ModelError(f"第 {i} 條限制式的符號必須是 ≤、= 或 ≥。")
        name = str(con.get("name") or "").strip() or f"限制式{i}"
        a = [_to_float(x, f"第 {i} 條限制式中 {vars_[j]['name']} 的係數") for j, x in enumerate(a_raw)]
        b = _to_float(con.get("b"), f"第 {i} 條限制式的右端常數")
        cons.append({"name": name, "a": a, "op": op, "b": b})
    if not cons:
        raise ModelError("至少需要 1 條限制式。")

    return {
        "sense": sense,
        "obj_name": str(raw.get("obj_name") or "").strip() or ("利潤" if sense == "max" else "成本"),
        "unit": str(raw.get("unit") or "").strip() or "單位",
        "vars": vars_, "c": c, "constraints": cons,
    }


def model_lines(model: dict):
    names = [v["name"] for v in model["vars"]]
    lines = [("max" if model["sense"] == "max" else "min") + " Z = " + expr_text(model["c"], names), "subject to"]
    for con in model["constraints"]:
        lines.append(f"    {expr_text(con['a'], names)} {OP_SYMBOL[con['op']]} {fmt_num(con['b'])}")
    return lines + kind_lines(model["vars"])


def kind_lines(vars_):
    """變數型態/非負限制的說明列,例如「x1, x2 ≥ 0」。"""
    g = {k: [] for k in KINDS}
    for v in vars_:
        g[v["kind"]].append(v["name"])
    text = {"cont": "≥ 0", "int": "≥ 0 且為整數", "bin": "∈ {0, 1}", "free": "無正負限制", "ifree": "為整數(無正負限制)"}
    return [f"    {', '.join(g[k])} {text[k]}" for k in ("cont", "int", "bin", "free", "ifree") if g[k]]


def _run_linprog(c_min, A_ub, b_ub, A_eq, b_eq, bounds, integrality, presolve=True):
    kwargs = dict(
        A_ub=np.array(A_ub) if A_ub else None, b_ub=np.array(b_ub) if b_ub else None,
        A_eq=np.array(A_eq) if A_eq else None, b_eq=np.array(b_eq) if b_eq else None,
        bounds=bounds, method="highs", options={"presolve": presolve},
    )
    if integrality is not None:
        kwargs["integrality"] = integrality
    return linprog(np.array(c_min), **kwargs)


def solve_model(raw: dict) -> dict:
    """求解並回傳完整結果(含限制式分析、影子價格、管理意涵、圖形資料)。"""
    model = normalize_model(raw)
    n = len(model["vars"])
    sense = model["sense"]
    names = [v["name"] for v in model["vars"]]

    sign = -1.0 if sense == "max" else 1.0   # linprog 只會「最小化」
    c_min = [sign * k for k in model["c"]]
    bounds, integrality = [], []
    for v in model["vars"]:
        bounds.append(BOUNDS[v["kind"]])
        integrality.append(1 if v["kind"] in ("int", "ifree", "bin") else 0)
    is_integer = any(integrality)

    A_ub, b_ub, A_eq, b_eq, loc = [], [], [], [], []
    for con in model["constraints"]:
        if con["op"] == "<=":
            loc.append(("ub", len(A_ub), 1.0)); A_ub.append(con["a"]); b_ub.append(con["b"])
        elif con["op"] == ">=":
            loc.append(("ub", len(A_ub), -1.0)); A_ub.append([-k for k in con["a"]]); b_ub.append(-con["b"])
        else:
            loc.append(("eq", len(A_eq), 1.0)); A_eq.append(con["a"]); b_eq.append(con["b"])

    integ = integrality if is_integer else None
    res = _run_linprog(c_min, A_ub, b_ub, A_eq, b_eq, bounds, integ)
    if res.status in (1, 4):
        res = _run_linprog(c_min, A_ub, b_ub, A_eq, b_eq, bounds, integ, presolve=False)

    status = {0: "optimal", 2: "infeasible", 3: "unbounded"}.get(res.status, "error")
    out = {"status": status, "message": _status_message(status, res.message), "model_lines": model_lines(model),
           "model": model, "is_integer": is_integer, "x": None, "z": None, "rows": [], "summary": [],
           "sensitivity_notes": []}

    if status == "optimal":
        x = [float(v) for v in res.x]
        if is_integer:
            x = [round(v) if integrality[j] else v for j, v in enumerate(x)]
        z = sum(k * v for k, v in zip(model["c"], x))
        out["x"] = [{"name": v["name"], "label": v["label"], "value": clean(x[j]), "kind": v["kind"]}
                    for j, v in enumerate(model["vars"])]
        out["z"] = clean(z)

        marg_ub = getattr(getattr(res, "ineqlin", None), "marginals", None)
        marg_eq = getattr(getattr(res, "eqlin", None), "marginals", None)
        rows = []
        for i, con in enumerate(model["constraints"]):
            lhs = sum(k * v for k, v in zip(con["a"], x))
            rhs = con["b"]
            gap = rhs - lhs if con["op"] == "<=" else lhs - rhs if con["op"] == ">=" else 0.0
            binding = abs(lhs - rhs) <= TOL * (1 + abs(rhs))
            slack = 0.0 if binding else max(gap, 0.0)
            sp = None
            if not is_integer:
                kind_, idx, sg = loc[i]
                src = marg_ub if kind_ == "ub" else marg_eq
                if src is not None:
                    sp = float(src[idx]) * sg * (-1.0 if sense == "max" else 1.0)
            rows.append({"name": con["name"],
                         "text": f"{expr_text(con['a'], names)} {OP_SYMBOL[con['op']]} {fmt_num(rhs)}",
                         "op": OP_SYMBOL[con["op"]], "lhs": clean(lhs), "rhs": clean(rhs),
                         "binding": bool(binding), "slack": clean(slack), "shadow": clean(sp)})
        out["rows"] = rows
        out["summary"], out["sensitivity_notes"] = interpret(model, out)
    else:
        out["summary"] = [out["message"]]

    out["graph"] = graph_data(model, out) if n == 2 else None
    return out


def _status_message(status, raw):
    if status == "optimal":
        return "已找到最佳解。"
    if status == "infeasible":
        return "無可行解(Infeasible):限制式之間互相衝突,找不到能同時滿足所有條件的方案。請檢查是否有 ≤ 與 ≥ 設反、或需求量大於供給量。"
    if status == "unbounded":
        return "無界解(Unbounded):目標函數值可以無限增大(或縮小)。通常是漏掉了某個上限(或下限)限制式。"
    return f"求解失敗:{raw}"


def interpret(model, out):
    unit, obj = model["unit"], model["obj_name"]
    sense_word = "最大" if model["sense"] == "max" else "最小"
    xs = out["x"]
    nonzero = [v for v in xs if abs(v["value"]) > 1e-9]
    summary = []
    shown = xs if len(xs) <= 6 else nonzero
    plan = ";".join(f"{v['label']} 為 {fmt_num(v['value'])} {unit}" for v in shown)
    if plan:
        summary.append(f"最佳方案:{plan}。")
    summary.append(f"{sense_word}{obj}為 {fmt_num(out['z'])}。")
    zero_cont = [v["label"] for v in xs if abs(v["value"]) <= 1e-9 and v["kind"] in ("cont", "int", "ifree")]
    if zero_cont and len(xs) <= 6:
        summary.append(f"{'、'.join(zero_cont)} 在最佳方案中為 0,代表在目前的限制下不值得投入。")

    notes = []
    for r in out["rows"]:
        if r["binding"]:
            sp = r["shadow"]
            if sp is None:
                notes.append(f"「{r['name']}」在最佳解下等號成立(Binding),是限制最佳解的條件。")
            elif abs(sp) > 1e-9:
                direction = "增加" if sp > 0 else "減少"
                notes.append(f"「{r['name']}」為瓶頸(Binding):右端常數每增加 1 {unit},{obj}將{direction} {fmt_num(abs(sp))}"
                             f"(僅在最佳基底不變的小範圍內成立)。")
            else:
                notes.append(f"「{r['name']}」等號成立,但影子價格為 0(退化情形),目前調整它不會改變{obj}。")
        else:
            notes.append(f"「{r['name']}」尚有剩餘 {fmt_num(r['slack'])}(Non-binding):不是瓶頸,放寬它不會改善{obj}。")
    if out["is_integer"]:
        notes.append("此為整數規劃問題,影子價格在嚴格意義下不適用,因此不顯示。")
    return summary, notes


# ---------------------------------------------------------------- 二維圖形資料
def _clip_polygon(poly, a1, a2, b, eps=1e-9):
    """保留 a1*x + a2*y <= b 的部分 (Sutherland–Hodgman)。"""
    def val(p):
        return a1 * p[0] + a2 * p[1] - b
    out = []
    for i in range(len(poly)):
        p, q = poly[i], poly[(i + 1) % len(poly)]
        vp, vq = val(p), val(q)
        if vp <= eps:
            out.append(p)
        if (vp < -eps and vq > eps) or (vp > eps and vq < -eps):
            t = vp / (vp - vq)
            out.append((p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])))
    return out


def _clip_line(a1, a2, b, win):
    d = a1 * a1 + a2 * a2
    if d < 1e-18:
        return None
    p0 = (a1 * b / d, a2 * b / d)
    dx, dy = -a2, a1
    t0, t1 = -1e18, 1e18
    for p, dd, lo, hi in ((p0[0], dx, win["xl"], win["xh"]), (p0[1], dy, win["yl"], win["yh"])):
        if abs(dd) < 1e-15:
            if p < lo - 1e-9 or p > hi + 1e-9:
                return None
        else:
            ta, tb = (lo - p) / dd, (hi - p) / dd
            if ta > tb:
                ta, tb = tb, ta
            t0, t1 = max(t0, ta), min(t1, tb)
    if t0 > t1:
        return None
    return [[clean(p0[0] + t0 * dx), clean(p0[1] + t0 * dy)], [clean(p0[0] + t1 * dx), clean(p0[1] + t1 * dy)]]


def graph_data(model, out):
    vars_ = model["vars"]
    names = [v["name"] for v in vars_]
    c1, c2 = model["c"]

    hps = []   # (a1, a2, op, b, label, is_bound)
    for con in model["constraints"]:
        hps.append((con["a"][0], con["a"][1], con["op"], con["b"], con["name"], False))
    for j, v in enumerate(vars_):
        e = [1.0, 0.0] if j == 0 else [0.0, 1.0]
        if v["kind"] in ("cont", "int", "bin"):
            hps.append((e[0], e[1], ">=", 0.0, f"{v['name']} ≥ 0", True))
        if v["kind"] == "bin":
            hps.append((e[0], e[1], "<=", 1.0, f"{v['name']} ≤ 1", True))

    def feasible(p):
        for a1, a2, op, b, *_ in hps:
            val = a1 * p[0] + a2 * p[1]
            tol = 1e-7 * (1 + abs(b))
            if op == "<=" and val > b + tol: return False
            if op == ">=" and val < b - tol: return False
            if op == "=" and abs(val - b) > tol: return False
        return True

    inter = []
    for i in range(len(hps)):
        for j in range(i + 1, len(hps)):
            a1, a2, _, b, *_ = hps[i]
            d1, d2, _, e, *_ = hps[j]
            det = a1 * d2 - a2 * d1
            if abs(det) < 1e-12:
                continue
            inter.append(((b * d2 - a2 * e) / det, (a1 * e - b * d1) / det))
    seen, feas_pts = set(), []
    for p in inter:
        if feasible(p):
            key = (round(p[0], 6), round(p[1], 6))
            if key not in seen:
                seen.add(key); feas_pts.append(p)

    opt = (out["x"][0]["value"], out["x"][1]["value"]) if out["status"] == "optimal" else None
    pts = list(feas_pts) if feas_pts else list(inter)
    if opt:
        pts.append(opt)
    if not pts:
        pts = [(0.0, 0.0), (10.0, 10.0)]

    def axis_range(k, j):
        vals = [p[k] for p in pts]
        lo, hi = min(vals), max(vals)
        if vars_[j]["kind"] in ("cont", "int", "bin"):
            lo = min(lo, 0.0)
        if hi - lo < 1e-6:
            hi = lo + 10.0
        span = hi - lo
        return lo - 0.08 * span, hi + 0.22 * span

    xl, xh = axis_range(0, 0)
    yl, yh = axis_range(1, 1)
    win = {"xl": clean(xl), "xh": clean(xh), "yl": clean(yl), "yh": clean(yh)}

    poly = [(xl, yl), (xh, yl), (xh, yh), (xl, yh)]
    for a1, a2, op, b, *_ in hps:
        if op in ("<=", "="):
            poly = _clip_polygon(poly, a1, a2, b)
        if op in (">=", "="):
            poly = _clip_polygon(poly, -a1, -a2, -b)
        if not poly:
            break
    polygon = [[clean(p[0]), clean(p[1])] for p in poly]

    lines = []
    for a1, a2, op, b, label, is_bound in hps:
        seg = _clip_line(a1, a2, b, win)
        if seg:
            lines.append({"label": label, "op": OP_SYMBOL[op], "p": seg, "bound": is_bound,
                          "text": f"{expr_text([a1, a2], names)} {OP_SYMBOL[op]} {fmt_num(b)}"})

    zvals = [c1 * p[0] + c2 * p[1] for p in feas_pts]
    iso = []
    if abs(c1) > 1e-12 or abs(c2) > 1e-12:
        levels = []
        if opt:
            zopt = out["z"]
            levels.append((zopt, True))
            if zvals:
                worst = min(zvals) if model["sense"] == "max" else max(zvals)
                if abs(zopt - worst) > 1e-9:
                    for f in (0.33, 0.66):
                        levels.append((worst + (zopt - worst) * f, False))
        elif zvals:
            lo, hi = min(zvals), max(zvals)
            for f in (0.25, 0.5, 0.75):
                levels.append((lo + (hi - lo) * f, False))
        else:
            levels.append((0.0, False))
        for z, is_opt in levels:
            seg = _clip_line(c1, c2, z, win)
            if seg:
                iso.append({"z": clean(z), "p": seg, "optimal": is_opt})

    vertices = []
    for p in sorted(feas_pts, key=lambda q: (q[0], q[1])):
        vertices.append({"x": clean(p[0]), "y": clean(p[1]), "z": clean(c1 * p[0] + c2 * p[1]),
                         "optimal": bool(opt and abs(p[0] - opt[0]) < 1e-6 and abs(p[1] - opt[1]) < 1e-6)})

    lattice = []
    if all(v["kind"] in ("int", "ifree", "bin") for v in vars_):
        xr = range(math.ceil(xl), math.floor(xh) + 1)
        yr = range(math.ceil(yl), math.floor(yh) + 1)
        if len(xr) * len(yr) <= 4000:
            lattice = [[i, j] for i in xr for j in yr if feasible((i, j))]

    imp = [c1, c2] if model["sense"] == "max" else [-c1, -c2]
    return {"names": names, "labels": [v["label"] for v in vars_], "window": win, "polygon": polygon,
            "lines": lines, "iso": iso, "vertices": vertices, "lattice": lattice,
            "improve": [clean(imp[0]), clean(imp[1])], "c": [clean(c1), clean(c2)],
            "hps": [{"name": lb, "a": [clean(a1), clean(a2)], "op": op, "b": clean(b), "bound": bd}
                    for a1, a2, op, b, lb, bd in hps],
            "integer": [v["kind"] in ("int", "ifree", "bin") for v in vars_],
            "optimum": ({"x": opt[0], "y": opt[1], "z": out["z"]} if opt else None),
            "sense": model["sense"], "obj_name": model["obj_name"]}
