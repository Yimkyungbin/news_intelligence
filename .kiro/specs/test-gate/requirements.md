# 요구사항 문서: 테스트 후 반영 (Test Gate)

## 소개

실제 개발 코드는 자동화된 검증을 통과한 뒤에만 완료로 보고하고 저장소·배포 환경에 반영한다. 이 Spec은 검증 단계, 실행 명령, Spec 작업 완료 조건, 커밋·배포 절차를 정의한다.

규칙 원문: `.kiro/steering/test-before-merge.md`

## 요구사항

### 요구사항 1: 단계별 검증 명령

**사용자 스토리:** 개발자로서, 나는 하나의 명령으로 변경 사항을 검증하고 싶다. 그래야 누락 없이 같은 기준으로 확인할 수 있다.

#### 인수 기준

1. WHEN 개발자가 `npm run verify`를 실행하면 THE SYSTEM SHALL 타입 검사, 린트, 프로덕션 빌드를 순서대로 실행하고 하나라도 실패하면 0이 아닌 종료 코드를 반환한다.
2. WHEN 개발자가 `npm run test:db`를 실행하면 THE SYSTEM SHALL 로컬 DB에서 RLS·권한 트리거 테스트를 트랜잭션 내에서 실행하고 종료 시 롤백한다.
3. WHEN 개발자가 `npm run test:e2e`를 실행하면 THE SYSTEM SHALL 브라우저로 주요 사용자 흐름을 검증하고 실패 항목을 출력한다.
4. WHEN 개발자가 `npm run verify:full`을 실행하면 THE SYSTEM SHALL verify → test:db → test:e2e를 실행하고, 앱이 실행 중이 아니면 `next start`로 기동한 뒤 종료 시 정리한다.
5. IF 로컬 Supabase가 실행 중이 아니라면 THEN THE SYSTEM SHALL 안내 메시지와 함께 실패한다.

### 요구사항 2: Spec 작업 완료 조건

**사용자 스토리:** 프로젝트 오너로서, 나는 "완료" 표시된 작업이 실제로 테스트를 통과했기를 원한다. 그래야 진행 상황을 신뢰할 수 있다.

#### 인수 기준

1. WHEN tasks.md에 구현 작업을 작성하면 THE SYSTEM SHALL 각 작업에 검증 하위 작업(테스트 추가 및 검증 명령 통과)을 포함한다.
2. WHEN Spec 작업이 완료되면 THE SYSTEM SHALL `npm run verify`를 자동 실행한다 (PostTaskExec Hook).
3. IF 검증이 실패하면 THEN THE SYSTEM SHALL 작업을 완료로 보고하지 않고 원인을 수정한 뒤 검증을 처음부터 다시 실행한다.
4. WHEN 버그를 수정하면 THE SYSTEM SHALL 재현 테스트를 먼저 추가해 실패를 확인한 뒤 수정한다.

### 요구사항 3: 테스트 시나리오 유지

**사용자 스토리:** 개발자로서, 나는 새 기능이 기존 테스트 스위트에 추가되기를 원한다. 그래야 회귀를 막을 수 있다.

#### 인수 기준

1. WHEN DB 스키마·RLS·트리거가 변경되면 THE SYSTEM SHALL `supabase/tests/rls_test.sql`에 assert를 추가한다.
2. WHEN 화면·Server Action·인증 흐름이 변경되면 THE SYSTEM SHALL `scripts/e2e_smoke.py`에 `check(...)` 시나리오를 추가한다.
3. THE SYSTEM SHALL 테스트 중 생성한 계정·프로세스·임시 파일을 정리한다.

### 요구사항 4: 반영 절차

**사용자 스토리:** 프로젝트 오너로서, 나는 검증되지 않은 코드가 main과 운영 환경에 들어가지 않기를 원한다. 그래야 운영 장애를 줄일 수 있다.

#### 인수 기준

1. THE SYSTEM SHALL main 브랜치에 직접 push하지 않고 기능 브랜치와 PR을 사용한다.
2. WHEN PR이 생성·갱신되면 THE SYSTEM SHALL CI에서 `npm run verify:full`을 실행하고 실패 시 병합을 차단한다.
3. WHEN 마이그레이션을 원격 DB에 반영하기 전에 THE SYSTEM SHALL 로컬 `npx supabase db reset`으로 처음부터 적용되는지 확인하고, 원격 반영은 사용자 확인 후 진행한다.
4. WHEN Vercel에 배포하면 THE SYSTEM SHALL Preview 배포에서 확인한 뒤 Production으로 승격한다.

### 요구사항 5: 결과 보고

**사용자 스토리:** 프로젝트 오너로서, 나는 무엇을 검증했고 무엇을 못 했는지 알고 싶다. 그래야 위험을 판단할 수 있다.

#### 인수 기준

1. WHEN 작업 결과를 보고하면 THE SYSTEM SHALL 실행한 검증 명령과 통과/실패 수를 포함한다.
2. IF 실행하지 못한 검증이 있다면 THEN THE SYSTEM SHALL 그 이유를 명시한다 (예: "DB/E2E 미검증: 로컬 Supabase 미실행").
