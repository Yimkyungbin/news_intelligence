# 설계 문서: Phase 2 콘텐츠 수집

## 개요

수집은 서버에서만 실행한다. 소스에서 가져온 항목을 공통 형식(`CollectedItem`)으로 정규화한 뒤, 사용자별 활성 주제로 분류해 해당 사용자의 `content_items` 에 저장한다. DB 쓰기는 service role(secret key)로 수행한다. 클라이언트는 수집 콘텐츠를 만들 수 없다 (기존 트리거 `protect_content_permissions`).

## 아키텍처

```
Vercel Cron (21:00 UTC = 06:00 KST)          Settings "지금 수집" (Server Action)
   │ GET /api/cron/collect                        │ requireUser + 10분 제한
   │ Authorization: Bearer CRON_SECRET            │
   ▼                                              ▼
runCollection({ userId? })  ── src/lib/collectors/pipeline.ts
   ├─ 대상 소스: 시스템 활성 소스 + (사용자 지정 시 그 사용자 / 전체 시 모든 사용자의) 활성 소스
   ├─ 소스별: collection_logs(running) → fetchWithRetry(adapter) → 정규화
   │            ├─ adapters: rss(RSS/Atom) / hackernews / github / arxiv / huggingface
   │            └─ http.ts: 타임아웃 10s, 최대 2MB, User-Agent, (사용자 소스) SSRF 차단
   ├─ 사용자별: classify(item, topics) → 일치 시 upsert content_items + content_topics
   ├─ 로그 종료(success/partial/failed, 건수, 오류), data_sources·topics last_collected_at 갱신
   └─ (Cron) purgeExpired(): retention_until 경과 + 미저장 수집 콘텐츠 삭제
```

## 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| `CollectedItem` 타입 | `src/lib/collectors/types.ts` | title, url, summary, author, publishedAt, contentType, popularity, tags, language |
| `safeFetch()` | `src/lib/collectors/http.ts` | 타임아웃·크기 제한·UA. `untrusted` 옵션 시 https 강제 + DNS 해석 IP 검사 + 리다이렉트 수동 추적·재검사 |
| `isPublicAddress()` | `src/lib/collectors/net.ts` | IPv4/IPv6 사설·루프백·링크로컬·CGNAT·메타데이터 대역 차단 |
| `parseFeed()` | `src/lib/collectors/rss.ts` | RSS 2.0 / Atom 파싱 (fast-xml-parser), HTML 제거, 500자 요약 |
| `parseHackerNewsItem()` | `src/lib/collectors/hackernews.ts` | topstories 상위 60개 item → points, comments |
| `parseGithubSearch()` | `src/lib/collectors/github.ts` | 최근 30일 생성 저장소, 토픽별(llm, ai-agents, rag) stars 순 |
| `parseArxiv()` | `src/lib/collectors/arxiv.ts` | cs.AI/cs.CL/cs.LG 최신 50건 (Atom) |
| `parseHfModels()` | `src/lib/collectors/huggingface.ts` | trending 모델 30개 → likes, downloads |
| `classify()` | `src/lib/collectors/classify.ts` | 주제 키워드 매칭, relevance = 일치 키워드 수 / min(키워드 수, 3) 상한 1 |
| `runCollection()` | `src/lib/collectors/pipeline.ts` | 오케스트레이션, 재시도(2회, 지수 백오프), 로그 |
| Cron Route | `src/app/api/cron/collect/route.ts` | CRON_SECRET 검증 (timing-safe 비교) |
| `collectNow`, `addUserFeed`, `deleteUserFeed`, `setUserFeedActive` | `src/app/(app)/settings/collect-actions.ts` | 수동 수집, 사용자 RSS 관리 |
| 수집 이력 UI | `src/app/(app)/settings/page.tsx` | 최근 20건, 출처 로고 |
| `vercel.json` | 루트 | `crons: [{ path: "/api/cron/collect", schedule: "0 21 * * *" }]` |

### 소스 어댑터 선택

`data_sources.slug` 로 어댑터를 고른다: `hacker-news` → hackernews, `github` → github, `arxiv` → arxiv, `hugging-face` → huggingface, 그 외 `source_type in (official_blog, rss)` 이고 `source_url` 이 있으면 rss.

### 저장 규칙

| 컬럼 | 값 |
|---|---|
| `provenance` | `collected` |
| `permission_status` | 소스 값 (현재 `NOT_VERIFIED`) |
| `storage_allowed`, `display_allowed`, `ai_processing_allowed`, `external_llm_allowed` | 소스 값 복사 (AI 관련은 false) |
| `ai_processing_status` | `blocked` |
| `retention_until` | `now() + retention_days` |
| `language` | 소스 제공 값 우선, 없으면 `detectLanguage(title, summary)` |
| `keywords` | 일치한 주제 키워드 + 소스 태그(최대 10) |
| 충돌 시 | `(user_id, original_url)` upsert: 제목·요약·인기 지표 갱신, `collected_at` 유지 |

## 데이터 모델 (마이그레이션 `20261110000000_phase2_collection.sql`)

- 시스템 소스 활성화: openai-blog, google-ai-blog, deepmind-blog, nvidia-blog, aws-ml-blog, hacker-news, github, arxiv, hugging-face (`is_active = true`, `connection_status = 'connected'`)
- microsoft-ai-blog: `is_active = false`, `connection_status = 'error'`, 비고 "피드 410 Gone"
- `permission_status` 는 `NOT_VERIFIED` 유지 (약관 상세 검토 전). 제목·링크·짧은 요약 메타데이터 저장·표시만 허용
- `collection_logs` 조회 정책: 본인 작업 + 시스템 작업(user_id null) 중 시스템 소스 로그 허용
- `data_sources` 사용자 insert 정책: `source_type = 'rss'`, `source_url ~ '^https://'` 로 제한
- `collection_logs` 인덱스 `(user_id, job_type, started_at desc)` (수동 수집 제한 조회)

## 오류 처리

- 소스 단위 격리: 한 소스 실패가 전체 실행을 중단하지 않는다.
- 재시도: 네트워크 오류·5xx·429에 대해 1s, 3s 백오프로 최대 2회. 4xx(429 제외)는 재시도하지 않는다.
- 로그 메시지에는 URL 쿼리·토큰을 남기지 않는다 (호스트와 상태 코드만).
- 파싱 실패 항목은 건너뛰고 나머지를 저장한다 (`partial`).

## 테스트 전략

| 종류 | 위치 | 내용 |
|---|---|---|
| 단위 (vitest) | `tests/unit/*.test.ts` | RSS/Atom/HN/GitHub/arXiv/HF fixture 파싱, HTML 제거·요약 길이, classify(언어 조건 포함), detectLanguage, isPublicAddress |
| DB | `supabase/tests/rls_test.sql` | 클라이언트의 collected 콘텐츠·collection_logs 위조 차단, 사용자 RSS 소스 http/타 유형 insert 차단, 시스템 로그 조회 가능 |
| E2E | `scripts/e2e_smoke.py` | 로컬 fixture 피드 서버 + 시스템 테스트 소스 삽입 → 지금 수집 → 콘텐츠·로고·주제 연결·수집 이력 확인 → 10분 제한 확인 → 정리 |
| 게이트 | `npm run verify` 에 `test:unit` 포함 | CI 동일 |
