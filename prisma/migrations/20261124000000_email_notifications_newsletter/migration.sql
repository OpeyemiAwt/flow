-- Add email notification preferences (transaction receipts & blog newsletter)
-- and idempotent email delivery tracking with scoped SECURITY DEFINER helpers.

BEGIN;

ALTER TABLE flow.account_notification_preferences
  ADD COLUMN IF NOT EXISTS email_transactions BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_newsletter BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS flow.email_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES flow.users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES flow.accounts(id) ON DELETE CASCADE,
  kind VARCHAR(32) NOT NULL,
  dedupe_key VARCHAR(191) NOT NULL UNIQUE,
  recipient_email VARCHAR(320) NOT NULL,
  subject VARCHAR(240) NOT NULL,
  provider_message_id VARCHAR(128),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_deliveries_user_kind_idx
  ON flow.email_deliveries (user_id, kind, created_at DESC);

ALTER TABLE flow.email_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.email_deliveries FORCE ROW LEVEL SECURITY;

-- Atomically claims a dedupe slot for an email delivery so WELCOME, TX_RECEIPT,
-- and BLOG_NEWSLETTER emails can never be sent twice for the same event.
CREATE OR REPLACE FUNCTION flow.claim_email_delivery(
  p_dedupe_key text,
  p_kind text,
  p_user_id uuid,
  p_account_id uuid,
  p_recipient_email text,
  p_subject text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  inserted_count integer := 0;
BEGIN
  IF p_dedupe_key IS NULL OR btrim(p_dedupe_key) = '' THEN
    RETURN false;
  END IF;

  INSERT INTO flow.email_deliveries (
    user_id,
    account_id,
    kind,
    dedupe_key,
    recipient_email,
    subject
  )
  VALUES (
    p_user_id,
    p_account_id,
    left(p_kind, 32),
    left(p_dedupe_key, 191),
    left(lower(btrim(p_recipient_email)), 320),
    left(p_subject, 240)
  )
  ON CONFLICT (dedupe_key) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count > 0;
END;
$$;

-- Release a claimed dedupe slot if Resend delivery transiently fails so it can be retried.
CREATE OR REPLACE FUNCTION flow.release_email_delivery_claim(
  p_dedupe_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  DELETE FROM flow.email_deliveries
  WHERE dedupe_key = p_dedupe_key
    AND provider_message_id IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION flow.mark_email_delivery_sent(
  p_dedupe_key text,
  p_provider_message_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  UPDATE flow.email_deliveries
  SET provider_message_id = left(p_provider_message_id, 128)
  WHERE dedupe_key = p_dedupe_key;
END;
$$;

-- Looks up the email target and transaction-receipt opt-in for an account
-- (used by custody/payment workers when a transfer settles).
CREATE OR REPLACE FUNCTION flow.get_account_tx_email_target(
  p_account_id uuid
)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  flow_id text,
  email_transactions boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF p_account_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    au.email::text AS email,
    COALESCE(NULLIF(btrim(up.display_name), ''), NULLIF(btrim(au.name), ''), 'FLOW user')::text AS display_name,
    a.flow_id::text AS flow_id,
    COALESCE(np.email_transactions, true) AS email_transactions
  FROM flow.accounts a
  JOIN flow.users u
    ON u.id = a.personal_owner_id
    OR EXISTS (
      SELECT 1
      FROM flow.account_memberships m
      WHERE m.account_id = a.id
        AND m.user_id = u.id
        AND m.role = 'OWNER'
        AND m.status = 'ACTIVE'
    )
  JOIN flow.auth_users au ON au.id = u.auth_user_id
  LEFT JOIN flow.user_profile_preferences up ON up.user_id = u.id
  LEFT JOIN flow.account_notification_preferences np
    ON np.account_id = a.id
    AND np.user_id = u.id
  WHERE a.id = p_account_id
    AND u.active = true
    AND au.email_verified = true
    AND au.mailbox_paused = false
  ORDER BY (u.id = a.personal_owner_id) DESC
  LIMIT 1;
END;
$$;

-- Lists all active verified users subscribed to the FLOW Blog newsletter.
CREATE OR REPLACE FUNCTION flow.list_newsletter_subscribers()
RETURNS TABLE (
  account_id uuid,
  user_id uuid,
  email text,
  display_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (lower(au.email))
    np.account_id,
    np.user_id,
    au.email::text AS email,
    COALESCE(NULLIF(btrim(up.display_name), ''), NULLIF(btrim(au.name), ''), 'there')::text AS display_name
  FROM flow.account_notification_preferences np
  JOIN flow.users u ON u.id = np.user_id
  JOIN flow.auth_users au ON au.id = u.auth_user_id
  LEFT JOIN flow.user_profile_preferences up ON up.user_id = u.id
  WHERE np.email_newsletter = true
    AND u.active = true
    AND au.email_verified = true
    AND au.mailbox_paused = false
  ORDER BY lower(au.email), np.updated_at DESC;
END;
$$;

-- One-click unsubscribe helper invoked via HMAC-signed unsubscribe token.
CREATE OR REPLACE FUNCTION flow.unsubscribe_email_preference(
  p_account_id uuid,
  p_user_id uuid,
  p_kind text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF p_account_id IS NULL OR p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF p_kind = 'newsletter' THEN
    INSERT INTO flow.account_notification_preferences (
      account_id, user_id, email_newsletter, updated_at
    )
    VALUES (p_account_id, p_user_id, false, now())
    ON CONFLICT (account_id, user_id)
    DO UPDATE SET email_newsletter = false, updated_at = now();
    RETURN true;
  ELSIF p_kind = 'transactions' THEN
    INSERT INTO flow.account_notification_preferences (
      account_id, user_id, email_transactions, updated_at
    )
    VALUES (p_account_id, p_user_id, false, now())
    ON CONFLICT (account_id, user_id)
    DO UPDATE SET email_transactions = false, updated_at = now();
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

-- Fetches a settled outgoing transfer job for receipt email generation under RLS.
CREATE OR REPLACE FUNCTION flow.get_settled_outgoing_job_for_email(
  p_job_id uuid
)
RETURNS TABLE (
  id uuid,
  public_id text,
  account_id uuid,
  job_kind text,
  source_network text,
  source_asset_symbol text,
  source_decimals integer,
  source_atomic_amount text,
  destination_network text,
  destination_asset_symbol text,
  destination_decimals integer,
  expected_destination_atomic_amount text,
  recipient_address text,
  source_tx_hash text,
  destination_tx_hash text,
  provider_quote_payload jsonb,
  settled_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF p_job_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    j.id,
    j.public_id::text,
    j.account_id,
    j.job_kind::text,
    j.source_network::text,
    j.source_asset_symbol::text,
    j.source_decimals,
    j.source_atomic_amount::text,
    j.destination_network::text,
    j.destination_asset_symbol::text,
    j.destination_decimals,
    j.expected_destination_atomic_amount::text,
    j.recipient_address::text,
    j.source_tx_hash::text,
    j.destination_tx_hash::text,
    j.provider_quote_payload,
    j.settled_at
  FROM flow.outgoing_transfer_jobs j
  WHERE j.id = p_job_id
    AND j.status = 'SETTLED'
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION flow.claim_email_delivery(text, text, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.release_email_delivery_claim(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mark_email_delivery_sent(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.get_account_tx_email_target(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.list_newsletter_subscribers() FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.unsubscribe_email_preference(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.get_settled_outgoing_job_for_email(uuid) FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := db_name || '_app';
  custody_role text := db_name || '_custody_worker';
  payment_role text := db_name || '_payment_worker';
  definer_role text := current_user;
BEGIN
  EXECUTE format(
    'CREATE POLICY email_deliveries_definer_all ON flow.email_deliveries FOR ALL TO %I USING (true) WITH CHECK (true)',
    definer_role
  );

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.claim_email_delivery(text, text, uuid, uuid, text, text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.release_email_delivery_claim(text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mark_email_delivery_sent(text, text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_account_tx_email_target(uuid) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.list_newsletter_subscribers() TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.unsubscribe_email_preference(uuid, uuid, text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_settled_outgoing_job_for_email(uuid) TO %I', app_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = custody_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.claim_email_delivery(text, text, uuid, uuid, text, text) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.release_email_delivery_claim(text) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mark_email_delivery_sent(text, text) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_account_tx_email_target(uuid) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.list_newsletter_subscribers() TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_settled_outgoing_job_for_email(uuid) TO %I', custody_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = payment_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.claim_email_delivery(text, text, uuid, uuid, text, text) TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.release_email_delivery_claim(text) TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mark_email_delivery_sent(text, text) TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_account_tx_email_target(uuid) TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_settled_outgoing_job_for_email(uuid) TO %I', payment_role);
  END IF;
END;
$$;

COMMIT;
