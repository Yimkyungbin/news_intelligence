# 구현 작업: 한국어 처리

- [ ] 0. Kiro 채팅 응답 한국어 적용 (최우선)
  - [x] 0.1 `.kiro/steering/korean-language.md` 최상단에 "0. 최우선 규칙: Kiro 채팅창은 항상 한국어" 추가
    - 적용 범위: 최종 답변, 중간 진행 안내, 도구 호출 설명, 질문·계획, 세션 제목·상태, Hook·워크플로 이름
    - 예외(코드·명령어·경로·로그 원문)와 금지 예시, 전송 전 자체 점검 명시
  - [x] 0.2 기존 "응답" 섹션을 최우선 규칙으로 통합 (중복 제거)
  - [x] 0.3 사용자 전역 규칙 추가: `~/.kiro/steering/korean-chat.md` (`inclusion: always`, 모든 워크스페이스 적용)
  - [ ] 0.4 사용자 확인: 다음 작업에서 채팅창의 중간 안내·도구 설명·최종 답변이 모두 한국어로 표시되는지 확인
  - _요구사항: 0.1, 0.2, 0.3, 0.4, 0.5, 0.6_

- [x] 1. 한국어 작성 규칙 steering 추가
  - `.kiro/steering/korean-language.md` (`inclusion: always`)
  - Spec 문서, EARS 키워드, 코드 주석, UI 문구, 커밋 메시지 규칙
  - _요구사항: 1.1, 1.2, 1.3, 2.1, 2.2_

- [x] 2. 표시 로케일·폰트 적용
  - `formatDate`, `formatDateTime` 에 `ko-KR`, `Asia/Seoul` 적용
  - `globals.css` 폰트 스택에 Apple SD Gothic Neo, Noto Sans KR 포함, `<html lang="ko">`
  - _요구사항: 2.3, 2.4_
  - [x] 2.1 E2E 대시보드·화면 렌더링 시나리오 통과 (`npm run test:e2e`)

- [x] 3. 입력 NFC 정규화
  - `src/lib/validation.ts` 에 `text()` 스키마 추가, 기존 `z.string().trim()` 대체
  - `splitList()` 항목별 `normalize("NFC")`
  - 폴더명·프로필 이름·가입 이름 Server Action 적용, 비밀번호 제외
  - _요구사항: 3.1, 3.2, 3.3, 3.4_
  - [x] 3.1 E2E `한국어 입력 NFC 정규화 저장` 시나리오 추가 (`scripts/e2e_smoke.py`)
  - [x] 3.2 정규화 누락 시 테스트가 실패하는지 확인 (DB에서 NFD ≠ NFC 비교 결과 `f`)
  - [x] 3.3 `npm run verify:full` 통과 (verify, DB 9/9, E2E 17/17)

- [x] 4. 콘텐츠 언어 판별
  - `src/lib/language.ts` 에 `detectLanguage(...parts)` 구현 (한글 비율 ≥ 0.3 → `ko`)
  - `addManualContent` 에서 제목·요약으로 `language` 저장 (기존: DB 기본값 `en` 고정)
  - 추가 수정: `listContent` 기간 필터가 `published_at` 만 비교해 게시일 없는 직접 등록 콘텐츠가 Trending/Dashboard에서 누락됨 → 게시일이 없으면 `collected_at` 기준으로 판단
  - _요구사항: 4.1_
  - [x] 4.1 E2E 재현 테스트 추가 → 수정 전 실패 확인(17/18) → 수정 후 통과
  - [x] 4.2 경계 사례 확인: 한국어+영문 용어 혼합("RAG 파이프라인 구축 사례" → ko), 영어 위주 혼합 → en, 빈 문자열·숫자 → en
  - [x] 4.3 `npm run verify:full` 통과 (verify, DB 9/9, E2E 18/18)

- [x] 5. Phase 2 수집기 언어 처리
  - `itemLanguage()`: 소스 제공 언어 우선(arXiv = en), 없으면 `detectLanguage(title, summary)` (`src/lib/collectors/classify.ts`)
  - 주제 언어 조건(ko/en)에 맞는 콘텐츠만 연결
  - _요구사항: 4.2_
  - [x] 5.1 단위 테스트(arXiv 언어 en, ko 주제는 영어 콘텐츠 미연결·한국어 콘텐츠 연결) 및 `npm run verify:full` 통과

- [ ] 6. Phase 3 한국어 AI 요약
  - AIProvider 프롬프트에 한국어 출력 지시, `ai_processing_allowed` 확인 후에만 실행
  - _요구사항: 5.1, 5.2_
  - [ ] 6.1 허용되지 않은 콘텐츠는 요약하지 않음을 확인하는 테스트 추가
  - [ ] 6.2 `npm run verify:full` 통과

- [ ] 7. Phase 4 한국어 의미 검색
  - pgvector + 다국어 임베딩 모델 기반 Knowledge Base 검색
  - _요구사항: 6.2_
  - [ ] 7.1 조사·어미가 다른 질의로 검색되는지 E2E 확인 및 `npm run verify:full` 통과
