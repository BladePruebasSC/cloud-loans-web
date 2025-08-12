-- Create private 'documents' storage bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

-- Policies for 'documents' bucket: users can manage files under their own folder user-<uid>/
-- View (SELECT)
create policy if not exists "Users can view their own documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  );

-- Insert (UPLOAD)
create policy if not exists "Users can upload their own documents"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  );

-- Update
create policy if not exists "Users can update their own documents"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  )
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  );

-- Delete
create policy if not exists "Users can delete their own documents"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
  );