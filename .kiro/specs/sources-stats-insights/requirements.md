# 요구사항 문서: 데이터 소스 관리·수집처 확대·일자별 통계·트렌드 시사점·한국어 번역

## 소개

프론트 페이지 점검 후 사용자 요청 5건과 확정된 결정 사항:

| 요청 | 결정 |
|---|---|
| 1. 데이터 소스 on/off | 사용자별 설정. 끈 소스는 수집 중단 + 피드 화면에서 숨김 (저장한 글은 Saved/Knowledge 에 유지) |
| 2. 한국어 번역 토글 | 정책 B: 운영자가 출처별로 "AI 번역·요약 허용"을 켠 출처만 번역 |
| 3. Trending 카드 정보·시사점 | 카드에 주제·요약·한 줄 시사점, 페이지 상단 트렌드 시사점 패널 (AI 부분은 정책 B) |
| 4. 일자별 통계 | 하루 단위 집계 저장(원문 미저장), 보관 2년, 사이드바에 Statistics 메뉴 추가 |
| 5. 수집처 확대 | 응답 확인(2026-11-10)된 "바로 추가 가능" 소스 전체 |

진행 순서: 1 → 5 → 4 → 3 → 2

## 요구사항

### 요구사항 1: 사용자별 데이터 소스 on/off

**사용자 스토리:** 사용자로서, 나는 관심 없는 출처를 끄고 싶다. 그래야 피드에 원하는 정보만 남는다.

#### 인수 기준

1. THE SYSTEM SHALL Settings 의 데이터 소스 표에서 소스마다 켜기/끄기 토글을 제공한다 (직접 입력·LinkedIn 은 제외).
2. WHEN 사용자가 소스를 끄면 THE SYSTEM SHALL 해당 사용자에 대해 그 소스를 수집하지 않는다.
3. WHEN 소스가 꺼져 있으면 THE SYSTEM SHALL Dashboard·Trending·Topics·검색·브리핑·통계에서 그 소스 콘텐츠를 숨긴다.
4. THE SYSTEM SHALL 사용자가 저장한 콘텐츠는 Saved Posts·Knowledge Base 에 계속 표시한다.
5. THE SYSTEM SHALL 설정을 사용자별로 격리하고(RLS), 다른 사용자의 수집에 영향을 주지 않는다.
6. WHEN 모든 사용자가 끈 시스템 소스이면 THE SYSTEM SHALL 외부 요청을 하지 않는다.

### 요구사항 2: 수집처 확대

**사용자 스토리:** 사용자로서, 나는 SNS·IT 뉴스·기술 블로그의 최신 정보도 받고 싶다.

#### 인수 기준

1. THE SYSTEM SHALL 다음 소스를 추가한다:
   - 국내 IT 뉴스·커뮤니티: GeekNews, 요즘IT, ZDNet Korea, 전자신문, AI타임스
   - 국내 기업 기술 블로그: 카카오, 우아한형제들, 네이버 D2, 토스, 당근
   - 해외 IT 미디어: TechCrunch AI, The Verge AI, MIT Technology Review AI, Ars Technica AI
   - 뉴스레터·블로그: Import AI, Latent Space, Simon Willison, Hugging Face Blog
   - 개발자 커뮤니티: dev.to(공개 API), Lobsters AI(RSS), Hacker News 검색(Algolia API)
   - SNS: Mastodon 해시태그 타임라인(공개 API)
2. THE SYSTEM SHALL Hacker News 검색에 사용자 관심 주제의 검색 쿼리를 사용한다 (최근 7일, 전체 쿼리 최대 30개).
3. THE SYSTEM SHALL 사용자 피드로 Mastodon 프로필 RSS 와 Bluesky 프로필(bsky.app/profile/…, 공개 API) 등록을 지원한다.
4. THE SYSTEM SHALL 출처 제공 지표만 저장한다 (dev.to 반응·댓글, Mastodon 좋아요·부스트, HN 검색 points·댓글).
5. THE SYSTEM SHALL 새 소스를 `NOT_VERIFIED` 로 시작하고 제목·링크·요약 500자만 저장하며, SNS 게시글은 보관 30일로 한다.
6. THE SYSTEM SHALL 새 소스마다 로고를 표시한다.

### 요구사항 3: 일자별 통계

**사용자 스토리:** 사용자로서, 나는 지난 정보를 날짜별 통계로 다시 보고 싶다. 그래야 트렌드의 흐름을 알 수 있다.

#### 인수 기준

1. THE SYSTEM SHALL 하루(KST) 단위로 콘텐츠 수, 출처별·주제별·언어별·유형별 건수, 키워드 TOP 30, 인기 콘텐츠 TOP 10(제목·링크·출처만)을 저장한다.
2. THE SYSTEM SHALL 날짜 기준을 게시일(없으면 수집일)로 하고, 늦게 들어온 콘텐츠를 반영하도록 매 수집 후 최근 3일을 다시 계산한다.
3. THE SYSTEM SHALL 통계를 2년간 보관하고 이후 삭제한다. 콘텐츠 원문 보관 기한과 무관하게 집계값은 유지된다.
4. THE SYSTEM SHALL 사이드바 Statistics 메뉴에서 기간(7·30·90·365일)별 일별 건수, 키워드 추이, 출처 비중, 주제별 추이를 차트로 보여 준다.
5. WHEN 사용자가 날짜를 고르면 THE SYSTEM SHALL 그날의 인기 콘텐츠 TOP 10, 키워드, 해당 날짜 브리핑 링크를 보여 준다.
6. THE SYSTEM SHALL 현재 DB 의 콘텐츠로 지난 날짜를 채우는 "통계 갱신"을 제공한다 (최근 90일, 10분에 1회).
7. THE SYSTEM SHALL 통계를 사용자별로 격리하고, 클라이언트가 직접 쓰지 못하게 한다.

### 요구사항 4: Trending 카드 정보와 트렌드 시사점

**사용자 스토리:** 사용자로서, 나는 카드만 보고도 주제·요약·의미를 파악하고 싶다.

#### 인수 기준

1. THE SYSTEM SHALL Trending 카드에 연결된 관심 주제 배지, 요약(최대 3줄), 출처 지표·순위 근거를 표시한다.
2. WHERE 출처의 AI 처리가 허용된 콘텐츠이면 THE SYSTEM SHALL "한 줄 시사점"(AI)을 카드에 표시한다.
3. THE SYSTEM SHALL Trending 상단에 선택 기간·필터 기준 "트렌드 시사점" 패널을 제공한다: 직전 동일 기간 대비 급상승 키워드·새 키워드·주제 증감(집계), AI 시사점 3~5개(AI 허용 콘텐츠, 근거 링크).
4. THE SYSTEM SHALL AI 시사점은 사용자가 생성 버튼을 누를 때 만들고, 같은 조건 결과를 24시간 재사용한다.

### 요구사항 5: 한국어 번역 토글 (정책 B)

**사용자 스토리:** 사용자로서, 나는 외국어 콘텐츠를 한국어로 읽고 싶다.

#### 인수 기준

1. THE SYSTEM SHALL 관리자(`ADMIN_EMAILS`)만 Settings 에서 시스템 소스별 "AI 번역·요약 허용"을 켜고 끌 수 있게 한다.
2. WHEN 관리자가 허용을 켜면 THE SYSTEM SHALL 그 소스의 기존·신규 수집 콘텐츠를 AI 처리 허용으로 바꾸고, 끄면 차단으로 되돌리며 해당 소스의 번역·시사점 결과를 삭제한다.
3. THE SYSTEM SHALL 수집 후 허용 소스의 콘텐츠에 대해 제목·요약 번역(외국어만)과 한 줄 시사점을 일괄 생성하고 URL 기준으로 캐시해 사용자 간에 재사용한다.
4. THE SYSTEM SHALL 시스템 AI 일괄 처리를 하루 100회 호출로 제한한다.
5. THE SYSTEM SHALL Dashboard·Trending 상단에 "한국어로 보기" 토글(사용자별 저장, 기본 켜짐)을 제공한다.
6. WHEN 토글이 켜져 있고 번역이 있으면 THE SYSTEM SHALL 번역 제목·요약과 "번역" 표시를 보여 주고 원문 제목도 함께 확인할 수 있게 한다.
7. IF 번역이 없으면(미허용·미처리) THEN THE SYSTEM SHALL 원문을 그대로 보여 준다.
8. THE SYSTEM SHALL 번역·시사점에 DEMO(모의 AI) 여부를 표시한다.
