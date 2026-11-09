# API Feasibility Matrix

최종 확인: 2026-11-09 (공개 문서 검색 기준, 실제 API 호출 검증 전)
상태: AVAILABLE(검증 완료) / CONDITIONAL(추가 승인·조건 필요) / UNAVAILABLE(현재 사용 불가) / NOT_VERIFIED(미확인)

> 확인되지 않은 기능은 구현 완료로 표시하지 않는다. 앱의 `data_sources.permission_status` 값과 이 문서를 일치시킨다.

## 1. LinkedIn Official API (Source A)

| 기능 | 필요 데이터 | Endpoint / Product | Permission | 승인 | 접근 | 저장 | 표시 | AI 처리 | 보관·삭제 | 상태 | 대체 구현 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 로그인 | 본인 이름·이메일 | Sign In with LinkedIn (OIDC) | openid, profile, email | 셀프서비스 | 가능 | 제한적 | 가능 | 미확인 | 약관 기준 | 미사용 (결정: 이메일 로그인만 사용) | Supabase 이메일 인증 |
| 인플루언서·팔로잉 게시글 조회 | 타인 게시글·반응 | Posts / Social Metadata API | r_member_social | 비공개(신규 신청 받지 않음) | 불가 | - | - | - | - | UNAVAILABLE | 사용자 직접 링크 등록 (My Following) |
| Trending / Top N | 전체 게시글 인기 지표 | 없음 | - | - | 불가 | - | - | - | - | UNAVAILABLE | 외부 소스 지표 기반 집계 (범위 명시) |
| 인플루언서 목록·팔로워 수 | 타인 프로필·지표 | 일반 공개 API 없음 | - | - | 불가 | - | - | - | - | UNAVAILABLE | 사용자 등록, 검증 불가 지표 미표시 |
| 홈 피드 / Follow 목록 | 피드 | 없음 | - | - | 불가 | - | - | - | - | UNAVAILABLE | 사용자 직접 관리 |
| 내가 관리하는 Page 게시글·통계 | 조직 게시글·통계 | Community Management API | r_organization_social 등 | 심사 필요 | 조건부 | 24~48시간 | Page 관리 목적만 | 외부 LLM 금지(정책 검토 필요) | 24h(프로필)/48h(소셜) | CONDITIONAL | Phase 4 검토 |

정책 근거 (요약, 원문 확인 필요):
- Marketing API 데이터는 Page/Profile 관리 목적 외 사용 금지, 멤버 소셜 활동 48시간·프로필 24시간 저장 제한 — [Restricted Uses](https://learn.microsoft.com/en-us/linkedin/marketing/restricted-use-cases), [Data Storage Requirements](https://learn.microsoft.com/en-us/linkedin/marketing/data-storage-requirements)
- r_member_social 은 closed permission — [Social Metadata API](https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/social-metadata-api)
- AI 기능 정책 — [Developer AI Policy](https://learn.microsoft.com/en-us/linkedin/marketing/developer-ai-policy)

## 2. 외부 소스 (Source B)

| 소스 | 방식 | 인증 | 인기 지표 | 상태 | 비고 |
|---|---|---|---|---|---|
| Hacker News | 공식 Firebase API | 불필요 | points, comments | NOT_VERIFIED | Phase 2 기본 소스 |
| GitHub | REST API | 토큰 권장 | stars | NOT_VERIFIED | |
| arXiv | 공식 API | 불필요 | 없음 | NOT_VERIFIED | 논문별 라이선스 상이 |
| Hugging Face | 공개 API | 선택 | likes, downloads | NOT_VERIFIED | |
| 기업 공식 블로그 (OpenAI, Google, DeepMind, NVIDIA, AWS, Microsoft 등) | RSS | 불필요 | 없음 | NOT_VERIFIED | 제목·링크·요약만 저장. Anthropic·Meta는 RSS 제공 여부 확인 필요 |
| Reddit | Data API (OAuth) | 필수 + 사전 승인 | upvotes | CONDITIONAL | Responsible Builder Policy 승인, 무료 비상업 100 QPM |
| X | API v2 Pay-per-use | 필수, 유료 | likes 등 | CONDITIONAL | 무료 티어 없음, 게시글 읽기당 약 $0.005 (2차 자료). 예산 상한 필요 |

## 3. 사용자 입력 (Source C)

| 항목 | 저장 | 표시 | AI 처리 | 비고 |
|---|---|---|---|---|
| URL·제목·메모·태그 | 허용 (본인 용도) | 본인만 (RLS) | 기본 차단 | LinkedIn URL은 링크만 저장, 본문을 가져오지 않음 |

## 4. 콘텐츠 단위 권한 필드

`content_items`: `provenance`, `permission_status`, `storage_allowed`, `display_allowed`, `ai_processing_allowed`, `external_llm_allowed`, `ai_processing_status`, `retention_policy`, `retention_until`

- 클라이언트는 AI 권한 플래그를 올릴 수 없음 (DB 트리거 `protect_content_permissions`)
- `ai_processing_status` 가 진행/완료 상태가 되려면 `ai_processing_allowed = true` 필수 (CHECK 제약)
- 비인가 스크래핑, 브라우저 자동화, 쿠키 재사용, Rate Limit 우회는 구현하지 않음
