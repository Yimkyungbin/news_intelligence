#!/usr/bin/env bash
# 비밀값 검사: git 이 추적하는 파일(커밋 예정 포함)에 키 형태 문자열이 있으면 실패
# 사용: npm run check:secrets   (verify 첫 단계, CI 에서도 실행)
# 일치한 값은 출력하지 않고 파일:줄 번호만 표시한다.
set -uo pipefail
cd "$(dirname "$0")/.."

PATTERNS=(
  'sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}'   # OpenAI
  'sb_secret_[A-Za-z0-9_-]{16,}'                    # Supabase secret key
  'sb_publishable_[A-Za-z0-9_-]{16,}'               # Supabase publishable key (실제 프로젝트 키 커밋 방지)
  'gh[pousr]_[A-Za-z0-9]{30,}'                      # GitHub token
  'github_pat_[A-Za-z0-9_]{30,}'
  'AKIA[0-9A-Z]{16}'                                # AWS access key
  'eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}' # JWT (legacy Supabase anon/service_role)
  '-----BEGIN [A-Z ]*PRIVATE KEY-----'
)

# 추적 파일 + 스테이징된 새 파일
FILES=$( { git ls-files; git diff --cached --name-only --diff-filter=A; } | sort -u | grep -vE '^(package-lock\.json|scripts/check-secrets\.sh)$' )

found=0
for p in "${PATTERNS[@]}"; do
  hits=$(echo "$FILES" | xargs -I{} sh -c 'test -f "{}" && grep -nIE -- "$0" "{}" /dev/null' "$p" 2>/dev/null | cut -d: -f1,2)
  if [[ -n "$hits" ]]; then
    found=1
    echo "비밀값으로 보이는 문자열 발견 (패턴: ${p%%[*})"
    echo "$hits" | sed 's/^/  - /'
  fi
done

# .env 계열 실제 설정 파일이 추적되면 실패 (.env.example 제외)
envs=$(git ls-files | grep -E '(^|/)\.env(\..+)?$' | grep -v '\.env\.example$')
if [[ -n "$envs" ]]; then
  found=1
  echo ".env 파일이 git 에 포함되어 있습니다:"
  echo "$envs" | sed 's/^/  - /'
fi

# .env.example 에는 값이 비어 있거나 자리표시자여야 함
if [[ -f .env.example ]]; then
  bad=$(grep -nE '^[A-Z0-9_]*(KEY|SECRET|TOKEN)[A-Z0-9_]*=.+' .env.example | grep -vE '=(<[^>]*>|sb_publishable_\.\.\.|https://<project-ref>\.supabase\.co)\s*$' | cut -d: -f1)
  if [[ -n "$bad" ]]; then
    found=1
    echo ".env.example 에 값이 들어 있습니다 (줄: $(echo $bad | tr ' ' ',')). 실제 값은 .env.local 또는 Vercel 환경변수에 넣으세요."
  fi
fi

if [[ $found -ne 0 ]]; then
  echo "비밀값 검사 실패" >&2
  exit 1
fi
echo "비밀값 검사 통과"
