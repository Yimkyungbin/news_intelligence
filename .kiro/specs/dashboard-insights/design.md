# 설계 문서: 대시보드 고도화

## 개요

순수 로직(순위·키워드·차트)은 `src/lib/content.ts`, `src/lib/keywords.ts` 에 두고 단위 테스트로 검증한다. UI는 설명 팝오버(`InfoTip`), 상세 보기 패널(`ContentDetailProvider` + 네이티브 `<dialog>`), 주제 펼치기(`TopicUpdateList`)로 구성한다.

## 아키텍처

```
Dashboard / Trending / Topics / Saved / Search (Server Components)
   │  rankContent() → items + notes("GitHub 내 1위/53")
   │  topKeywords() → normalizeKeywords() + mergePluralCounts()
   │  dailyBuckets() → published_at ?? collected_at
   ▼
ContentCard ── OpenDetailButton(제목·상세 버튼) ──┐
TopicUpdateList(펼치기) ── OpenDetailButton ─────┤
                                                 ▼
(app)/layout: ContentDetailProvider ── <dialog> 상세 패널
                                         │ getContentDetail(id)  (Server Action, uuid 검증, authedClient + RLS)
                                         ▼
                                      content_items + data_sources + content_topics + saved_posts + ai_insights
```

## 컴포넌트

| 컴포넌트 | 위치 | 역할 |
|---|---|---|
| `rankContent()` | `src/lib/content.ts` | 출처별 그룹 → 출처 내 순위 정규화 `(n-idx)/(n+1)` → 탐욕 선택(같은 출처 k회 선택 시 ×0.7^k) → 지표 없는 항목 게시일순 → `notes` |
| `normalizeKeyword(s)` | `src/lib/keywords.ts` | NFC·소문자, arXiv 코드 매핑/제외, `_`·단어 사이 `-` → 공백, 2~40자, 숫자만 제외, 불용어 제외 |
| `mergePluralCounts()` | `src/lib/keywords.ts` | 집계 시 복수형을 단수형에 합산 |
| `dailyBuckets()` | `src/lib/content.ts` | 게시일(없으면 수집일) KST 일자별 집계 |
| `InfoTip` | `src/components/info-tip.tsx` | ⓘ 버튼 + `role="note"` 팝오버, 바깥 클릭·Esc 닫기, 좌/우 정렬 |
| `getContentDetail()` | `src/app/(app)/content/actions.ts` | 상세 조회 Server Action |
| `ContentDetailProvider`, `OpenDetailButton` | `src/components/content/content-detail.tsx` | 컨텍스트로 어디서든 패널 열기. 늦게 도착한 이전 응답 무시(요청 번호) |
| `TopicUpdateList` | `src/components/dashboard/topic-update-list.tsx` | 아코디언(한 번에 한 주제), 서버에서 로고 해석 후 전달 |
| Trending `kw` 필터 | `src/app/(app)/trending/page.tsx` | `normalizeKeyword(kw)` 와 항목의 정리된 키워드 비교, 해제 칩 |

### 순위 예시 (단위 테스트 기준)

GitHub 30건(stars 5000~2100), Hacker News 3건(points 320/152/30), Hugging Face 1건, 블로그 2건 → Top 10 에 GitHub 6건 이하, HN·HF 포함, 블로그는 지표 항목 뒤.

## 데이터 모델

변경 없음. 기존 저장 키워드는 표시 시 정리하고, 신규 수집분은 저장 시 정리한다(`pipeline.ts`).

## 오류 처리

- 상세 조회: 잘못된 id → "잘못된 요청입니다.", 미존재/타인 콘텐츠 → "콘텐츠를 찾을 수 없습니다.", 조회 실패 → 일반 메시지 (내부 오류 미노출).
- 패널을 연 채 다른 항목을 열면 이전 응답은 무시한다.

## 테스트 전략

| 종류 | 내용 |
|---|---|
| 단위 `tests/unit/dashboard.test.ts` | 독점 방지, 출처 1위 상위 포함, 출처 내 순서 유지, 지표 없는 항목 위치, 근거 문구, 결정성, 키워드 정리·분리·병합, 게시일 차트 |
| E2E `대시보드 항목 설명·상세 보기·주제 펼치기·키워드 이동` | ⓘ 설명 열기·Esc 닫기, 제목 → 상세 패널(요약·권한·원문 링크·연결 주제) → Esc, 주제 펼치기 → 상세, 키워드 → Trending 필터 칩 |
| 회귀 | 제목이 링크 → 버튼으로 바뀐 기존 E2E 시나리오 갱신 |
