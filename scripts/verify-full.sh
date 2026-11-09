#!/usr/bin/env bash
# 전체 검증 게이트: 정적 검사·빌드 → DB 보안 테스트 → E2E
# 사용: npm run verify:full  (전제: npx supabase start 로 로컬 Supabase 실행 중)
set -euo pipefail

cd "$(dirname "$0")/.."
APP_URL="http://localhost:3000"
STARTED_PID=""

cleanup() {
  if [[ -n "$STARTED_PID" ]]; then
    kill "$STARTED_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

step() { printf '\n==> %s\n' "$1"; }

step "1/3 정적 검사 + 빌드 (npm run verify)"
npm run verify

step "2/3 DB 보안 테스트 (npm run test:db)"
if ! docker ps --format '{{.Names}}' 2>/dev/null | grep -q '^supabase_db_linkedin_intelligence$'; then
  echo "로컬 Supabase가 실행 중이 아닙니다. 'npx supabase start' 후 다시 실행하세요." >&2
  exit 1
fi
npm run test:db

step "3/3 E2E 테스트 (npm run test:e2e)"
if curl -s -o /dev/null -m 5 "$APP_URL/login"; then
  echo "실행 중인 앱($APP_URL)을 사용합니다."
else
  echo "앱이 실행 중이 아니어서 프로덕션 빌드로 기동합니다 (next start)."
  npx next start -p 3000 >/tmp/lih-verify-server.log 2>&1 &
  STARTED_PID=$!
  for _ in $(seq 1 60); do
    curl -s -o /dev/null -m 2 "$APP_URL/login" && break
    sleep 1
  done
fi
npm run test:e2e

printf '\n모든 검증을 통과했습니다.\n'
