/*
  # Fix storage policies to allow client photos and attachments
  
  This migration updates the storage policies to allow users to upload
  files in subdirectories under their user folder, including:
  - client-photos/
  - client-attachments/
  - Any other subdirectories under user-{uid}/
  
  Also makes the bucket public for read access (images need to be viewable)
*/

-- Ensure bucket exists and is public (for reading images)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Create policies idempotently using DO block
DO $$
BEGIN
  -- Public read access (since bucket is public, images need to be viewable)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Public read access to documents'
  ) THEN
    CREATE POLICY "Public read access to documents"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'documents');
  END IF;

  -- View (SELECT) - Allow authenticated users to view their own files
  -- Note: This policy allows viewing files in user-{uid}/ and any subdirectories
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can view their own documents'
  ) THEN
    CREATE POLICY "Users can view their own documents"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
      );
  END IF;

  -- Insert (UPLOAD) - Allow uploading files in user-{uid}/ and any subdirectories
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can upload their own documents'
  ) THEN
    CREATE POLICY "Users can upload their own documents"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
      );
  END IF;

  -- Update - Allow updating files in user-{uid}/ and any subdirectories
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can update their own documents'
  ) THEN
    CREATE POLICY "Users can update their own documents"
      ON storage.objects FOR UPDATE TO authenticated
      USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
      )
      WITH CHECK (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
      );
  END IF;

  -- Delete - Allow deleting files in user-{uid}/ and any subdirectories
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
    AND tablename = 'objects' 
    AND policyname = 'Users can delete their own documents'
  ) THEN
    CREATE POLICY "Users can delete their own documents"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'documents'
        AND (storage.foldername(name))[1] = ('user-' || auth.uid()::text)
      );
  END IF;
END $$;

