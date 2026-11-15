-- Grant SELECT + RLS read access on payment_requests and related payment tables
-- to the active payment worker role (fixing 42501 permission denied in production).

DO $$
DECLARE
    v_role TEXT;
    v_roles TEXT[] := ARRAY[
        current_database() || '_payment_worker',
        'flow_production_payment_worker',
        current_database() || '_worker',
        'flow_production_worker'
    ];
BEGIN
    FOREACH v_role IN ARRAY v_roles LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format('GRANT USAGE ON SCHEMA flow TO %I', v_role);
            EXECUTE format(
                'GRANT SELECT ON TABLE flow.payment_requests, flow.payment_attempts, flow.payment_verifications, flow.assets, flow.network_assets, flow.add_money_intents, flow.wallet_addresses, flow.accounts TO %I',
                v_role
            );

            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'flow'
                  AND tablename = 'payment_requests'
                  AND policyname = 'payment_requests_payment_worker_select_policy'
            ) THEN
                EXECUTE format(
                    'CREATE POLICY payment_requests_payment_worker_select_policy ON flow.payment_requests FOR SELECT TO %I USING (true)',
                    v_role
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = 'flow'
                  AND tablename = 'payment_attempts'
                  AND policyname = 'payment_attempts_payment_worker_select_policy'
            ) THEN
                EXECUTE format(
                    'CREATE POLICY payment_attempts_payment_worker_select_policy ON flow.payment_attempts FOR SELECT TO %I USING (true)',
                    v_role
                );
            END IF;
        END IF;
    END LOOP;
END
$$;
