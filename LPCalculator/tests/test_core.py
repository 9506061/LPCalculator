"""執行: python tests/test_core.py   (或 python -m pytest tests)"""
import copy
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from lp_core import ModelError, solve_model  # noqa: E402
from templates_ms import TEMPLATES  # noqa: E402


def M(sense, c, cons, kinds=None):
    n = len(c)
    kinds = kinds or ["cont"] * n
    return {"sense": sense, "vars": [{"name": f"x{i+1}", "kind": kinds[i]} for i in range(n)], "c": c,
            "constraints": [{"name": f"R{i+1}", "a": a, "op": op, "b": b} for i, (a, op, b) in enumerate(cons)]}


def test_assignment_example():
    r = solve_model(M("max", [20, 15], [([2, 1], "<=", 20), ([1, 3], "<=", 35)]))
    assert r["status"] == "optimal"
    assert [v["value"] for v in r["x"]] == [5, 10] and r["z"] == 250
    assert all(row["binding"] for row in r["rows"])


def test_min_with_ge():
    r = solve_model(M("min", [2, 3], [([1, 1], ">=", 4), ([1, -1], "<=", 2)]))
    assert [v["value"] for v in r["x"]] == [3, 1] and r["z"] == 9


def test_infeasible_unbounded():
    assert solve_model(M("max", [1], [([1], "<=", 2), ([1], ">=", 5)]))["status"] == "infeasible"
    assert solve_model(M("max", [1, 1], [([1, -1], "<=", 2)]))["status"] == "unbounded"


def test_free_integer_binary():
    r = solve_model(M("min", [1], [([1], ">=", -5)], ["free"]))
    assert r["x"][0]["value"] == -5
    r = solve_model(M("max", [5, 4], [([6, 4], "<=", 24), ([1, 2], "<=", 6)], ["int", "int"]))
    assert r["z"] == 20 and r["rows"][0]["shadow"] is None
    r = solve_model(M("max", [3, 2, 4], [([2, 1, 3], "<=", 4)], ["bin"] * 3))
    assert r["z"] == 6   # 選第 2、3 項:重量 4、價值 6


def test_shadow_price_by_perturbation():
    """影子價格 = 右端常數增加 1 單位時目標值的變化量(涵蓋 ≤、≥、= 與 max/min)。"""
    cases = [
        M("max", [20, 15], [([2, 1], "<=", 20), ([1, 3], "<=", 35)]),
        M("min", [2, 3], [([1, 1], ">=", 4), ([1, -1], "<=", 2)]),
        M("min", [4, 3, 5], [([1, 1, 1], "=", 10), ([1, 0, 0], ">=", 2), ([0, 1, 2], "<=", 12)]),
        M("max", [3, 5, 2], [([1, 1, 1], "<=", 10), ([1, -1, 0], ">=", -2), ([0, 2, 1], "=", 9)]),
    ]
    for m in cases:
        base = solve_model(m)
        assert base["status"] == "optimal"
        for i, row in enumerate(base["rows"]):
            m2 = copy.deepcopy(m)
            m2["constraints"][i]["b"] += 0.01
            z2 = solve_model(m2)["z"]
            assert abs((z2 - base["z"]) / 0.01 - row["shadow"]) < 1e-3, (m, i, row)


def test_graph():
    g = solve_model(M("max", [20, 15], [([2, 1], "<=", 20), ([1, 3], "<=", 35)]))["graph"]
    assert len(g["polygon"]) == 4 and sum(v["optimal"] for v in g["vertices"]) == 1
    g = solve_model(M("max", [5, 4], [([6, 4], "<=", 24), ([1, 2], "<=", 6)], ["int", "int"]))["graph"]
    assert len(g["lattice"]) > 5
    g = solve_model(M("max", [1, 1], [([1, -1], "<=", 2)]))["graph"]
    assert g["optimum"] is None and len(g["polygon"]) >= 3


def test_validation():
    for bad in ({"sense": "max", "vars": [], "c": [], "constraints": []}, M("max", [1], []),
                M("max", ["abc"], [([1], "<=", 1)])):
        try:
            solve_model(bad)
            raise AssertionError("應該要丟出 ModelError")
        except ModelError:
            pass


def test_transport_example():
    d = {"sources": [{"name": "S1", "supply": 300}, {"name": "S2", "supply": 300}, {"name": "S3", "supply": 200}],
         "dests": [{"name": "A", "demand": 150}, {"name": "B", "demand": 250},
                   {"name": "C", "demand": 200}, {"name": "D", "demand": 200}],
         "cost": [[16, 18, 11, 20], [14, 12, 13, 17], [13, 15, 17, 18]]}
    build, extra = TEMPLATES["transport"]
    model, note = build(d)
    r = solve_model(model)
    assert r["status"] == "optimal" and note is None
    ex = extra(d, r)
    assert abs(sum(p["qty"] for p in ex["plan"]) - 800) < 1e-6
    assert abs(sum(p["subtotal"] for p in ex["plan"]) - r["z"]) < 1e-6
    d["sources"][0]["supply"] = 10
    model, note = build(d)
    assert note and solve_model(model)["status"] == "infeasible"


def test_other_templates():
    d = {"workers": ["甲", "乙", "丙"], "jobs": ["X", "Y", "Z"], "cost": [[9, 2, 7], [6, 4, 3], [5, 8, 1]], "sense": "min"}
    r = solve_model(TEMPLATES["assignment"][0](d)[0])
    assert r["z"] == 9 and len(TEMPLATES["assignment"][1](d, r)["pairs"]) == 3
    d = {"ingredients": [{"name": "玉米", "cost": 3}, {"name": "大豆", "cost": 5}],
         "nutrients": [{"name": "蛋白質", "content": [0.09, 0.5], "op": ">=", "req": 20},
                       {"name": "纖維", "content": [0.02, 0.06], "op": "<=", "req": 5}], "total": 100}
    assert solve_model(TEMPLATES["blending"][0](d)[0])["status"] == "optimal"
    d = {"products": [{"name": "A", "profit": 20}, {"name": "B", "profit": 15}],
         "resources": [{"name": "人力", "usage": [2, 1], "avail": 20}, {"name": "原料", "usage": [1, 3], "avail": 35}]}
    assert solve_model(TEMPLATES["production"][0](d)[0])["z"] == 250


def _run(kind, d):
    build, extra = TEMPLATES[kind]
    model, _ = build(d)
    r = solve_model(model)
    return r, extra(d, r)


def test_w6_integer_programming():
    # 社區休閒設施(0-1 + 互斥限制):選游泳池、運動場,Z = 700
    d = {"sense": "max", "items": [{"name": n, "value": v} for n, v in
                                   [("游泳池", 300), ("網球中心", 90), ("運動場", 400), ("體育館", 150)]],
         "resources": [{"name": "預算", "usage": [35000, 10000, 25000, 90000], "avail": 120000},
                       {"name": "土地", "usage": [4, 2, 7, 3], "avail": 12}],
         "rules": [{"type": "exclusive", "items": [0, 1]}]}
    r, ex = _run("selection", d)
    assert r["z"] == 700 and [t["pick"] for t in ex["table"]] == [True, False, True, False]
    # 邏輯限制:若選 x3 則選 x2、x1 = x4、至少 2 項
    d = {"sense": "min", "items": [{"name": str(i), "value": 1} for i in range(4)], "resources": [],
         "rules": [{"type": "exclusive", "items": [0, 2]}, {"type": "if_then", "p": 2, "q": 1},
                   {"type": "coreq", "p": 0, "q": 3}, {"type": "at_least", "items": [0, 1, 2, 3], "k": 2}]}
    r, ex = _run("selection", d)
    x = [v["value"] for v in r["x"]]
    assert r["z"] == 2 and x[2] <= x[1] and x[0] == x[3] and x[0] + x[2] <= 1
    # Nancy 混合整數規劃
    r = solve_model({"sense": "max", "vars": [{"name": "x1", "kind": "int"}, {"name": "x2"}, {"name": "x3", "kind": "int"}],
                     "c": [9000, 1500, 1000], "constraints": [
                         {"a": [50000, 12000, 8000], "op": "<=", "b": 250000}, {"a": [1, 0, 0], "op": "<=", "b": 4},
                         {"a": [0, 1, 0], "op": "<=", "b": 15}, {"a": [0, 0, 1], "op": "<=", "b": 20}]})
    assert r["status"] == "optimal" and float(r["x"][0]["value"]).is_integer()
    # One Potato 固定費用設施區位
    fac = [(405, 11.2), (390, 10.5), (450, 12.8), (368, 9.3), (520, 10.8), (465, 9.6)]
    d = {"facilities": [{"name": f"F{i}", "fixed": f, "cap": c} for i, (f, c) in enumerate(fac)],
         "customers": [{"name": n, "demand": q} for n, q in [("A", 12), ("B", 10), ("C", 14)]],
         "cost": [[18, 15, 12], [13, 10, 17], [16, 14, 18], [19, 15, 16], [17, 19, 12], [14, 16, 12]]}
    r, ex = _run("facility", d)
    assert abs(r["z"] - 2082.3) < 1e-6
    for row, flow in zip(ex["rows"], ex["flow"]):     # 未設置的農場不能運出
        assert row["open"] or sum(flow) < 1e-9
    # APS 區域涵蓋:最少 4 個配送中心
    cov = ["1,3,8", "2,9", "1,3,11", "4,5,8,10", "4,5,6,7,10", "4,5,6,7,8,12", "5,6,7", "1,4,6,8,12", "2,9,11",
           "4,5,10,11", "3,9,10,11", "6,8,12"]
    r, ex = _run("covering", {"sites": [{"name": f"c{i}", "covers": c} for i, c in enumerate(cov)]})
    assert r["z"] == 4 and all(any(m[i][j] and ex["pick"][j] for j in range(12)) for m in [ex["matrix"]] for i in range(12))


def test_w8_network_models():
    names = ["Ohio", "Penn", "NY", "Indiana", "Georgia", "Virginia", "Kentucky", "Louisiana"]
    types = ["supply"] * 3 + ["trans"] * 2 + ["demand"] * 3
    amt = [72, 105, 83, 0, 0, 90, 80, 120]
    arcs = [{"from": i, "to": 3 + j, "cost": c} for i, row in enumerate([[16, 21], [18, 16], [22, 25]]) for j, c in enumerate(row)]
    arcs += [{"from": 3 + j, "to": 5 + k, "cost": c} for j, row in enumerate([[23, 15, 29], [20, 17, 24]]) for k, c in enumerate(row)]
    r, ex = _run("transship", {"nodes": [{"name": n, "type": t, "amount": a} for n, t, a in zip(names, types, amt)], "arcs": arcs})
    assert r["z"] == 10043
    for b in ex["balance"]:
        if b["type"] == "trans":
            assert abs(b["in"] - b["out"]) < 1e-6
    sp = [(1, 2, 21), (1, 3, 17), (1, 4, 30), (2, 4, 10), (2, 5, 25), (3, 4, 12), (3, 6, 25), (4, 5, 18),
          (4, 6, 10), (4, 7, 9), (5, 7, 12), (6, 7, 15)]
    d = {"nodes": [{"name": str(i)} for i in range(1, 8)], "arcs": [{"from": a - 1, "to": b - 1, "cost": c} for a, b, c in sp],
         "start": 0, "end": 6}
    r, ex = _run("shortest", d)
    assert r["z"] == 38 and [ex["legs"][0]["from"]] + [l["to"] for l in ex["legs"]] == ["1", "3", "4", "7"]
    d["both"] = True
    assert _run("shortest", d)[0]["z"] == 38
    caps = [(1, 2, 6), (1, 3, 5), (3, 1, 1), (2, 4, 2), (4, 2, 1), (2, 6, 3), (6, 2, 4), (3, 4, 7), (4, 3, 2), (3, 5, 3),
            (3, 7, 4), (4, 5, 2), (5, 4, 6), (4, 6, 4), (6, 4, 2), (5, 7, 9), (6, 7, 4)]
    d = {"nodes": [{"name": str(i)} for i in range(1, 8)], "arcs": [{"from": a - 1, "to": b - 1, "cap": c} for a, b, c in caps],
         "start": 0, "end": 6}
    r, ex = _run("maxflow", d)
    assert r["z"] == 10 and abs(sum(c["cap"] for c in ex["cut"]) - 10) < 1e-9   # 最大流 = 最小割


def test_w10_goal_programming():
    from goal_core import solve_goal
    V = [{"name": "x1"}, {"name": "x2"}]
    base = [{"name": "工時", "a": [1, 2], "target": 40, "want": "ge", "priority": 1},
            {"name": "利潤", "a": [40, 50], "target": 1600, "want": "ge", "priority": 2},
            {"name": "陶土", "a": [4, 3], "target": 120, "want": "le", "priority": 3}]
    r = solve_goal({"vars": V, "goals": base + [{"name": "加班", "a": [0, 0], "dev": [{"goal": 0, "side": "+"}],
                                                  "target": 0, "want": "le", "priority": 4}]})
    assert [v["value"] for v in r["x"]] == [15, 20] and [lv["value"] for lv in r["levels"]] == [0, 0, 0, 15]
    for g in r["goals"]:
        assert g["dminus"] * g["dplus"] < 1e-9
    r = solve_goal({"vars": V, "goals": base + [
        {"name": "加班≤10", "a": [0, 0], "dev": [{"goal": 0, "side": "+"}], "target": 10, "want": "le", "priority": 4},
        {"name": "碗30", "a": [1, 0], "target": 30, "want": "ge", "priority": 5, "weight": 4},
        {"name": "杯20", "a": [0, 1], "target": 20, "want": "ge", "priority": 5, "weight": 5}],
        "hard": [{"a": [1, 0], "op": "<=", "b": 30}, {"a": [0, 1], "op": "<=", "b": 20}]})
    assert [v["value"] for v in r["x"]] == [15, 20] and r["levels"][3]["value"] == 5 and r["levels"][4]["value"] == 60
    # 高優先目標不會被犧牲:P1 達成
    r = solve_goal({"vars": [{"name": "x1", "kind": "int"}, {"name": "x2", "kind": "int"}],
                    "goals": [{"a": [80, 40], "target": 3000, "want": "ge", "priority": 1},
                              {"a": [50, 70], "target": 2500, "want": "le", "priority": 2},
                              {"a": [80, 0], "target": 1000, "want": "ge", "priority": 3}]})
    assert r["levels"][0]["achieved"] and all(float(v["value"]).is_integer() for v in r["x"])



def test_nonnegativity_toggle():
    """取消非負限制:free(連續)與 ifree(整數)可以取負值。"""
    base = {"sense": "min", "vars": [{"name": "x1", "kind": "cont"}, {"name": "x2", "kind": "cont"}], "c": [1, 1],
            "constraints": [{"name": "c1", "a": [1, -1], "op": ">=", "b": -5}, {"name": "c2", "a": [1, 0], "op": ">=", "b": -3.5}]}
    r = solve_model(base)
    assert abs(r["z"]) < 1e-9                                   # x ≥ 0 → (0, 0)
    m = copy.deepcopy(base); m["vars"][0]["kind"] = "free"; m["vars"][1]["kind"] = "free"
    m["constraints"].append({"name": "c3", "a": [0, 1], "op": ">=", "b": -2})
    r = solve_model(m)
    assert abs(r["z"] - (-5.5)) < 1e-6                          # x1 = -3.5, x2 = -2
    m["vars"][0]["kind"] = "ifree"
    r = solve_model(m)
    assert r["x"][0]["value"] == -3 and abs(r["z"] - (-5)) < 1e-6
    assert any("為整數(無正負限制)" in ln for ln in r["model_lines"])
    assert r["graph"]["hps"] and r["graph"]["c"] == [1, 1] and r["graph"]["integer"] == [True, False]

if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
