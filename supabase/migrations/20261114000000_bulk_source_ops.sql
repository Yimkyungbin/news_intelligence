-- =====================================================================
-- 출처 AI 번역·요약 허용/차단 일괄 처리 (한 번의 호출로 처리해 대기 시간 단축)
-- 이전: 앱에서 200건 단위로 수십 회 삭제 → 차단에 수십 초 소요
-- =====================================================================
create or replace function public.set_sources_ai_permission(p_source_ids uuid[], p_allowed boolean)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  -- 시스템 소스 중 AI 허용을 바꿀 수 있는 유형만
  update data_sources
     set ai_processing_allowed = p_allowed, external_llm_allowed = p_allowed
   where id = any(p_source_ids)
     and user_id is null
     and source_type not in ('linkedin_api', 'user_provided', 'demo');
  get diagnostics n = row_count;

  update content_items
     set ai_processing_allowed = p_allowed,
         external_llm_allowed  = p_allowed,
         ai_processing_status  = case when p_allowed then 'pending' else 'blocked' end
   where source_id = any(p_source_ids)
     and provenance = 'collected';

  if not p_allowed then
    -- 철회: 해당 출처의 번역·시사점·AI 요약 삭제
    delete from content_ai_cache where source_id = any(p_source_ids);
    delete from ai_insights i
     using content_items c
     where c.id = i.content_id and c.source_id = any(p_source_ids) and c.provenance = 'collected';
  end if;
  return n;
end $$;
revoke execute on function public.set_sources_ai_permission(uuid[], boolean) from public, anon, authenticated;
grant execute on function public.set_sources_ai_permission(uuid[], boolean) to service_role;

-- content_items(source_id, provenance) 조건 갱신 속도
create index if not exists content_items_source_provenance on public.content_items(source_id, provenance);
