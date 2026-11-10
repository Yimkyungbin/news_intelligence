# 설계 문서: 데이터 소스 관리·수집처 확대·일자별 통계·트렌드 시사점·한국어 번역

## 개요

```
[수집 Cron 06:00 KST] runCollection
   ├─ 사용자별 끈 소스 제외 (user_source_settings) · 모두 끈 소스는 요청 생략
   ├─ 소스 31개 병렬(4) 수집: RSS/Atom·HN·GitHub·arXiv·HF·dev.to·HN 검색(주제 쿼리)·Mastodon·Bluesky(사용자 피드)
   ├─ refreshAllStats(): 사용자별 최근 3일 daily_stats upsert + 2년 경과 삭제
   └─ processSystemAI(): 운영자가 허용한 출처 콘텐츠 → 번역·한 줄 시사점 → content_ai_cache (URL 공유, 하루 100회)

[화면]
 Dashboard/Trending ─ listContent(숨김 소스 필터) ─ getAIMeta(urls) ─ ContentCard(주제 배지·번역·시사점)
 Trending ─ loadTrendItems(현재+직전 기간) ─ trendDelta(집계) ─ TrendPanel ─ (버튼) generateTrendInsight → trend_insights (24h 재사용)
 Statistics ─ daily_stats 기간 조회 ─ summarizeRange / keywordSeries ─ Recharts
 Settings ─ 사용 토글(사용자) · AI 번역·요약 토글(운영자 ADMIN_EMAILS)
```

## 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| 소스 설정 | `src/lib/source-settings.ts` | `getDisabledSourceIds`(요청 캐시), `hiddenSourceFilter`(UUID 검증 or 필터), `disabledSourceIdsFor`(service role) |
| 소스 토글 | `settings/source-actions.ts`, `source-toggle.tsx` | `setSourceEnabled`(사용자), `setSourceAIAllowed`(운영자). `role="switch"` |
| 새 파서 | `src/lib/collectors/sources.ts` | `parseDevto`, `parseAlgoliaHits`, `parseMastodonStatuses`, `parseBlueskyFeed`, `blueskyHandleFromUrl` |
| 어댑터 | `src/lib/collectors/adapters.ts` | `adapterFor(source, { queries })`, `gather`(부분 실패 허용·URL 중복 제거) |
| 통계 | `src/lib/stats/compute.ts`(순수), `service.ts` | `computeDailyStats`, `groupByStatDate`, `summarizeRange`, `keywordSeries`, `refreshDailyStats` |
| 통계 화면 | `src/app/(app)/statistics/*`, `components/stats/stats-charts.tsx` | 기간 7/30/90/365, 일별 막대(클릭 시 날짜 상세), 키워드 추이, 출처·주제 막대 |
| 트렌드 | `src/lib/trends/{params,compute,service}.ts`, `components/trends/*` | 조건 파싱 공유, 직전 기간 대비 집계, AI 시사점 |
| 시스템 AI | `src/lib/ai/system.ts` | `processSystemAI`, `setSystemSourceAIPermission`(기존 콘텐츠 반영, 철회 시 결과 삭제) |
| 운영자 | `src/lib/admin.ts` | `ADMIN_EMAILS` (이메일 또는 `@도메인`) |
| 번역 토글 | `content/pref-actions.ts`, `components/content/translate-toggle.tsx` | `profiles.translate_ko` (기본 true) |

## 데이터 모델 (`20261112000000_sources_stats_insights.sql`)

| 테이블/변경 | 내용 | RLS |
|---|---|---|
| `user_source_settings` | (user_id, source_id) → enabled | 본인 CRUD, 직접 입력·LinkedIn·타 사용자 소스 불가 |
| `data_sources` | `news` 유형, 신규 22개 | 기존 |
| `daily_stats` | (user_id, stat_date) → data jsonb | 본인 조회만, 쓰기 service role, `purge_old_stats()` 730일 |
| `content_ai_cache` | original_url → title_ko, summary_ko, implication_ko, is_demo | 로그인 사용자 조회, 쓰기 service role |
| `trend_insights` | user_id, cache_key, content | 본인 조회만 |
| `profiles.translate_ko` | boolean default true | 본인 수정 |
| `collection_logs.job_type` | + stats, system_ai, trend_ai | 기존 |

## 주요 결정

- 숨김은 앱 레벨 필터로 구현 (RLS 로 숨기면 Saved·Knowledge 에서도 사라지므로). 여러 `or` 조건은 PostgREST 에서 AND 결합됨을 확인.
- 소스를 끄면 최근 90일 통계를 다시 계산해 통계에서도 숨김을 반영.
- 번역은 콘텐츠 행이 사용자별로 중복되므로 URL 기준 공유 캐시로 비용 절감. 시스템 소스 메타데이터만 대상(사용자 피드·직접 등록 제외).
- 출처 AI 허용 시 해당 소스 수집 콘텐츠는 `pending`(요청 시 AI 요약 가능). 동의 대기 일괄 요약(`processPending`)은 직접 등록 콘텐츠로 한정.
- Bluesky 프로필 RSS 는 404 → 공개 API(getAuthorFeed, 고정 호스트)로 수집. Mastodon 프로필은 RSS.

## 오류 처리

- 다중 요청 소스(dev.to·Mastodon·HN 검색)는 일부 실패 시 `partial`, 전부 실패 시 `failed`.
- 시스템 AI: 재시도 불가 오류(키 오류 등)면 즉시 중단, 하루 100회 초과 시 건너뜀.

## 테스트 전략

| 종류 | 내용 |
|---|---|
| 단위 `tests/unit/sources-stats.test.ts` (12) | 새 파서 4종·Bluesky 핸들 검증, 통계 KST 날짜·집계·원문 미저장·기간 합계·추이, 트렌드 기간 분리·급상승·새 키워드·주제 증감, 조건 파싱(주입 차단·캐시 키), 일괄 번역 프롬프트·모의 출력 |
| DB `rls_test.sql` (+3) | 소스 설정 권한, 통계·캐시·시사점 쓰기 차단, 사용자 격리·캐시 공유 조회 |
| E2E | DEMO 소스 끄기 → 피드 숨김 → 켜기 복원, Statistics 갱신·차트·날짜 상세, 운영자 AI 허용 → DEMO 번역·시사점·주제 배지 → 번역 끄기/켜기 → 트렌드 AI 시사점 → 차단 복원(캐시 삭제) |
| 실제 수집 | 로컬 1회: 31개 소스 모두 success |
