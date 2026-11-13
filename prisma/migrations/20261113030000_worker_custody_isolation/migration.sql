BEGIN;

-- Public checkout may disclose the merchant's active destination address, but
-- the web role must never read the custody wallet tables directly.
CREATE OR REPLACE FUNCTION flow.get_payment_request_wallet_addresses(p_public_id text)
RETURNS TABLE (address text, chain_id text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
  SELECT wa.address::text, wa.chain_id::text
  FROM flow.payment_requests pr
  JOIN flow.wallets w ON w.account_id = pr.account_id AND w.status = 'ACTIVE'
  JOIN flow.wallet_addresses wa ON wa.wallet_id = w.id
  WHERE pr.public_id = p_public_id
  ORDER BY wa.chain_id, wa.address
$$;

CREATE OR REPLACE FUNCTION flow.get_checkout_payment_attempt(
  p_public_id text,
  p_attempt_public_id text
)
RETURNS TABLE (
  attempt_public_id text,
  status text,
  deposit_address text,
  deposit_memo text,
  deposit_deadline timestamptz,
  route_type text,
  is_provider_verified boolean,
  destination_network text,
  destination_asset_symbol text,
  destination_decimals integer,
  request_status text,
  request_expires_at timestamptz,
  payer_memo_required boolean,
  source_network text,
  source_asset_id text,
  source_asset_symbol text,
  source_decimals integer,
  quoted_source_atomic_amount text,
  quoted_destination_atomic_amount text,
  source_tx_hash text,
  destination_tx_hash text,
  settled_at timestamptz,
  payer_refund_address text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
  SELECT pa.attempt_public_id::text,
         pa.status::text,
         pa.deposit_address::text,
         pa.deposit_memo::text,
         pa.deposit_deadline,
         pa.route_type::text,
         pa.is_provider_verified,
         pr.destination_network::text,
         pr.destination_asset_symbol::text,
         pr.destination_decimals,
         pr.status::text,
         pr.expires_at,
         pr.payer_memo_required,
         pa.source_network::text,
         pa.source_asset_id::text,
         pa.source_asset_symbol::text,
         pa.source_decimals,
         pa.quoted_source_atomic_amount::text,
         pa.quoted_destination_atomic_amount::text,
         pa.source_tx_hash::text,
         pa.destination_tx_hash::text,
         pa.settled_at,
         pa.payer_refund_address::text
  FROM flow.payment_attempts pa
  JOIN flow.payment_requests pr ON pr.id = pa.payment_request_id
  WHERE pr.public_id = p_public_id
    AND (
      (p_attempt_public_id IS NOT NULL AND pa.attempt_public_id = p_attempt_public_id)
      OR (p_attempt_public_id IS NULL AND pa.deposit_address IS NOT NULL
          AND pa.status IN ('DEPOSIT_COMMITTED', 'DETECTED', 'SETTLING', 'SETTLED', 'EXCEPTION_REFUND_REQUIRED', 'FAILED'))
    )
  ORDER BY pa.updated_at DESC
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION flow.get_payment_request_wallet_addresses(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.get_checkout_payment_attempt(text, text) FROM PUBLIC;

-- Web requests only enqueue an account-scoped sync. A separate indexer role
-- claims durable work and writes observed balances/activity; it has no custody
-- credentials or wallet provisioning permissions.
CREATE TABLE IF NOT EXISTS flow.account_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES flow.accounts(id) ON DELETE CASCADE,
  wallet_id uuid NOT NULL REFERENCES flow.wallets(id) ON DELETE CASCADE,
  job_type text NOT NULL CHECK (job_type IN ('BALANCE_REFRESH', 'ACTIVITY_SYNC')),
  status text NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'LEASED', 'RETRY', 'COMPLETE', 'FAILED')),
  lease_token uuid,
  lease_expires_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS account_sync_jobs_one_open_per_type
  ON flow.account_sync_jobs (account_id, job_type)
  WHERE status IN ('QUEUED', 'LEASED', 'RETRY');
CREATE INDEX IF NOT EXISTS account_sync_jobs_claim_idx
  ON flow.account_sync_jobs (next_attempt_at, created_at)
  WHERE status IN ('QUEUED', 'RETRY', 'LEASED');

ALTER TABLE flow.account_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.account_sync_jobs FORCE ROW LEVEL SECURITY;
REVOKE ALL ON flow.account_sync_jobs FROM PUBLIC;
CREATE POLICY account_sync_jobs_app_select ON flow.account_sync_jobs
  FOR SELECT TO PUBLIC USING (flow.can_access_account(account_id));
CREATE POLICY account_sync_jobs_app_insert ON flow.account_sync_jobs
  FOR INSERT TO PUBLIC WITH CHECK (flow.can_access_account(account_id));

CREATE OR REPLACE FUNCTION flow.request_account_sync(p_account_id uuid, p_job_type text)
RETURNS TABLE (job_id uuid, job_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_wallet_id uuid;
  v_job flow.account_sync_jobs%ROWTYPE;
BEGIN
  IF p_job_type NOT IN ('BALANCE_REFRESH', 'ACTIVITY_SYNC')
     OR NOT flow.can_access_account(p_account_id) THEN
    RAISE EXCEPTION 'account sync request denied' USING ERRCODE = '42501';
  END IF;
  SELECT w.id INTO v_wallet_id
  FROM flow.wallets w
  WHERE w.account_id = p_account_id AND w.status = 'ACTIVE'
  ORDER BY w.created_at LIMIT 1;
  IF v_wallet_id IS NULL THEN
    RETURN;
  END IF;
  SELECT j.* INTO v_job FROM flow.account_sync_jobs j
  WHERE j.account_id = p_account_id AND j.job_type = p_job_type
    AND j.created_at > now() - interval '15 seconds'
  ORDER BY j.created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_job.id, v_job.status;
    RETURN;
  END IF;
  INSERT INTO flow.account_sync_jobs (account_id, wallet_id, job_type)
  VALUES (p_account_id, v_wallet_id, p_job_type)
  ON CONFLICT (account_id, job_type)
    WHERE status IN ('QUEUED', 'LEASED', 'RETRY')
  DO UPDATE SET updated_at = flow.account_sync_jobs.updated_at
  RETURNING * INTO v_job;
  RETURN QUERY SELECT v_job.id, v_job.status;
END;
$$;

CREATE OR REPLACE FUNCTION flow.read_account_sync_status(p_account_id uuid, p_job_type text)
RETURNS TABLE (job_id uuid, job_status text, updated_at timestamptz, error_code text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
  SELECT j.id, j.status, j.updated_at, j.error_code
  FROM flow.account_sync_jobs j
  WHERE j.account_id = p_account_id
    AND j.job_type = p_job_type
    AND flow.can_access_account(p_account_id)
  ORDER BY j.created_at DESC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION flow.enqueue_settlement_balance_sync(p_attempt_public_id text)
RETURNS TABLE (job_id uuid, job_status text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_account_id uuid;
  v_wallet_id uuid;
  v_job flow.account_sync_jobs%ROWTYPE;
BEGIN
  IF right(SESSION_USER, length('_payment_worker')) <> '_payment_worker' THEN
    RAISE EXCEPTION 'settlement sync enqueue denied' USING ERRCODE = '42501';
  END IF;
  SELECT pr.account_id, w.id INTO v_account_id, v_wallet_id
  FROM flow.payment_attempts pa
  JOIN flow.payment_requests pr ON pr.id = pa.payment_request_id
  JOIN flow.wallets w ON w.account_id = pr.account_id AND w.status = 'ACTIVE'
  WHERE pa.attempt_public_id = p_attempt_public_id AND pa.status = 'SETTLED'
  ORDER BY w.created_at LIMIT 1;
  IF v_wallet_id IS NULL THEN RETURN; END IF;
  INSERT INTO flow.account_sync_jobs (account_id, wallet_id, job_type)
  VALUES (v_account_id, v_wallet_id, 'BALANCE_REFRESH')
  ON CONFLICT (account_id, job_type)
    WHERE status IN ('QUEUED', 'LEASED', 'RETRY')
  DO UPDATE SET updated_at = flow.account_sync_jobs.updated_at
  RETURNING * INTO v_job;
  RETURN QUERY SELECT v_job.id, v_job.status;
END;
$$;

CREATE OR REPLACE FUNCTION flow.claim_account_sync_job(p_worker_id text, p_lease_seconds integer)
RETURNS TABLE (job_id uuid, account_id uuid, wallet_id uuid, job_type text, lease_token uuid)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_job flow.account_sync_jobs%ROWTYPE;
BEGIN
  IF right(SESSION_USER, length('_indexer_worker')) <> '_indexer_worker'
     OR p_lease_seconds NOT BETWEEN 15 AND 300
     OR p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'indexer claim denied' USING ERRCODE = '42501';
  END IF;
  UPDATE flow.account_sync_jobs SET status = 'FAILED', error_code = 'RETRY_LIMIT', updated_at = now()
  WHERE status = 'LEASED' AND lease_expires_at <= now() AND attempts >= max_attempts;
  SELECT j.* INTO v_job
  FROM flow.account_sync_jobs j
  WHERE j.attempts < j.max_attempts
    AND j.next_attempt_at <= now()
    AND (j.status IN ('QUEUED', 'RETRY') OR (j.status = 'LEASED' AND j.lease_expires_at <= now()))
  ORDER BY j.created_at
  FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  UPDATE flow.account_sync_jobs j SET status = 'LEASED', lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    attempts = j.attempts + 1, updated_at = now(), error_code = NULL
  WHERE j.id = v_job.id RETURNING j.* INTO v_job;
  RETURN QUERY SELECT v_job.id, v_job.account_id, v_job.wallet_id, v_job.job_type, v_job.lease_token;
END;
$$;

CREATE OR REPLACE FUNCTION flow.finish_account_sync_job(p_job_id uuid, p_lease_token uuid, p_error_code text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE v_job flow.account_sync_jobs%ROWTYPE;
BEGIN
  IF right(SESSION_USER, length('_indexer_worker')) <> '_indexer_worker' THEN
    RAISE EXCEPTION 'indexer completion denied' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_job FROM flow.account_sync_jobs
  WHERE id = p_job_id AND status = 'LEASED' AND lease_token = p_lease_token
    AND lease_expires_at > now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'stale sync lease' USING ERRCODE = '40001'; END IF;
  IF p_error_code IS NULL THEN
    UPDATE flow.account_sync_jobs SET status = 'COMPLETE', completed_at = now(), updated_at = now(),
      lease_token = NULL, lease_expires_at = NULL, error_code = NULL WHERE id = p_job_id;
    RETURN 'COMPLETE';
  END IF;
  IF p_error_code !~ '^[A-Z0-9_]{1,64}$' THEN
    RAISE EXCEPTION 'invalid sync error code' USING ERRCODE = '22023';
  END IF;
  UPDATE flow.account_sync_jobs SET
    status = CASE WHEN attempts < max_attempts THEN 'RETRY' ELSE 'FAILED' END,
    next_attempt_at = now() + make_interval(secs => LEAST(300, power(2, attempts)::integer * 5)),
    updated_at = now(), lease_token = NULL, lease_expires_at = NULL, error_code = p_error_code
  WHERE id = p_job_id;
  RETURN CASE WHEN v_job.attempts < v_job.max_attempts THEN 'RETRY' ELSE 'FAILED' END;
END;
$$;

REVOKE ALL ON FUNCTION flow.request_account_sync(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.read_account_sync_status(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.enqueue_settlement_balance_sync(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.claim_account_sync_job(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.finish_account_sync_job(uuid, uuid, text) FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := current_database() || '_app';
  migrator_role text := current_database() || '_migrator';
  old_worker text := current_database() || '_worker';
  payment_role text := current_database() || '_payment_worker';
  fixture_role text := current_database() || '_fixture';
  indexer_role text := current_database() || '_indexer_worker';
BEGIN
  IF db_name LIKE 'flow_test_%'
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = fixture_role) THEN
    EXECUTE format('GRANT USAGE ON SCHEMA flow TO %I', fixture_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA flow TO %I', fixture_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA flow TO %I', fixture_role);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA flow TO %I', fixture_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_payment_request_wallet_addresses(text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_checkout_payment_attempt(text, text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.request_account_sync(uuid, text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.read_account_sync_status(uuid, text) TO %I', app_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = payment_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.enqueue_settlement_balance_sync(text) TO %I', payment_role);
  END IF;

  -- The claim and completion SECURITY DEFINER functions run as the migration
  -- owner. FORCE RLS requires a narrowly scoped owner policy for those calls.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator_role) THEN
    EXECUTE format('CREATE POLICY account_sync_jobs_migrator_worker ON flow.account_sync_jobs FOR ALL TO %I USING (true) WITH CHECK (true)', migrator_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = indexer_role) THEN
    EXECUTE format('GRANT USAGE ON SCHEMA flow TO %I', indexer_role);
    EXECUTE format('GRANT SELECT (id, account_id, environment, status) ON TABLE flow.wallets TO %I', indexer_role);
    EXECUTE format('GRANT SELECT (id, wallet_id, network, chain_id, address) ON TABLE flow.wallet_addresses TO %I', indexer_role);
    EXECUTE format('GRANT SELECT ON TABLE flow.assets, flow.network_assets TO %I', indexer_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE flow.wallet_balances, flow.wallet_activities TO %I', indexer_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.claim_account_sync_job(text, integer) TO %I', indexer_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.finish_account_sync_job(uuid, uuid, text) TO %I', indexer_role);
    EXECUTE format('GRANT SELECT ON TABLE flow.account_sync_jobs TO %I', indexer_role);
    EXECUTE format('CREATE POLICY account_sync_jobs_indexer_select ON flow.account_sync_jobs FOR SELECT TO %I USING (true)', indexer_role);
    EXECUTE format('CREATE POLICY wallet_indexer_wallet_select ON flow.wallets FOR SELECT TO %I USING (true)', indexer_role);
    EXECUTE format('CREATE POLICY wallet_indexer_address_select ON flow.wallet_addresses FOR SELECT TO %I USING (true)', indexer_role);
    EXECUTE format('CREATE POLICY wallet_indexer_balance_all ON flow.wallet_balances FOR ALL TO %I USING (true) WITH CHECK (true)', indexer_role);
    EXECUTE format('CREATE POLICY wallet_indexer_activity_all ON flow.wallet_activities FOR ALL TO %I USING (true) WITH CHECK (true)', indexer_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.can_access_account(uuid) TO %I', indexer_role);
  END IF;

  -- The legacy shared worker must lose custody access even if the new payment
  -- role has not yet been provisioned. This makes the migration safe to apply
  -- across partially bootstrapped staging databases.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = old_worker) THEN
    EXECUTE format('REVOKE ALL ON TABLE flow.wallets, flow.wallet_addresses, flow.wallet_capabilities, flow.wallet_provisioning_jobs, flow.provider_compatibility_authorizations, flow.custody_operators, flow.custody_recovery_approvals FROM %I', old_worker);
    EXECUTE format('REVOKE ALL ON TABLE flow.portfolio_refresh_lease_secrets FROM %I', old_worker);
    EXECUTE format('REVOKE SELECT (encrypted_credential, key_id, key_digest) ON TABLE flow.wallets FROM %I', old_worker);
  END IF;

  -- The payment worker receives only fields and relations used by payment
  -- verification. It never receives wallet credentials or ledger table writes.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = payment_role) THEN
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA flow FROM %I', payment_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA flow FROM %I', payment_role);
    EXECUTE format('REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA flow FROM %I', payment_role);
    EXECUTE format('GRANT USAGE ON SCHEMA flow TO %I', payment_role);
    EXECUTE format('GRANT SELECT ON TABLE flow.assets, flow.network_assets, flow.payment_requests, flow.payment_verifications TO %I', payment_role);
    EXECUTE format('GRANT SELECT, UPDATE ON TABLE flow.payment_attempts TO %I', payment_role);
    EXECUTE format('GRANT SELECT ON TABLE flow.payment_rehearsal_authorizations TO %I', payment_role);
    EXECUTE format('GRANT SELECT (id, account_id, environment, status) ON TABLE flow.wallets TO %I', payment_role);
    EXECUTE format('GRANT SELECT (wallet_id, network, chain_id, address) ON TABLE flow.wallet_addresses TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.acquire_payment_monitoring_lease(text, integer, integer) TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.record_payment_verification(text, text, text, text, text, text, text, text, numeric, bigint, text, text, text, text, jsonb, integer) TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.record_payment_verification(text, text, text, text, text, text, text, text, numeric, bigint, text, text, text, text, jsonb) TO %I', payment_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.worker_settle_payment_attempt(text, text, text) TO %I', payment_role);

  END IF;
END;
$$;

COMMIT;
