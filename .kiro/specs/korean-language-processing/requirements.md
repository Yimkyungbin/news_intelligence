# 요구사항 문서: 한국어 처리

## 소개

Insight Radar(인사이트 레이더, 이전 이름 LinkedIn Intelligence Hub)는 한국어 사용자를 기본 대상으로 한다. 이 Spec은 Kiro 채팅창 응답의 한국어 작성(최우선), Spec 문서·UI·코드 주석의 한국어 작성 규칙과, 사용자가 입력하거나 수집된 한국어 텍스트를 일관되게 저장·검색·표시하기 위한 처리 규칙을 정의한다.

규칙 원문: `.kiro/steering/korean-language.md`

## 요구사항

### 요구사항 0: Kiro 채팅 응답 한국어 (최우선)

**사용자 스토리:** 프로젝트 오너로서, 나는 Kiro 채팅(프롬프트) 창에 나오는 모든 응답을 한국어로 보고 싶다. 그래야 진행 상황과 결과를 바로 이해하고 판단할 수 있다.

#### 인수 기준

1. WHEN Kiro가 채팅창에 메시지를 출력하면 THE SYSTEM SHALL 최종 답변뿐 아니라 작업 중간 진행 안내, 계획, 질문, 오류 설명까지 모두 한국어로 작성한다.
2. WHEN Kiro가 도구를 호출하면 THE SYSTEM SHALL 사용자에게 표시되는 설명 문구(명령 description, explanation 등)를 한국어로 작성한다.
3. WHEN Kiro가 세션 제목·진행 상태, Hook 이름, 워크플로 라벨을 설정하면 THE SYSTEM SHALL 한국어로 작성한다.
4. THE SYSTEM SHALL 코드, 명령어, 파일 경로, 라이브러리·API 이름, 로그·오류 원문은 번역하지 않고 그대로 표시하며, 그에 대한 설명은 한국어로 작성한다.
5. IF 메시지에 영어 설명 문장이 섞여 있다면 THEN THE SYSTEM SHALL 보내기 전에 한국어로 고친다.
6. THE SYSTEM SHALL 이 규칙을 다른 언어 관련 규칙과 기본 언어 설정보다 우선 적용한다.

### 요구사항 1: Spec 문서 한국어 작성

**사용자 스토리:** 프로젝트 오너로서, 나는 모든 Spec 문서를 한국어로 받기를 원한다. 그래야 요구사항과 설계를 빠르게 검토할 수 있다.

#### 인수 기준

1. WHEN Kiro가 `.kiro/specs/**` 아래에 requirements.md, design.md, tasks.md를 생성하면 THE SYSTEM SHALL 본문을 한국어로 작성한다.
2. WHEN 요구사항을 EARS 형식으로 작성하면 THE SYSTEM SHALL 구조 키워드(`WHEN`, `IF`, `THEN`, `WHILE`, `WHERE`, `THE SYSTEM SHALL`)는 영어로, 나머지는 한국어로 작성한다.
3. THE SYSTEM SHALL 기술 용어, 테이블·컬럼명, 파일 경로, 코드 식별자, 권한 상태 값(`AVAILABLE` 등)을 번역하지 않는다.

### 요구사항 2: UI·메시지 한국어화

**사용자 스토리:** 사용자로서, 나는 화면 문구와 오류 메시지를 한국어로 보고 싶다. 그래야 서비스를 쉽게 이해할 수 있다.

#### 인수 기준

1. THE SYSTEM SHALL 버튼, 안내 문구, 오류 메시지, toast, 빈 상태 안내를 한국어로 표시한다.
2. THE SYSTEM SHALL 사이드바 메뉴명(Dashboard, My Topics 등)은 영어 명칭을 유지한다.
3. THE SYSTEM SHALL 날짜·시간을 `ko-KR` 로케일과 `Asia/Seoul` 시간대로 표시한다.
4. THE SYSTEM SHALL 한국어 글꼴(Apple SD Gothic Neo, Noto Sans KR)을 폰트 스택에 포함한다.

### 요구사항 3: 한국어 입력 정규화

**사용자 스토리:** 사용자로서, 나는 macOS에서 입력한 한국어도 다른 환경에서 입력한 것과 동일하게 검색·중복 검사되기를 원한다. 그래야 같은 주제가 두 번 등록되거나 검색에서 누락되지 않는다.

#### 인수 기준

1. WHEN 사용자가 텍스트 필드(주제명, 키워드, 인물 정보, 메모, 태그, 폴더명, 이름 등)를 저장하면 THE SYSTEM SHALL 값을 NFC로 정규화하고 앞뒤 공백을 제거한 뒤 저장한다.
2. IF 입력이 NFD(자모 분리) 형태라면 THEN THE SYSTEM SHALL NFC 형태로 변환하여 저장한다.
3. THE SYSTEM SHALL 비밀번호는 정규화하지 않는다 (입력값 그대로 인증).
4. THE SYSTEM SHALL 길이 제한을 바이트가 아닌 문자 수 기준으로 검증한다.

### 요구사항 4: 콘텐츠 언어 판별

**사용자 스토리:** 사용자로서, 나는 한국어 콘텐츠를 언어 필터로 골라 보고 싶다. 그래야 Trending의 한국어 필터가 정확하게 동작한다.

#### 인수 기준

1. WHEN 사용자가 URL을 직접 등록하면 THE SYSTEM SHALL 제목·요약의 한글 비율로 `language`를 `ko` 또는 `en`으로 판별하여 저장한다.
2. WHEN Phase 2 수집기가 콘텐츠를 저장하면 THE SYSTEM SHALL 소스가 제공한 언어 값을 우선 사용하고, 없으면 동일한 판별 규칙을 적용한다.

### 요구사항 5: 한국어 AI 요약 (Phase 3)

**사용자 스토리:** 사용자로서, 나는 영어 콘텐츠도 한국어 요약으로 보고 싶다. 그래야 해외 트렌드를 빠르게 파악할 수 있다.

#### 인수 기준

1. WHEN AI 처리가 허용된 콘텐츠를 요약하면 THE SYSTEM SHALL 원문 언어와 관계없이 한국어로 요약·핵심 주장·키워드를 생성한다.
2. IF 콘텐츠의 `ai_processing_allowed`가 false라면 THEN THE SYSTEM SHALL 요약을 생성하지 않는다.

### 요구사항 6: 한국어 검색 (Phase 4)

**사용자 스토리:** 사용자로서, 나는 조사나 어미가 달라도 관련 콘텐츠를 찾고 싶다. 그래야 Knowledge Base 검색이 실용적이다.

#### 인수 기준

1. WHILE Phase 4 이전에는 THE SYSTEM SHALL 대소문자 무시 부분 일치(`ilike`)로 검색한다.
2. WHEN Phase 4 RAG 검색이 도입되면 THE SYSTEM SHALL 다국어 임베딩(pgvector) 기반 의미 검색을 제공한다.
