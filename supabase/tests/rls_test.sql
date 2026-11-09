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
  select count(*) into n from public.content_items where user_id = '00000000-0000-0000-0000-00000000000a' and provenance = 'demo';
  assert n = 5, format('seed demo content expected 5, got %s', n);
  select count(*) into n from public.content_topics ct join public.content_items c on c.id = ct.content_id
    where c.user_id = '00000000-0000-0000-0000-00000000000a';
  assert n > 0, 'demo content should be linked to topics';
  raise notice 'PASS seed: 10 topics, 5 demo items, topic links %', n;
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
  assert n = 17, format('system sources expected 17, got %s', n);
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
