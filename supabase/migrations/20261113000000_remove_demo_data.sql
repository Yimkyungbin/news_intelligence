-- =====================================================================
-- 예시(DEMO)·목업 데이터 제거 (사용자 요청 2026-11-11)
-- - DEMO 콘텐츠·DEMO 소스 삭제, 신규 가입 시 DEMO 콘텐츠 생성 중단
-- - 모의 AI(DEMO) 결과 삭제. 모의 AI 제공자는 자동 테스트·CI 전용으로만 유지
-- =====================================================================

-- 1) DEMO 콘텐츠 (content_topics·saved_posts·ai_insights 는 FK cascade)
delete from public.content_items where provenance = 'demo';

-- 2) 모의 AI 결과
delete from public.ai_insights where is_demo;
delete from public.topic_insights where is_demo;
delete from public.trend_insights where is_demo;
delete from public.content_ai_cache where is_demo;
delete from public.daily_briefings where is_demo;

-- 3) DEMO 가 섞인 통계는 삭제 (다음 수집 또는 '통계 갱신' 시 실제 데이터로 다시 계산)
delete from public.daily_stats where coalesce((data->>'demo')::int, 0) > 0;

-- 4) DEMO 소스 (user_source_settings 는 FK cascade)
delete from public.data_sources where slug = 'demo' and user_id is null;

-- 5) 신규 가입: 프로필 + 기본 관심 주제 10개만 (DEMO 콘텐츠 없음)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
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
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
