-- RLS / 권한 트리거 검증 스크립트 (로컬 전용)
-- 실행: docker exec -i supabase_db_linkedin_intelligence psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls_test.sql
-- 전체를 트랜잭션으로 실행 후 ROLLBACK → DB에 흔적을 남기지 않음
begin;

-- 테스트 사용자 2명 (handle_new_user 트리거로 프로필/주제/DEMO 생성)
insert into auth.users (id, instance_id, aud, role, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local', '{"name":"User A"}', now(), now(), now()),
  ('00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local', '{"name":"User B"}', now(), now(), now());

do $$
declare n int;
begin
  select count(*) into n from public.topics where user_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 10, format('seed topics expected 10, got %s', n);
  -- 예시(DEMO) 콘텐츠는 더 이상 생성하지 않음
  select count(*) into n from public.content_items where user_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 0, format('signup must not create example content, got %s', n);
  select count(*) into n from public.data_sources where slug = 'demo';
  assert n = 0, 'demo source must not exist';
  raise notice 'PASS seed: 10 topics, no example content';
end $$;

-- ===== 사용자 A로 전환 =====
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);

do $$
declare n int; cid uuid; src uuid;
begin
  -- 1) 다른 사용자 데이터 비가시성
  select count(*) into n from public.topics;
  assert n = 10, format('A should see only own 10 topics, got %s', n);
  select count(*) into n from public.content_items where user_id = '00000000-0000-0000-0000-00000000000b';
  assert n = 0, 'A must not see B content';
  select count(*) into n from public.profiles;
  assert n = 1, 'A sees only own profile';
  raise notice 'PASS isolation: A sees only own rows';

  -- 2) 시스템 소스 카탈로그는 읽기 가능, 수정 불가
  select count(*) into n from public.data_sources where user_id is null;
  -- 소스가 추가될 수 있으므로 최소 개수로 확인 (Phase 1: 17 + 확대: 22 - DEMO 1 = 38)
  assert n >= 38, format('system sources expected >= 38, got %s', n);
  update public.data_sources set ai_processing_allowed = true where slug = 'linkedin-api';
  get diagnostics n = row_count;
  assert n = 0, 'A must not update system source';
  raise notice 'PASS catalog: readable, not writable';

  -- 3) 사용자 입력 콘텐츠: AI 권한 플래그를 올려도 강제로 차단됨
  select id into src from public.data_sources where slug = 'user-provided';
  insert into public.content_items (user_id, source_id, title, original_url, source_name, source_type, provenance,
      ai_processing_allowed, external_llm_allowed, ai_processing_status)
    values ('00000000-0000-0000-0000-00000000000a', src, 'LinkedIn post', 'https://www.linkedin.com/posts/x', 'linkedin.com',
      'user_provided', 'user_provided', true, true, 'blocked')
    returning id into cid;
  select count(*) into n from public.content_items where id = cid and not ai_processing_allowed and not external_llm_allowed;
  assert n = 1, 'client-supplied AI permission flags must be forced to false';

  update public.content_items set ai_processing_allowed = true, provenance = 'collected' where id = cid;
  select count(*) into n from public.content_items where id = cid and not ai_processing_allowed and provenance = 'user_provided';
  assert n = 1, 'client must not escalate permissions via update';
  raise notice 'PASS permission guard: AI flags cannot be escalated by client';

  -- 4) 클라이언트가 demo/collected 콘텐츠를 위조 삽입할 수 없음
  begin
    insert into public.content_items (user_id, title, original_url, source_name, source_type, provenance)
      values ('00000000-0000-0000-0000-00000000000a', 'fake', 'https://example.com/fake', 'x', 'rss', 'collected');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not insert collected content';
  end;
  raise notice 'PASS provenance guard: only user_provided insert allowed';

  -- 5) 다른 사용자 명의로 삽입 불가
  begin
    insert into public.topics (user_id, name) values ('00000000-0000-0000-0000-00000000000b', 'hijack');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'A must not insert rows for B';
  end;
  raise notice 'PASS insert guard: cannot write rows for another user';

  -- 6) ai_insights 는 클라이언트 쓰기 불가
  begin
    insert into public.ai_insights (content_id, model_name) values (cid, 'x');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not write ai_insights';
  end;
  raise notice 'PASS ai_insights: read-only for clients';

  -- ===== Phase 2 =====
  -- 8) 클라이언트는 수집 이력을 위조할 수 없음
  begin
    insert into public.collection_logs (user_id, source_id, status, collected_count)
      values ('00000000-0000-0000-0000-00000000000a', src, 'success', 999);
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not insert collection_logs';
  end;
  raise notice 'PASS collection_logs: clients cannot forge logs';

  -- 9) 사용자 RSS 소스: http / 다른 유형 거부
  begin
    insert into public.data_sources (user_id, slug, name, source_type, source_url)
      values ('00000000-0000-0000-0000-00000000000a', 'u-http', 'http feed', 'rss', 'http://example.com/feed');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'http user feed must be rejected';
  end;
  begin
    insert into public.data_sources (user_id, slug, name, source_type, source_url)
      values ('00000000-0000-0000-0000-00000000000a', 'u-api', 'api', 'public_api', 'https://example.com/api');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'non-rss user source must be rejected';
  end;

  -- 10) 사용자 RSS 소스: 권한 값은 서버가 강제 (AI 처리 허용 위조 불가)
  insert into public.data_sources (user_id, slug, name, source_type, source_url, ai_processing_allowed,
      external_llm_allowed, permission_status, retention_days, is_active)
    values ('00000000-0000-0000-0000-00000000000a', 'u-ok', 'my feed', 'rss', 'https://example.com/feed', true, true, 'AVAILABLE', 9999, true);
  select count(*) into n from public.data_sources
    where slug = 'u-ok' and not ai_processing_allowed and not external_llm_allowed
      and permission_status = 'NOT_VERIFIED' and retention_days = 90;
  assert n = 1, 'user source permission fields must be forced';
  update public.data_sources set source_url = 'https://evil.example/feed', ai_processing_allowed = true where slug = 'u-ok';
  select count(*) into n from public.data_sources
    where slug = 'u-ok' and source_url = 'https://example.com/feed' and not ai_processing_allowed;
  assert n = 1, 'user must not change feed url or permissions after insert';
  raise notice 'PASS user feed: https only, permissions forced by server';

  -- 11) 보관 기간 삭제 함수는 클라이언트가 호출할 수 없음
  begin
    perform public.purge_expired_content();
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not call purge_expired_content';
  end;
  raise notice 'PASS purge function: not callable by clients';

  -- ===== Phase 3 =====
  -- 13) 클라이언트는 AI 결과(주제 인사이트)·브리핑을 직접 만들 수 없음
  begin
    insert into public.topic_insights (user_id, topic_id, content, model_name, provider)
      select '00000000-0000-0000-0000-00000000000a', id, '{}'::jsonb, 'x', 'openai' from public.topics limit 1;
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not insert topic_insights';
  end;
  begin
    insert into public.daily_briefings (user_id, briefing_date, content)
      values ('00000000-0000-0000-0000-00000000000a', current_date, '{"fake":true}');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not insert daily_briefings';
  end;
  raise notice 'PASS AI results: clients cannot forge topic insights or briefings';

  -- 14) 지원하지 않는 AI 모델 값 거부
  begin
    update public.profiles set ai_model = 'gpt-4o-mini' where id = '00000000-0000-0000-0000-00000000000a';
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'unsupported ai_model must be rejected';
  end;
  select count(*) into n from public.profiles where id = '00000000-0000-0000-0000-00000000000a' and ai_model = 'gpt-6-luna';
  assert n = 1, 'default ai_model should be gpt-6-luna';
  raise notice 'PASS ai_model: default gpt-6-luna, unsupported values rejected';

  -- ===== 소스 관리·통계·번역 =====
  -- 16) 소스 on/off: 본인 설정만, 직접 입력·LinkedIn 소스는 대상 아님
  insert into public.user_source_settings (user_id, source_id, enabled)
    select '00000000-0000-0000-0000-00000000000a', id, false from public.data_sources where slug = 'github' and user_id is null;
  select count(*) into n from public.user_source_settings where user_id = '00000000-0000-0000-0000-00000000000a';
  assert n = 1, 'A can store own source setting';
  begin
    insert into public.user_source_settings (user_id, source_id, enabled)
      select '00000000-0000-0000-0000-00000000000a', id, false from public.data_sources where slug = 'user-provided';
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'user-provided source must not be toggled';
  end;
  begin
    insert into public.user_source_settings (user_id, source_id, enabled)
      select '00000000-0000-0000-0000-00000000000b', id, false from public.data_sources where slug = 'arxiv';
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'A must not write B source settings';
  end;
  raise notice 'PASS source settings: own only, non-toggleable sources rejected';

  -- 17) 통계·번역 캐시·트렌드 시사점: 클라이언트 쓰기 불가
  begin
    insert into public.daily_stats (user_id, stat_date, data) values ('00000000-0000-0000-0000-00000000000a', current_date, '{}');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not write daily_stats';
  end;
  begin
    insert into public.content_ai_cache (original_url, source_language, title_ko, model_name, provider)
      values ('https://x.example/forged', 'en', '위조', 'x', 'openai');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not write content_ai_cache';
  end;
  begin
    insert into public.trend_insights (user_id, cache_key, content, model_name, provider)
      values ('00000000-0000-0000-0000-00000000000a', 'k', '{}', 'x', 'openai');
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not write trend_insights';
  end;
  begin
    perform public.purge_old_stats();
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'client must not call purge_old_stats';
  end;
  raise notice 'PASS stats/cache/trend: clients cannot write';
end $$;

-- 18) 통계·트렌드 시사점·소스 설정은 본인 것만 조회, 번역 캐시는 공유 조회
reset role;
insert into public.daily_stats (user_id, stat_date, data) values ('00000000-0000-0000-0000-00000000000b', current_date, '{"total":1}');
insert into public.trend_insights (id, user_id, cache_key, content, model_name, provider)
  values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-00000000000b', 'k', '{}', 'm', 'mock');
insert into public.user_source_settings (user_id, source_id, enabled)
  select '00000000-0000-0000-0000-00000000000b', id, false from public.data_sources where slug = 'arxiv' and user_id is null;
insert into public.content_ai_cache (original_url, source_language, title_ko, model_name, provider)
  values ('https://x.example/shared', 'en', '공유 번역', 'm', 'mock');
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.daily_stats where user_id = '00000000-0000-0000-0000-00000000000b';
  assert n = 0, 'A must not see B daily_stats';
  select count(*) into n from public.trend_insights where id = '00000000-0000-0000-0000-0000000000e1';
  assert n = 0, 'A must not see B trend insights';
  select count(*) into n from public.user_source_settings where user_id = '00000000-0000-0000-0000-00000000000b';
  assert n = 0, 'A must not see B source settings';
  select count(*) into n from public.content_ai_cache where original_url = 'https://x.example/shared';
  assert n = 1, 'translation cache is readable by signed-in users';
  raise notice 'PASS isolation: stats, trend insights, source settings; shared translation cache readable';
end $$;

-- 15) 주제 인사이트·브리핑은 본인 것만 조회
reset role;
insert into public.topic_insights (id, user_id, topic_id, content, model_name, provider)
  select '00000000-0000-0000-0000-0000000000d1', user_id, id, '{"overview":"b"}', 'm', 'mock' from public.topics
  where user_id = '00000000-0000-0000-0000-00000000000b' limit 1;
insert into public.daily_briefings (id, user_id, briefing_date, content)
  values ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-00000000000b', current_date, '{}');
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.topic_insights where id = '00000000-0000-0000-0000-0000000000d1';
  assert n = 0, 'A must not see B topic insights';
  select count(*) into n from public.daily_briefings where id = '00000000-0000-0000-0000-0000000000d2';
  assert n = 0, 'A must not see B briefings';
  update public.daily_briefings set content = '{"hijack":true}' where id = '00000000-0000-0000-0000-0000000000d2';
  get diagnostics n = row_count;
  assert n = 0, 'A must not update B briefing';
  raise notice 'PASS AI results isolation: topic insights and briefings per user';
end $$;

-- 12) 시스템 작업(cron) 이력은 모든 사용자가 조회 가능, 다른 사용자의 수동 작업 이력은 불가
reset role;
-- 기존 수집 이력이 있는 DB에서도 동작하도록, 테스트가 넣은 고정 id 로만 판단
insert into public.collection_logs (id, user_id, source_id, status)
  select '00000000-0000-0000-0000-0000000000c1', null, id, 'success' from public.data_sources where slug = 'hacker-news' and user_id is null;
insert into public.collection_logs (id, user_id, source_id, status)
  select '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-00000000000b', id, 'success' from public.data_sources where slug = 'hacker-news' and user_id is null;
set local role authenticated;
do $$
declare n int;
begin
  select count(*) into n from public.collection_logs where id = '00000000-0000-0000-0000-0000000000c1';
  assert n = 1, 'A should see system (cron) logs';
  select count(*) into n from public.collection_logs where id = '00000000-0000-0000-0000-0000000000c2';
  assert n = 0, 'A must not see B manual logs';
  raise notice 'PASS collection_logs visibility';
end $$;

-- ===== 사용자 B로 전환: A의 콘텐츠를 저장(참조)하려는 시도 =====
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
do $$
declare a_content uuid;
begin
  reset role;
  select id into a_content from public.content_items where user_id = '00000000-0000-0000-0000-00000000000a' limit 1;
  set local role authenticated;
  begin
    insert into public.saved_posts (user_id, content_id) values ('00000000-0000-0000-0000-00000000000b', a_content);
    raise exception 'SHOULD_NOT_REACH';
  exception when others then
    assert sqlerrm <> 'SHOULD_NOT_REACH', 'B must not save A content';
  end;
  raise notice 'PASS cross-owner reference blocked';
end $$;

reset role;
-- 7) 계정 삭제 시 cascade
delete from auth.users where id = '00000000-0000-0000-0000-00000000000a';
do $$
declare n int;
begin
  select (select count(*) from public.topics where user_id = '00000000-0000-0000-0000-00000000000a')
       + (select count(*) from public.content_items where user_id = '00000000-0000-0000-0000-00000000000a')
       + (select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000000a') into n;
  assert n = 0, 'account deletion must cascade';
  raise notice 'PASS account deletion cascades all user data';
end $$;

rollback;
