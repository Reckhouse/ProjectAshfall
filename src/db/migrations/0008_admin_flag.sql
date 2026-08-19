-- Persist operator admin grants independently of ADMIN_EMAILS.
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
