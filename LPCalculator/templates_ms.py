"""
templates_ms.py -- 管理科學模型範本:把「問題資料」自動轉成線性規劃模型。

build_xxx(data) -> (model dict, note)   model 可直接丟給 lp_core.solve_model
extra_xxx(data, result) -> 範本專屬的結果表格(給網頁顯示)
"""
from lp_core import ModelError, _to_float, clean, fmt_num


def _names(items, prefix, fallback_fn):
    out = []
    for i, it in enumerate(items):
        nm = str((it.get("name") if isinstance(it, dict) else it) or "").strip()
        out.append(nm or fallback_fn(i))
    if len(set(out)) != len(out):
        raise ModelError(f"{prefix}的名稱不能重複。")
    return out


# ---------------------------------------------------------------- 運輸問題
def build_transport(d):
    src, dst = d.get("sources") or [], d.get("dests") or []
    if not src or not dst:
        raise ModelError("請至少設定 1 個供給地與 1 個需求地。")
    sn = _names(src, "供給地", lambda i: f"S{i+1}")
    dn = _names(dst, "需求地", lambda j: f"D{j+1}")
    supply = [_to_float(s.get("supply"), f"{sn[i]} 的供應量") for i, s in enumerate(src)]
    demand = [_to_float(t.get("demand"), f"{dn[j]} 的需求量") for j, t in enumerate(dst)]
    cost = d.get("cost") or []
    if len(cost) != len(src) or any(len(r) != len(dst) for r in cost):
        raise ModelError("運輸成本矩陣的大小與供給地/需求地數量不一致。")
    if any(v < 0 for v in supply + demand):
        raise ModelError("供應量與需求量不能是負數。")

    vars_, c = [], []
    for i in range(len(src)):
        for j in range(len(dst)):
            vars_.append({"name": f"x{i+1}_{j+1}", "kind": "cont", "label": f"{sn[i]}→{dn[j]}"})
            c.append(_to_float(cost[i][j], f"{sn[i]}→{dn[j]} 的運輸成本"))
    nv = len(vars_)
    cons = []
    for i in range(len(src)):
        a = [0.0] * nv
        for j in range(len(dst)):
            a[i * len(dst) + j] = 1.0
        cons.append({"name": f"供給 {sn[i]}", "a": a, "op": "<=", "b": supply[i]})
    for j in range(len(dst)):
        a = [0.0] * nv
        for i in range(len(src)):
            a[i * len(dst) + j] = 1.0
        cons.append({"name": f"需求 {dn[j]}", "a": a, "op": "=", "b": demand[j]})
    note = None
    if sum(supply) < sum(demand) - 1e-9:
        note = f"總供給量 {fmt_num(sum(supply))} 小於總需求量 {fmt_num(sum(demand))},需求無法全部滿足,此問題無可行解。"
    return {"sense": "min", "obj_name": "總運輸成本", "unit": "單位", "vars": vars_, "c": c, "constraints": cons}, note


def extra_transport(d, res):
    if res["status"] != "optimal":
        return None
    sn = _names(d["sources"], "供給地", lambda i: f"S{i+1}")
    dn = _names(d["dests"], "需求地", lambda j: f"D{j+1}")
    m, k = len(sn), len(dn)
    vals = [v["value"] for v in res["x"]]
    flow = [[vals[i * k + j] for j in range(k)] for i in range(m)]
    cost = [[float(x) for x in r] for r in d["cost"]]
    plan = [{"from": sn[i], "to": dn[j], "qty": flow[i][j], "cost": cost[i][j],
             "subtotal": clean(flow[i][j] * cost[i][j])}
            for i in range(m) for j in range(k) if flow[i][j] > 1e-9]
    supply_rows = [{"name": sn[i], "supply": clean(float(d["sources"][i]["supply"])), "used": clean(sum(flow[i])),
                    "left": clean(float(d["sources"][i]["supply"]) - sum(flow[i]))} for i in range(m)]
    demand_rows = []
    for j in range(k):
        got = sum(flow[i][j] for i in range(m))
        need = float(d["dests"][j]["demand"])
        demand_rows.append({"name": dn[j], "demand": clean(need), "received": clean(got), "met": abs(got - need) < 1e-6})
    text = []
    for s in supply_rows:
        text.append(f"供給地 {s['name']} 尚餘 {fmt_num(s['left'])} 單位供應量。" if s["left"] > 1e-9
                    else f"供給地 {s['name']} 的供應量全數用完(Binding)。")
    for r in demand_rows:
        text.append(f"需求地 {r['name']} 的需求限制為 Binding(需求量剛好被滿足)。")
    return {"type": "transport", "sources": sn, "dests": dn, "flow": flow, "plan": plan,
            "supply_rows": supply_rows, "demand_rows": demand_rows, "text": text}


# ---------------------------------------------------------------- 指派問題
def build_assignment(d):
    ws, js = d.get("workers") or [], d.get("jobs") or []
    if not ws or not js:
        raise ModelError("請至少設定 1 位人員與 1 項工作。")
    wn = _names(ws, "人員", lambda i: f"人員{i+1}")
    jn = _names(js, "工作", lambda j: f"工作{j+1}")
    cost = d.get("cost") or []
    if len(cost) != len(wn) or any(len(r) != len(jn) for r in cost):
        raise ModelError("成本/效益矩陣的大小與人員、工作數量不一致。")
    sense = "max" if d.get("sense") == "max" else "min"
    vars_, c = [], []
    for i in range(len(wn)):
        for j in range(len(jn)):
            vars_.append({"name": f"x{i+1}_{j+1}", "kind": "bin", "label": f"{wn[i]}→{jn[j]}"})
            c.append(_to_float(cost[i][j], f"{wn[i]}→{jn[j]} 的數值"))
    nv, k = len(vars_), len(jn)
    row_op = "=" if len(wn) <= len(jn) else "<="
    col_op = "=" if len(jn) <= len(wn) else "<="
    cons = []
    for i in range(len(wn)):
        a = [0.0] * nv
        for j in range(k):
            a[i * k + j] = 1.0
        cons.append({"name": f"人員 {wn[i]}", "a": a, "op": row_op, "b": 1})
    for j in range(k):
        a = [0.0] * nv
        for i in range(len(wn)):
            a[i * k + j] = 1.0
        cons.append({"name": f"工作 {jn[j]}", "a": a, "op": col_op, "b": 1})
    return {"sense": sense, "obj_name": "總成本" if sense == "min" else "總效益", "unit": "",
            "vars": vars_, "c": c, "constraints": cons}, None


def extra_assignment(d, res):
    if res["status"] != "optimal":
        return None
    wn = _names(d["workers"], "人員", lambda i: f"人員{i+1}")
    jn = _names(d["jobs"], "工作", lambda j: f"工作{j+1}")
    k = len(jn)
    vals = [v["value"] for v in res["x"]]
    pairs = [{"worker": wn[i], "job": jn[j], "value": float(d["cost"][i][j])}
             for i in range(len(wn)) for j in range(k) if vals[i * k + j] > 0.5]
    return {"type": "assignment", "pairs": pairs, "sense": res["model"]["sense"],
            "text": [f"{p['worker']} 負責 {p['job']}(數值 {fmt_num(p['value'])})。" for p in pairs]}


# ---------------------------------------------------------------- 混合問題
def build_blending(d):
    ings, nuts = d.get("ingredients") or [], d.get("nutrients") or []
    if not ings:
        raise ModelError("請至少設定 1 種原料。")
    inn = _names(ings, "原料", lambda i: f"原料{i+1}")
    nn = _names(nuts, "成分", lambda i: f"成分{i+1}")
    vars_ = [{"name": f"x{j+1}", "kind": "cont", "label": inn[j]} for j in range(len(inn))]
    c = [_to_float(g.get("cost"), f"{inn[j]} 的單位成本") for j, g in enumerate(ings)]
    cons = []
    for i, t in enumerate(nuts):
        content = t.get("content") or []
        if len(content) != len(inn):
            raise ModelError(f"成分「{nn[i]}」的含量個數與原料數量不一致。")
        cons.append({"name": f"成分 {nn[i]}", "a": [_to_float(x, f"{nn[i]} 含量") for x in content],
                     "op": t.get("op", ">="), "b": _to_float(t.get("req"), f"{nn[i]} 的需求量")})
    total = d.get("total")
    if total not in (None, "", 0, "0"):
        cons.append({"name": "混合總量", "a": [1.0] * len(inn), "op": "=", "b": _to_float(total, "混合總量")})
    if not cons:
        raise ModelError("請至少設定 1 項成分限制或混合總量,否則最小成本會是 0。")
    return {"sense": "min", "obj_name": "總成本", "unit": "單位", "vars": vars_, "c": c, "constraints": cons}, None


# ---------------------------------------------------------------- 生產計劃問題
def build_production(d):
    prods, res_ = d.get("products") or [], d.get("resources") or []
    if not prods or not res_:
        raise ModelError("請至少設定 1 項產品與 1 種資源。")
    pn = _names(prods, "產品", lambda j: f"產品{j+1}")
    rn = _names(res_, "資源", lambda i: f"資源{i+1}")
    vars_ = [{"name": f"x{j+1}", "kind": "int" if d.get("integer") else "cont", "label": pn[j]} for j in range(len(pn))]
    c = [_to_float(p.get("profit"), f"{pn[j]} 的單位利潤") for j, p in enumerate(prods)]
    cons = []
    for i, r in enumerate(res_):
        use = r.get("usage") or []
        if len(use) != len(pn):
            raise ModelError(f"資源「{rn[i]}」的單位用量個數與產品數量不一致。")
        cons.append({"name": rn[i], "a": [_to_float(x, f"{rn[i]} 單位用量") for x in use], "op": "<=",
                     "b": _to_float(r.get("avail"), f"{rn[i]} 的可用量")})
    return {"sense": "max", "obj_name": "利潤", "unit": "單位", "vars": vars_, "c": c, "constraints": cons}, None


TEMPLATES = {
    "transport": (build_transport, extra_transport),
    "assignment": (build_assignment, extra_assignment),
    "blending": (build_blending, None),
    "production": (build_production, None),
}

from templates_ext import TEMPLATES_EXT  # noqa: E402  W6 整數規劃、W8 網路模式

TEMPLATES.update(TEMPLATES_EXT)
