---
inclusion: always
---

# 테스트 후 반영 규칙 (Test Gate)

코드 변경은 아래 검증 게이트를 통과한 뒤에만 완료로 보고하고 반영(커밋·배포)한다.
검증이 실패하면 원인을 수정하고 게이트를 처음부터 다시 실행한다. 실패한 상태로 "완료"라고 보고하지 않는다.

## 검증 단계

| 단계 | 명령 | 필요 조건 | 언제 |
|---|---|---|---|
| 1. 정적 검사 + 빌드 | `npm run verify` | 없음 | 모든 코드 변경 |
| 2. DB 보안 테스트 | `npm run test:db` | 로컬 Supabase 실행 (`npx supabase start`) | `supabase/migrations`, RLS, 트리거, 데이터 접근 코드 변경 |
| 3. E2E 테스트 | `npm run test:e2e` | 로컬 Supabase + 앱 실행 | 화면, Server Action, 인증, 라우팅 변경 |
| 전체 | `npm run verify:full` | 로컬 Supabase 실행 | 커밋·배포 전 필수 |

- `npm run verify` = `typecheck` → `lint` → `build`
- `npm run verify:full` = `verify` → `test:db` → (앱 미실행 시 `next start` 자동 기동) → `test:e2e`
- Python 실행 환경은 `uv`를 사용한다 (E2E는 `uv run --with playwright==...`).

## Spec 작업(tasks.md) 작성 규칙

- 각 구현 작업에는 검증 하위 작업을 반드시 포함한다.
  - 예: `- [ ] 3.2 My Topics 우선순위 정렬 구현` 아래에 `- [ ] 3.2.1 E2E 시나리오 추가 (scripts/e2e_smoke.py) 및 npm run verify:full 통과`
- 새 기능은 기존 테스트에 시나리오를 추가한다.
  - DB·권한 변경: `supabase/tests/rls_test.sql` 에 assert 추가
  - 화면·흐름 변경: `scripts/e2e_smoke.py` 에 `check(...)` 추가
- 버그 수정은 재현 테스트를 먼저 추가하고(실패 확인), 수정 후 통과를 확인한다.
- 작업을 완료(`[x]`)로 표시하는 조건: 해당 단계의 검증 명령이 모두 통과했을 것.

## 반영(커밋·배포) 규칙

- `main` 에 직접 push 하지 않는다. 기능 브랜치 → PR → 검증 통과 후 병합한다.
- 커밋 전 `npm run verify:full` 결과를 확인한다. 로컬 Supabase를 실행할 수 없는 경우 `npm run verify` 결과와 함께 "DB/E2E 미검증"을 명시한다.
- 마이그레이션은 로컬에서 `npx supabase db reset` 으로 처음부터 적용되는지 확인한 뒤 원격(`npx supabase db push`)에 반영한다. 원격 DB 반영은 사용자 확인 후 진행한다.
- Vercel 배포는 Preview 배포에서 동작을 확인한 뒤 Production으로 승격한다.

## 결과 보고

- 실행한 검증 명령과 결과(통과/실패 수)를 보고에 포함한다.
- 실행하지 못한 검증이 있으면 이유와 함께 명시한다.
- 테스트 중 생성한 임시 파일·계정·프로세스는 정리한다 (E2E 계정은 테스트 마지막 단계에서 삭제됨).
