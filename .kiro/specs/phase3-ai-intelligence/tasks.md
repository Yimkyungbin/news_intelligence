# 구현 작업: Phase 3 AI 분석

- [x] 1. 비밀값 유출 방지
  - GitHub Secret Scanning·푸시 보호 활성화, `scripts/check-secrets.sh` 를 `verify` 첫 단계로 연결
  - _요구사항: 7.1, 7.2_
  - [x] 1.1 정상 저장소 통과, 가짜 키 스테이징·`.env.example` 값 입력 시 실패 확인

- [x] 2. 마이그레이션 `20261111000000_phase3_ai.sql`
  - _요구사항: 1.3, 6.3_
  - [x] 2.1 `rls_test.sql` +3 (위조 차단, 모델 값 제한, 격리) → 16/16 통과

- [x] 3. AI 코어 (스키마·게이트·프롬프트·OpenAI·모의 AI·Provider)
  - _요구사항: 1.1, 1.2, 1.4, 1.5, 1.6, 3.2, 6.1, 6.4_
  - [x] 3.1 단위 테스트 22건. 첫 실행에서 Node strip-types 가 생성자 매개변수 속성(`readonly x`)을 지원하지 않아 실패 → 명시적 필드로 변경 (`FetchError` 포함)

- [x] 4. AI 서비스·동의
  - 요약·일괄 처리·동의/철회(결과 삭제)·주제 인사이트·일일 한도 50·작업 이력
  - 직접 등록 콘텐츠 관심 주제 자동 연결
  - _요구사항: 2.1~2.4, 3.1, 4.1~4.4, 6.2_

- [x] 5. Daily Briefing
  - `compose.ts`(섹션 1~4, 6), `service.ts`(AI 섹션, 재시도 3회, upsert), Cron `/api/cron/briefing` (`0 22 * * *`)
  - _요구사항: 5.1~5.7_

- [x] 6. UI
  - 상세 패널 AI 영역(동의·생성·철회·인사이트), 대시보드 브리핑 카드, `/briefing`, 주제 AI 인사이트 카드, Settings 모델·AI 상태
  - _요구사항: 3.3, 4.2, 5.6_

- [ ] 7. 검증·반영
  - [x] 7.1 E2E `Phase 3 AI` 추가, `verify-full.sh` 가 모의 AI 서버를 직접 기동하도록 변경
    - 첫 실행에서 테스트 선택자 중복(라벨과 모의 문구가 같은 단어 포함) → exact 일치로 수정 후 21/21
  - [x] 7.2 `npm run verify:full` 통과 (secrets, unit 60, DB 16, E2E 21)
  - [ ] 7.3 PR → CI 통과 → 병합
  - [ ] 7.4 실제 OpenAI 키로 로컬 1~2건 확인 (요약 1건, 브리핑 AI 섹션 1회)
