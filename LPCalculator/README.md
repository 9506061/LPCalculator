# 網頁版管理數學計算器(線性規劃 / 整數規劃 / 網路模式 / 目標規劃)

## 執行
```
pip install -r requirements.txt
python app.py          # 瀏覽器開啟 http://127.0.0.1:5000
python tests/test_core.py
```

## 功能
| 分頁 | 內容 |
|---|---|
| 一般線性規劃 | 任意 LP / 整數 / 0-1 / 混合整數規劃,含限制式分析、影子價格、二維圖形 |
| 管理科學範本 | 基本模型:運輸、指派、混合、生產計劃 |
| | W6 整數規劃:0-1 方案選擇(互斥、強制選擇、k 選 n、若 P 則 Q、共軛…)、固定費用與設施區位、區域涵蓋 |
| | W8 網路模式:轉運模式、最短路徑、最大流量(含網路圖、流量平衡檢查、最小割) |
| 目標規劃 | W10 Goal Programming:離差變數、優先順序逐層求解、同層加權、目標中的目標、系統限制式 |

## 檔案
- `app.py` Flask 後端(/api/solve、/api/template/<kind>、/api/goal)
- `lp_core.py` 求解核心(HiGHS)、限制式分析、影子價格、管理意涵、圖形資料
- `templates_ms.py` 基本範本:運輸、指派、混合、生產計劃
- `templates_ext.py` W6/W8 範本:0-1 方案選擇、設施區位、區域涵蓋、轉運、最短路徑、最大流量
- `goal_core.py` W10 目標規劃(Preemptive Goal Programming)求解
- `static/` 前端(index.html、app.js、ext.js、goal.js、style.css)
- `tests/test_core.py` 單元測試(含課本例題答案驗證)
