# 구현 작업: Phase 2 콘텐츠 수집

- [x] 1. 단위 테스트 환경 구성
  - Node 내장 테스트 러너(`node --test`, strip-types) 사용, `test:unit` 스크립트, `verify` 에 포함
  - 변경 사유: vitest 4/5 설치 시 npm 10.9.2 arborist 오류(`edgesOut`, peer set 계산)가 3회 반복되어 의존성 없는 방식으로 전환. vitest 는 Node 23 공식 미지원
  - `tsconfig` 에 `allowImportingTsExtensions`, `.nvmrc` = 22 (CI 와 동일)
  - _요구사항: 6.1_
  - [x] 1.1 `tests/unit/language.test.ts` 6건 통과

- [x] 2. 외부 요청 안전 계층
  - `net.ts`(`isPublicAddress`), `http.ts`(`safeFetch`: 10초·2MB·UA, 사용자 소스 https 강제·DNS 해석 IP 검사·리다이렉트 재검사, `withRetry`, `mapLimit`)
  - 한계: DNS rebinding(검사와 연결 사이 재해석)은 완전히 막지 못함 → Phase 4 검토
  - _요구사항: 4.2, 4.3_
  - [x] 2.1 사설/루프백/링크로컬/CGNAT/메타데이터/IPv4-mapped/NAT64 차단 단위 테스트

- [x] 3. 소스 어댑터와 파서
  - `rss.ts`(RSS 2.0/Atom, XML 엔티티 선언 거부), `sources.ts`(HN/GitHub/arXiv/HF), `adapters.ts`
  - _요구사항: 1.2, 1.3, 1.4_
  - [x] 3.1 fixture 파싱 단위 테스트 (HTML·스크립트 제거, 위험 스킴 제외, 상대 링크, 500자 요약, 인기 지표, 경로 조작 id 제외)

- [x] 4. 주제 분류
  - `classify.ts`: 영문 단어 경계(rag ≠ storage)·복수형, 한국어 부분 일치, NFC, 주제 언어 조건
  - _요구사항: 2.1, 2.2, 2.3, 2.4_
  - [x] 4.1 분류 단위 테스트

- [x] 5. 마이그레이션 `20261110000000_phase2_collection.sql`
  - 소스 활성화 9개, Microsoft 비활성(410), 사용자 RSS insert 정책·권한 강제 트리거, 수집 이력 조회 정책, 인덱스, `purge_expired_content()`
  - _요구사항: 1.1, 3.5, 4.1, 5.2_
  - [x] 5.1 `rls_test.sql` assert 추가 → 테스트가 트리거의 "조용한 유형 변경" 문제를 발견, 거부 방식으로 수정
  - [x] 5.2 `npx supabase db reset` 후 `npm run test:db` 13/13 통과

- [x] 6. 수집 파이프라인 `pipeline.ts`
  - 소스 격리, 재시도(2회), 주제 일치 콘텐츠만 사용자별 upsert, 사용자 직접 등록 URL 덮어쓰기 방지, content_topics, 로그, last_collected_at, 보관 기간 삭제(cron), 대상 사용자 없으면 외부 요청 생략
  - _요구사항: 1.5, 1.6, 2.5, 3.5, 3.6, 3.7, 5.1, 5.2_

- [x] 7. 실행 진입점
  - `/api/cron/collect`(CRON_SECRET timing-safe, 미설정 503, 불일치 401), `vercel.json`(`0 21 * * *`), Settings "지금 수집"(10분 제한)
  - _요구사항: 3.1, 3.2, 3.3, 3.4_

- [x] 8. Settings UI
  - 콘텐츠 수집 카드(최근 이력 20건, 출처 로고, 자동/수동, 재시도 횟수), 내 RSS 피드(등록 전 안전 요청으로 피드 확인, 활성 토글, 삭제)
  - _요구사항: 3.8, 4.1, 4.4, 4.5_
  - [x] 8.1 E2E: fixture 피드 수집 → 주제 일치 글만 저장·RSS 로고·Agentic AI 주제 연결·이력 "성공", 10분 제한, 사용자 RSS http·127.0.0.1 거부

- [ ] 9. 문서·검증·반영
  - [x] README, `.env.example`(CRON_SECRET, GITHUB_TOKEN), api-feasibility-matrix 갱신
  - [x] 9.1 `npm run verify:full` 통과 (unit 24, DB 13, E2E 19)
  - [x] 9.2 실제 소스 1회 수집(로컬): 미인증 401 확인, 9개 소스 모두 success(약 9초)
  - [ ] 9.3 PR 생성 → CI(`verify-full`) 통과 → 병합
  - [ ] 9.4 운영 배포 후 Vercel Cron 첫 실행 결과 확인 (Supabase Cloud·Vercel 연결 후)
