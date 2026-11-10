# 구현 작업: 대시보드 고도화

- [x] 1. 출처 간 공정한 인기 순위 (`rankContent`)
  - _요구사항: 1.1~1.6_
  - [x] 1.1 단위 테스트 7건. 첫 구현(감쇠 0.8, 꼴찌 0점)에서 GitHub 7/10 독점을 테스트가 발견 → 감쇠 0.7, `(n-idx)/(n+1)` 로 수정 후 통과

- [x] 2. 게시일 기준 차트 (`dailyBuckets`)
  - _요구사항: 2.1, 2.2_
  - [x] 2.1 단위 테스트 (게시일 분산, 게시일 없음 → 수집일)

- [x] 3. 키워드 정리 (`src/lib/keywords.ts`)
  - 수집 저장(`pipeline.ts`)과 표시(`topKeywords`, `ContentCard`, 상세 패널, Trending 필터)에 동일 적용
  - _요구사항: 3.1~3.6_
  - [x] 3.1 단위 테스트 (arXiv 코드, 복합 분류 분리, 하이픈·메타 태그, 복수형 병합, 숫자·길이)

- [x] 4. 항목 설명 (`InfoTip`)
  - 지표 카드 4개 + 섹션 7개(Today's Intelligence, 차트, AI Daily Briefing, Daily/Weekly Top 10, My Topics/Following Update, Recommended Influencers)
  - _요구사항: 4.1~4.4_

- [x] 5. 콘텐츠 상세 보기
  - `getContentDetail` Server Action, `ContentDetailProvider`(`<dialog>`), `OpenDetailButton`, 카드 제목 → 상세 패널, 목록 카드 요약 1줄
  - _요구사항: 5.1~5.6_

- [x] 6. My Topics Update 펼치기 (`TopicUpdateList`)
  - _요구사항: 6.1~6.3_

- [ ] 7. 검증·반영
  - [x] 7.1 E2E 시나리오 추가, 제목 링크 → 버튼 변경에 맞춰 기존 시나리오 갱신
  - [x] 7.2 `npm run verify:full` 통과 (unit 38, DB 13, E2E 20)
    - DB 테스트의 수집 이력 가시성 검사가 "로그 1건"을 가정해 기존 데이터가 있는 DB에서 실패 → 테스트가 넣은 고정 id 기준으로 수정
  - [x] 7.4 실제 수집 데이터 화면 확인: Weekly Top 10 에 Hacker News·GitHub 혼합, 출처 내 순위 표시, 상세 패널·주제 펼치기 동작, 게시일 기준 차트가 11/4~11/10 에 분산
  - [x] 7.3 PR #3 생성 → CI 통과 → 병합 (`9b06574`)
