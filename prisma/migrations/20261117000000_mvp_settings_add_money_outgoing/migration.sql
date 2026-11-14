BEGIN;

-- 1. Server-persisted user profile preferences (name, avatar) scoped to flow.users(id).
CREATE TABLE flow.user_profile_preferences (
  user_id uuid PRIMARY KEY REFERENCES flow.users(id) ON DELETE CASCADE,
  display_name varchar(80),
  avatar_data_url text CHECK (avatar_data_url IS NULL OR char_length(avatar_data_url) <= 350000),
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE flow.user_profile_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.user_profile_preferences FORCE ROW LEVEL SECURITY;

-- 2. Server-persisted notification preferences per (account, user).
CREATE TABLE flow.account_notification_preferences (
  account_id uuid NOT NULL REFERENCES flow.accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES flow.users(id) ON DELETE CASCADE,
  incoming_payments boolean NOT NULL DEFAULT true,
  payment_link_activity boolean NOT NULL DEFAULT true,
  security_alerts boolean NOT NULL DEFAULT true,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, user_id)
);

ALTER TABLE flow.account_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.account_notification_preferences FORCE ROW LEVEL SECURITY;

-- 3. Committed cross-chain Add Money intents settling into permanent native NEAR.
CREATE TABLE flow.add_money_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id varchar(64) NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES flow.accounts(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES flow.wallets(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES flow.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  source_network varchar(64) NOT NULL,
  source_asset_id varchar(128) NOT NULL,
  source_asset_symbol varchar(32) NOT NULL,
  source_decimals integer NOT NULL,
  destination_network varchar(64) NOT NULL DEFAULT 'near-mainnet',
  destination_asset_id varchar(128) NOT NULL DEFAULT 'near-mainnet:NEAR',
  destination_asset_symbol varchar(32) NOT NULL DEFAULT 'NEAR',
  destination_decimals integer NOT NULL DEFAULT 24,
  destination_address varchar(256) NOT NULL,
  refund_address varchar(256) NOT NULL,
  quoted_source_atomic_amount decimal(78, 0) NOT NULL CHECK (quoted_source_atomic_amount > 0),
  quoted_destination_atomic_amount decimal(78, 0) NOT NULL CHECK (quoted_destination_atomic_amount >= 0),
  min_destination_atomic_amount decimal(78, 0),
  estimated_duration_seconds integer,
  provider_fees jsonb NOT NULL DEFAULT '{}',
  provider_correlation_id varchar(128),
  provider_signature text,
  deposit_address varchar(256),
  deposit_memo varchar(128),
  deposit_deadline timestamptz(3),
  deposit_instructions jsonb NOT NULL DEFAULT '{}',
  source_tx_hash varchar(128),
  destination_tx_hash varchar(128),
  status varchar(32) NOT NULL DEFAULT 'DEPOSIT_COMMITTED'
    CHECK (status IN ('DEPOSIT_COMMITTED', 'SETTLING', 'SETTLED', 'FAILED', 'REFUNDED', 'EXPIRED')),
  settlement_error text,
  settled_at timestamptz(3),
  monitoring_lease_worker_id varchar(64),
  monitoring_lease_expires_at timestamptz(3),
  last_polled_at timestamptz(3),
  poll_count integer NOT NULL DEFAULT 0,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX add_money_intents_account_created_idx
  ON flow.add_money_intents (account_id, created_at DESC);
CREATE INDEX add_money_intents_status_idx
  ON flow.add_money_intents (status, monitoring_lease_expires_at);

ALTER TABLE flow.add_money_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.add_money_intents FORCE ROW LEVEL SECURITY;

-- 4. Durable outgoing Send & Convert execution jobs (web inserts PENDING_CUSTODY;
-- custody worker claims under fencing token & executes OutLayer/RPC broadcast).
CREATE TABLE flow.outgoing_transfer_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id varchar(64) NOT NULL UNIQUE,
  account_id uuid NOT NULL REFERENCES flow.accounts(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES flow.wallets(id) ON DELETE RESTRICT,
  created_by_user_id uuid NOT NULL REFERENCES flow.users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  job_kind varchar(16) NOT NULL CHECK (job_kind IN ('SEND', 'CONVERT')),
  source_network varchar(64) NOT NULL,
  source_asset_id varchar(128) NOT NULL,
  source_asset_symbol varchar(32) NOT NULL,
  source_decimals integer NOT NULL,
  source_atomic_amount decimal(78, 0) NOT NULL CHECK (source_atomic_amount > 0),
  recipient_address varchar(256) NOT NULL,
  destination_network varchar(64) NOT NULL,
  destination_asset_id varchar(128) NOT NULL,
  destination_asset_symbol varchar(32) NOT NULL,
  destination_decimals integer NOT NULL,
  expected_destination_atomic_amount decimal(78, 0),
  min_destination_atomic_amount decimal(78, 0),
  provider_correlation_id varchar(128),
  provider_deposit_address varchar(256),
  provider_deposit_memo varchar(128),
  provider_deadline timestamptz(3),
  provider_quote_payload jsonb NOT NULL DEFAULT '{}',
  status varchar(32) NOT NULL DEFAULT 'PENDING_CUSTODY'
    CHECK (status IN (
      'PENDING_CUSTODY',
      'LEASED',
      'SIGNING_IN_PROGRESS',
      'CONFIRMING',
      'PROVIDER_SETTLING',
      'SETTLED',
      'FAILED',
      'REFUNDED',
      'UNKNOWN_AMBIGUOUS'
    )),
  fencing_token bigint NOT NULL DEFAULT 0,
  lease_holder varchar(128),
  lease_expires_at timestamptz(3),
  provider_request_id varchar(128),
  source_tx_hash varchar(128),
  destination_tx_hash varchar(128),
  fee_atomic_amount decimal(78, 0),
  error_code varchar(64),
  error_message text,
  authorized_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  broadcast_at timestamptz(3),
  settled_at timestamptz(3),
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (account_id, idempotency_key)
);

CREATE INDEX outgoing_transfer_jobs_account_created_idx
  ON flow.outgoing_transfer_jobs (account_id, created_at DESC);
CREATE INDEX outgoing_transfer_jobs_status_idx
  ON flow.outgoing_transfer_jobs (status, lease_expires_at);

ALTER TABLE flow.outgoing_transfer_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.outgoing_transfer_jobs FORCE ROW LEVEL SECURITY;

-- Security-definer Add Money worker lease & transition routines
CREATE OR REPLACE FUNCTION flow.claim_active_add_money_intents(
  p_worker_id text,
  p_lease_seconds integer,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  public_id text,
  account_id uuid,
  wallet_id uuid,
  source_network text,
  source_asset_id text,
  source_asset_symbol text,
  source_decimals integer,
  destination_network text,
  destination_asset_symbol text,
  destination_decimals integer,
  destination_address text,
  refund_address text,
  quoted_source_atomic_amount text,
  quoted_destination_atomic_amount text,
  deposit_address text,
  deposit_memo text,
  deposit_deadline timestamptz,
  source_tx_hash text,
  destination_tx_hash text,
  status text,
  poll_count integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF right(SESSION_USER, length('_payment_worker')) <> '_payment_worker'
     OR p_worker_id IS NULL OR char_length(p_worker_id) NOT BETWEEN 1 AND 64
     OR p_lease_seconds NOT BETWEEN 15 AND 300
     OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'add_money claim denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT am.id
    FROM flow.add_money_intents am
    WHERE am.status IN ('DEPOSIT_COMMITTED', 'SETTLING')
      AND (am.monitoring_lease_expires_at IS NULL OR am.monitoring_lease_expires_at <= now())
    ORDER BY am.last_polled_at ASC NULLS FIRST, am.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  upd AS (
    UPDATE flow.add_money_intents am
    SET monitoring_lease_worker_id = p_worker_id,
        monitoring_lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        last_polled_at = now(),
        poll_count = am.poll_count + 1,
        updated_at = now()
    FROM picked
    WHERE am.id = picked.id
    RETURNING am.*
  )
  SELECT
    u.id,
    u.public_id::text,
    u.account_id,
    u.wallet_id,
    u.source_network::text,
    u.source_asset_id::text,
    u.source_asset_symbol::text,
    u.source_decimals,
    u.destination_network::text,
    u.destination_asset_symbol::text,
    u.destination_decimals,
    u.destination_address::text,
    u.refund_address::text,
    u.quoted_source_atomic_amount::text,
    u.quoted_destination_atomic_amount::text,
    u.deposit_address::text,
    u.deposit_memo::text,
    u.deposit_deadline,
    u.source_tx_hash::text,
    u.destination_tx_hash::text,
    u.status::text,
    u.poll_count,
    u.created_at
  FROM upd u;
END;
$$;

CREATE OR REPLACE FUNCTION flow.transition_add_money_intent(
  p_intent_id uuid,
  p_worker_id text,
  p_next_status text,
  p_source_tx_hash text DEFAULT NULL,
  p_destination_tx_hash text DEFAULT NULL,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_row flow.add_money_intents%ROWTYPE;
BEGIN
  IF right(SESSION_USER, length('_payment_worker')) <> '_payment_worker' THEN
    RAISE EXCEPTION 'add_money transition denied' USING ERRCODE = '42501';
  END IF;
  IF p_next_status NOT IN ('DEPOSIT_COMMITTED', 'SETTLING', 'SETTLED', 'FAILED', 'REFUNDED', 'EXPIRED') THEN
    RAISE EXCEPTION 'invalid add_money status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM flow.add_money_intents
  WHERE id = p_intent_id
    AND monitoring_lease_worker_id = p_worker_id
    AND monitoring_lease_expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale add_money monitoring lease' USING ERRCODE = '40001';
  END IF;

  UPDATE flow.add_money_intents
  SET status = p_next_status,
      source_tx_hash = COALESCE(p_source_tx_hash, source_tx_hash),
      destination_tx_hash = COALESCE(p_destination_tx_hash, destination_tx_hash),
      settlement_error = COALESCE(p_error, settlement_error),
      settled_at = CASE WHEN p_next_status = 'SETTLED' THEN COALESCE(settled_at, now()) ELSE settled_at END,
      monitoring_lease_worker_id = NULL,
      monitoring_lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_intent_id;

  IF p_next_status = 'SETTLED' THEN
    INSERT INTO flow.account_sync_jobs (account_id, wallet_id, job_type)
    VALUES
      (v_row.account_id, v_row.wallet_id, 'BALANCE_REFRESH'),
      (v_row.account_id, v_row.wallet_id, 'ACTIVITY_SYNC')
    ON CONFLICT (account_id, job_type)
      WHERE status IN ('QUEUED', 'LEASED', 'RETRY')
    DO UPDATE SET updated_at = flow.account_sync_jobs.updated_at;
  END IF;
END;
$$;

-- Security-definer Custody Worker Send & Convert execution routines
CREATE OR REPLACE FUNCTION flow.claim_outgoing_transfer_for_custody(
  p_worker_id text,
  p_lease_seconds integer
)
RETURNS TABLE (
  id uuid,
  public_id text,
  account_id uuid,
  wallet_id uuid,
  job_kind text,
  source_network text,
  source_asset_id text,
  source_asset_symbol text,
  source_decimals integer,
  source_atomic_amount text,
  recipient_address text,
  destination_network text,
  destination_asset_id text,
  destination_asset_symbol text,
  destination_decimals integer,
  provider_deposit_address text,
  provider_deposit_memo text,
  provider_correlation_id text,
  fencing_token bigint,
  provider_wallet_id text,
  credential_envelope text,
  key_id text,
  wallet_environment text,
  source_address text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_job flow.outgoing_transfer_jobs%ROWTYPE;
BEGIN
  IF right(SESSION_USER, length('_custody_worker')) <> '_custody_worker'
     OR p_worker_id IS NULL OR char_length(p_worker_id) NOT BETWEEN 1 AND 128
     OR p_lease_seconds NOT BETWEEN 15 AND 300 THEN
    RAISE EXCEPTION 'custody claim denied' USING ERRCODE = '42501';
  END IF;

  -- Escalate stale SIGNING_IN_PROGRESS jobs instead of double-broadcasting.
  UPDATE flow.outgoing_transfer_jobs
  SET status = 'UNKNOWN_AMBIGUOUS',
      error_code = 'LEASE_EXPIRED_DURING_BROADCAST',
      error_message = 'Worker lease expired after signing began; manual reconciliation required before retrying.',
      lease_holder = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE status = 'SIGNING_IN_PROGRESS'
    AND lease_expires_at <= now();

  SELECT j.* INTO v_job
  FROM flow.outgoing_transfer_jobs j
  WHERE j.status = 'PENDING_CUSTODY'
     OR (j.status = 'LEASED' AND j.lease_expires_at <= now())
  ORDER BY j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE flow.outgoing_transfer_jobs
  SET status = 'LEASED',
      fencing_token = v_job.fencing_token + 1,
      lease_holder = p_worker_id,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      updated_at = now()
  WHERE flow.outgoing_transfer_jobs.id = v_job.id
  RETURNING * INTO v_job;

  RETURN QUERY
  SELECT
    v_job.id,
    v_job.public_id::text,
    v_job.account_id,
    v_job.wallet_id,
    v_job.job_kind::text,
    v_job.source_network::text,
    v_job.source_asset_id::text,
    v_job.source_asset_symbol::text,
    v_job.source_decimals,
    v_job.source_atomic_amount::text,
    v_job.recipient_address::text,
    v_job.destination_network::text,
    v_job.destination_asset_id::text,
    v_job.destination_asset_symbol::text,
    v_job.destination_decimals,
    v_job.provider_deposit_address::text,
    v_job.provider_deposit_memo::text,
    v_job.provider_correlation_id::text,
    v_job.fencing_token,
    w.provider_wallet_id::text,
    w.encrypted_credential::text,
    w.key_id::text,
    w.environment::text,
    wa.address::text
  FROM flow.wallets w
  JOIN flow.wallet_addresses wa
    ON wa.wallet_id = w.id
   AND wa.network = v_job.source_network
  WHERE w.id = v_job.wallet_id
    AND w.status = 'ACTIVE';
END;
$$;

CREATE OR REPLACE FUNCTION flow.mark_outgoing_transfer_signing_started(
  p_job_id uuid,
  p_fencing_token bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF right(SESSION_USER, length('_custody_worker')) <> '_custody_worker' THEN
    RAISE EXCEPTION 'custody signing start denied' USING ERRCODE = '42501';
  END IF;

  UPDATE flow.outgoing_transfer_jobs
  SET status = 'SIGNING_IN_PROGRESS',
      updated_at = now()
  WHERE id = p_job_id
    AND fencing_token = p_fencing_token
    AND status = 'LEASED'
    AND lease_expires_at > now();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale outgoing custody lease' USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION flow.mark_outgoing_transfer_broadcast(
  p_job_id uuid,
  p_fencing_token bigint,
  p_source_tx_hash text,
  p_provider_request_id text DEFAULT NULL,
  p_fee_atomic numeric DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_job flow.outgoing_transfer_jobs%ROWTYPE;
  v_next_status text;
BEGIN
  IF right(SESSION_USER, length('_custody_worker')) <> '_custody_worker' THEN
    RAISE EXCEPTION 'custody broadcast mark denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_job
  FROM flow.outgoing_transfer_jobs
  WHERE id = p_job_id
    AND fencing_token = p_fencing_token
    AND status IN ('LEASED', 'SIGNING_IN_PROGRESS')
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale outgoing custody lease' USING ERRCODE = '40001';
  END IF;

  v_next_status := CASE WHEN v_job.provider_deposit_address IS NOT NULL THEN 'PROVIDER_SETTLING' ELSE 'CONFIRMING' END;

  UPDATE flow.outgoing_transfer_jobs
  SET status = v_next_status,
      source_tx_hash = p_source_tx_hash,
      provider_request_id = COALESCE(p_provider_request_id, provider_request_id),
      fee_atomic_amount = COALESCE(p_fee_atomic, fee_atomic_amount),
      broadcast_at = COALESCE(broadcast_at, now()),
      lease_holder = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_job_id;

  RETURN v_next_status;
END;
$$;

CREATE OR REPLACE FUNCTION flow.fail_outgoing_transfer_before_broadcast(
  p_job_id uuid,
  p_fencing_token bigint,
  p_status text,
  p_error_code text,
  p_error_message text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF right(SESSION_USER, length('_custody_worker')) <> '_custody_worker' THEN
    RAISE EXCEPTION 'custody failure update denied' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('FAILED', 'UNKNOWN_AMBIGUOUS') THEN
    RAISE EXCEPTION 'invalid failure status' USING ERRCODE = '22023';
  END IF;

  UPDATE flow.outgoing_transfer_jobs
  SET status = p_status,
      error_code = left(p_error_code, 64),
      error_message = left(p_error_message, 1000),
      lease_holder = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_job_id
    AND fencing_token = p_fencing_token
    AND status IN ('LEASED', 'SIGNING_IN_PROGRESS');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale outgoing custody lease' USING ERRCODE = '40001';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION flow.claim_outgoing_transfers_for_confirmation(
  p_worker_id text,
  p_lease_seconds integer,
  p_limit integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  public_id text,
  account_id uuid,
  wallet_id uuid,
  job_kind text,
  source_network text,
  source_asset_id text,
  destination_network text,
  destination_asset_id text,
  recipient_address text,
  provider_deposit_address text,
  provider_deposit_memo text,
  source_tx_hash text,
  destination_tx_hash text,
  status text,
  wallet_environment text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF right(SESSION_USER, length('_custody_worker')) <> '_custody_worker'
     OR p_worker_id IS NULL OR char_length(p_worker_id) NOT BETWEEN 1 AND 128
     OR p_lease_seconds NOT BETWEEN 15 AND 300
     OR p_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'outgoing confirmation claim denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH picked AS (
    SELECT j.id
    FROM flow.outgoing_transfer_jobs j
    WHERE j.status IN ('CONFIRMING', 'PROVIDER_SETTLING')
      AND (j.lease_expires_at IS NULL OR j.lease_expires_at <= now())
    ORDER BY j.updated_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ),
  upd AS (
    UPDATE flow.outgoing_transfer_jobs j
    SET lease_holder = p_worker_id,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        updated_at = now()
    FROM picked
    WHERE j.id = picked.id
    RETURNING j.*
  )
  SELECT
    u.id,
    u.public_id::text,
    u.account_id,
    u.wallet_id,
    u.job_kind::text,
    u.source_network::text,
    u.source_asset_id::text,
    u.destination_network::text,
    u.destination_asset_id::text,
    u.recipient_address::text,
    u.provider_deposit_address::text,
    u.provider_deposit_memo::text,
    u.source_tx_hash::text,
    u.destination_tx_hash::text,
    u.status::text,
    w.environment::text
  FROM upd u
  JOIN flow.wallets w ON w.id = u.wallet_id;
END;
$$;

CREATE OR REPLACE FUNCTION flow.complete_outgoing_transfer_settlement(
  p_job_id uuid,
  p_worker_id text,
  p_next_status text,
  p_destination_tx_hash text DEFAULT NULL,
  p_error_code text DEFAULT NULL,
  p_error_message text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_row flow.outgoing_transfer_jobs%ROWTYPE;
BEGIN
  IF right(SESSION_USER, length('_custody_worker')) <> '_custody_worker' THEN
    RAISE EXCEPTION 'outgoing settlement update denied' USING ERRCODE = '42501';
  END IF;
  IF p_next_status NOT IN ('CONFIRMING', 'PROVIDER_SETTLING', 'SETTLED', 'FAILED', 'REFUNDED') THEN
    RAISE EXCEPTION 'invalid outgoing settlement status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row
  FROM flow.outgoing_transfer_jobs
  WHERE id = p_job_id
    AND lease_holder = p_worker_id
    AND lease_expires_at > now()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale outgoing confirmation lease' USING ERRCODE = '40001';
  END IF;

  UPDATE flow.outgoing_transfer_jobs
  SET status = p_next_status,
      destination_tx_hash = COALESCE(p_destination_tx_hash, destination_tx_hash),
      error_code = COALESCE(left(p_error_code, 64), error_code),
      error_message = COALESCE(left(p_error_message, 1000), error_message),
      settled_at = CASE WHEN p_next_status = 'SETTLED' THEN COALESCE(settled_at, now()) ELSE settled_at END,
      lease_holder = NULL,
      lease_expires_at = NULL,
      updated_at = now()
  WHERE id = p_job_id;

  IF p_next_status IN ('SETTLED', 'REFUNDED') THEN
    INSERT INTO flow.account_sync_jobs (account_id, wallet_id, job_type)
    VALUES
      (v_row.account_id, v_row.wallet_id, 'BALANCE_REFRESH'),
      (v_row.account_id, v_row.wallet_id, 'ACTIVITY_SYNC')
    ON CONFLICT (account_id, job_type)
      WHERE status IN ('QUEUED', 'LEASED', 'RETRY')
    DO UPDATE SET updated_at = flow.account_sync_jobs.updated_at;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION flow.claim_active_add_money_intents(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.transition_add_money_intent(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.claim_outgoing_transfer_for_custody(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mark_outgoing_transfer_signing_started(uuid, bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.mark_outgoing_transfer_broadcast(uuid, bigint, text, text, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.fail_outgoing_transfer_before_broadcast(uuid, bigint, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.claim_outgoing_transfers_for_confirmation(text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.complete_outgoing_transfer_settlement(uuid, text, text, text, text, text) FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := current_database() || '_app';
  payment_role text := current_database() || '_payment_worker';
  custody_role text := current_database() || '_custody_worker';
  migrator_role text := current_database() || '_migrator';
  fixture_role text := current_database() || '_fixture';
  definer_role text := current_user;
BEGIN
  IF db_name LIKE 'flow_test_%'
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = fixture_role) THEN
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE flow.user_profile_preferences, flow.account_notification_preferences, flow.add_money_intents, flow.outgoing_transfer_jobs TO %I',
      fixture_role
    );
  END IF;

  -- SECURITY DEFINER worker functions execute as the migration/table owner.
  -- Under FORCE ROW LEVEL SECURITY, grant scoped owner policies so worker
  -- claim/transition functions operate across rows while non-owners stay locked down.
  EXECUTE format(
    'CREATE POLICY add_money_intents_definer_all ON flow.add_money_intents FOR ALL TO %I USING (true) WITH CHECK (true)',
    definer_role
  );
  EXECUTE format(
    'CREATE POLICY outgoing_transfer_jobs_definer_all ON flow.outgoing_transfer_jobs FOR ALL TO %I USING (true) WITH CHECK (true)',
    definer_role
  );
  IF migrator_role <> definer_role AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator_role) THEN
    EXECUTE format(
      'CREATE POLICY add_money_intents_migrator_all ON flow.add_money_intents FOR ALL TO %I USING (true) WITH CHECK (true)',
      migrator_role
    );
    EXECUTE format(
      'CREATE POLICY outgoing_transfer_jobs_migrator_all ON flow.outgoing_transfer_jobs FOR ALL TO %I USING (true) WITH CHECK (true)',
      migrator_role
    );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON flow.user_profile_preferences TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON flow.account_notification_preferences TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT ON flow.add_money_intents TO %I', app_role);
    EXECUTE format('GRANT SELECT, INSERT ON flow.outgoing_transfer_jobs TO %I', app_role);

    EXECUTE format($policy$
      CREATE POLICY user_profile_prefs_app_select
      ON flow.user_profile_preferences FOR SELECT TO %I
      USING (user_id = flow.current_session_flow_user_id())
    $policy$, app_role);
    EXECUTE format($policy$
      CREATE POLICY user_profile_prefs_app_insert
      ON flow.user_profile_preferences FOR INSERT TO %I
      WITH CHECK (user_id = flow.current_session_flow_user_id())
    $policy$, app_role);
    EXECUTE format($policy$
      CREATE POLICY user_profile_prefs_app_update
      ON flow.user_profile_preferences FOR UPDATE TO %I
      USING (user_id = flow.current_session_flow_user_id())
      WITH CHECK (user_id = flow.current_session_flow_user_id())
    $policy$, app_role);

    EXECUTE format($policy$
      CREATE POLICY account_notification_prefs_app_select
      ON flow.account_notification_preferences FOR SELECT TO %I
      USING (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND user_id = flow.current_session_flow_user_id()
        AND flow.can_access_account(account_id)
      )
    $policy$, app_role);
    EXECUTE format($policy$
      CREATE POLICY account_notification_prefs_app_insert
      ON flow.account_notification_preferences FOR INSERT TO %I
      WITH CHECK (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND user_id = flow.current_session_flow_user_id()
        AND flow.can_access_account(account_id)
      )
    $policy$, app_role);
    EXECUTE format($policy$
      CREATE POLICY account_notification_prefs_app_update
      ON flow.account_notification_preferences FOR UPDATE TO %I
      USING (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND user_id = flow.current_session_flow_user_id()
        AND flow.can_access_account(account_id)
      )
      WITH CHECK (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND user_id = flow.current_session_flow_user_id()
        AND flow.can_access_account(account_id)
      )
    $policy$, app_role);

    EXECUTE format($policy$
      CREATE POLICY add_money_intents_app_select
      ON flow.add_money_intents FOR SELECT TO %I
      USING (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND flow.can_access_account(account_id)
      )
    $policy$, app_role);
    EXECUTE format($policy$
      CREATE POLICY add_money_intents_app_insert
      ON flow.add_money_intents FOR INSERT TO %I
      WITH CHECK (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND created_by_user_id = flow.current_session_flow_user_id()
        AND flow.can_access_account(account_id)
        AND status = 'DEPOSIT_COMMITTED'
      )
    $policy$, app_role);

    EXECUTE format($policy$
      CREATE POLICY outgoing_transfer_jobs_app_select
      ON flow.outgoing_transfer_jobs FOR SELECT TO %I
      USING (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND flow.can_access_account(account_id)
      )
    $policy$, app_role);
    EXECUTE format($policy$
      CREATE POLICY outgoing_transfer_jobs_app_insert
      ON flow.outgoing_transfer_jobs FOR INSERT TO %I
      WITH CHECK (
        account_id = NULLIF(current_setting('flow.current_account_id', true), '')::uuid
        AND created_by_user_id = flow.current_session_flow_user_id()
        AND flow.can_access_account(account_id)
        AND status = 'PENDING_CUSTODY'
      )
    $policy$, app_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = payment_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.claim_active_add_money_intents(text, integer, integer) TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.transition_add_money_intent(uuid, text, text, text, text, text) TO %I', payment_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = custody_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.claim_outgoing_transfer_for_custody(text, integer) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mark_outgoing_transfer_signing_started(uuid, bigint) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.mark_outgoing_transfer_broadcast(uuid, bigint, text, text, numeric) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.fail_outgoing_transfer_before_broadcast(uuid, bigint, text, text, text) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.claim_outgoing_transfers_for_confirmation(text, integer, integer) TO %I', custody_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.complete_outgoing_transfer_settlement(uuid, text, text, text, text, text) TO %I', custody_role);
  END IF;
END;
$$;

COMMIT;
