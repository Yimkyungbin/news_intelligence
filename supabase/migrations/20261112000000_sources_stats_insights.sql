-- =====================================================================
-- 데이터 소스 관리·수집처 확대·일자별 통계·트렌드 시사점·번역 (.kiro/specs/sources-stats-insights)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 사용자별 소스 on/off (행이 없으면 켜짐)
-- ---------------------------------------------------------------------
create table public.user_source_settings (
  user_id    uuid not null references auth.users(id) on delete cascade,
  source_id  uuid not null references public.data_sources(id) on delete cascade,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, source_id)
);
alter table public.user_source_settings enable row level security;
create policy uss_select on public.user_source_settings for select to authenticated using (user_id = (select auth.uid()));
create policy uss_insert on public.user_source_settings for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.data_sources s
      where s.id = source_id and (s.user_id is null or s.user_id = (select auth.uid()))
        and s.source_type not in ('user_provided', 'linkedin_api')
    )
  );
create policy uss_update on public.user_source_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy uss_delete on public.user_source_settings for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2) 소스 유형 'news'(IT 미디어) 추가 + 신규 소스 (응답 확인 2026-11-10)
-- ---------------------------------------------------------------------
alter table public.data_sources drop constraint if exists data_sources_source_type_check;
alter table public.data_sources add constraint data_sources_source_type_check check (source_type in
  ('linkedin_api','official_blog','rss','news','public_api','social_api','user_provided','demo'));

insert into public.data_sources
  (slug, name, source_type, source_url, homepage_url, logo_key, brand_color,
   connection_status, permission_status, storage_allowed, display_allowed,
   ai_processing_allowed, external_llm_allowed, retention_days, terms_url, policy_note, is_active)
values
  -- 국내 IT 뉴스·커뮤니티
  ('geeknews','GeekNews','news','https://news.hada.io/rss/news','https://news.hada.io','geeknews','#2E7D32','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 제목·링크·요약만 저장.',true),
  ('yozm-it','요즘IT','news','https://yozm.wishket.com/magazine/feed/','https://yozm.wishket.com/magazine/','yozm','#5A2FE0','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 제목·링크·요약만 저장.',true),
  ('zdnet-korea','ZDNet Korea','news','https://feeds.feedburner.com/zdkorea','https://zdnet.co.kr','zdnet','#D32F2F','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 제목·링크·요약만 저장. 기사 본문 저장 금지.',true),
  ('etnews','전자신문','news','https://rss.etnews.com/Section901.xml','https://www.etnews.com','etnews','#0B4EA2','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 제목·링크·요약만 저장. 기사 본문 저장 금지.',true),
  ('aitimes','AI타임스','news','https://www.aitimes.com/rss/allArticle.xml','https://www.aitimes.com','aitimes','#1A237E','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 제목·링크·요약만 저장. 기사 본문 저장 금지.',true),
  -- 국내 기업 기술 블로그
  ('kakao-tech','카카오 기술블로그','official_blog','https://tech.kakao.com/feed/','https://tech.kakao.com','kakao','#FFCD00','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',true),
  ('woowahan-tech','우아한형제들 기술블로그','official_blog','https://techblog.woowahan.com/feed/','https://techblog.woowahan.com','woowahan','#2AC1BC','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',true),
  ('naver-d2','네이버 D2','official_blog','https://d2.naver.com/d2.atom','https://d2.naver.com','naver','#03C75A','connected','NOT_VERIFIED',true,true,false,false,180,null,'Atom 피드.',true),
  ('toss-tech','토스 테크','official_blog','https://toss.tech/rss.xml','https://toss.tech','toss','#0064FF','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',true),
  ('daangn-tech','당근 테크','official_blog','https://medium.com/feed/daangn','https://medium.com/daangn','daangn','#FF6F0F','connected','NOT_VERIFIED',true,true,false,false,180,null,'Medium RSS 피드.',true),
  -- 해외 IT 미디어
  ('techcrunch-ai','TechCrunch AI','news','https://techcrunch.com/category/artificial-intelligence/feed/','https://techcrunch.com/category/artificial-intelligence/','techcrunch','#029F00','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 제목·링크·요약만 저장. 기사 본문 저장 금지.',true),
  ('theverge-ai','The Verge AI','news','https://www.theverge.com/rss/ai-artificial-intelligence/index.xml','https://www.theverge.com/ai-artificial-intelligence','theverge','#5200FF','connected','NOT_VERIFIED',true,true,false,false,180,null,'Atom 제목·링크·요약만 저장. 기사 본문 저장 금지.',true),
  ('mit-tr-ai','MIT Technology Review AI','news','https://www.technologyreview.com/topic/artificial-intelligence/feed','https://www.technologyreview.com/topic/artificial-intelligence/','mittr','#111111','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 제목·링크·요약만 저장. 기사 본문 저장 금지.',true),
  ('arstechnica-ai','Ars Technica AI','news','https://arstechnica.com/ai/feed/','https://arstechnica.com/ai/','arstechnica','#FF4E00','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 제목·링크·요약만 저장. 기사 본문 저장 금지.',true),
  -- 뉴스레터·블로그
  ('import-ai','Import AI','rss','https://importai.substack.com/feed','https://importai.substack.com','substack','#FF6719','connected','NOT_VERIFIED',true,true,false,false,180,null,'Substack RSS.',true),
  ('latent-space','Latent Space','rss','https://www.latent.space/feed','https://www.latent.space','latentspace','#7C3AED','connected','NOT_VERIFIED',true,true,false,false,180,null,'뉴스레터 RSS.',true),
  ('simon-willison','Simon Willison','rss','https://simonwillison.net/atom/everything/','https://simonwillison.net','simonw','#334155','connected','NOT_VERIFIED',true,true,false,false,180,null,'개인 블로그 Atom.',true),
  ('hf-blog','Hugging Face Blog','official_blog','https://huggingface.co/blog/feed.xml','https://huggingface.co/blog','huggingface','#FFD21E','connected','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',true),
  -- 개발자 커뮤니티
  ('devto','dev.to','public_api','https://dev.to/api/articles','https://dev.to','devto','#0A0A0A','connected','NOT_VERIFIED',true,true,false,false,90,'https://dev.to/terms','공개 API (tag: ai, llm, machinelearning). 반응·댓글 수를 지표로 사용.',true),
  ('lobsters-ai','Lobsters AI','rss','https://lobste.rs/t/ai.rss','https://lobste.rs/t/ai','lobsters','#AC130D','connected','NOT_VERIFIED',true,true,false,false,90,null,'RSS 피드.',true),
  ('hn-search','Hacker News 검색','public_api','https://hn.algolia.com/api/v1/search','https://hn.algolia.com','hackernews','#F0652F','connected','NOT_VERIFIED',true,true,false,false,90,'https://hn.algolia.com/api',
   '관심 주제의 검색 쿼리로 최근 7일 스토리 검색 (Algolia 공개 API).',true),
  -- SNS
  ('mastodon-tags','Mastodon 해시태그','social_api','https://mastodon.social/api/v1/timelines/tag/','https://mastodon.social','mastodon','#6364FF','connected','NOT_VERIFIED',true,true,false,false,30,'https://mastodon.social/terms',
   '공개 해시태그 타임라인(ai, llm, machinelearning, generativeai). 공개 게시물만, 보관 30일.',true);

-- ---------------------------------------------------------------------
-- 3) 일자별 통계 (원문 미저장, 2년 보관)
-- ---------------------------------------------------------------------
create table public.daily_stats (
  user_id    uuid not null references auth.users(id) on delete cascade,
  stat_date  date not null,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, stat_date)
);
alter table public.daily_stats enable row level security;
create policy daily_stats_select on public.daily_stats for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.purge_old_stats()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from daily_stats where stat_date < (now() at time zone 'Asia/Seoul')::date - 730;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_old_stats() from public, anon, authenticated;
grant execute on function public.purge_old_stats() to service_role;

-- ---------------------------------------------------------------------
-- 4) AI 번역·시사점 캐시 (URL 기준, 사용자 간 공유. 시스템 소스 메타데이터만)
-- ---------------------------------------------------------------------
create table public.content_ai_cache (
  original_url    text primary key check (original_url ~ '^https?://'),
  source_id       uuid references public.data_sources(id) on delete cascade,
  source_language text not null,
  title_ko        text,
  summary_ko      text,
  implication_ko  text,
  model_name      text not null,
  provider        text not null check (provider in ('openai', 'mock')),
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index content_ai_cache_source on public.content_ai_cache(source_id);
alter table public.content_ai_cache enable row level security;
-- 조회: 로그인 사용자 (공개 메타데이터의 번역). 쓰기: service role 만
create policy content_ai_cache_select on public.content_ai_cache for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 5) 트렌드 시사점 (Trending 조건별, 24시간 재사용)
-- ---------------------------------------------------------------------
create table public.trend_insights (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  cache_key    text not null,
  content      jsonb not null,
  model_name   text not null,
  provider     text not null check (provider in ('openai', 'mock')),
  is_demo      boolean not null default false,
  generated_at timestamptz not null default now()
);
create index trend_insights_key on public.trend_insights(user_id, cache_key, generated_at desc);
alter table public.trend_insights enable row level security;
create policy trend_insights_select on public.trend_insights for select to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 6) 사용자 번역 보기 설정, 작업 이력 유형
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists translate_ko boolean not null default true;

alter table public.collection_logs drop constraint if exists collection_logs_job_type_check;
alter table public.collection_logs add constraint collection_logs_job_type_check
  check (job_type in ('collect', 'briefing', 'ai', 'topic_ai', 'stats', 'system_ai', 'trend_ai'));
