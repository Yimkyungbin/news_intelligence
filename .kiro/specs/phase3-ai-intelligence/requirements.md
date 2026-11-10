# 요구사항 문서: Phase 3 AI 분석

## 소개

AI 처리가 허용된 콘텐츠에 대해 AI 요약·인사이트, 주제 인텔리전스, Daily Briefing 을 제공한다. 권한이 확인되지 않은 콘텐츠는 외부 LLM 으로 보내지 않는다(원 요구사항 3.4). 모델은 교체 가능한 Provider 구조로 둔다.

배경 결정 (사용자 합의):
- 자동 수집 콘텐츠는 출처 약관 검토 전이므로 계속 AI 차단. 허용 여부는 운영자가 소스별로 결정.
- 사용자 직접 등록 콘텐츠는 사용자가 권리를 확인·동의한 항목만 AI 처리, 언제든 철회 가능.
- Daily Briefing 의 집계 섹션은 AI 없이 생성, "AI 핵심 인사이트" 섹션만 AI 사용.
- 키가 없는 로컬·테스트·CI 는 DEMO 로 표시되는 모의 AI 사용, 운영에서는 모의 AI 금지.
- 기본 모델 `gpt-6-luna` (OpenAI 공식 모델 안내, 2026-11 확인).

## 요구사항

### 요구사항 1: AI 처리 권한 게이트

**사용자 스토리:** 운영자로서, 나는 권한이 없는 콘텐츠가 외부 AI 로 전송되지 않기를 원한다. 그래야 약관과 저작권을 지킬 수 있다.

#### 인수 기준

1. WHEN AI 작업을 실행하기 전에 THE SYSTEM SHALL 콘텐츠의 `ai_processing_allowed` 를 확인하고, 외부 제공자이면 `external_llm_allowed` 도 확인한다.
2. THE SYSTEM SHALL `provenance = linkedin_api` 콘텐츠는 권한 값과 관계없이 AI 처리하지 않는다.
3. THE SYSTEM SHALL AI 작업을 서버(service role)에서만 실행하고, 클라이언트가 AI 결과·브리핑을 직접 만들 수 없게 한다.
4. THE SYSTEM SHALL 외부 AI 요청에 제목·요약·출처명·유형·게시일만 보내고 작성자·메모 등 개인정보는 보내지 않는다.
5. THE SYSTEM SHALL OpenAI 요청에 `store: false` 를 지정하고, 사용자·제3자 콘텐츠를 모델 학습에 사용하지 않는다.
6. THE SYSTEM SHALL 콘텐츠를 신뢰하지 않는 데이터로 구분해 전달하고, 콘텐츠 안의 지시를 따르지 않도록 지시한다 (프롬프트 인젝션 완화).

### 요구사항 2: 직접 등록 콘텐츠 AI 처리 동의

**사용자 스토리:** 사용자로서, 나는 내가 권리를 가진 콘텐츠만 골라 AI 요약을 받고 싶다. 그래야 필요한 것만 안전하게 분석할 수 있다.

#### 인수 기준

1. THE SYSTEM SHALL 직접 등록 콘텐츠의 상세 보기에서 권리 확인 체크 후에만 "AI 처리 허용"을 누를 수 있게 한다.
2. WHEN 사용자가 철회하면 THE SYSTEM SHALL 해당 콘텐츠의 AI 결과를 삭제하고 차단 상태로 되돌린다.
3. THE SYSTEM SHALL 직접 등록이 아닌 콘텐츠에는 동의 옵션을 제공하지 않고 차단 사유를 표시한다.
4. WHEN 사용자가 콘텐츠를 직접 등록하면 THE SYSTEM SHALL 수집 콘텐츠와 같은 규칙으로 관심 주제에 연결한다.

### 요구사항 3: AI Summary·Insight (원 요구사항 4.1, 4.2)

**사용자 스토리:** 사용자로서, 나는 콘텐츠의 핵심을 한국어로 빠르게 파악하고 싶다.

#### 인수 기준

1. THE SYSTEM SHALL 한국어 요약, 핵심 주장, 주요 기술·개념, 키워드, 인사이트(핵심·기술적 의미·산업 영향·실무 적용·관련 기술 연관성)를 생성한다.
2. THE SYSTEM SHALL 모델 출력을 JSON Schema(strict)로 요청하고, 응답을 다시 스키마 검증한 뒤 저장한다.
3. THE SYSTEM SHALL 결과에 모델명·생성 시각·DEMO 여부를 표시하고, 원문 확인 안내를 함께 표시한다.

### 요구사항 4: Topic Intelligence (원 요구사항 4.3)

#### 인수 기준

1. WHEN 사용자가 주제 페이지에서 생성을 누르면 THE SYSTEM SHALL 최근 14일 해당 주제 콘텐츠 중 AI 허용 콘텐츠(최대 30건)로 최근 동향·신규 기술·기업 동향·전문가 주장·공통 이슈·주목할 기술을 생성한다.
2. THE SYSTEM SHALL 각 항목에 근거 콘텐츠 번호를 표시하고, 누르면 상세 보기를 연다.
3. IF AI 허용 콘텐츠가 없으면 THEN THE SYSTEM SHALL AI 를 호출하지 않고 사유를 안내한다.
4. THE SYSTEM SHALL 제외된(AI 미허용) 콘텐츠 수를 표시한다.

### 요구사항 5: Daily Briefing (원 요구사항 4.4)

#### 인수 기준

1. THE SYSTEM SHALL 매일 07:00 KST(22:00 UTC, Vercel Cron)에 모든 사용자의 브리핑을 생성한다.
2. THE SYSTEM SHALL 1) 트렌드 TOP 5, 2) 신규 콘텐츠 TOP 10, 3) 주제별 업데이트, 4) 인플루언서 콘텐츠, 5) AI 핵심 인사이트, 6) 전일 대비 변화 를 포함한다.
3. THE SYSTEM SHALL 섹션 1~4, 6 은 최근 24시간과 직전 24시간 비교 집계로 만들고, 섹션 5 만 AI 허용 콘텐츠로 생성한다.
4. IF 생성이 실패하면 THEN THE SYSTEM SHALL 최대 3회 재시도하고, 실행 이력(시각·자동/수동·상태·시도 횟수·오류)을 기록·표시한다.
5. IF AI 섹션만 실패하면 THEN THE SYSTEM SHALL 집계 섹션은 저장하고 상태를 "일부 성공"으로 기록한다.
6. THE SYSTEM SHALL 대시보드에 최신 브리핑 요약을, 브리핑 페이지에 전체와 지난 브리핑(14일)을 표시한다.
7. THE SYSTEM SHALL 수동 생성을 10분에 1회로 제한한다.

### 요구사항 6: Provider·비용·운영

#### 인수 기준

1. THE SYSTEM SHALL `AI_PROVIDER`(openai/mock)와 `OPENAI_API_KEY` 로 제공자를 선택하고, 운영(VERCEL_ENV=production)에서는 모의 AI 를 비활성화한다.
2. THE SYSTEM SHALL 사용자별 하루 AI 호출을 50회로 제한한다.
3. THE SYSTEM SHALL Settings 에서 모델(`gpt-6-luna`, `gpt-6.1-terra`, `gpt-6.1-sol`)을 선택하게 하고 DB 에서 다른 값을 거부한다.
4. THE SYSTEM SHALL API 키를 서버 환경변수로만 읽고, 오류 메시지·로그에 키·응답 본문을 남기지 않는다.

### 요구사항 7: 비밀값 유출 방지

**사용자 스토리:** 운영자로서, 나는 실수로 키를 커밋해도 공개 저장소에 올라가지 않기를 원한다.

#### 인수 기준

1. THE SYSTEM SHALL GitHub Secret Scanning 과 푸시 보호를 켠다.
2. THE SYSTEM SHALL `verify`(로컬·CI) 첫 단계에서 추적 파일의 키 형태 문자열, 추적되는 `.env` 파일, 값이 들어간 `.env.example` 을 검사해 실패시킨다. 일치한 값은 출력하지 않는다.
