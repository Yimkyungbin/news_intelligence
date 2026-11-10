-- =====================================================================
-- Phase 3 AI 분석 (.kiro/specs/phase3-ai-intelligence)
-- 원칙: AI 처리는 서버(service role)에서만, ai_processing_allowed 콘텐츠만, 결과는 사용자별 격리
-- =====================================================================

-- 1) 기본 AI 모델: GPT-6 세대 저비용 모델 (2026-11 공식 문서 기준)
alter table public.profiles alter column ai_model set default 'gpt-6-luna';
update public.profiles set ai_model = 'gpt-6-luna' where ai_model not in ('gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol');
alter table public.profiles add constraint profiles_ai_model_check
  check (ai_model in ('gpt-6-luna', 'gpt-6.1-terra', 'gpt-6.1-sol'));

-- 2) AI 결과 메타데이터: 제공자, DEMO(모의 AI) 여부
alter table public.ai_insights
  add column if not exists provider text not null default 'openai' check (provider in ('openai', 'mock')),
  add column if not exists is_demo boolean not null default false;
create index if not exists ai_insights_content_time on public.ai_insights(content_id, processed_at desc);

-- 3) 작업 이력 상세 (모델, 토큰 사용량, 대상 수 등). 비밀값·원문은 넣지 않는다.
alter table public.collection_logs add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.collection_logs drop constraint if exists collection_logs_job_type_check;
alter table public.collection_logs add constraint collection_logs_job_type_check
  check (job_type in ('collect', 'briefing', 'ai', 'topic_ai'));

-- 4) 주제별 AI 인사이트 (Topic Intelligence)
create table public.topic_insights (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  topic_id      uuid not null references public.topics(id) on delete cascade,
  content       jsonb not null,
  source_ids    uuid[] not null default '{}',
  model_name    text not null,
  provider      text not null check (provider in ('openai', 'mock')),
  is_demo       boolean not null default false,
  generated_at  timestamptz not null default now()
);
create index topic_insights_topic_time on public.topic_insights(topic_id, generated_at desc);
alter table public.topic_insights enable row level security;
-- 조회만 허용 (생성·삭제는 service role)
create policy topic_insights_select on public.topic_insights for select to authenticated
  using (user_id = (select auth.uid()));

-- 5) 브리핑: 클라이언트 쓰기 차단 (생성은 서버만). 조회는 기존 정책 유지
drop policy if exists daily_briefings_insert on public.daily_briefings;
drop policy if exists daily_briefings_update on public.daily_briefings;
