# 요구사항 문서: Phase 2 콘텐츠 수집

## 소개

허용된 외부 소스(RSS, 공식 공개 API)에서 최신 콘텐츠 메타데이터를 수집하고, 사용자별 관심 주제로 분류해 Dashboard·Trending·My Topics에 제공한다. LinkedIn은 수집하지 않으며(UNAVAILABLE), 비인가 스크래핑은 구현하지 않는다. 근거: `docs/api-feasibility-matrix.md`

소스 응답 확인 결과 (2026-11-10):

| 소스 | 방식 | 응답 | 적용 |
|---|---|---|---|
| OpenAI News, Google AI Blog, Google DeepMind Blog, AWS ML Blog | RSS | 200 | 활성화 |
| NVIDIA Technical Blog | Atom | 200 | 활성화 |
| Hacker News (Firebase), arXiv, Hugging Face, GitHub | 공개 API | 200 | 활성화 |
| Microsoft AI Blog | RSS | 410 Gone | 비활성 (대체 피드 확인 필요) |
| Anthropic, Meta AI | RSS | 404 | 비활성 (RSS 미제공) |
| Reddit, X | API | - | CONDITIONAL, 비활성 유지 |

## 요구사항

### 요구사항 1: 소스별 수집기

**사용자 스토리:** 사용자로서, 나는 주요 기술 블로그와 커뮤니티의 최신 콘텐츠를 한곳에서 보고 싶다. 그래야 여러 사이트를 돌아다니지 않아도 된다.

#### 인수 기준

1. WHEN 수집이 실행되면 THE SYSTEM SHALL `is_active = true` 인 소스만 수집한다.
2. THE SYSTEM SHALL 소스별로 제목, 원문 URL, 작성자, 게시일, 요약(최대 500자, HTML 제거), 출처 제공 인기 지표만 저장하고 원문 본문은 저장하지 않는다.
3. THE SYSTEM SHALL RSS 2.0과 Atom 피드를 모두 처리한다.
4. THE SYSTEM SHALL Hacker News는 points·comments, GitHub은 stars, Hugging Face는 likes·downloads를 인기 지표로 저장한다.
5. THE SYSTEM SHALL 수집 콘텐츠의 `provenance`를 `collected`, AI 처리 권한을 소스 설정값(현재 모두 false)으로 저장한다.
6. WHEN 같은 URL이 다시 수집되면 THE SYSTEM SHALL 중복 생성하지 않고 인기 지표만 갱신한다.

### 요구사항 2: 주제별 분류

**사용자 스토리:** 사용자로서, 나는 내 관심 주제와 관련된 콘텐츠만 받고 싶다. 그래야 정보 과잉 없이 필요한 것만 볼 수 있다.

#### 인수 기준

1. WHEN 콘텐츠가 수집되면 THE SYSTEM SHALL 사용자별 활성 주제의 키워드를 제목·요약과 비교(대소문자 무시, NFC)하여 일치하는 주제에 연결한다.
2. THE SYSTEM SHALL 일치한 키워드 비율로 `relevance_score`(0~1)를 저장한다.
3. IF 콘텐츠가 사용자의 어떤 활성 주제와도 일치하지 않으면 THEN THE SYSTEM SHALL 그 사용자에게 저장하지 않는다.
4. IF 주제의 언어가 `ko` 또는 `en` 이라면 THEN THE SYSTEM SHALL 같은 언어로 판별된 콘텐츠만 연결한다.
5. WHEN 분류가 끝나면 THE SYSTEM SHALL 주제의 `last_collected_at` 을 갱신한다.

### 요구사항 3: 수집 실행과 이력

**사용자 스토리:** 사용자로서, 나는 수집이 언제 실행됐고 성공했는지 알고 싶다. 그래야 데이터를 신뢰할 수 있다.

#### 인수 기준

1. THE SYSTEM SHALL 매일 06:00 KST(21:00 UTC)에 전체 사용자 대상 수집을 자동 실행한다 (Vercel Cron).
2. WHEN Cron 엔드포인트가 호출되면 THE SYSTEM SHALL `Authorization: Bearer <CRON_SECRET>` 를 검증하고 불일치 시 401을 반환한다.
3. WHEN 사용자가 Settings에서 "지금 수집"을 누르면 THE SYSTEM SHALL 해당 사용자만 대상으로 수집한다.
4. IF 사용자가 최근 10분 이내에 수동 수집을 실행했다면 THEN THE SYSTEM SHALL 실행을 거부하고 남은 시간을 안내한다.
5. THE SYSTEM SHALL 소스별 실행마다 시작·종료 시각, 상태(success/failed/partial), 수집 건수, 오류 메시지를 `collection_logs` 에 기록한다.
6. IF 소스 요청이 실패하면 THEN THE SYSTEM SHALL 최대 2회 재시도하고, 최종 실패 시 다른 소스 수집은 계속한다.
7. THE SYSTEM SHALL 소스의 `last_collected_at`, `error_message`, `connection_status` 를 갱신한다.
8. THE SYSTEM SHALL Settings에서 최근 수집 이력을 출처 로고와 함께 표시한다.

### 요구사항 4: 사용자 RSS 소스 관리

**사용자 스토리:** 사용자로서, 나는 내가 구독하는 블로그 RSS를 추가하고 싶다. 그래야 인플루언서 개인 채널도 수집할 수 있다.

#### 인수 기준

1. WHEN 사용자가 RSS URL을 추가하면 THE SYSTEM SHALL https URL만 허용하고 본인 소스로 저장한다.
2. THE SYSTEM SHALL 사용자 소스 요청 시 사설·루프백·링크로컬 IP로 해석되는 호스트를 차단한다 (SSRF 방지).
3. THE SYSTEM SHALL 모든 외부 요청에 10초 타임아웃, 응답 최대 2MB, 식별 가능한 User-Agent를 적용한다.
4. WHEN 사용자가 본인 소스를 삭제하거나 비활성화하면 THE SYSTEM SHALL 이후 수집에서 제외한다.
5. THE SYSTEM SHALL 사용자 소스 콘텐츠를 해당 사용자에게만 저장한다.

### 요구사항 5: 보관 기간

**사용자 스토리:** 운영자로서, 나는 소스별 보관 조건을 지키고 싶다. 그래야 약관과 개인정보 요건을 준수할 수 있다.

#### 인수 기준

1. WHEN 콘텐츠를 저장하면 THE SYSTEM SHALL 소스의 `retention_days` 로 `retention_until` 을 설정한다.
2. WHEN Cron 수집이 실행되면 THE SYSTEM SHALL `retention_until` 이 지났고 저장(saved_posts)되지 않은 수집 콘텐츠를 삭제한다.

### 요구사항 6: 테스트

**사용자 스토리:** 개발자로서, 나는 수집기가 외부 네트워크 없이도 검증되기를 원한다. 그래야 CI가 안정적으로 동작한다.

#### 인수 기준

1. THE SYSTEM SHALL 파서(RSS/Atom/HN/GitHub/arXiv/HF), 분류, 언어 판별, URL 안전성 검사를 고정 데이터(fixture) 단위 테스트로 검증한다.
2. THE SYSTEM SHALL E2E에서 로컬 fixture 피드로 "지금 수집" → 콘텐츠 표시(출처 로고·주제 연결) → 수집 이력 표시를 검증한다.
3. THE SYSTEM SHALL DB 테스트에서 클라이언트가 수집 콘텐츠·수집 이력을 위조할 수 없음을 검증한다.
