-- Allow engagement participants to read delivery-attachments objects linked to
-- milestone deliveries (requester review modal), not only single-job deliveries.

drop policy if exists "delivery_att_storage_select_participant" on storage.objects;

create policy "delivery_att_storage_select_participant"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'delivery-attachments'
    and (
      exists (
        select 1
        from public.delivery_attachments da
        join public.deliveries d on d.id = da.delivery_id
        where da.storage_path = name
          and public.is_engagement_participant(d.engagement_id, auth.uid())
      )
      or exists (
        select 1
        from public.milestone_delivery_attachments mda
        join public.milestone_deliveries md on md.id = mda.milestone_delivery_id
        join public.engagement_milestones em on em.id = md.milestone_id
        where mda.storage_path = name
          and public.is_engagement_participant(em.engagement_id, auth.uid())
      )
    )
  );
