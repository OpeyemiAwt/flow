-- Public-safe helper to read payment link usage limits and settled payment counts.
CREATE OR REPLACE FUNCTION flow.get_payment_request_usage(p_public_id text)
RETURNS TABLE (
    max_payments INTEGER,
    paid_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
    RETURN QUERY
    SELECT
        CASE
            WHEN (pr.metadata->>'maxPayments') ~ '^[1-9][0-9]*$'
            THEN (pr.metadata->>'maxPayments')::integer
            ELSE NULL
        END AS max_payments,
        COALESCE(
            (
                SELECT COUNT(*)::integer
                FROM flow.payment_attempts pa
                WHERE pa.payment_request_id = pr.id
                  AND pa.status = 'SETTLED'
            ),
            0
        ) AS paid_count
    FROM flow.payment_requests pr
    WHERE pr.public_id = p_public_id
    LIMIT 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION flow.get_payment_request_usage(text) FROM PUBLIC;

DO $$
DECLARE
    v_role TEXT;
    v_roles TEXT[] := ARRAY[
        current_database() || '_app',
        current_database() || '_worker',
        current_database() || '_payment_worker',
        'flow_production_app',
        'flow_production_worker',
        'flow_production_payment_worker'
    ];
BEGIN
    FOREACH v_role IN ARRAY v_roles LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_role) THEN
            EXECUTE format(
                'GRANT EXECUTE ON FUNCTION flow.get_payment_request_usage(text) TO %I',
                v_role
            );
        END IF;
    END LOOP;
END
$$;
