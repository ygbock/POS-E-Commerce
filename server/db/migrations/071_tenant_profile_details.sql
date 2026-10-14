-- Persist tenant organization profile independently from billing and Discovery listing state.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS profile JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organizations.profile IS
  'Validated non-credential organization contact, address, operational and internal onboarding profile.';
