-- Private file storage (D-11).
--
-- Both buckets are private: files are viewed only through signed links that
-- expire. Paths start with the owner's id, so ownership is checked from the
-- path alone. The type list and size limit match UPLOAD_LIMITS in
-- src/services/uploads/imageValidation.js.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('report-photos', 'report-photos', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('identity-evidence', 'identity-evidence', false, 5242880,
   array['image/jpeg', 'image/png', 'image/webp']);

-- report-photos/{reporter_id}/{report_id}/{file}

create policy "reporters upload into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'report-photos'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "reporters and responders view report photos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'report-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_responder())
  );

create policy "reviewers remove report photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'report-photos' and public.is_reviewer());

-- identity-evidence/{applicant_id}/{file}

create policy "applicants upload into their own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'identity-evidence'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "applicants and reviewers view evidence" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'identity-evidence'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_reviewer())
  );

-- Only once no pending application still needs the files.
create policy "reviewers remove evidence after a decision" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'identity-evidence'
    and public.is_reviewer()
    and not exists (
      select 1 from public.responder_applications a
      where a.applicant_id::text = (storage.foldername(name))[1]
        and a.status = 'pending'
    )
  );
