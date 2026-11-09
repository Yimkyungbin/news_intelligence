-- =====================================================================
-- Phase 2 콘텐츠 수집 (.kiro/specs/phase2-content-collection)
-- =====================================================================

-- 1) 응답 확인(2026-11-10)된 시스템 소스 활성화
--    permission_status 는 약관 상세 검토 전이므로 NOT_VERIFIED 유지
--    저장·표시는 제목·링크·짧은 요약 메타데이터에 한정, AI 처리는 계속 차단
update public.data_sources
set is_active = true,
    connection_status = 'connected',
    storage_allowed = true,
    display_allowed = true,
    ai_processing_allowed = false,
    external_llm_allowed = false,
    error_message = null
where user_id is null
  and slug in ('openai-blog','google-ai-blog','deepmind-blog','nvidia-blog','aws-ml-blog',
               'hacker-news','github','arxiv','hugging-face');

update public.data_sources
set is_active = false, connection_status = 'error',
    error_message = '피드가 410 Gone 을 반환 (2026-11-10 확인). 대체 피드 확인 필요.'
where user_id is null and slug = 'microsoft-ai-blog';

update public.data_sources
set policy_note = '공식 RSS 미제공 (2026-11-10 확인, 404). 수집하지 않음.'
where user_id is null and slug in ('anthropic-news','meta-ai-blog');

-- 2) 사용자 RSS 소스: https 피드만 추가 가능
drop policy if exists data_sources_insert on public.data_sources;
create policy data_sources_insert on public.data_sources for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and source_type = 'rss'
    and source_url ~ '^https://'
    and char_length(source_url) <= 2000
    and char_length(name) between 1 and 100
  );

-- 사용자 소스의 권한 값은 서버가 정함 (클라이언트가 AI 처리 허용 등을 지정하지 못하도록)
create or replace function public.protect_user_source()
returns trigger language plpgsql as $$
begin
  if coalesce(auth.role(), 'service_role') <> 'service_role' then
    if new.user_id is null then
      raise exception 'system sources are read-only';
    end if;
    if tg_op = 'INSERT' and (new.source_type is distinct from 'rss' or new.source_url !~ '^https://') then
      raise exception 'user sources must be https rss feeds';
    end if;
    if tg_op = 'UPDATE' then
      -- 사용자는 이름·활성 여부만 변경 가능
      new.source_url := old.source_url;
      new.source_type := old.source_type;
      new.slug := old.slug;
      new.user_id := old.user_id;
    end if;
    new.source_type := 'rss';
    new.permission_status := 'NOT_VERIFIED';
    new.storage_allowed := true;
    new.display_allowed := true;
    new.ai_processing_allowed := false;
    new.external_llm_allowed := false;
    new.retention_days := 90;
    new.logo_key := null;
    new.logo_url := null;
    new.brand_color := null;
    new.terms_url := null;
    if tg_op = 'INSERT' then
      new.connection_status := 'not_configured';
      new.last_collected_at := null;
      new.error_message := null;
    else
      new.connection_status := old.connection_status;
      new.last_collected_at := old.last_collected_at;
      new.error_message := old.error_message;
    end if;
  end if;
  return new;
end $$;
create trigger trg_data_sources_protect before insert or update on public.data_sources
  for each row execute function public.protect_user_source();

-- 3) 수집 이력: 본인 작업 + 시스템 소스의 시스템 작업(cron) 조회 허용
drop policy if exists collection_logs_select on public.collection_logs;
create policy collection_logs_select on public.collection_logs for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      user_id is null
      and exists (select 1 from public.data_sources s where s.id = source_id and s.user_id is null)
    )
  );
create index if not exists collection_logs_user_job on public.collection_logs(user_id, job_type, started_at desc);
create index if not exists content_items_retention on public.content_items(retention_until) where retention_until is not null;

-- 4) 보관 기간 경과 + 저장되지 않은 수집 콘텐츠 삭제 (Cron 에서 service role 로 호출)
create or replace function public.purge_expired_content()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from content_items c
  where c.provenance = 'collected'
    and c.retention_until is not null
    and c.retention_until < now()
    and not exists (select 1 from saved_posts s where s.content_id = c.id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_expired_content() from public, anon, authenticated;
grant execute on function public.purge_expired_content() to service_role;
