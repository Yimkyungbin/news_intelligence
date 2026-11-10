# 설계 문서: Phase 3 AI 분석

## 개요

```
Server Action / Cron
   │
   ▼
lib/ai/service.ts ─ 권한 게이트(gate.ts) ─ 일일 한도 ─ 작업 이력(collection_logs)
   │                         ▲
   ▼                         │ ai_processing_allowed / external_llm_allowed / provenance
lib/ai/provider.ts ── openai.ts (Responses API, json_schema strict, store:false)
                  └── mock.ts   (DEMO, 외부 전송 없음)
   │ prompts.ts: 한국어 출력, 최소 필드, <content> 구분 + 인젝션 무력화
   ▼
ai_insights / topic_insights / daily_briefings  (쓰기: service role, 읽기: RLS 본인)

lib/briefing/compose.ts (순수) ── 섹션 1~4, 6 집계
lib/briefing/service.ts ── loadInputs → compose → AI 섹션(허용 콘텐츠) → upsert, 재시도 3회
```

## 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| 스키마 | `src/lib/ai/schemas.ts` | 출력 zod 스키마 + strict JSON Schema |
| 게이트 | `src/lib/ai/gate.ts` | `checkAIPermission`, `filterAIAllowed` |
| 프롬프트 | `src/lib/ai/prompts.ts` | 콘텐츠·주제·브리핑 프롬프트 |
| OpenAI | `src/lib/ai/openai.ts` | `callOpenAI`, `extractOutputText`, `parseTaskOutput`, `AIError`(재시도 가능 여부) |
| 모의 AI | `src/lib/ai/mock.ts` | DEMO 출력 (`mock-demo`) |
| Provider | `src/lib/ai/provider.ts` | `providerStatus`, `getProvider` |
| 서비스 | `src/lib/ai/service.ts` | `summarizeContent`, `processPending`, `setUserContentAIConsent`, `generateTopicInsight`, 일일 한도 50 |
| 브리핑 | `src/lib/briefing/compose.ts`, `service.ts` | 구성·생성·Cron |
| Server Actions | `src/app/(app)/ai/actions.ts` | 동의/철회, 요약, 주제 인사이트, 브리핑(10분 제한) |
| Cron | `src/app/api/cron/briefing/route.ts`, `vercel.json` (`0 22 * * *`) | CRON_SECRET timing-safe |
| UI | `content-ai.tsx`(상세 패널), `briefing-view.tsx`, `topic-insight-card.tsx`, `ai-buttons.tsx`, `/briefing` | |
| 비밀값 검사 | `scripts/check-secrets.sh`, `npm run check:secrets` | verify 첫 단계 |

## 데이터 모델 (`20261111000000_phase3_ai.sql`)

- `profiles.ai_model` 기본 `gpt-6-luna`, CHECK 3개 모델
- `ai_insights.provider`, `is_demo`
- `collection_logs.details`(jsonb), `job_type` 에 `topic_ai` 추가
- `topic_insights`(user_id, topic_id, content, source_ids, model_name, provider, is_demo) + RLS 조회만
- `daily_briefings` insert/update 정책 제거 (서버만 생성)

## 오류 처리

- `AIError.retryable`: 429·5xx·타임아웃·네트워크만 재시도 대상. 401 은 "키가 올바르지 않음".
- 미완료(`incomplete`), 거부(`refusal`), 스키마 불일치는 실패 처리, 콘텐츠 상태 `failed`.
- 브리핑: 전체 3회 재시도(1s, 3s). AI 섹션 실패는 `partial`.
- 오류 메시지에 응답 본문·키를 포함하지 않음.

## 테스트 전략

| 종류 | 내용 |
|---|---|
| 단위 `tests/unit/ai.test.ts` (22) | 게이트(외부/로컬, LinkedIn), 프롬프트(한국어·인젝션·길이·개인정보), 응답 추출·거부·미완료, 스키마 불일치, 요청 형식(store false, strict, 키 헤더만), HTTP 오류 재시도 판정·본문 미노출, strict 스키마 규칙, 모의 출력 검증, 브리핑 6개 섹션 집계 |
| DB `rls_test.sql` (+3) | 주제 인사이트·브리핑 위조 차단, 모델 값 제한, 사용자별 격리 |
| E2E `Phase 3 AI` | 기본 차단 → 동의 → 요약(DEMO) → DEMO 콘텐츠 동의 옵션 없음 → 주제 인사이트(허용 1건·제외 표시) → 브리핑 6개 섹션·근거 링크·실행 이력·10분 제한 → 철회 시 결과 삭제 → Cron 미인증 거부 |
| 게이트 | E2E 는 항상 `AI_PROVIDER=mock` 서버를 직접 기동 (실행 중 서버 재사용 금지 → 실제 키 호출 방지) |
| 실제 키 | 검증 통과 후 로컬에서 1~2건만 수동 확인 |
