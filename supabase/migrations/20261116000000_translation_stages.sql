-- =====================================================================
-- 번역 속도 개선: 2단계 처리(제목 먼저 → 요약·시사점) + 중복 실행 방지
-- =====================================================================

-- 1) 번역 캐시 처리 단계
--    title: 1단계(제목만 번역) 완료, 요약 번역·시사점은 아직
--    full : 2단계까지 완료 (기존 행은 모두 full)
alter table public.content_ai_cache
  add column if not exists stage text not null default 'full'
  check (stage in ('title', 'full'));
create index if not exists content_ai_cache_stage on public.content_ai_cache(stage) where stage = 'title';

-- 2) 처리 중 표시 (URL·단계별). 동시에 여러 화면·작업이 요청해도 한 번만 처리
--    2분이 지난 표시는 실패·중단으로 보고 다시 가져갈 수 있음
create table if not exists public.ai_job_claims (
  original_url text not null,
  stage        text not null check (stage in ('title', 'full')),
  claimed_at   timestamptz not null default now(),
  primary key (original_url, stage)
);
alter table public.ai_job_claims enable row level security;
-- 정책 없음: 클라이언트는 읽기·쓰기 불가 (service role 전용)

-- 아직 처리 중이 아닌 URL 만 가져가고(표시 남김) 그 목록을 돌려줌
create or replace function public.claim_ai_urls(p_urls text[], p_stage text)
returns setof text language plpgsql security definer set search_path = public as $$
begin
  if p_stage not in ('title', 'full') then
    raise exception 'invalid stage';
  end if;
  delete from ai_job_claims where claimed_at < now() - interval '2 minutes';
  return query
    insert into ai_job_claims (original_url, stage)
    select distinct u, p_stage from unnest(p_urls) as u where u is not null
    on conflict do nothing
    returning original_url;
end $$;

create or replace function public.release_ai_urls(p_urls text[], p_stage text)
returns void language sql security definer set search_path = public as $$
  delete from ai_job_claims where stage = p_stage and original_url = any(p_urls);
$$;

revoke execute on function public.claim_ai_urls(text[], text) from public, anon, authenticated;
revoke execute on function public.release_ai_urls(text[], text) from public, anon, authenticated;
grant execute on function public.claim_ai_urls(text[], text) to service_role;
grant execute on function public.release_ai_urls(text[], text) to service_role;
