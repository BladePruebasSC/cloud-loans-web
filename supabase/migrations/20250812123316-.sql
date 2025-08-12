-- Create documents storage bucket and policies
-- Create bucket if it doesn't exist
insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

-- Allow public read access to documents
create policy if not exists "Public read access to documents"
on storage.objects
for select
using (bucket_id = 'documents');

-- Allow authenticated users to upload to their own folder (user-id as first folder segment)
create policy if not exists "Users can upload their own documents"
on storage.objects
for insert
with check (
  bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to update their own files
create policy if not exists "Users can update their own documents"
on storage.objects
for update
using (
  bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own files
create policy if not exists "Users can delete their own documents"
on storage.objects
for delete
using (
  bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]
);