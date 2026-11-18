"""
goal_core.py -- 目標規劃 (Goal Programming) 求解模組:優先順序逐層求解 (Preemptive / Lexicographic)

輸入格式:
{
  "vars":  [{"name": "x1", "kind": "cont", "label": "碗"}, ...],
  "goals": [{"name": "勞力工時", "a": [1, 2], "target": 40,
             "want": "ge" | "le" | "eq",      # ge: 希望 ≥ 目標(最小化 d-)  le: 希望 ≤(最小化 d+)  eq: 兩者都最小化
             "priority": 1, "weight": 1,
             "dev": [{"goal": 0, "side": "+", "coef": 1}]   # 選填:目標中的目標(Goal on a Deviation)
            }, ...],
  "hard":  [{"name": "倉庫", "a": [1, 0], "op": "<=", "b": 30}, ...]    # 選填:不可違反的系統限制式
}
"""
from __future__ import annotations

import numpy as np
from scipy.optimize import linprog

from lp_core import BOUNDS, KINDS, kind_lines, OPS, OP_SYMBOL, ModelError, _to_float, clean, expr_text, fmt_num

WANT_TEXT = {"ge": "≥", "le": "≤", "eq": "="}


def _normalize(raw):
    vars_raw = raw.get("vars") or []
    if not vars_raw:
        raise ModelError("至少需要 1 個決策變數。")
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

    goals = []
    graw = raw.get("goals") or []
    if not graw:
        raise ModelError("至少需要 1 個目標。")
    for k, g in enumerate(graw, 1):
        a = g.get("a") or []
        if len(a) != n:
            raise ModelError(f"目標 {k} 的係數個數與決策變數不一致。")
        want = g.get("want", "ge")
        if want not in WANT_TEXT:
            raise ModelError(f"目標 {k} 的型態不正確。")
        try:
            pr = int(g.get("priority", k))
        except (TypeError, ValueError):
            raise ModelError(f"目標 {k} 的優先順序必須是整數。")
        if pr < 1:
            raise ModelError(f"目標 {k} 的優先順序必須 ≥ 1。")
        w = _to_float(g.get("weight", 1) if g.get("weight", "") != "" else 1, f"目標 {k} 的權重")
        if w < 0:
            raise ModelError(f"目標 {k} 的權重不能是負數。")
        devs = []
        for d in g.get("dev") or []:
            j = d.get("goal")
            if j is None or j == "":
                continue
            j = int(j)
            if not (0 <= j < len(graw)) or j == k - 1:
                raise ModelError(f"目標 {k} 參照的離差變數不正確。")
            side = "+" if d.get("side", "+") == "+" else "-"
            devs.append({"goal": j, "side": side, "coef": _to_float(d.get("coef", 1), f"目標 {k} 的離差係數")})
        goals.append({"name": str(g.get("name") or f"目標{k}").strip() or f"目標{k}",
                      "a": [_to_float(x, f"目標 {k} 的係數") for x in a],
                      "target": _to_float(g.get("target"), f"目標 {k} 的目標值"),
                      "want": want, "priority": pr, "weight": w, "dev": devs})

    hard = []
    for i, c in enumerate(raw.get("hard") or [], 1):
        a = c.get("a") or []
        if len(a) != n:
            raise ModelError(f"第 {i} 條系統限制式的係數個數與決策變數不一致。")
        op = OPS.get(str(c.get("op", "<=")).strip())
        if op is None:
            raise ModelError(f"第 {i} 條系統限制式的符號不正確。")
        hard.append({"name": str(c.get("name") or f"系統限制{i}"), "a": [_to_float(x, "係數") for x in a],
                     "op": op, "b": _to_float(c.get("b"), f"第 {i} 條系統限制式的右端常數")})
    return vars_, goals, hard


def _dname(k, side):
    return f"d{k + 1}{'⁻' if side == '-' else '⁺'}"


def _undesired(g):
    return {"ge": ["-"], "le": ["+"], "eq": ["-", "+"]}[g["want"]]


def solve_goal(raw: dict) -> dict:
    vars_, goals, hard = _normalize(raw)
    n, m = len(vars_), len(goals)
    names = [v["name"] for v in vars_]
    N = n + 2 * m                    # x..., d1-, d1+, d2-, d2+, ...

    def idx(k, side):
        return n + 2 * k + (0 if side == "-" else 1)

    A_eq, b_eq, A_ub, b_ub = [], [], [], []
    for k, g in enumerate(goals):
        row = [0.0] * N
        row[:n] = g["a"]
        for d in g["dev"]:
            row[idx(d["goal"], d["side"])] += d["coef"]
        row[idx(k, "-")] += 1.0
        row[idx(k, "+")] -= 1.0
        A_eq.append(row); b_eq.append(g["target"])
    for c in hard:
        row = c["a"] + [0.0] * (2 * m)
        if c["op"] == "<=":
            A_ub.append(row); b_ub.append(c["b"])
        elif c["op"] == ">=":
            A_ub.append([-x for x in row]); b_ub.append(-c["b"])
        else:
            A_eq.append(row); b_eq.append(c["b"])

    bounds = [BOUNDS[v["kind"]] for v in vars_]
    bounds += [(0, None)] * (2 * m)
    integ = [1 if v["kind"] in ("int", "ifree", "bin") else 0 for v in vars_] + [0] * (2 * m)
    is_int = any(integ)

    def run(c):
        kw = dict(A_eq=np.array(A_eq), b_eq=np.array(b_eq), bounds=bounds, method="highs")
        if A_ub:
            kw["A_ub"], kw["b_ub"] = np.array(A_ub), np.array(b_ub)
        if is_int:
            kw["integrality"] = integ
        return linprog(np.array(c), **kw)

    levels = sorted({g["priority"] for g in goals})
    level_out = []
    x = None
    for p in levels:
        c = [0.0] * N
        terms = []
        for k, g in enumerate(goals):
            if g["priority"] != p:
                continue
            for side in _undesired(g):
                c[idx(k, side)] += g["weight"]
                terms.append((g["weight"], _dname(k, side)))
        res = run(c)
        if res.status != 0:
            msg = "系統限制式互相衝突,無可行解。" if res.status == 2 else f"求解失敗:{res.message}"
            raise ModelError(msg)
        val = round(float(res.fun), 6)
        level_out.append({"priority": p, "expr": " + ".join((f"{fmt_num(w)}" if abs(w - 1) > 1e-12 else "") + nm
                                                            for w, nm in terms) or "0",
                          "value": clean(val), "achieved": val <= 1e-7})
        A_ub.append(c); b_ub.append(val + 1e-7 * (1 + abs(val)))
        x = res.x
    # 最後一輪:在不犧牲任何優先層的前提下,讓多餘的離差歸零(使 d⁻·d⁺ = 0,報表較乾淨)
    res = run([0.0] * n + [1.0] * (2 * m))
    if res.status == 0:
        x = res.x
    x = [float(v) for v in x]
    for j in range(n):
        if integ[j]:
            x[j] = round(x[j])

    xs = [{"name": v["name"], "label": v["label"], "value": clean(x[j]), "kind": v["kind"]} for j, v in enumerate(vars_)]
    goal_rows = []
    for k, g in enumerate(goals):
        lhs = sum(a * v for a, v in zip(g["a"], x[:n])) + sum(d["coef"] * x[idx(d["goal"], d["side"])] for d in g["dev"])
        dm, dp = x[idx(k, "-")], x[idx(k, "+")]
        bad = sum(x[idx(k, s)] for s in _undesired(g))
        goal_rows.append({"name": g["name"], "priority": g["priority"], "weight": g["weight"], "want": g["want"],
                          "text": f"{_goal_expr(g, names)} {WANT_TEXT[g['want']]} {fmt_num(g['target'])}",
                          "value": clean(lhs), "target": clean(g["target"]), "dminus": clean(dm), "dplus": clean(dp),
                          "minimize": "、".join(_dname(k, s) for s in _undesired(g)),
                          "achieved": bad <= 1e-6 * (1 + abs(g["target"]))})
    hard_rows = []
    for c in hard:
        lhs = sum(a * v for a, v in zip(c["a"], x[:n]))
        hard_rows.append({"name": c["name"], "text": f"{expr_text(c['a'], names)} {OP_SYMBOL[c['op']]} {fmt_num(c['b'])}",
                          "op": OP_SYMBOL[c["op"]], "lhs": clean(lhs), "rhs": clean(c["b"]),
                          "binding": abs(lhs - c["b"]) <= 1e-6 * (1 + abs(c["b"]))})

    return {"status": "optimal", "is_integer": is_int, "x": xs, "goals": goal_rows, "hard": hard_rows,
            "levels": level_out, "model_lines": _model_lines(vars_, goals, hard),
            "summary": _summary(xs, goal_rows, level_out)}


def _goal_expr(g, names):
    s = expr_text(g["a"], names) if any(abs(a) > 1e-12 for a in g["a"]) else ""
    for d in g["dev"]:
        t = expr_text([d["coef"]], [_dname(d["goal"], d["side"])])
        s = t if not s else (s + (" - " + t[1:] if t.startswith("-") else " + " + t))
    return s or "0"


def _model_lines(vars_, goals, hard):
    names = [v["name"] for v in vars_]
    by_p = {}
    for k, g in enumerate(goals):
        for side in _undesired(g):
            w = g["weight"]
            by_p.setdefault(g["priority"], []).append((f"{fmt_num(w)}" if abs(w - 1) > 1e-12 else "") + _dname(k, side))
    obj = ", ".join(f"P{p}({' + '.join(t)})" for p, t in sorted(by_p.items()))
    lines = [f"min ( {obj} )", "subject to"]
    for k, g in enumerate(goals):
        lines.append(f"    {_goal_expr(g, names)} + {_dname(k, '-')} - {_dname(k, '+')} = {fmt_num(g['target'])}"
                     f"      ({g['name']})")
    for c in hard:
        lines.append(f"    {expr_text(c['a'], names)} {OP_SYMBOL[c['op']]} {fmt_num(c['b'])}      ({c['name']},系統限制)")
    lines += kind_lines(vars_)
    lines.append(f"    所有離差變數 dᵢ⁻, dᵢ⁺ ≥ 0")
    return lines


def _summary(xs, goals, levels):
    out = ["最滿意解:" + ";".join(f"{v['label']} = {fmt_num(v['value'])}" for v in xs) + "。"]
    for g in goals:
        if g["achieved"]:
            out.append(f"P{g['priority']}「{g['name']}」已達成(實際值 {fmt_num(g['value'])},目標 {fmt_num(g['target'])})。")
        else:
            gap = []
            if g["dminus"] > 1e-9:
                gap.append(f"不足 {fmt_num(g['dminus'])}")
            if g["dplus"] > 1e-9:
                gap.append(f"超過 {fmt_num(g['dplus'])}")
            out.append(f"P{g['priority']}「{g['name']}」未完全達成:實際值 {fmt_num(g['value'])},"
                       f"目標 {fmt_num(g['target'])}({'、'.join(gap)})。")
    first_bad = next((lv for lv in levels if not lv["achieved"]), None)
    if first_bad:
        out.append(f"較高優先的目標已盡可能達成後,P{first_bad['priority']} 開始無法完全滿足;"
                   f"逐層求解保證不會為了較低優先目標而犧牲較高優先目標。")
    else:
        out.append("所有優先層級的目標都可同時達成。")
    return out
