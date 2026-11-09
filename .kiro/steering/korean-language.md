---
inclusion: always
---

# 한국어 처리 규칙

## 0. 최우선 규칙: Kiro 채팅창은 항상 한국어

사용자가 보는 Kiro 채팅(프롬프트) 창의 모든 출력은 한국어로 작성한다. 이 규칙은 이 파일의 다른 규칙과 기본 언어 설정보다 우선한다.

한국어로 작성해야 하는 출력:

- 최종 답변, 결과 보고, 요약
- 작업 중간 진행 안내 (예: "빌드를 확인하겠습니다", "테스트가 모두 통과했습니다. 문서를 갱신합니다.")
- 도구 호출에 붙이는 설명 문구 (명령 description, explanation, 파일 작업 설명)
- 계획, 질문, 확인 요청, 오류·실패 설명
- 세션 제목과 진행 상태 설명 (session title / description)
- Hook·작업 이름, 워크플로 실행 라벨 등 사용자에게 표시되는 이름
- 이미지·첨부 문서에 대한 설명

영어 그대로 둘 수 있는 것:

- 코드, 명령어, 파일 경로, 패키지·라이브러리·API 이름, 코드 식별자
- 로그·오류 원문 인용 (인용 후 설명은 한국어로)
- 고유 메뉴명(Dashboard, My Topics 등)과 상태 값(`AVAILABLE` 등)

금지:

- 영어 문장으로 진행 상황을 알리는 것 (예: "All checks pass. I'll update ..." 금지 → "모든 검증을 통과했습니다. ...를 갱신합니다.")
- 한국어와 영어 문장을 번갈아 쓰는 것

자체 점검: 메시지를 보내기 전에 설명 문장이 한국어인지 확인한다. 영어 문장이 섞여 있으면 한국어로 고친 뒤 보낸다.

## 1. Spec 문서 (.kiro/specs/**)

- `requirements.md`, `design.md`, `tasks.md` 는 모두 한국어로 작성한다.
- 요구사항은 EARS 형식을 유지하되, 구조 키워드(`WHEN`, `IF`, `THEN`, `WHILE`, `WHERE`, `THE SYSTEM SHALL`)는 영어로 두고 나머지 문장은 한국어로 쓴다.
  - 예: `WHEN 사용자가 관심 주제를 저장하면 THE SYSTEM SHALL 주제를 user_id 기준으로 저장하고 목록에 즉시 표시한다.`
- User Story 형식: `**사용자 스토리:** [역할]로서, 나는 [기능]을 원한다. 그래야 [가치]를 얻을 수 있다.`
- 섹션 제목은 한국어로 쓴다: 소개 / 요구사항 / 인수 기준 / 개요 / 아키텍처 / 컴포넌트 / 데이터 모델 / 오류 처리 / 테스트 전략 / 구현 작업.
- 기술 용어, 라이브러리명, API명, 테이블·컬럼명, 파일 경로, 코드 식별자는 번역하지 않는다 (예: `content_items`, Server Action, RLS, Supabase).
- 상태 값은 원문을 유지한다: `AVAILABLE`, `CONDITIONAL`, `UNAVAILABLE`, `NOT_VERIFIED`.

## 2. 코드

- 코드 식별자(변수, 함수, 타입, 파일명)는 영어로 쓴다.
- 코드 주석은 한국어로 쓴다 (기존 코드베이스 관례).
- 사용자에게 보이는 UI 문구, 오류 메시지, toast, 빈 상태 안내는 한국어로 쓴다. 메뉴명(Dashboard, My Topics 등)은 기존 영어 명칭을 유지한다.
- 날짜·시간은 `ko-KR` 로케일과 `Asia/Seoul` 시간대로 표시한다 (`src/lib/utils.ts` 의 `formatDate`, `formatDateTime` 사용).
- 커밋 메시지는 한국어로 작성하되 Conventional Commits 접두사는 영어로 쓴다 (예: `feat: My Topics 우선순위 정렬 추가`).
- 테스트 이름과 테스트 출력 메시지는 한국어로 쓴다 (예: `check("My Topics 생성/수정/삭제", ...)`).

## 3. 한국어 콘텐츠 데이터 처리

- 텍스트 입력은 저장 전에 `trim()` 하고 NFC로 정규화한다 (macOS 입력의 NFD 자모 분리 방지). 비밀번호는 제외한다.
- 길이 제한은 문자 수 기준으로 검증한다 (DB `char_length`, zod `.max()`).
- 콘텐츠 `language` 는 `src/lib/language.ts` 의 `detectLanguage()` 로 `ko` / `en` 을 판별한다.
- 검색은 대소문자 무시(`ilike`)를 사용하며, 한국어 형태소·의미 기반 검색은 Phase 4 (RAG/pgvector)에서 다룬다.
- AI 요약은 원문 언어와 관계없이 한국어로 생성한다 (Phase 3).
- 폰트 스택에 한국어 글꼴(Apple SD Gothic Neo, Noto Sans KR)을 유지한다.
