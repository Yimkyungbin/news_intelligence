# 설계 문서: 테스트 후 반영 (Test Gate)

## 개요

검증은 로컬 게이트(개발자·Kiro 실행)와 CI 게이트(PR 시 자동 실행) 두 곳에서 동일한 명령으로 수행한다. 명령은 `package.json` 스크립트로 통일해 로컬과 CI의 기준이 달라지지 않게 한다.

## 아키텍처

```
코드 변경
  │
  ├─ Spec 작업 완료 ──> PostTaskExec Hook ──> npm run verify
  │
  ├─ 커밋 전 ─────────> npm run verify:full
  │                       ├─ verify   (typecheck → lint → build)
  │                       ├─ test:db  (rls_test.sql, 트랜잭션 + ROLLBACK)
  │                       └─ test:e2e (Playwright, next start 자동 기동)
  │
  └─ PR ─────────────> GitHub Actions (예정): supabase start → verify:full
                          │ 통과
                          ▼
                       main 병합 → Vercel Preview 확인 → Production 승격
                       (마이그레이션: 로컬 db reset 확인 → 사용자 확인 → db push)
```

## 컴포넌트

| 컴포넌트 | 위치 | 내용 |
|---|---|---|
| `typecheck` | `package.json` | `next typegen && tsc --noEmit` |
| `lint` | `package.json` | `eslint src` |
| `verify` | `package.json` | typecheck → lint → build |
| `test:db` | `package.json` | `supabase/tests/rls_test.sql`을 로컬 DB 컨테이너에서 `ON_ERROR_STOP=1`로 실행 |
| `test:e2e` | `package.json` | `uv run --with playwright==1.55.0 python scripts/e2e_smoke.py` |
| `verify:full` | `scripts/verify-full.sh` | 전체 게이트, Supabase 실행 확인, 앱 자동 기동·정리 |
| Hook | `.kiro/hooks/verify-after-task.json` | PostTaskExec → `npm run verify` |
| Steering | `.kiro/steering/test-before-merge.md` | Kiro 작업 규칙 (항상 포함) |
| CI (예정) | `.github/workflows/verify.yml` | PR마다 verify:full |

### 테스트 스위트 현황

| 스위트 | 항목 수 | 범위 |
|---|---|---|
| `rls_test.sql` | 9 | 가입 시드, 사용자 격리, 카탈로그 읽기 전용, AI 권한 상승 차단, provenance 위조 차단, 타 사용자 명의 쓰기 차단, ai_insights 읽기 전용, 교차 소유 참조 차단, 계정 삭제 cascade |
| `e2e_smoke.py` | 18 | 인증 흐름, 8개 메뉴, Topics/Following/Saved CRUD, URL·XSS 검증, 출처 로고, 언어 판별·필터, 검색, 설정, 다크 모드, 모바일, NFC 정규화, 계정 삭제, 런타임 오류 없음 |

## 데이터 모델

변경 없음. DB 테스트는 트랜잭션 후 ROLLBACK하고, E2E는 매 실행마다 임의 이메일 계정을 만든 뒤 마지막 단계에서 계정 삭제로 정리한다.

## 오류 처리

- 각 단계는 실패 시 즉시 중단한다 (`set -euo pipefail`, `ON_ERROR_STOP=1`, 실패 시 종료 코드 1).
- `verify-full.sh`는 `trap`으로 자신이 기동한 `next start` 프로세스를 항상 종료한다.
- 로컬 Supabase가 없으면 원인과 해결 명령(`npx supabase start`)을 출력한다.

## 테스트 전략

- 게이트 자체 검증: `npm run verify:full`이 전체 통과하는지 확인한다.
- 실패 감지 검증: 의도적으로 실패하는 조건(예: NFC 미정규화)에서 해당 테스트가 실패하는지 확인한다.
- CI 검증: 실패하는 커밋으로 PR을 열어 병합이 차단되는지 확인한다 (CI 구축 후).
