# 설계 문서: 트렌드 메인 개편 · 카테고리 · 반응 지표 · 논문

## 개요

카테고리 분류, 지표 계산, 개요 계산은 순수 모듈로 두어 단위 테스트를 쉽게 했다. 서버에서는 `loadTrendBoard` 한 곳에서 메인 데이터를 조합한다.

## 컴포넌트

| 파일 | 역할 |
|---|---|
| `src/lib/categories.ts` | 8종 정의(색·칩), `categorize()` 규칙(제목 2점·요약/키워드 1점, 유형 보정, 국내 기술 블로그 보정), `itemCategory()` |
| `src/lib/metrics.ts` | 대표 지표(`points > upvotes > stars > likes > citations > downloads`), `metricGrowth`, `topPercent`, `kstDate` |
| `src/lib/trends/overview.ts` | `categoryBreakdown`, `rankChanges`, `relatedCounts`(범용 키워드 제외), `keywordDailySeries` |
| `src/lib/trends/board.ts` | 메인 보드: 기간 분할, Top 10(논문 제외), 논문 7일, 지표 기록 조회, 하루 전 순위 |
| `src/lib/collectors/text.ts` | `cleanPostText`·`cleanPostTitle`·`cleanPostSummary`·`isLinkOnly` |
| `src/lib/collectors/sources.ts` | `parseHfDailyPapers`, `parseOpenAlexWorks`, `openAlexAbstract` |
| `src/lib/collectors/adapters.ts` | hf-papers, openalex-ai, arXiv RSS(요청 간 3초 큐) |
| `src/components/trends/trend-card.tsx` | 순위 카드 (왼쪽 색 띠 = 카테고리) |
| `src/components/trends/trend-overview.tsx` | 카테고리 비중 막대, 급상승 키워드 + 스파크라인 |
| `src/components/stats/live-overview.tsx` | 메인에서 옮긴 요약 지표·Today's Intelligence |

## 데이터 모델

마이그레이션은 `20261115000000_categories_metrics_papers.sql` 이다.
- `content_items.category` (CHECK 8종, `(user_id, category)` 인덱스)
- `content_metric_snapshots(content_id, user_id, captured_on, score, popularity)` PK `(content_id, captured_on)`, RLS 본인 조회만 허용, `purge_old_metric_snapshots()`(35일, service role 전용)
- 시스템 소스 4개 추가

## 오류 처리

- 지표 기록에 실패해도 수집은 실패로 처리하지 않는다 (경고 로그만 남김).
- arXiv export API가 429를 반환해서 분야별 소스는 RSS를 사용한다.

## 테스트 전략

- 단위 테스트: `tests/unit/trend-board.test.ts` (분류, 제목 정리, 파서, 지표, 개요)
- DB 테스트: `rls_test.sql` 19번 (기록 격리·쓰기 차단·정리 함수·카테고리 CHECK)
- E2E: 메인 보드, 카테고리 필터, Trending 카테고리 탭, Statistics 이동
