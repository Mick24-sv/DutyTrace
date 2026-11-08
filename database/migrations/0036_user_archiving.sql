ALTER TABLE public.users
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archive_previous_status public.user_status,
  ADD CONSTRAINT users_archive_state CHECK (
    (archived_at IS NULL AND archive_previous_status IS NULL) OR
    (archived_at IS NOT NULL AND archive_previous_status IS NOT NULL AND status='disabled')
  );
CREATE INDEX users_archived_at ON public.users(institution_id,archived_at);
