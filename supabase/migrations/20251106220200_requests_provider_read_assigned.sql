-- Assigned provider can read the request row (for engagement / chat context).
drop policy if exists "requests_select_assigned_provider" on public.requests;
create policy "requests_select_assigned_provider"
  on public.requests for select
  to authenticated
  using (
    exists (
      select 1 from public.assignments a
      where a.request_id = requests.id
        and a.provider_user_id = auth.uid()
    )
  );
