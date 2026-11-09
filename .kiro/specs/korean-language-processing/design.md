# 설계 문서: 한국어 처리

## 개요

한국어 처리는 네 계층으로 나뉜다.

0. 채팅 응답 (최우선): steering 파일 최상단 "0. 최우선 규칙"으로 Kiro 채팅창의 모든 출력(중간 진행 안내, 도구 설명 문구, 세션 제목 포함)을 한국어로 강제한다.
1. 작성 규칙: steering 파일(`.kiro/steering/korean-language.md`, `inclusion: always`)로 Kiro가 Spec·코드·응답을 한국어로 작성하도록 강제한다.
2. 입력 처리: 서버 측 zod 검증 단계에서 NFC 정규화를 수행한다. 클라이언트 값은 신뢰하지 않으므로 Server Action에서만 처리한다.
3. 표시: `ko-KR` 로케일, `Asia/Seoul` 시간대, 한국어 폰트 스택.

## 아키텍처

```
Browser (form, NFD 가능)
   │ FormData
   ▼
Server Action ──> zod schema: text() = z.string().normalize("NFC").trim()
   │               splitList(): 항목별 normalize("NFC").trim()
   ▼
Supabase (char_length CHECK, 문자 수 기준)
```

## 채팅 응답 한국어 적용 방식

| 항목 | 적용 위치 | 내용 |
|---|---|---|
| 규칙 로딩 | `.kiro/steering/korean-language.md` (`inclusion: always`) | 모든 세션·요청에 자동 포함 |
| 우선순위 | 파일 최상단 "0. 최우선 규칙" 섹션 | 다른 언어 규칙과 기본 언어 설정보다 우선한다고 명시 |
| 적용 범위 | 최종 답변, 중간 진행 안내, 도구 호출 설명, 질문·계획, 세션 제목·상태, Hook·워크플로 이름 | 사용자에게 보이는 모든 문장 |
| 예외 | 코드, 명령어, 경로, 식별자, 로그 원문 | 번역하지 않고 설명만 한국어로 작성 |
| 자체 점검 | 메시지 전송 전 | 영어 설명 문장이 있으면 한국어로 고침 |

배경: 이전 작업에서 최종 답변은 한국어였지만 작업 중간 진행 안내가 영어로 출력되었다 (예: "All checks pass. I'll update ..."). 기존 규칙은 "응답" 항목이 파일 하단에 있었고 중간 안내와 도구 설명 문구를 명시하지 않아 적용 범위가 모호했다.

## 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| `text()` | `src/lib/validation.ts` | NFC 정규화 + trim 문자열 스키마. 모든 텍스트 필드의 기반 |
| `splitList()` | `src/lib/utils.ts` | 쉼표·줄바꿈 목록(키워드, 태그) 분리 + 항목별 NFC 정규화 |
| `formatDate()`, `formatDateTime()` | `src/lib/utils.ts` | `ko-KR` + `Asia/Seoul` 표시 |
| `detectLanguage()` | `src/lib/language.ts` | 한글 비율 기반 `ko`/`en` 판별 |
| 폰트 스택 | `src/app/globals.css` | Geist + Apple SD Gothic Neo + Noto Sans KR |

### 정규화 적용 대상

| 필드 | 스키마/함수 |
|---|---|
| 주제명, 설명, 키워드, 검색 쿼리 | `topicSchema` (`text()`, `splitList`) |
| 인물 이름, 직책, 회사, 메모 | `influencerSchema` |
| 콘텐츠 링크 제목, 메모 | `linkSchema` |
| 직접 등록 URL 제목, 요약, 작성자, 메모, 태그 | `manualContentSchema` |
| 저장 메모, 태그 | `savedPostSchema` |
| 폴더명, 프로필 이름, 가입 이름 | 각 Server Action의 `text()` |
| 비밀번호 | 제외 (정규화 시 인증 값이 달라짐) |

### 언어 판별 규칙

- 대상 텍스트: `title + " " + summary`
- 한글 음절(U+AC00–U+D7A3) 수 / (한글 + 라틴 문자 수) ≥ 0.3 이면 `ko`, 아니면 `en`
- 문자가 없으면 기본값 `en`

## 데이터 모델

변경 없음. `content_items.language`(`ko`/`en`), 각 텍스트 컬럼의 `char_length` CHECK 제약을 그대로 사용한다.

## 오류 처리

- 정규화 후 길이 초과 시 zod 오류 메시지(한국어)를 필드별로 반환하고, 입력값을 폼에 복원한다 (`failure()`).
- 언어 판별 실패 시 `en`으로 저장하며 오류로 처리하지 않는다.

## 테스트 전략

| 항목 | 방법 |
|---|---|
| 채팅 응답 한국어 | 자동 테스트 불가. 사용자가 채팅창에서 중간 진행 안내·도구 설명·최종 답변이 모두 한국어인지 확인한다. 영어 문장이 발견되면 해당 사례를 steering "금지" 예시에 추가한다 |
| NFC 정규화 | E2E `한국어 입력 NFC 정규화 저장`: NFD로 주제명·키워드 입력 → DB에서 NFC 리터럴과 바이트 단위 일치 확인 |
| 테스트 유효성 | `select normalize('한국어', NFD) = '한국어'` 가 `f` 임을 확인 (정규화 누락 시 테스트가 실패함) |
| 언어 판별 | E2E `직접 등록 콘텐츠 언어 판별 → Trending 언어 필터`: 한국어/영어 제목 등록 → `lang=ko`/`lang=en` 필터에서 각각만 노출 |
| 표시 | E2E 대시보드 날짜 표시, 한국어 UI 문구 확인 |
