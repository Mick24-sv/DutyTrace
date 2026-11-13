-- Commit the enum addition before subsequent migrations use the new value.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin';
