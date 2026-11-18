import os
import threading
import webbrowser

from flask import Flask, jsonify, request, send_from_directory

from goal_core import solve_goal
from lp_core import ModelError, model_lines, normalize_model, solve_model
from templates_ms import TEMPLATES

BASE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__, static_folder=os.path.join(BASE, "static"), static_url_path="/static")


@app.get("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.errorhandler(ModelError)
def handle_model_error(e):
    return jsonify({"error": str(e)}), 400


@app.post("/api/solve")
def api_solve():
    return jsonify(solve_model(request.get_json(force=True, silent=True) or {}))


@app.post("/api/goal")
def api_goal():
    return jsonify(solve_goal(request.get_json(force=True, silent=True) or {}))


@app.post("/api/template/<kind>")
def api_template(kind):
    if kind not in TEMPLATES:
        return jsonify({"error": "找不到這個範本。"}), 404
    body = request.get_json(force=True, silent=True) or {}
    action = body.get("action", "solve")
    data = body.get("data") or {}
    build, extra = TEMPLATES[kind]
    model, note = build(data)
    if action == "build":
        norm = normalize_model(model)
        return jsonify({"model_lines": model_lines(norm), "n_vars": len(norm["vars"]),
                        "n_constraints": len(norm["constraints"]), "note": note})
    res = solve_model(model)
    res["note"] = note
    res["extra"] = extra(data, res) if extra else None
    return jsonify(res)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    if os.environ.get("NO_BROWSER") != "1":
        threading.Timer(1.0, lambda: webbrowser.open(f"http://127.0.0.1:{port}")).start()
    app.run(host="127.0.0.1", port=port, debug=False)
