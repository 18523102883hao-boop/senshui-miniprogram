#!/usr/bin/env bash
# 云函数部署脚本（走微信开发者工具 CLI）
#
# 为什么不用 cloudbase CLI：
#   cloudbase login 存的是 2 小时有效期的临时密钥（auth.json 的 tmpExpired），
#   refreshToken 虽有 30 天但 CLI 不自动续期 —— 所以总是"登录成功后没多久就无有效身份信息"。
#   微信开发者工具 CLI 直接复用 IDE 的登录态，不会过期。
#
# 前置条件（一次性）：
#   微信开发者工具 → 设置 → 安全设置 → 服务端口：开启
#
# 用法：
#   scripts/deploy-functions.sh                    部署本轮全部待部署函数
#   scripts/deploy-functions.sh fn1 fn2 ...        只部署指定函数
#   scripts/deploy-functions.sh --list             列出云端已有函数
set -uo pipefail

CLI="/Applications/wechatwebdevtools.app/Contents/MacOS/cli"
ENV_ID="cloud1-d4gzkwy3w150d2fd2"
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BATCH_SIZE=4 # 一次传太多容易超时

# 本轮功能扩展需要部署/重新部署的函数
DEFAULT_FUNCTIONS=(
  # Task 2 首页与内容
  seedPortalContent getHomePortal listArticles getArticle initDb
  # Task 6 票种目录
  listTicketProducts getTicketProduct seedTicketProducts
  # Task 7 下单出票（payCallback 为改动，需重新部署）
  createTicketOrder getMyTickets getTicketCode payCallback
  # Task 8 核销退款
  verifyTicket requestTicketRefund
  # Task 9 团队预约
  getReservationConfig createVisitReservation getMyReservations getVisitReservation cancelVisitReservation
  # 头像（此前遗留未部署）
  updateAvatar
)

if [ ! -x "$CLI" ]; then
  echo "✖ 找不到微信开发者工具 CLI：$CLI"
  exit 1
fi

check_port() {
  if ! "$CLI" cloud functions list --env "$ENV_ID" --project "$PROJECT" 2>&1 | grep -q "service port disabled\|服务端口已关闭"; then
    return 0
  fi
  cat <<'TIP'
✖ 开发者工具的服务端口没开，CLI 无法调用。

  打开微信开发者工具 → 设置 → 安全设置 → 把「服务端口」打开（只需一次）

开启后重新运行本脚本即可。
TIP
  return 1
}

if [ "${1:-}" = "--list" ]; then
  check_port || exit 1
  "$CLI" cloud functions list --env "$ENV_ID" --project "$PROJECT" 2>&1 | grep -v DeprecationWarning
  exit 0
fi

if [ $# -gt 0 ]; then
  FUNCTIONS=("$@")
else
  FUNCTIONS=("${DEFAULT_FUNCTIONS[@]}")
fi

# 只保留本地真实存在的函数目录，避免因拼错名字整批失败
VALID=()
for fn in "${FUNCTIONS[@]}"; do
  if [ -d "$PROJECT/cloudfunctions/$fn" ]; then
    VALID+=("$fn")
  else
    echo "⚠ 跳过（本地无此目录）：$fn"
  fi
done

if [ ${#VALID[@]} -eq 0 ]; then
  echo "✖ 没有可部署的函数"
  exit 1
fi

echo "环境：$ENV_ID"
echo "待部署 ${#VALID[@]} 个函数：${VALID[*]}"
echo ""

check_port || exit 1

FAILED=()
total=${#VALID[@]}
i=0
while [ $i -lt $total ]; do
  batch=("${VALID[@]:$i:$BATCH_SIZE}")
  echo "──── 批次 $((i / BATCH_SIZE + 1))：${batch[*]}"
  # -r：依赖在云端安装，不上传本地 node_modules
  if "$CLI" cloud functions deploy \
      --env "$ENV_ID" \
      --names "${batch[@]}" \
      --project "$PROJECT" \
      --remote-npm-install 2>&1 | grep -v "DeprecationWarning\|trace-deprecation"; then
    echo "✓ 批次完成"
  else
    echo "✖ 批次失败：${batch[*]}"
    FAILED+=("${batch[@]}")
  fi
  echo ""
  i=$((i + BATCH_SIZE))
done

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "✖ 以下函数部署失败，可单独重试：${FAILED[*]}"
  echo "  scripts/deploy-functions.sh ${FAILED[*]}"
  exit 1
fi

echo "✓ 全部部署完成"
echo ""
echo "接下来还需要在云开发控制台配置环境变量（见 scripts/db-init.md）："
echo "  createTicketOrder / requestTicketRefund → SUB_MCH_ID"
echo "  getTicketCode / verifyTicket           → TICKET_QR_SECRET（两者必须相同）"
