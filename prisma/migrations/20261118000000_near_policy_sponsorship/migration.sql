BEGIN;

-- Dedicated audit, idempotency, spend-cap, and circuit-breaker tables for
-- automated NEAR mainnet policy-storage fee sponsorship.
-- Strictly restricted to the isolated custody worker role.

CREATE TABLE IF NOT EXISTS flow.custody_policy_sponsorships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL UNIQUE REFERENCES flow.wallets(id) ON DELETE RESTRICT,
  account_id uuid NOT NULL REFERENCES flow.accounts(id) ON DELETE RESTRICT,
  job_id uuid REFERENCES flow.wallet_provisioning_jobs(id) ON DELETE RESTRICT,
  wallet_pubkey text NOT NULL,
  sponsor_account_id text NOT NULL,
  contract_id text NOT NULL DEFAULT 'outlayer.near' CHECK (contract_id = 'outlayer.near'),
  method_name text NOT NULL DEFAULT 'store_wallet_policy' CHECK (method_name = 'store_wallet_policy'),
  policy_version bigint NOT NULL CHECK (policy_version >= 1),
  policy_hash text,
  estimated_storage_yocto numeric(78, 0) NOT NULL CHECK (estimated_storage_yocto >= 0),
  attached_deposit_yocto numeric(78, 0) NOT NULL CHECK (
    attached_deposit_yocto >= 0 AND attached_deposit_yocto <= 50000000000000000000000
  ),
  max_allowed_fee_yocto numeric(78, 0) NOT NULL CHECK (
    max_allowed_fee_yocto > 0 AND max_allowed_fee_yocto <= 50000000000000000000000
  ),
  actual_gas_burnt_yocto numeric(78, 0),
  actual_fee_yocto numeric(78, 0),
  tx_hash text UNIQUE,
  status text NOT NULL DEFAULT 'PREPARED' CHECK (
    status IN ('PREPARED', 'BROADCASTING', 'FINALIZED', 'VERIFIED', 'FAILED', 'AMBIGUOUS')
  ),
  error_code text,
  fencing_token bigint NOT NULL DEFAULT 0,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finalized_at timestamptz(3)
);

CREATE INDEX IF NOT EXISTS custody_policy_sponsorships_created_idx
  ON flow.custody_policy_sponsorships (created_at DESC);

CREATE INDEX IF NOT EXISTS custody_policy_sponsorships_status_idx
  ON flow.custody_policy_sponsorships (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS flow.custody_sponsor_circuit (
  id text PRIMARY KEY DEFAULT 'DEFAULT' CHECK (id = 'DEFAULT'),
  circuit_open boolean NOT NULL DEFAULT false,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  opened_at timestamptz(3),
  opened_reason text,
  last_known_balance_yocto numeric(78, 0),
  last_balance_checked_at timestamptz(3),
  updated_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO flow.custody_sponsor_circuit (id, circuit_open, consecutive_failures)
VALUES ('DEFAULT', false, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE flow.custody_policy_sponsorships ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.custody_policy_sponsorships FORCE ROW LEVEL SECURITY;
ALTER TABLE flow.custody_sponsor_circuit ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow.custody_sponsor_circuit FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE flow.custody_policy_sponsorships FROM PUBLIC;
REVOKE ALL ON TABLE flow.custody_sponsor_circuit FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := current_database() || '_app';
  worker_role text := current_database() || '_worker';
  payment_role text := current_database() || '_payment_worker';
  indexer_role text := current_database() || '_indexer_worker';
  custody_role text := current_database() || '_custody_worker';
  operator_role text := current_database() || '_operator';
  auth_ticket_role text := current_database() || '_auth_ticket';
  migrator_role text := current_database() || '_migrator';
  fixture_role text := current_database() || '_fixture';
  definer_role text := current_user;
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[app_role, worker_role, payment_role, indexer_role, operator_role, auth_ticket_role] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON TABLE flow.custody_policy_sponsorships FROM %I', r);
      EXECUTE format('REVOKE ALL ON TABLE flow.custody_sponsor_circuit FROM %I', r);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = custody_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE flow.custody_policy_sponsorships TO %I', custody_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON TABLE flow.custody_sponsor_circuit TO %I', custody_role);
    EXECUTE format('CREATE POLICY sponsorship_custody_all ON flow.custody_policy_sponsorships FOR ALL TO %I USING (true) WITH CHECK (true)', custody_role);
    EXECUTE format('CREATE POLICY sponsor_circuit_custody_all ON flow.custody_sponsor_circuit FOR ALL TO %I USING (true) WITH CHECK (true)', custody_role);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = migrator_role) THEN
    EXECUTE format('CREATE POLICY sponsorship_migrator_all ON flow.custody_policy_sponsorships FOR ALL TO %I USING (true) WITH CHECK (true)', migrator_role);
    EXECUTE format('CREATE POLICY sponsor_circuit_migrator_all ON flow.custody_sponsor_circuit FOR ALL TO %I USING (true) WITH CHECK (true)', migrator_role);
  END IF;

  IF migrator_role <> definer_role AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = definer_role) THEN
    EXECUTE format('CREATE POLICY sponsorship_definer_all ON flow.custody_policy_sponsorships FOR ALL TO %I USING (true) WITH CHECK (true)', definer_role);
    EXECUTE format('CREATE POLICY sponsor_circuit_definer_all ON flow.custody_sponsor_circuit FOR ALL TO %I USING (true) WITH CHECK (true)', definer_role);
  END IF;

  IF db_name LIKE 'flow_test_%'
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = fixture_role) THEN
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE flow.custody_policy_sponsorships, flow.custody_sponsor_circuit TO %I', fixture_role);
    EXECUTE format('CREATE POLICY sponsorship_fixture_all ON flow.custody_policy_sponsorships FOR ALL TO %I USING (true) WITH CHECK (true)', fixture_role);
    EXECUTE format('CREATE POLICY sponsor_circuit_fixture_all ON flow.custody_sponsor_circuit FOR ALL TO %I USING (true) WITH CHECK (true)', fixture_role);
  END IF;
END;
$$;

COMMIT;
