-- =====================================================================
-- 트렌드 메인 개편: 카테고리 태깅, 반응 지표 일별 기록, 논문 출처 확대
-- =====================================================================

-- 1) 콘텐츠 카테고리 (고정 8종, 규칙 기반 분류 결과 · src/lib/categories.ts 와 일치)
--    기존 콘텐츠는 null 로 두고 화면에서 같은 규칙으로 계산한다 (재수집 시 저장)
alter table public.content_items
  add column if not exists category text
  check (category is null or category in
    ('model_research','agent','infra','devtools','product','business','policy','usecase'));
create index if not exists content_items_user_category on public.content_items(user_id, category);

-- 2) 반응 지표 일별 기록 (출처가 제공한 지표만, 하루 1건 · 최근 35일 보관)
--    증가량(예: GitHub stars 어제 대비 +860)과 순위 변동 계산에 사용
create table if not exists public.content_metric_snapshots (
  content_id  uuid not null references public.content_items(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  captured_on date not null,
  score       integer not null check (score >= 0),
  popularity  jsonb not null default '{}'::jsonb,
  primary key (content_id, captured_on)
);
create index if not exists content_metric_snapshots_user_day on public.content_metric_snapshots(user_id, captured_on);
alter table public.content_metric_snapshots enable row level security;
-- 조회: 본인 콘텐츠만. 쓰기: service role(수집 파이프라인)만
drop policy if exists content_metric_snapshots_select on public.content_metric_snapshots;
create policy content_metric_snapshots_select on public.content_metric_snapshots
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.purge_old_metric_snapshots()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from content_metric_snapshots where captured_on < (now() at time zone 'Asia/Seoul')::date - 35;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_old_metric_snapshots() from public, anon, authenticated;
grant execute on function public.purge_old_metric_snapshots() to service_role;

-- 3) IT 논문 출처 확대 (공개 API, 2026-11-11 응답 확인)
insert into public.data_sources
  (slug, name, source_type, source_url, homepage_url, logo_key, brand_color,
   connection_status, permission_status, storage_allowed, display_allowed,
   ai_processing_allowed, external_llm_allowed, retention_days, terms_url, policy_note, is_active)
values
  ('hf-papers','Hugging Face Daily Papers','public_api','https://huggingface.co/api/daily_papers','https://huggingface.co/papers','huggingface','#FFD21E',
   'connected','NOT_VERIFIED',true,true,false,false,365,'https://huggingface.co/terms-of-service',
   '커뮤니티가 추천(upvote)한 논문. 제목·초록 일부·추천 수만 저장.',true),
  ('openalex-ai','OpenAlex (AI 분야)','public_api','https://api.openalex.org/works','https://openalex.org','openalex','#C12D2E',
   'connected','NOT_VERIFIED',true,true,false,false,365,'https://help.openalex.org/',
   '학술 메타데이터(CC0). 최근 30일 AI·비전 분야 인용 상위 논문. 키 없이 하루 무료 한도 내 호출 (OPENALEX_API_KEY 선택).',true),
  ('arxiv-systems','arXiv 시스템·보안·SE','public_api','https://rss.arxiv.org/rss/cs.SE+cs.CR+cs.DC+cs.IR','https://arxiv.org','arxiv','#B31B1B',
   'connected','NOT_VERIFIED',true,true,false,false,365,'https://info.arxiv.org/help/api/tou.html',
   'cs.SE·cs.CR·cs.DC·cs.IR 공식 RSS(하루 1회 공지분, 최대 100건). 요청 간 3초 이상 간격.',true),
  ('arxiv-vision','arXiv 비전·로보틱스·멀티에이전트','public_api','https://rss.arxiv.org/rss/cs.CV+cs.RO+cs.MA','https://arxiv.org','arxiv','#B31B1B',
   'connected','NOT_VERIFIED',true,true,false,false,365,'https://info.arxiv.org/help/api/tou.html',
   'cs.CV·cs.RO·cs.MA 공식 RSS(하루 1회 공지분, 최대 100건). 요청 간 3초 이상 간격.',true)
on conflict do nothing;
