-- =====================================================================
-- LinkedIn Intelligence Hub - 초기 스키마 (Phase 1)
-- 원칙
--  * 모든 사용자 데이터는 user_id 기준 분리 + RLS
--  * 모든 콘텐츠는 출처(source)와 권한 메타데이터(provenance/permission)를 함께 저장
--  * 권한이 확인되지 않은 콘텐츠는 AI 처리 기본 차단 (ai_processing_status = 'blocked')
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 공통: updated_at 자동 갱신
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- users (프로필) : auth.users 1:1
-- ---------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  name          text,
  language      text not null default 'ko' check (language in ('ko','en')),
  timezone      text not null default 'Asia/Seoul',
  briefing_time time not null default '07:00',
  ai_model      text not null default 'gpt-4o-mini',
  notify_email  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- data_sources : 수집처 카탈로그
--   user_id null  = 시스템 공용 카탈로그 (모든 로그인 사용자 읽기 전용)
--   user_id 값 有 = 사용자가 추가한 소스
--   logo_key      = 앱 내 로고 레지스트리 키 (src/lib/sources/registry.ts)
-- ---------------------------------------------------------------------
create table public.data_sources (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references auth.users(id) on delete cascade,
  slug                  text not null,
  name                  text not null,
  source_type           text not null check (source_type in
                          ('linkedin_api','official_blog','rss','public_api','social_api','user_provided','demo')),
  source_url            text,
  homepage_url          text,
  logo_key              text,
  logo_url              text,
  brand_color           text check (brand_color is null or brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  connection_status     text not null default 'not_configured' check (connection_status in
                          ('connected','not_configured','disconnected','error','disabled')),
  permission_status     text not null default 'NOT_VERIFIED' check (permission_status in
                          ('AVAILABLE','CONDITIONAL','UNAVAILABLE','NOT_VERIFIED')),
  -- 소스 단위 기본 처리 권한 (콘텐츠 생성 시 복사됨)
  storage_allowed       boolean not null default false,
  display_allowed       boolean not null default false,
  ai_processing_allowed boolean not null default false,
  external_llm_allowed  boolean not null default false,
  retention_days        integer check (retention_days is null or retention_days > 0),
  terms_url             text,
  policy_note           text,
  is_active             boolean not null default false,
  last_collected_at     timestamptz,
  error_message         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create unique index data_sources_system_slug on public.data_sources(slug) where user_id is null;
create unique index data_sources_user_slug on public.data_sources(user_id, slug) where user_id is not null;
create trigger trg_data_sources_updated before update on public.data_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- topics
-- ---------------------------------------------------------------------
create table public.topics (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 100),
  description       text check (char_length(description) <= 1000),
  keywords          text[] not null default '{}',
  search_queries    text[] not null default '{}',
  priority          smallint not null default 3 check (priority between 1 and 5),
  language          text not null default 'all' check (language in ('all','ko','en')),
  is_active         boolean not null default true,
  last_collected_at timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, name)
);
create index topics_user on public.topics(user_id);
create trigger trg_topics_updated before update on public.topics
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- influencers : Influencers 메뉴 + My Following (is_following)
-- 팔로워 수 등 검증 불가 지표는 저장하지 않음
-- ---------------------------------------------------------------------
create table public.influencers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 100),
  company       text check (char_length(company) <= 200),
  job_title     text check (char_length(job_title) <= 200),
  linkedin_url  text check (linkedin_url is null or linkedin_url ~ '^https://([a-z]+\.)?linkedin\.com/'),
  category      text[] not null default '{}',
  notes         text check (char_length(notes) <= 4000),
  is_following  boolean not null default true,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index influencers_user on public.influencers(user_id);
create trigger trg_influencers_updated before update on public.influencers
  for each row execute function public.set_updated_at();

-- 인물별 콘텐츠 링크 (사용자 직접 관리)
create table public.influencer_links (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  influencer_id  uuid not null references public.influencers(id) on delete cascade,
  url            text not null check (url ~ '^https?://'),
  title          text check (char_length(title) <= 300),
  note           text check (char_length(note) <= 2000),
  posted_at      date,
  created_at     timestamptz not null default now()
);
create index influencer_links_inf on public.influencer_links(influencer_id);

-- ---------------------------------------------------------------------
-- content_items : 모든 수집/입력 콘텐츠 + 출처·권한 메타데이터
-- ---------------------------------------------------------------------
create table public.content_items (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  source_id             uuid references public.data_sources(id) on delete set null,
  influencer_id         uuid references public.influencers(id) on delete set null,
  title                 text not null check (char_length(title) between 1 and 500),
  summary               text check (char_length(summary) <= 5000),
  original_url          text not null check (original_url ~ '^https?://'),
  author                text,
  author_title          text,
  author_company        text,
  source_name           text not null,
  source_type           text not null,
  published_at          timestamptz,
  collected_at          timestamptz not null default now(),
  language              text not null default 'en',
  content_type          text not null default 'article' check (content_type in
                          ('article','post','paper','repository','model','discussion','video','other')),
  keywords              text[] not null default '{}',
  -- 출처가 실제 제공한 인기 지표만 저장 (예: {"points":120,"comments":45})
  popularity            jsonb not null default '{}'::jsonb,
  -- provenance: demo / collected / user_provided / linkedin_api
  provenance            text not null check (provenance in ('demo','collected','user_provided','linkedin_api')),
  permission_status     text not null default 'NOT_VERIFIED' check (permission_status in
                          ('AVAILABLE','CONDITIONAL','UNAVAILABLE','NOT_VERIFIED')),
  storage_allowed       boolean not null default false,
  display_allowed       boolean not null default true,
  ai_processing_allowed boolean not null default false,
  external_llm_allowed  boolean not null default false,
  ai_processing_status  text not null default 'blocked' check (ai_processing_status in
                          ('blocked','pending','processing','completed','failed')),
  retention_policy      text,
  retention_until       timestamptz,
  created_at            timestamptz not null default now(),
  unique (user_id, original_url),
  -- AI 처리 허용 없이 pending/processing/completed 불가
  constraint ai_requires_permission check (
    ai_processing_status in ('blocked','failed') or ai_processing_allowed
  )
);
create index content_items_user_pub on public.content_items(user_id, published_at desc);
create index content_items_user_collected on public.content_items(user_id, collected_at desc);
create index content_items_source on public.content_items(source_id);

create table public.content_topics (
  id              uuid primary key default gen_random_uuid(),
  content_id      uuid not null references public.content_items(id) on delete cascade,
  topic_id        uuid not null references public.topics(id) on delete cascade,
  relevance_score real not null default 0 check (relevance_score between 0 and 1),
  created_at      timestamptz not null default now(),
  unique (content_id, topic_id)
);
create index content_topics_topic on public.content_topics(topic_id);

-- ---------------------------------------------------------------------
-- saved_posts + folders
-- ---------------------------------------------------------------------
create table public.saved_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);

create table public.saved_posts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  content_id  uuid not null references public.content_items(id) on delete cascade,
  folder_id   uuid references public.saved_folders(id) on delete set null,
  notes       text check (char_length(notes) <= 4000),
  tags        text[] not null default '{}',
  in_knowledge_base boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (user_id, content_id)
);
create index saved_posts_user on public.saved_posts(user_id, created_at desc);

-- ---------------------------------------------------------------------
-- AI / 수집 / 브리핑
-- ---------------------------------------------------------------------
create table public.ai_insights (
  id            uuid primary key default gen_random_uuid(),
  content_id    uuid not null references public.content_items(id) on delete cascade,
  summary       text,
  key_points    jsonb not null default '[]'::jsonb,
  keywords      text[] not null default '{}',
  insights      jsonb not null default '{}'::jsonb,
  model_name    text not null,
  processed_at  timestamptz not null default now()
);
create index ai_insights_content on public.ai_insights(content_id);

create table public.collection_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade,
  source_id       uuid references public.data_sources(id) on delete cascade,
  job_type        text not null default 'collect' check (job_type in ('collect','briefing','ai')),
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  status          text not null default 'running' check (status in ('running','success','failed','partial')),
  attempt         smallint not null default 1,
  collected_count integer not null default 0,
  error_message   text
);
create index collection_logs_source on public.collection_logs(source_id, started_at desc);

create table public.daily_briefings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  briefing_date date not null,
  content       jsonb not null,
  model_name    text,
  is_demo       boolean not null default false,
  generated_at  timestamptz not null default now(),
  unique (user_id, briefing_date)
);

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles         enable row level security;
alter table public.data_sources     enable row level security;
alter table public.topics           enable row level security;
alter table public.influencers      enable row level security;
alter table public.influencer_links enable row level security;
alter table public.content_items    enable row level security;
alter table public.content_topics   enable row level security;
alter table public.saved_folders    enable row level security;
alter table public.saved_posts      enable row level security;
alter table public.ai_insights      enable row level security;
alter table public.collection_logs  enable row level security;
alter table public.daily_briefings  enable row level security;

-- profiles: 본인만 조회/수정 (생성은 트리거, 삭제는 auth.users cascade)
create policy profiles_select on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- data_sources: 시스템 카탈로그는 읽기 전용, 사용자 소스는 본인만 CRUD
create policy data_sources_select on public.data_sources for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy data_sources_insert on public.data_sources for insert to authenticated
  with check (user_id = (select auth.uid()) and source_type in ('rss','official_blog','user_provided'));
create policy data_sources_update on public.data_sources for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy data_sources_delete on public.data_sources for delete to authenticated
  using (user_id = (select auth.uid()));

-- 사용자 소유 테이블 공통 정책
do $$
declare t text;
begin
  foreach t in array array['topics','influencers','influencer_links','content_items','saved_folders','saved_posts','daily_briefings']
  loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- content_topics: 콘텐츠와 주제 모두 본인 소유일 때만
create policy content_topics_all on public.content_topics for all to authenticated
  using (
    exists (select 1 from public.content_items c where c.id = content_id and c.user_id = (select auth.uid()))
  )
  with check (
    exists (select 1 from public.content_items c where c.id = content_id and c.user_id = (select auth.uid()))
    and exists (select 1 from public.topics t where t.id = topic_id and t.user_id = (select auth.uid()))
  );

-- ai_insights: 조회만 허용 (생성은 서버의 service role이 권한 확인 후 수행)
create policy ai_insights_select on public.ai_insights for select to authenticated
  using (exists (select 1 from public.content_items c where c.id = content_id and c.user_id = (select auth.uid())));

-- collection_logs: 본인 작업 또는 시스템 소스 작업 조회만
create policy collection_logs_select on public.collection_logs for select to authenticated
  using (user_id = (select auth.uid()));

-- 다른 사용자의 influencer/topic/folder를 참조하지 못하도록 소유권 검증
create or replace function public.assert_same_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'influencer_links' then
    if not exists (select 1 from influencers where id = new.influencer_id and user_id = new.user_id) then
      raise exception 'influencer not owned by user';
    end if;
  elsif tg_table_name = 'saved_posts' then
    if not exists (select 1 from content_items where id = new.content_id and user_id = new.user_id) then
      raise exception 'content not owned by user';
    end if;
    if new.folder_id is not null and not exists (select 1 from saved_folders where id = new.folder_id and user_id = new.user_id) then
      raise exception 'folder not owned by user';
    end if;
  elsif tg_table_name = 'content_items' then
    if new.influencer_id is not null and not exists (select 1 from influencers where id = new.influencer_id and user_id = new.user_id) then
      raise exception 'influencer not owned by user';
    end if;
    if new.source_id is not null and not exists (
      select 1 from data_sources where id = new.source_id and (user_id is null or user_id = new.user_id)) then
      raise exception 'source not accessible';
    end if;
  end if;
  return new;
end $$;
create trigger trg_influencer_links_owner before insert or update on public.influencer_links
  for each row execute function public.assert_same_owner();
create trigger trg_saved_posts_owner before insert or update on public.saved_posts
  for each row execute function public.assert_same_owner();
create trigger trg_content_items_owner before insert or update on public.content_items
  for each row execute function public.assert_same_owner();

-- 클라이언트가 AI 처리 권한 플래그를 임의로 올리지 못하도록 보호
-- (service_role 만 ai_processing_allowed / external_llm_allowed / permission_status 변경 가능)
create or replace function public.protect_content_permissions()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    if tg_op = 'INSERT' then
      new.ai_processing_allowed := false;
      new.external_llm_allowed  := false;
      new.ai_processing_status  := 'blocked';
      if new.provenance not in ('user_provided') then
        raise exception 'clients may only insert user_provided content';
      end if;
    else
      new.ai_processing_allowed := old.ai_processing_allowed;
      new.external_llm_allowed  := old.external_llm_allowed;
      new.permission_status     := old.permission_status;
      new.provenance            := old.provenance;
      new.ai_processing_status  := old.ai_processing_status;
    end if;
  end if;
  return new;
end $$;
create trigger trg_content_items_protect before insert or update on public.content_items
  for each row execute function public.protect_content_permissions();

-- =====================================================================
-- 시스템 데이터 소스 카탈로그 (상태는 docs/api-feasibility-matrix.md 기준)
-- =====================================================================
insert into public.data_sources
  (slug, name, source_type, source_url, homepage_url, logo_key, brand_color,
   connection_status, permission_status, storage_allowed, display_allowed,
   ai_processing_allowed, external_llm_allowed, retention_days, terms_url, policy_note, is_active)
values
  ('linkedin-api','LinkedIn Official API','linkedin_api',null,'https://www.linkedin.com','linkedin','#0A66C2',
   'disabled','UNAVAILABLE',false,false,false,false,1,'https://www.linkedin.com/legal/l/api-terms-of-use',
   '타인 게시글 조회 권한(r_member_social)이 비공개이며 신규 신청을 받지 않음. 저장 기간 24~48시간 제한. 외부 LLM 처리 금지.',false),
  ('hacker-news','Hacker News','public_api','https://hacker-news.firebaseio.com/v0/','https://news.ycombinator.com','hackernews','#F0652F',
   'not_configured','NOT_VERIFIED',true,true,false,false,90,'https://github.com/HackerNews/API',
   '공식 Firebase API. 점수·댓글 수를 인기 지표로 사용. AI 처리 범위는 약관 검토 후 허용.',false),
  ('github','GitHub','public_api','https://api.github.com','https://github.com','github','#181717',
   'not_configured','NOT_VERIFIED',true,true,false,false,90,'https://docs.github.com/en/site-policy/github-terms/github-terms-of-service',
   '공식 REST API. 저장소/릴리스 메타데이터.',false),
  ('arxiv','arXiv','public_api','https://export.arxiv.org/api/query','https://arxiv.org','arxiv','#B31B1B',
   'not_configured','NOT_VERIFIED',true,true,false,false,365,'https://info.arxiv.org/help/api/tou.html',
   '공식 API. 메타데이터·초록. 논문별 라이선스 상이.',false),
  ('hugging-face','Hugging Face','public_api','https://huggingface.co/api','https://huggingface.co','huggingface','#FFD21E',
   'not_configured','NOT_VERIFIED',true,true,false,false,90,'https://huggingface.co/terms-of-service',
   '공개 API. 모델/Daily Papers 트렌드.',false),
  ('openai-blog','OpenAI News','official_blog','https://openai.com/news/rss.xml','https://openai.com/news','openai','#000000',
   'not_configured','NOT_VERIFIED',true,true,false,false,180,'https://openai.com/policies/terms-of-use',
   'RSS 피드 제목·링크·요약만 저장.',false),
  ('anthropic-news','Anthropic News','official_blog',null,'https://www.anthropic.com/news','anthropic','#191919',
   'not_configured','NOT_VERIFIED',true,true,false,false,180,null,'공식 RSS 제공 여부 확인 필요.',false),
  ('google-ai-blog','Google AI Blog','official_blog','https://blog.google/technology/ai/rss/','https://blog.google/technology/ai/','google','#4285F4',
   'not_configured','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',false),
  ('deepmind-blog','Google DeepMind Blog','official_blog','https://deepmind.google/blog/rss.xml','https://deepmind.google/discover/blog/','deepmind','#4285F4',
   'not_configured','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',false),
  ('nvidia-blog','NVIDIA Technical Blog','official_blog','https://developer.nvidia.com/blog/feed','https://developer.nvidia.com/blog','nvidia','#76B900',
   'not_configured','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',false),
  ('meta-ai-blog','Meta AI Blog','official_blog',null,'https://ai.meta.com/blog/','meta','#0467DF',
   'not_configured','NOT_VERIFIED',true,true,false,false,180,null,'공식 RSS 제공 여부 확인 필요.',false),
  ('aws-ml-blog','AWS Machine Learning Blog','official_blog','https://aws.amazon.com/blogs/machine-learning/feed/','https://aws.amazon.com/blogs/machine-learning/','aws','#FF9900',
   'not_configured','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',false),
  ('microsoft-ai-blog','Microsoft AI Blog','official_blog','https://blogs.microsoft.com/ai/feed/','https://blogs.microsoft.com/ai/','microsoft','#0078D4',
   'not_configured','NOT_VERIFIED',true,true,false,false,180,null,'RSS 피드.',false),
  ('reddit','Reddit','social_api','https://oauth.reddit.com','https://www.reddit.com','reddit','#FF4500',
   'not_configured','CONDITIONAL',false,true,false,false,2,'https://redditinc.com/policies/data-api-terms',
   'Responsible Builder Policy에 따라 사전 승인 필요. OAuth 필수, 무료 비상업 100 QPM.',false),
  ('x','X (Twitter)','social_api','https://api.x.com/2','https://x.com','x','#000000',
   'not_configured','CONDITIONAL',false,true,false,false,30,'https://developer.x.com/en/developer-terms/agreement-and-policy',
   'Pay-per-use 유료 API(무료 티어 없음). 예산 상한 설정 후 활성화.',false),
  ('user-provided','직접 입력','user_provided',null,null,'user','#64748B',
   'connected','CONDITIONAL',true,true,false,false,null,null,
   '사용자가 직접 등록한 URL/텍스트. AI 처리는 사용자가 권리 확인 후 개별 허용(Phase 3).',true),
  ('demo','DEMO DATA','demo',null,null,'demo','#D97706',
   'connected','AVAILABLE',true,true,false,false,null,null,'화면 시연용 가상 데이터. 실제 수집 데이터 아님.',true);

-- =====================================================================
-- 신규 가입 시: 프로필 + 기본 관심 주제 10개 + DEMO 콘텐츠 생성
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  demo_src uuid;
begin
  insert into profiles (id, email, name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)));

  insert into topics (user_id, name, description, keywords, search_queries, priority, language) values
    (new.id,'Agentic AI','자율적으로 계획·실행하는 AI 에이전트',
      array['agentic ai','ai agent','autonomous agent','tool use'], array['"agentic AI"','"AI agents" enterprise'],5,'all'),
    (new.id,'Enterprise AI Platform','기업용 AI 플랫폼과 도입 전략',
      array['enterprise ai','ai platform','genai adoption'], array['"enterprise AI platform"'],4,'all'),
    (new.id,'RAG / Knowledge Management','검색 증강 생성과 지식 관리',
      array['rag','retrieval augmented generation','vector database','knowledge graph'], array['RAG retrieval augmented generation'],5,'all'),
    (new.id,'Multi-Agent Orchestration','다중 에이전트 협업·오케스트레이션',
      array['multi-agent','orchestration','agent framework','a2a'], array['"multi-agent" orchestration'],4,'all'),
    (new.id,'Context Engineering','LLM 컨텍스트 설계와 관리',
      array['context engineering','prompt engineering','context window','mcp'], array['"context engineering" LLM'],4,'all'),
    (new.id,'AI Infrastructure','GPU, 추론 인프라, 서빙',
      array['gpu','inference','ai infrastructure','serving'], array['"AI infrastructure" GPU inference'],3,'all'),
    (new.id,'Sovereign AI','국가·기업 주권형 AI',
      array['sovereign ai','national ai','data sovereignty'], array['"sovereign AI"'],3,'all'),
    (new.id,'LLM / Open-weight Models','LLM 및 오픈 웨이트 모델',
      array['llm','open-weight','open source model','foundation model'], array['open-weight LLM release'],4,'all'),
    (new.id,'AI Governance & Security','AI 거버넌스, 보안, 규제',
      array['ai governance','ai security','ai act','guardrails'], array['"AI governance" security'],3,'all'),
    (new.id,'MLOps / LLMOps','모델 운영과 평가',
      array['mlops','llmops','evaluation','observability'], array['LLMOps evaluation observability'],3,'all');

  select id into demo_src from data_sources where slug = 'demo' and user_id is null;

  -- DEMO 콘텐츠 : provenance='demo', 링크는 각 서비스 홈(가상 게시글 아님을 명확히)
  insert into content_items
    (user_id, source_id, title, summary, original_url, author, source_name, source_type,
     published_at, language, content_type, keywords, popularity, provenance, permission_status,
     storage_allowed, display_allowed, retention_policy)
  values
    (new.id, demo_src, '[DEMO] 엔터프라이즈 Agentic AI 도입 체크리스트',
      '시연용 예시 콘텐츠입니다. 실제 수집 데이터가 아닙니다.', 'https://news.ycombinator.com/?demo=1',
      'Demo Author', 'Hacker News (DEMO)', 'demo', now() - interval '3 hours', 'ko', 'discussion',
      array['agentic ai','enterprise ai'], '{"points": 0}', 'demo', 'AVAILABLE', true, true, 'demo'),
    (new.id, demo_src, '[DEMO] Open-weight 모델 릴리스 동향', '시연용 예시 콘텐츠입니다.',
      'https://huggingface.co/?demo=2', 'Demo Author', 'Hugging Face (DEMO)', 'demo', now() - interval '6 hours',
      'ko', 'model', array['llm','open-weight'], '{}', 'demo', 'AVAILABLE', true, true, 'demo'),
    (new.id, demo_src, '[DEMO] Multi-Agent Orchestration 프레임워크 비교', '시연용 예시 콘텐츠입니다.',
      'https://github.com/?demo=3', 'Demo Author', 'GitHub (DEMO)', 'demo', now() - interval '1 day',
      'ko', 'repository', array['multi-agent','orchestration'], '{}', 'demo', 'AVAILABLE', true, true, 'demo'),
    (new.id, demo_src, '[DEMO] RAG 평가 방법론 논문 요약', '시연용 예시 콘텐츠입니다.',
      'https://arxiv.org/?demo=4', 'Demo Author', 'arXiv (DEMO)', 'demo', now() - interval '2 days',
      'ko', 'paper', array['rag','evaluation'], '{}', 'demo', 'AVAILABLE', true, true, 'demo'),
    (new.id, demo_src, '[DEMO] AI 인프라: 추론 비용 최적화', '시연용 예시 콘텐츠입니다.',
      'https://developer.nvidia.com/blog?demo=5', 'Demo Author', 'NVIDIA Technical Blog (DEMO)', 'demo', now() - interval '4 days',
      'ko', 'article', array['inference','gpu'], '{}', 'demo', 'AVAILABLE', true, true, 'demo');

  -- DEMO 콘텐츠를 키워드가 겹치는 주제에 연결
  insert into content_topics (content_id, topic_id, relevance_score)
  select c.id, t.id, 0.8
  from content_items c join topics t on t.user_id = c.user_id and t.keywords && c.keywords
  where c.user_id = new.id
  on conflict do nothing;

  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 트리거 함수는 클라이언트에서 직접 호출 불가
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.assert_same_owner() from public, anon, authenticated;
