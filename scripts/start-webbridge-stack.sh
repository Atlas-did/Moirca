#!/usr/bin/env bash
# WebBridge 全套一键启动:mihomo 代理 → Moirca backend → daemon → Chrome(扩展+代理)
# 用法:bash start-webbridge-stack.sh
# 说明:
#   - 已在跑的组件自动跳过(幂等,可重复执行)
#   - daemon 令牌存在 /tmp/wb-token.txt,/tmp 被清则自动生成新令牌
#     (新令牌需重新粘贴到扩展 popup 的「配对 token」框)
set -uo pipefail

WB=/home/user/ClawsGO/高考辅助/workspace/webbridge-build
LOG=/tmp

echo "== 1/4 mihomo 代理(:7890) =="
if ss -tln 2>/dev/null | grep -q ':7890 '; then
  echo "   已在运行,跳过"
else
  (cd ~/clash && nohup ./mihomo -d . -f sub1.yaml > $LOG/mihomo.log 2>&1 &)
  sleep 3
  ss -tln 2>/dev/null | grep -q ':7890 ' && echo "   已启动" || echo "   ⚠ 启动失败,看 $LOG/mihomo.log"
fi

echo "== 2/4 Moirca backend(:8000) =="
if ss -tln 2>/dev/null | grep -q ':8000 '; then
  echo "   已在运行,跳过"
else
  (cd "$WB/backend" && nohup python3 run.py > $LOG/backend.log 2>&1 &)
  sleep 5
  ss -tln 2>/dev/null | grep -q ':8000 ' && echo "   已启动" || echo "   ⚠ 启动失败,看 $LOG/backend.log"
fi

echo "== 3/4 WebBridge daemon(:9223) =="
if ss -tln 2>/dev/null | grep -q ':9223 '; then
  echo "   已在运行,跳过"
else
  [ -s /tmp/wb-token.txt ] || od -An -tx1 -N32 /dev/urandom | tr -d ' \n' > /tmp/wb-token.txt
  (cd "$WB/daemon" && WEBBRIDGE_TOKEN=$(cat /tmp/wb-token.txt) \
    WEBBRIDGE_EVIDENCE_URL=http://127.0.0.1:8000/api/evidence/save \
    nohup node dist/index.js > $LOG/daemon.log 2>&1 &)
  sleep 3
  ss -tln 2>/dev/null | grep -q ':9223 ' && echo "   已启动" || echo "   ⚠ 启动失败,看 $LOG/daemon.log"
fi

echo "== 4/4 Chrome(代理+WebBridge 扩展) =="
CHROME_BIN="$(ls /opt/chrome-linux64/chrome 2>/dev/null \
  || ls ~/clash/chrome-for-testing/chrome-linux64/chrome 2>/dev/null \
  || which google-chrome chromium chromium-browser 2>/dev/null | head -1)"
[ -z "$CHROME_BIN" ] && { echo "   ⚠ 未找到 Chrome 可执行文件,请手工指定 CHROME_BIN"; exit 1; }
if pgrep -f "chrome.*webbridge-build/extension/dist-pro" > /dev/null 2>&1; then
  echo "   已有带扩展的 Chrome 在运行,跳过(关闭它后再跑本脚本可重启)"
else
  DISPLAY=${DISPLAY:-:99} nohup "$CHROME_BIN" \
    --no-first-run --no-default-browser-check \
    --proxy-server=http://127.0.0.1:7890 \
    --load-extension="$WB/extension/dist-pro" \
    --start-maximized > $LOG/chrome-webbridge.log 2>&1 &
  sleep 2
  echo "   已启动(DISPLAY=${DISPLAY:-:99})"
fi

echo
echo "========================================================="
echo "daemon 配对 token(粘贴到扩展 popup 的「配对 token」框):"
cat /tmp/wb-token.txt
echo "提醒:chrome://extensions 里 Developer mode 必须保持开启,"
echo "     否则 Chrome 会禁用未上架扩展(真机踩过两次的坑)。"
echo "========================================================="
