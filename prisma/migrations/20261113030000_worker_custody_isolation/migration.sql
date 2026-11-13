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

DO $$
DECLARE
  db_name text := current_database();
  app_role text := current_database() || '_app';
  old_worker text := current_database() || '_worker';
  payment_role text := current_database() || '_payment_worker';
  fixture_role text := current_database() || '_fixture';
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
