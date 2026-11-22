-- Public-safe helper to read whether the creator or payer covers routing fees on a payment link.
CREATE OR REPLACE FUNCTION flow.get_payment_request_fee_payer(p_public_id text)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
    v_fee_payer TEXT := 'PAYER';
BEGIN
    SELECT CASE
        WHEN UPPER(COALESCE(pr.metadata->>'feePayer', 'PAYER')) = 'MERCHANT' THEN 'MERCHANT'
        ELSE 'PAYER'
    END
    INTO v_fee_payer
    FROM flow.payment_requests pr
    WHERE pr.public_id = p_public_id
    LIMIT 1;

    RETURN COALESCE(v_fee_payer, 'PAYER');
END;
$$;

REVOKE EXECUTE ON FUNCTION flow.get_payment_request_fee_payer(text) FROM PUBLIC;

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
                'GRANT EXECUTE ON FUNCTION flow.get_payment_request_fee_payer(text) TO %I',
                v_role
            );
        END IF;
    END LOOP;
END
$$;
