BEGIN;

-- The custody process can operate wallet provisioning and read the minimum
-- owner records needed to verify scope. It cannot create accounts, alter
-- authentication identities, or approve privileged custody recovery.
DO $$
DECLARE
  db_name text := current_database();
  custody_role text := db_name || '_custody_worker';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = custody_role) THEN
    EXECUTE format('GRANT USAGE ON SCHEMA flow TO %I', custody_role);
    EXECUTE format('GRANT SELECT ON flow.accounts, flow.users, flow.auth_users TO %I', custody_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON flow.wallet_provisioning_jobs TO %I', custody_role);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON flow.wallets, flow.wallet_addresses, flow.wallet_capabilities TO %I', custody_role);
    EXECUTE format('GRANT SELECT, UPDATE ON flow.provider_compatibility_authorizations TO %I', custody_role);
    EXECUTE format('GRANT SELECT ON flow.custody_operators, flow.custody_recovery_approvals TO %I', custody_role);
    EXECUTE format('GRANT SELECT, INSERT ON flow.security_audit_events TO %I', custody_role);
    EXECUTE format('REVOKE INSERT, DELETE ON flow.provider_compatibility_authorizations FROM %I', custody_role);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON flow.custody_operators, flow.custody_recovery_approvals FROM %I', custody_role);
  END IF;
END;
$$;

COMMIT;
