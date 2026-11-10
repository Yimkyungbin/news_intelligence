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
# E2E 는 항상 모의 AI(AI_PROVIDER=mock)로 직접 기동한 서버에서 실행한다.
# 이미 떠 있는 개발 서버를 재사용하면 실제 OpenAI 키로 호출될 수 있어 거부한다.
if curl -s -o /dev/null -m 3 "$APP_URL/login"; then
  echo "포트 3000 에서 앱이 실행 중입니다. E2E 는 모의 AI 서버를 직접 띄워야 하므로 실행 중인 앱(npm run dev 등)을 종료한 뒤 다시 실행하세요." >&2
  exit 1
fi
echo "프로덕션 빌드를 모의 AI 모드로 기동합니다 (AI_PROVIDER=mock next start)."
# ADMIN_EMAILS=@test.local : E2E 계정(임의 @test.local)을 운영자로 취급해 출처 AI 허용 흐름을 검증
AI_PROVIDER=mock ADMIN_EMAILS=@test.local npx next start -p 3000 >/tmp/lih-verify-server.log 2>&1 &
STARTED_PID=$!
for _ in $(seq 1 60); do
  curl -s -o /dev/null -m 2 "$APP_URL/login" && break
  sleep 1
done
npm run test:e2e

printf '\n모든 검증을 통과했습니다.\n'
