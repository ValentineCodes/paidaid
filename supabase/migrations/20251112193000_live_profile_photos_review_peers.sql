-- Let providers read requesters' live profile photos (and vice versa) when they share a review,
-- so account reputation can show reviewer avatars via signed URLs.

drop policy if exists "live_profile_photos_storage_select_review_peer" on storage.objects;
create policy "live_profile_photos_storage_select_review_peer"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'live-profile-photos'
    and exists (
      select 1
      from public.profiles p
      where p.live_profile_photo_path = name
        and exists (
          select 1
          from public.reviews rv
          where (
            rv.requester_id = p.id
            and rv.provider_user_id = auth.uid()
          )
          or (
            rv.provider_user_id = p.id
            and rv.requester_id = auth.uid()
          )
        )
    )
  );
