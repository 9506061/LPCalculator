"""
templates_ext.py -- 新增的管理科學範本
  W6 整數規劃:0-1 方案選擇(含邏輯限制式)、固定費用設施區位、區域涵蓋
  W8 網路模式:轉運模式、最短路徑、最大流量
介面同 templates_ms:build_xxx(data) -> (model, note);extra_xxx(data, result) -> 結果表格
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


def _num(v, default, what):
    return default if v in (None, "") else _to_float(v, what)


# ================================================================ W6 0-1 方案選擇
RULES = {
    "exclusive": "互斥(至多選 1 個)",
    "choose_one": "強制選擇(恰選 1 個)",
    "exactly": "恰好選 k 個",
    "at_most": "至多選 k 個",
    "at_least": "至少選 k 個",
    "if_then": "條件:若選 P 則必選 Q",
    "if_not": "若選 A 則不得選 B",
    "coreq": "共軛:A、B 同時選或同時不選",
}


def _rule_constraint(r, k, names, nv):
    t = r.get("type")
    if t not in RULES:
        raise ModelError(f"第 {k} 條邏輯限制的類型不正確。")
    a = [0.0] * nv
    if t in ("if_then", "if_not", "coreq"):
        try:
            p, q = int(r.get("p")), int(r.get("q"))
        except (TypeError, ValueError):
            raise ModelError(f"第 {k} 條邏輯限制請選擇兩個方案。")
        if not (0 <= p < nv and 0 <= q < nv) or p == q:
            raise ModelError(f"第 {k} 條邏輯限制必須選擇兩個「不同」的方案。")
        if t == "if_then":                      # x_P ≤ x_Q
            a[p], a[q] = 1.0, -1.0
            return {"name": f"若選{names[p]}則選{names[q]}", "a": a, "op": "<=", "b": 0}
        if t == "if_not":                       # x_A + x_B ≤ 1
            a[p] = a[q] = 1.0
            return {"name": f"選{names[p]}則不選{names[q]}", "a": a, "op": "<=", "b": 1}
        a[p], a[q] = 1.0, -1.0                  # x_A = x_B
        return {"name": f"{names[p]}與{names[q]}共軛", "a": a, "op": "=", "b": 0}
    items = sorted({int(i) for i in (r.get("items") or []) if 0 <= int(i) < nv})
    need = 2 if t in ("exclusive", "choose_one") else 1
    if len(items) < need:
        raise ModelError(f"第 {k} 條邏輯限制「{RULES[t]}」請至少勾選 {need} 個方案。")
    for i in items:
        a[i] = 1.0
    group = "、".join(names[i] for i in items)
    if t == "exclusive":
        return {"name": f"互斥:{group}", "a": a, "op": "<=", "b": 1}
    if t == "choose_one":
        return {"name": f"擇一:{group}", "a": a, "op": "=", "b": 1}
    kk = _to_float(r.get("k"), f"第 {k} 條邏輯限制的 k")
    op = {"exactly": "=", "at_most": "<=", "at_least": ">="}[t]
    word = {"exactly": "恰選", "at_most": "至多選", "at_least": "至少選"}[t]
    return {"name": f"{word}{fmt_num(kk)}項:{group}", "a": a, "op": op, "b": kk}


def build_selection(d):
    items, res_ = d.get("items") or [], d.get("resources") or []
    if not items:
        raise ModelError("請至少設定 1 個方案。")
    names = _names(items, "方案", lambda i: f"方案{i+1}")
    rn = _names(res_, "資源", lambda i: f"資源{i+1}")
    nv = len(names)
    vars_ = [{"name": f"x{j+1}", "kind": "bin", "label": names[j]} for j in range(nv)]
    c = [_num(it.get("value"), 0.0, f"{names[j]} 的目標係數") for j, it in enumerate(items)]
    cons = []
    for i, r in enumerate(res_):
        use = r.get("usage") or []
        if len(use) != nv:
            raise ModelError(f"資源「{rn[i]}」的用量個數與方案數量不一致。")
        cons.append({"name": rn[i], "a": [_to_float(x, f"{rn[i]} 用量") for x in use], "op": r.get("op") or "<=",
                     "b": _to_float(r.get("avail"), f"{rn[i]} 的可用量")})
    for k, r in enumerate(d.get("rules") or [], 1):
        cons.append(_rule_constraint(r, k, names, nv))
    if not cons:
        raise ModelError("請至少設定 1 項資源限制或邏輯限制。")
    sense = "min" if d.get("sense") == "min" else "max"
    obj = str(d.get("obj_name") or "").strip() or ("總效益" if sense == "max" else "總成本")
    return {"sense": sense, "obj_name": obj, "unit": "", "vars": vars_, "c": c, "constraints": cons}, None


def extra_selection(d, res):
    if res["status"] != "optimal":
        return None
    names = _names(d["items"], "方案", lambda i: f"方案{i+1}")
    vals = [v["value"] for v in res["x"]]
    pick = [vals[j] > 0.5 for j in range(len(names))]
    text = [f"選擇(執行):{'、'.join(n for n, p in zip(names, pick) if p) or '無'}。",
            f"不選擇:{'、'.join(n for n, p in zip(names, pick) if not p) or '無'}。",
            f"{res['model']['obj_name']} = {fmt_num(res['z'])}。"]
    return {"type": "selection", "text": text,
            "table": [{"name": names[j], "value": clean(_num(d["items"][j].get("value"), 0.0, "")), "pick": pick[j]}
                      for j in range(len(names))]}


# ================================================================ W6 固定費用與設施區位
def build_facility(d):
    fac, cus = d.get("facilities") or [], d.get("customers") or []
    if not fac or not cus:
        raise ModelError("請至少設定 1 個候選設施與 1 個需求點。")
    fn = _names(fac, "候選設施", lambda i: f"F{i+1}")
    cn = _names(cus, "需求點", lambda j: f"C{j+1}")
    m, k = len(fn), len(cn)
    fixed = [_to_float(f.get("fixed"), f"{fn[i]} 的固定成本") for i, f in enumerate(fac)]
    cap = [_to_float(f.get("cap"), f"{fn[i]} 的產能") for i, f in enumerate(fac)]
    dem = [_to_float(c.get("demand"), f"{cn[j]} 的需求量") for j, c in enumerate(cus)]
    cost = d.get("cost") or []
    if len(cost) != m or any(len(r) != k for r in cost):
        raise ModelError("運輸成本矩陣的大小與設施/需求點數量不一致。")
    vars_, c = [], []
    for i in range(m):
        for j in range(k):
            vars_.append({"name": f"x{i+1}_{j+1}", "kind": "cont", "label": f"{fn[i]}→{cn[j]}"})
            c.append(_to_float(cost[i][j], f"{fn[i]}→{cn[j]} 的單位運輸成本"))
    for i in range(m):
        vars_.append({"name": f"y{i+1}", "kind": "bin", "label": f"設置 {fn[i]}"})
        c.append(fixed[i])
    nv = len(vars_)
    cons = []
    for i in range(m):                     # Linking constraint:Σ_j x_ij ≤ 產能_i × y_i
        a = [0.0] * nv
        for j in range(k):
            a[i * k + j] = 1.0
        a[m * k + i] = -cap[i]
        cons.append({"name": f"連結限制 {fn[i]}", "a": a, "op": "<=", "b": 0})
    for j in range(k):
        a = [0.0] * nv
        for i in range(m):
            a[i * k + j] = 1.0
        cons.append({"name": f"需求 {cn[j]}", "a": a, "op": "=", "b": dem[j]})
    note = None
    if sum(cap) < sum(dem) - 1e-9:
        note = f"所有設施產能合計 {fmt_num(sum(cap))} 小於總需求 {fmt_num(sum(dem))},無可行解。"
    return {"sense": "min", "obj_name": "總成本", "unit": "", "vars": vars_, "c": c, "constraints": cons}, note


def extra_facility(d, res):
    if res["status"] != "optimal":
        return None
    fn = _names(d["facilities"], "候選設施", lambda i: f"F{i+1}")
    cn = _names(d["customers"], "需求點", lambda j: f"C{j+1}")
    m, k = len(fn), len(cn)
    vals = [v["value"] for v in res["x"]]
    flow = [[vals[i * k + j] for j in range(k)] for i in range(m)]
    opened = [vals[m * k + i] > 0.5 for i in range(m)]
    fixed = [float(f["fixed"]) for f in d["facilities"]]
    fixed_total = sum(fixed[i] for i in range(m) if opened[i])
    rows = [{"name": fn[i], "open": opened[i], "fixed": fixed[i], "cap": float(d["facilities"][i]["cap"]),
             "ship": clean(sum(flow[i]))} for i in range(m)]
    text = [f"應設置(購買):{'、'.join(fn[i] for i in range(m) if opened[i]) or '無'}。",
            f"固定成本合計 {fmt_num(fixed_total)},運輸成本合計 {fmt_num(res['z'] - fixed_total)},總成本 {fmt_num(res['z'])}。"]
    closed = [fn[i] for i in range(m) if not opened[i]]
    if closed:
        text.append(f"{'、'.join(closed)} 未設置:y = 0 使連結限制式右側為 0,因此完全不能運出。")
    return {"type": "facility", "sources": fn, "dests": cn, "flow": flow, "rows": rows, "text": text,
            "fixed_total": clean(fixed_total), "trans_total": clean(res["z"] - fixed_total)}


# ================================================================ W6 區域涵蓋 (Set Covering)
def _parse_list(s, n, what):
    if isinstance(s, list):
        toks = s
    else:
        txt = str(s or "")
        for ch in "、,; ;":
            txt = txt.replace(ch, ",")
        toks = [t for t in txt.split(",") if t.strip()]
    out = set()
    for t in toks:
        try:
            j = int(str(t).strip())
        except ValueError:
            raise ModelError(f"{what} 的內容「{t}」不是編號。")
        if not 1 <= j <= n:
            raise ModelError(f"{what} 的編號 {j} 超出範圍 1~{n}。")
        out.add(j - 1)
    return sorted(out)


def build_covering(d):
    sites = d.get("sites") or []
    if not sites:
        raise ModelError("請至少設定 1 個地點。")
    sn = _names(sites, "地點", lambda i: f"地點{i+1}")
    n = len(sn)
    vars_ = [{"name": f"x{j+1}", "kind": "bin", "label": sn[j]} for j in range(n)]
    c = [_num(s.get("cost"), 1.0, f"{sn[j]} 的設置成本") for j, s in enumerate(sites)]
    cover = [_parse_list(s.get("covers"), n, f"「{sn[j]}」可涵蓋的地點") for j, s in enumerate(sites)]
    cons = []
    for i in range(n):                          # Σ_j a_ij x_j ≥ 1
        a = [1.0 if i in cover[j] else 0.0 for j in range(n)]
        if not any(a):
            raise ModelError(f"沒有任何地點可以涵蓋「{sn[i]}」,問題無可行解。")
        cons.append({"name": f"涵蓋 {i+1}.{sn[i]}", "a": a, "op": ">=", "b": 1})
    unit = all(abs(x - 1) < 1e-12 for x in c)
    return {"sense": "min", "obj_name": "據點數量" if unit else "總設置成本", "unit": "",
            "vars": vars_, "c": c, "constraints": cons}, None


def extra_covering(d, res):
    if res["status"] != "optimal":
        return None
    sn = _names(d["sites"], "地點", lambda i: f"地點{i+1}")
    n = len(sn)
    cover = [_parse_list(s.get("covers"), n, "涵蓋") for s in d["sites"]]
    pick = [res["x"][j]["value"] > 0.5 for j in range(n)]
    matrix = [[1 if i in cover[j] else 0 for j in range(n)] for i in range(n)]   # a_ij
    text = [f"應在 {'、'.join(f'{j+1}.{sn[j]}' for j in range(n) if pick[j])} 設立據點,共 {sum(pick)} 處。"]
    for i in range(n):
        by = [sn[j] for j in range(n) if pick[j] and i in cover[j]]
        text.append(f"{i+1}.{sn[i]} 由 {'、'.join(by)} 涵蓋。")
    return {"type": "covering", "names": sn, "matrix": matrix, "pick": pick, "text": text}


# ================================================================ W8 網路模式共用
def _nodes_arcs(d, need_cost=True, need_cap=False):
    nodes = d.get("nodes") or []
    if len(nodes) < 2:
        raise ModelError("請至少設定 2 個節點。")
    nn = _names(nodes, "節點", lambda i: f"{i+1}")
    arcs = []
    for k, a in enumerate(d.get("arcs") or [], 1):
        try:
            i, j = int(a.get("from")), int(a.get("to"))
        except (TypeError, ValueError):
            raise ModelError(f"第 {k} 條弧線的起點/終點未設定。")
        if not (0 <= i < len(nn) and 0 <= j < len(nn)) or i == j:
            raise ModelError(f"第 {k} 條弧線的起點與終點必須是兩個不同的節點。")
        arc = {"from": i, "to": j}
        if need_cost:
            arc["cost"] = _to_float(a.get("cost"), f"弧線 {nn[i]}→{nn[j]} 的成本/距離")
        if need_cap or a.get("cap") not in (None, ""):
            arc["cap"] = _to_float(a.get("cap"), f"弧線 {nn[i]}→{nn[j]} 的容量")
            if arc["cap"] < 0:
                raise ModelError(f"弧線 {nn[i]}→{nn[j]} 的容量不能是負數。")
        arcs.append(arc)
    if d.get("both"):                           # 雙向:自動補上反向弧
        have = {(a["from"], a["to"]) for a in arcs}
        arcs += [{**a, "from": a["to"], "to": a["from"]} for a in list(arcs) if (a["to"], a["from"]) not in have]
    seen = set()
    for a in arcs:
        key = (a["from"], a["to"])
        if key in seen:
            raise ModelError(f"弧線 {nn[key[0]]}→{nn[key[1]]} 重複輸入了。")
        seen.add(key)
    if not arcs:
        raise ModelError("請至少設定 1 條弧線。")
    return nn, arcs


def _arc_vars(nn, arcs, kind="cont"):
    short = all(len(x) <= 2 and x.isascii() and x.isalnum() for x in nn)
    out = []
    for k, a in enumerate(arcs):
        i, j = nn[a["from"]], nn[a["to"]]
        name = (f"x{i}{j}" if all(len(x) == 1 for x in nn) else f"x{i}_{j}") if short else f"x{k+1}"
        out.append({"name": name, "kind": kind, "label": f"{i}→{j}"})
    return out


def _balance_row(v, arcs, nv):
    """流出 − 流入 的係數列"""
    a = [0.0] * nv
    for k, arc in enumerate(arcs):
        if arc["from"] == v:
            a[k] += 1.0
        if arc["to"] == v:
            a[k] -= 1.0
    return a


def _net_view(nn, arcs, vals, kinds=None, src=None, dst=None, key="cost"):
    return {"nodes": nn, "kinds": kinds, "src": src, "dst": dst,
            "arcs": [{"from": a["from"], "to": a["to"], "label": fmt_num(a.get(key, 0)), "flow": clean(vals[k])}
                     for k, a in enumerate(arcs)]}


def _ends(d, n):
    try:
        s, t = int(d.get("start", 0)), int(d.get("end", n - 1))
    except (TypeError, ValueError):
        raise ModelError("請選擇起點與終點。")
    if s == t or not (0 <= s < n and 0 <= t < n):
        raise ModelError("起點與終點必須是兩個不同的節點。")
    return s, t


# ================================================================ W8 轉運模式
def build_transship(d):
    nn, arcs = _nodes_arcs(d)
    nodes = d["nodes"]
    kinds = [n.get("type", "trans") for n in nodes]
    amt = [_num(n.get("amount"), 0.0, f"{nn[i]} 的數量") for i, n in enumerate(nodes)]
    sup = sum(amt[i] for i in range(len(nn)) if kinds[i] == "supply")
    dem = sum(amt[i] for i in range(len(nn)) if kinds[i] == "demand")
    if sup <= 0 or dem <= 0:
        raise ModelError("請至少設定 1 個供應點與 1 個需求點,且數量大於 0。")
    vars_ = _arc_vars(nn, arcs)
    nv = len(vars_)
    short = sup < dem - 1e-9          # 供不應求:供應全數運出(=),需求 ≤
    cons = []
    for v in range(len(nn)):
        a = _balance_row(v, arcs, nv)
        if kinds[v] == "supply":
            cons.append({"name": f"供應 {nn[v]}", "a": a, "op": "=" if short else "<=", "b": amt[v]})
        elif kinds[v] == "demand":
            cons.append({"name": f"需求 {nn[v]}", "a": [-x for x in a], "op": "<=" if short else "=", "b": amt[v]})
        else:
            cons.append({"name": f"轉運點 {nn[v]} 流入=流出", "a": a, "op": "=", "b": 0})
    for k, arc in enumerate(arcs):
        if "cap" in arc:
            a = [0.0] * nv
            a[k] = 1.0
            cons.append({"name": f"容量 {nn[arc['from']]}→{nn[arc['to']]}", "a": a, "op": "<=", "b": arc["cap"]})
    if short:
        note = (f"總供給量 {fmt_num(sup)} < 總需求量 {fmt_num(dem)}(供不應求):供應點限制為「=」(全部運出),"
                f"需求點限制為「≤」,將有 {fmt_num(dem - sup)} 的需求無法滿足。")
    elif sup > dem + 1e-9:
        note = f"總供給量 {fmt_num(sup)} > 總需求量 {fmt_num(dem)}(供過於求):需求點限制為「=」,供應點限制為「≤」。"
    else:
        note = None
    return {"sense": "min", "obj_name": "總運輸成本", "unit": "", "vars": vars_,
            "c": [a["cost"] for a in arcs], "constraints": cons}, note


def extra_transship(d, res):
    if res["status"] != "optimal":
        return None
    nn, arcs = _nodes_arcs(d)
    vals = [v["value"] for v in res["x"]]
    kinds = [n.get("type", "trans") for n in d["nodes"]]
    amt = [_num(n.get("amount"), 0.0, "") for n in d["nodes"]]
    plan = [{"from": nn[a["from"]], "to": nn[a["to"]], "qty": vals[k], "cost": a["cost"],
             "subtotal": clean(vals[k] * a["cost"])} for k, a in enumerate(arcs) if vals[k] > 1e-9]
    bal, text = [], []
    for v in range(len(nn)):
        fin = sum(vals[k] for k, a in enumerate(arcs) if a["to"] == v)
        fout = sum(vals[k] for k, a in enumerate(arcs) if a["from"] == v)
        bal.append({"name": nn[v], "type": kinds[v], "amount": clean(amt[v]), "in": clean(fin), "out": clean(fout)})
        if kinds[v] == "trans":
            text.append(f"轉運點 {nn[v]}:流入 {fmt_num(fin)} = 流出 {fmt_num(fout)}(流量平衡)。")
        elif kinds[v] == "demand" and fin < amt[v] - 1e-6:
            text.append(f"需求點 {nn[v]} 只收到 {fmt_num(fin)},尚有 {fmt_num(amt[v] - fin)} 需求未滿足。")
        elif kinds[v] == "supply" and fout < amt[v] - 1e-6:
            text.append(f"供應點 {nn[v]} 尚餘 {fmt_num(amt[v] - fout)} 未運出。")
    return {"type": "network", "mode": "transship", "plan": plan, "balance": bal, "text": text,
            "net": _net_view(nn, arcs, vals, kinds=kinds)}


# ================================================================ W8 最短路徑
def build_shortest(d):
    nn, arcs = _nodes_arcs(d)
    s, t = _ends(d, len(nn))
    if any(a["cost"] < 0 for a in arcs):
        raise ModelError("距離不可為負數。")
    vars_ = _arc_vars(nn, arcs, "bin")
    nv = len(vars_)
    cons = []
    for v in range(len(nn)):
        a = _balance_row(v, arcs, nv)
        if v == s:
            cons.append({"name": f"起點 {nn[v]}:流出−流入=1", "a": a, "op": "=", "b": 1})
        elif v == t:
            cons.append({"name": f"終點 {nn[v]}:流入−流出=1", "a": [-x for x in a], "op": "=", "b": 1})
        elif any(a):
            cons.append({"name": f"節點 {nn[v]}:流入=流出", "a": a, "op": "=", "b": 0})
    return {"sense": "min", "obj_name": "總距離", "unit": "", "vars": vars_,
            "c": [a["cost"] for a in arcs], "constraints": cons}, None


def extra_shortest(d, res):
    if res["status"] != "optimal":
        return None
    nn, arcs = _nodes_arcs(d)
    s, t = _ends(d, len(nn))
    vals = [v["value"] for v in res["x"]]
    nxt = {a["from"]: a for k, a in enumerate(arcs) if vals[k] > 0.5}
    path, legs, cur = [s], [], s
    while cur != t and cur in nxt and len(path) <= len(nn):
        a = nxt[cur]
        legs.append({"from": nn[a["from"]], "to": nn[a["to"]], "dist": a["cost"]})
        cur = a["to"]
        path.append(cur)
    text = [f"最短路徑:{' → '.join(nn[p] for p in path)}。",
            f"總距離 = {' + '.join(fmt_num(l['dist']) for l in legs)} = {fmt_num(res['z'])}。",
            "與指派模式類似,變數都是 0-1;差別在於多了「流量平衡」限制,確保選到的弧線連成一條路徑。"]
    return {"type": "network", "mode": "shortest", "legs": legs, "text": text,
            "net": _net_view(nn, arcs, vals, src=s, dst=t)}


# ================================================================ W8 最大流量
def build_maxflow(d):
    nn, arcs = _nodes_arcs(d, need_cost=False, need_cap=True)
    s, t = _ends(d, len(nn))
    vars_ = _arc_vars(nn, arcs) + [{"name": "F", "kind": "cont", "label": "總流量 F"}]
    nv = len(vars_)
    cons = []
    for v in range(len(nn)):
        a = _balance_row(v, arcs, nv)
        if v == s:
            a[-1] = -1.0
            cons.append({"name": f"Source {nn[v]}:流出−流入=F", "a": a, "op": "=", "b": 0})
        elif v == t:
            a = [-x for x in a]
            a[-1] = -1.0
            cons.append({"name": f"Sink {nn[v]}:流入−流出=F", "a": a, "op": "=", "b": 0})
        elif any(a):
            cons.append({"name": f"節點 {nn[v]}:流量守恆", "a": a, "op": "=", "b": 0})
    for k, arc in enumerate(arcs):
        a = [0.0] * nv
        a[k] = 1.0
        cons.append({"name": f"容量 {nn[arc['from']]}→{nn[arc['to']]}", "a": a, "op": "<=", "b": arc["cap"]})
    return {"sense": "max", "obj_name": "總流量", "unit": "", "vars": vars_,
            "c": [0.0] * (nv - 1) + [1.0], "constraints": cons}, None


def extra_maxflow(d, res):
    if res["status"] != "optimal":
        return None
    nn, arcs = _nodes_arcs(d, need_cost=False, need_cap=True)
    s, t = _ends(d, len(nn))
    vals = [v["value"] for v in res["x"]]
    flow = {(a["from"], a["to"]): vals[k] for k, a in enumerate(arcs)}
    cap = {(a["from"], a["to"]): a["cap"] for a in arcs}
    reach, stack = {s}, [s]                      # 殘餘網路中由 Source 可到達的節點
    while stack:
        u = stack.pop()
        for v in range(len(nn)):
            r = cap.get((u, v), 0) - flow.get((u, v), 0) + flow.get((v, u), 0)
            if v not in reach and r > 1e-7:
                reach.add(v)
                stack.append(v)
    cut = [{"from": nn[a["from"]], "to": nn[a["to"]], "cap": a["cap"]} for a in arcs
           if a["from"] in reach and a["to"] not in reach and a["cap"] > 0]
    plan = [{"from": nn[a["from"]], "to": nn[a["to"]], "qty": vals[k], "cap": a["cap"],
             "full": vals[k] >= a["cap"] - 1e-7} for k, a in enumerate(arcs) if vals[k] > 1e-9]
    out_cap = sum(a["cap"] for a in arcs if a["from"] == s)
    in_cap = sum(a["cap"] for a in arcs if a["to"] == t)
    cut_txt = "、".join(f"{c['from']}→{c['to']}({fmt_num(c['cap'])})" for c in cut)
    text = [f"由 {nn[s]} 到 {nn[t]} 的最大流量 F* = {fmt_num(res['z'])}。",
            f"求解前分析:{nn[s]} 的總輸出能力 {fmt_num(out_cap)}、{nn[t]} 的總輸入能力 {fmt_num(in_cap)},"
            f"因此 F ≤ {fmt_num(min(out_cap, in_cap))}。",
            f"瓶頸(最小割):{cut_txt},容量合計 {fmt_num(sum(c['cap'] for c in cut))} = 最大流量。"
            f"要增加流量,必須擴充這些路線的容量。"]
    return {"type": "network", "mode": "maxflow", "plan": plan, "cut": cut, "text": text,
            "net": _net_view(nn, arcs, vals, src=s, dst=t, key="cap")}


TEMPLATES_EXT = {
    "selection": (build_selection, extra_selection),
    "facility": (build_facility, extra_facility),
    "covering": (build_covering, extra_covering),
    "transship": (build_transship, extra_transship),
    "shortest": (build_shortest, extra_shortest),
    "maxflow": (build_maxflow, extra_maxflow),
}
