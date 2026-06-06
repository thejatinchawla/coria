-- Restrict avatar uploads to JPEG and PNG (no GIF/WebP).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/png']::text[]
WHERE id = 'avatars';
