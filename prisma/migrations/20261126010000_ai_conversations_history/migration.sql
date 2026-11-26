-- Persistent Flow AI conversation history synced across devices per user & account.

BEGIN;

CREATE TABLE IF NOT EXISTS flow.ai_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES flow.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES flow.users(id) ON DELETE CASCADE,
  title VARCHAR(160) NOT NULL DEFAULT 'New conversation',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_conversations_account_user_updated_idx
  ON flow.ai_conversations (account_id, user_id, updated_at DESC);

ALTER TABLE flow.ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.ai_conversations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE flow.ai_conversations FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := db_name || '_app';
  migrator_role text := db_name || '_migrator';
  definer_role text := current_user;
  r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE flow.ai_conversations TO %I', app_role);
    EXECUTE 'DROP POLICY IF EXISTS ai_conversations_tenant_policy ON flow.ai_conversations';
    EXECUTE format(
      'CREATE POLICY ai_conversations_tenant_policy ON flow.ai_conversations FOR ALL TO %I USING (flow.can_access_account(account_id)) WITH CHECK (flow.can_access_account(account_id))',
      app_role
    );
  END IF;

  FOREACH r IN ARRAY ARRAY[migrator_role, definer_role] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON flow.ai_conversations', 'ai_conversations_owner_' || r);
      EXECUTE format(
        'CREATE POLICY %I ON flow.ai_conversations FOR ALL TO %I USING (true) WITH CHECK (true)',
        'ai_conversations_owner_' || r,
        r
      );
    END IF;
  END LOOP;
END;
$$;

COMMIT;
