#!/usr/bin/env bash
# ============================================================
# scripts/smoke-e2e.sh —— 发布门禁:可自动执行的 E2E 冒烟(AGENT_07)
# 覆盖:backend 启动 → /api/health(evidence_db) → /api/route 路由
#       → 证据落库 save/query → daemon MCP(stdio) tools/list + EXT_NOT_CONNECTED。
# 扩展加载与真实浏览器全链路(browser_navigate → snapshot → 证据 → 报告引用)
# 无法无头执行,按 docs/E2E_SMOKE.md 手工清单逐项勾选。
# 用法:bash scripts/smoke-e2e.sh        (仓库根目录执行)
# ============================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${SMOKE_BACKEND_PORT:-8123}"
BASE="http://127.0.0.1:${PORT}"
BACKEND_PID=""
PASS=0; FAIL=0

ok()   { echo "PASS  $1"; PASS=$((PASS+1)); }
bad()  { echo "FAIL  $1"; FAIL=$((FAIL+1)); }
step() { echo "---- $1 ----"; }

cleanup() {
  [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT

step "1/4 启动 backend(127.0.0.1:${PORT})"
cd "$ROOT/backend"
# 冒烟不依赖真实 LLM:占位 key 走既有降级闸门(utils/api_key.py),路由/证据链路零 LLM 依赖
export LLM_API_KEY="${LLM_API_KEY:-sk-smoke-placeholder}"
# 证据写入临时库,不污染真实 data/moirca.db
export DATABASE_PATH="${DATABASE_PATH:-/tmp/webbridge-smoke-moirca.db}"
rm -f /tmp/webbridge-smoke-moirca.db
HOST=127.0.0.1 PORT="$PORT" DEBUG=false python3 run.py > /tmp/webbridge-smoke-backend.log 2>&1 &
BACKEND_PID=$!
for _ in $(seq 1 60); do
  if curl -sf "$BASE/api/health" > /dev/null 2>&1; then break; fi
  sleep 0.5
done
HEALTH="$(curl -sf "$BASE/api/health")" || { bad "backend 未就绪"; exit 1; }
echo "$HEALTH" | grep -q '"ok": *true\|"ok":true' && ok "GET /api/health ok=true" || bad "health ok 字段异常: $HEALTH"
echo "$HEALTH" | grep -q '"evidence_db": *true\|"evidence_db":true' && ok "health.evidence_db=true(证据表已挂载)" || bad "evidence_db 非 true: $HEALTH"

step "2/4 意图路由 /api/route"
ROUTE="$(curl -sf -X POST "$BASE/api/route" -H 'content-type: application/json' \
  -d '{"text":"帮我对比华科和武大的计算机专业"}')"
echo "$ROUTE" | grep -q '"label": *"deep_research"\|"label":"deep_research"' \
  && ok "POST /api/route → deep_research" || bad "route 响应异常: $ROUTE"

step "3/4 证据落库 save → query(幂等真源)"
SAVE="$(curl -sf -X POST "$BASE/api/evidence/save" -H 'content-type: application/json' \
  -d '{"channel":"controlled_browse","url":"https://www.moe.gov.cn/smoke.html","title":"冒烟样本","quote":"冒烟测试:阳光招生政策原文引用。","task_id":"task_SMOKE"}')"
EVID="$(echo "$SAVE" | python3 -c 'import sys,json;print(json.load(sys.stdin)["evidence_id"])')"
[ -n "$EVID" ] && ok "POST /api/evidence/save → $EVID" || bad "save 响应异常: $SAVE"
Q="$(curl -sf "$BASE/api/evidence/query?task_id=task_SMOKE&evidence_id=$EVID")"
echo "$Q" | grep -q "$EVID" && ok "GET /api/evidence/query 回查命中" || bad "query 未命中: $Q"
DUP="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/evidence/save" \
  -H 'content-type: application/json' \
  -d "{\"evidence_id\":\"$EVID\",\"channel\":\"controlled_browse\",\"url\":\"https://www.moe.gov.cn/smoke.html\",\"quote\":\"冒烟测试:阳光招生政策原文引用。\",\"task_id\":\"task_SMOKE\"}")"
[ "$DUP" = "200" ] && ok "重放同 evidence_id → 200 幂等" || bad "幂等重放返回 $DUP"

step "4/4 daemon MCP(stdio) 冒烟:tools/list + 无扩展降级"
cd "$ROOT/daemon"
if [ ! -f dist/index.js ]; then
  echo "(dist/index.js 不存在,先构建 daemon)"
  npm run build > /dev/null 2>&1 || { bad "daemon 构建失败"; }
fi
if npm run --silent test:e2e > /tmp/webbridge-smoke-daemon.log 2>&1; then
  ok "daemon MCP stdio 冒烟(tools/list=15 工具 / EXT_NOT_CONNECTED / token 0600)"
else
  bad "daemon 冒烟失败,详见 /tmp/webbridge-smoke-daemon.log"
fi

echo "----------------------------------------"
echo "自动冒烟: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
echo "剩余人工步骤(扩展/真浏览器)见 docs/E2E_SMOKE.md,勾选完毕方视为发布门禁通过。"
