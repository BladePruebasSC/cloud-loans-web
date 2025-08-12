-- Ensure private 'documents' storage bucket exists
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Recreate policies idempotently
drop policy if exists "Users can view their own documents" on storage.objects;
drop policy if exists "Users can upload their own documents" on storage.objects;
drop policy if exists "Users can update their own documents" on storage.objects;
drop policy if exists "Users can delete their own documents" on storage.objects;

create policy "Users can view their own documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  );

create policy "Users can upload their own documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  );

create policy "Users can update their own documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  );

create policy "Users can delete their own documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  );