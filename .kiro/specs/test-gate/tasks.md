# 구현 작업: 테스트 후 반영 (Test Gate)

- [x] 1. 검증 npm 스크립트 구성
  - `typecheck`, `lint`(`eslint src`), `verify`, `test:db`, `test:e2e`, `verify:full`
  - _요구사항: 1.1, 1.2, 1.3_
  - [x] 1.1 `npm run verify` 통과 확인

- [x] 2. 전체 게이트 스크립트 작성
  - `scripts/verify-full.sh`: Supabase 실행 확인, 앱 미실행 시 `next start` 기동, `trap` 정리
  - _요구사항: 1.4, 1.5_
  - [x] 2.1 `npm run verify:full` 통과 (verify, DB 9/9, E2E 17/17), 기동한 서버 종료 확인

- [x] 3. 테스트 스위트 구축
  - `supabase/tests/rls_test.sql` (트랜잭션 + ROLLBACK)
  - `scripts/e2e_smoke.py` (계정 생성 → 마지막에 삭제로 정리)
  - _요구사항: 3.1, 3.2, 3.3_

- [x] 4. Kiro 규칙 및 Hook 등록
  - `.kiro/steering/test-before-merge.md` (`inclusion: always`)
  - `.kiro/hooks/verify-after-task.json` (PostTaskExec → `npm run verify`)
  - _요구사항: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2_

- [ ] 5. Git 저장소 초기화 및 브랜치 전략 적용
  - _요구사항: 4.1_
  - [x] 5.1 `git init -b main`, 첫 커밋(`8d7d082`), 원격 `https://github.com/Yimkyungbin/news_intelligence` 연결 및 push
    - 빈 저장소라 첫 커밋만 `main` 에 직접 push (이후 변경은 기능 브랜치 → PR)
  - [x] 5.2 커밋 전 `npm run verify:full` 통과 (DB 9/9, E2E 18/18), `.env.local` 미포함, 비밀값 패턴 검사, `supabase/.branches`·`supabase/.temp` 제외
  - [x] 5.3 `main` 보호 규칙: PR 필수(승인 0명), 관리자 포함 적용, 강제 push·삭제 금지, 대화 해결 필수, 필수 상태 검사 `verify-full`(strict)
    - 확인: `main` 직접 push 시 `GH006 Protected branch update failed` 로 거부됨

- [x] 6. GitHub Actions CI 구성
  - `.github/workflows/verify.yml`: Node 22 → `npm ci` → uv → `npx supabase start` → `.env.local`(로컬 기본 키) → Playwright → `npm run verify:full`, 실패 시 로그·스크린샷 아티팩트
  - 러너 `ubuntu-24.04` 고정 (첫 실행에서 `ubuntu-latest`=26.04 를 Playwright 1.55 가 지원하지 않아 실패 → 수정)
  - `verify-full` 을 필수 상태 검사로 지정
  - _요구사항: 4.2_
  - [x] 6.1 실패 감지 확인: 첫 실행이 실제로 실패(Playwright 설치 단계)하여 PR 상태가 실패로 표시됨
  - [x] 6.2 정상 PR(#1)에서 워크플로 통과(3분 58초) 후 병합 (`2cdac4a`)
  - [ ] 6.3 필수 상태 검사 등록 이후, 실패 상태 PR 의 병합 버튼이 차단되는지 확인 (다음 실패 PR 발생 시)

- [ ] 7. 마이그레이션 반영 절차 검증
  - 로컬 `npx supabase db reset` → `npm run test:db` 통과 → 사용자 확인 → `npx supabase db push`
  - _요구사항: 4.3_
  - [ ] 7.1 `db reset` 후 `npm run verify:full` 통과

- [ ] 8. Vercel Preview → Production 절차 적용
  - PR별 Preview 배포 확인 후 Production 승격
  - _요구사항: 4.4_
  - [ ] 8.1 Preview URL에서 로그인·주요 메뉴 수동 확인 결과 기록
