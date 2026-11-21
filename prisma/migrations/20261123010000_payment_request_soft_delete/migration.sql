-- Public-safe helper to check whether a payment link was soft-deleted by its creator.
CREATE OR REPLACE FUNCTION flow.is_payment_request_deleted(p_public_id text)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
    v_deleted BOOLEAN := FALSE;
BEGIN
    SELECT COALESCE((pr.metadata->>'deleted')::boolean, FALSE)
    INTO v_deleted
    FROM flow.payment_requests pr
    WHERE pr.public_id = p_public_id
    LIMIT 1;

    RETURN COALESCE(v_deleted, FALSE);
END;
$$;

REVOKE EXECUTE ON FUNCTION flow.is_payment_request_deleted(text) FROM PUBLIC;

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
                'GRANT EXECUTE ON FUNCTION flow.is_payment_request_deleted(text) TO %I',
                v_role
            );
        END IF;
    END LOOP;
END
$$;
