export const ADMIN_FLAG_MIGRATION_SQL = `
ALTER TABLE auth_users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
`;
