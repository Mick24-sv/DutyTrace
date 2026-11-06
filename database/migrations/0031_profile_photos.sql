-- Small private account photos persist in PostgreSQL, including hosted deployments.
ALTER TABLE users ADD COLUMN profile_photo bytea,
  ADD COLUMN profile_photo_mime text CHECK (profile_photo_mime IN ('image/png','image/jpeg')),
  ADD COLUMN profile_photo_updated_at timestamptz,
  ADD CONSTRAINT users_profile_photo_size CHECK (profile_photo IS NULL OR octet_length(profile_photo) BETWEEN 1 AND 2097152),
  ADD CONSTRAINT users_profile_photo_complete CHECK (
    (profile_photo IS NULL AND profile_photo_mime IS NULL AND profile_photo_updated_at IS NULL) OR
    (profile_photo IS NOT NULL AND profile_photo_mime IS NOT NULL AND profile_photo_updated_at IS NOT NULL));
