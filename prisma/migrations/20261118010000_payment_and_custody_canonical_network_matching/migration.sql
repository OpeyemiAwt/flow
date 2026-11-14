-- M38: Canonical network matching for real OutLayer wallet_addresses rows
-- OutLayer provisioning stores short network keys ('base', 'ethereum', 'solana', 'near')
-- with canonical chain_ids ('8453', '1', 'solana-mainnet', 'near-mainnet'), while
-- payment_requests and outgoing_transfer_jobs store canonical networkKey values
-- ('base-mainnet', 'ethereum-mainnet', 'solana-mainnet', 'near-mainnet').

CREATE OR REPLACE FUNCTION flow.networks_match(
    p_lhs text,
    p_rhs text
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN p_lhs IS NULL OR p_rhs IS NULL THEN false
        WHEN lower(trim(p_lhs)) = lower(trim(p_rhs)) THEN true
        WHEN lower(trim(p_lhs)) IN ('base', 'base-mainnet', '8453', 'eip155:8453')
         AND lower(trim(p_rhs)) IN ('base', 'base-mainnet', '8453', 'eip155:8453') THEN true
        WHEN lower(trim(p_lhs)) IN ('ethereum', 'ethereum-mainnet', 'eth', 'eth-mainnet', '1', 'eip155:1')
         AND lower(trim(p_rhs)) IN ('ethereum', 'ethereum-mainnet', 'eth', 'eth-mainnet', '1', 'eip155:1') THEN true
        WHEN lower(trim(p_lhs)) IN ('solana', 'solana-mainnet', 'mainnet-beta')
         AND lower(trim(p_rhs)) IN ('solana', 'solana-mainnet', 'mainnet-beta') THEN true
        WHEN lower(trim(p_lhs)) IN ('near', 'near-mainnet')
         AND lower(trim(p_rhs)) IN ('near', 'near-mainnet') THEN true
        ELSE false
    END
$$;

CREATE OR REPLACE FUNCTION flow.get_payment_attempt_commitment_details(
    p_payment_request_public_id text,
    p_attempt_public_id text
)
RETURNS TABLE (
    payment_request_id UUID,
    attempt_id UUID,
    destination_asset_id TEXT,
    payer_refund_address TEXT,
    recipient_address TEXT,
    recipient_network TEXT,
    recipient_chain_id TEXT,
    wallet_environment TEXT,
    wallet_status TEXT,
    can_receive BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
    RETURN QUERY
    SELECT
        pr.id AS payment_request_id,
        pa.id AS attempt_id,
        pr.destination_asset_id::TEXT,
        pa.payer_refund_address::TEXT,
        wa.address::TEXT AS recipient_address,
        wa.network::TEXT AS recipient_network,
        wa.chain_id::TEXT AS recipient_chain_id,
        w.environment::TEXT AS wallet_environment,
        w.status::TEXT AS wallet_status,
        COALESCE(wc.can_receive, false)::BOOLEAN AS can_receive
    FROM flow.payment_attempts pa
    JOIN flow.payment_requests pr ON pr.id = pa.payment_request_id
    LEFT JOIN flow.wallets w ON w.account_id = pr.account_id
    LEFT JOIN flow.wallet_addresses wa
      ON wa.wallet_id = w.id
     AND flow.networks_match(wa.network, pr.destination_network)
    LEFT JOIN flow.wallet_capabilities wc
      ON wc.wallet_id = w.id
     AND (wc.network = wa.network OR flow.networks_match(wc.network, wa.network))
    WHERE pa.attempt_public_id = p_attempt_public_id
      AND pr.public_id = p_payment_request_public_id
    ORDER BY
        (w.environment = 'mainnet') DESC,
        (w.status = 'ACTIVE') DESC,
        (wa.network = pr.destination_network) DESC,
        wa.updated_at DESC NULLS LAST
    LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION flow.create_payment_rehearsal_authorization(
    p_payment_request_id UUID,
    p_operator_auth_id TEXT,
    p_approval_assertion_token TEXT,
    p_source_network TEXT,
    p_source_asset_id TEXT,
    p_destination_network TEXT,
    p_destination_asset_id TEXT,
    p_max_atomic_amount NUMERIC,
    p_allowed_recipient_address TEXT,
    p_allowed_payer_refund_address TEXT DEFAULT NULL,
    p_duration_seconds INTEGER DEFAULT 1800
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
    v_auth_id UUID;
    v_expires_at TIMESTAMPTZ;
    v_wallet_id UUID;
    v_wallet_status flow.wallet_status;
    v_can_receive BOOLEAN;
    v_pr_dest_net TEXT;
    v_pr_dest_asset TEXT;
    v_pr_status flow.payment_request_status;
    v_assertion_hash TEXT;
    v_assertion RECORD;
    v_session_operator_id TEXT;
BEGIN
    IF p_approval_assertion_token IS NULL OR length(trim(p_approval_assertion_token)) < 32 THEN
        RAISE EXCEPTION 'OPERATOR_ASSERTION_REQUIRED: rehearsal authorization requires a valid cryptographic approval assertion token'
            USING ERRCODE = '42501';
    END IF;

    v_assertion_hash := encode(sha256(convert_to(trim(p_approval_assertion_token), 'UTF8')), 'hex');

    SELECT * INTO v_assertion
    FROM flow.operator_approval_assertions
    WHERE assertion_token_hash = v_assertion_hash
      AND consumed_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    FOR UPDATE;

    IF v_assertion.id IS NULL THEN
        RAISE EXCEPTION 'OPERATOR_ASSERTION_INVALID: approval assertion token is invalid, expired, or already consumed'
            USING ERRCODE = '42501';
    END IF;

    IF v_assertion.operator_auth_id <> p_operator_auth_id THEN
        RAISE EXCEPTION 'OPERATOR_ASSERTION_IDENTITY_MISMATCH: assertion was issued for operator %, not caller %',
            v_assertion.operator_auth_id, p_operator_auth_id
            USING ERRCODE = '42501';
    END IF;

    v_session_operator_id := NULLIF(current_setting('flow.operator_auth_id', true), '');
    IF v_session_operator_id IS NOT NULL AND v_session_operator_id <> v_assertion.operator_auth_id THEN
        RAISE EXCEPTION 'OPERATOR_IDENTITY_SPOOFED: session context % does not match assertion operator %',
            v_session_operator_id, v_assertion.operator_auth_id
            USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM flow.custody_operators co
        WHERE co.auth_user_id = v_assertion.operator_auth_id
          AND co.status = 'ACTIVE'
          AND co.role IN ('SECURITY_OFFICER', 'CUSTODY_OPERATOR')
    ) THEN
        RAISE EXCEPTION 'OPERATOR_NOT_AUTHORIZED: operator % is not an active custody operator or security officer', v_assertion.operator_auth_id
            USING ERRCODE = '42501';
    END IF;

    IF v_assertion.payment_request_id <> p_payment_request_id OR
       v_assertion.source_network <> p_source_network OR
       v_assertion.source_asset_id <> p_source_asset_id OR
       v_assertion.destination_network <> p_destination_network OR
       v_assertion.destination_asset_id <> p_destination_asset_id OR
       p_max_atomic_amount > v_assertion.max_atomic_amount OR
       lower(trim(v_assertion.allowed_recipient_address)) <> lower(trim(p_allowed_recipient_address)) OR
       (v_assertion.allowed_payer_refund_address IS NOT NULL AND v_assertion.allowed_payer_refund_address IS DISTINCT FROM p_allowed_payer_refund_address) THEN
        RAISE EXCEPTION 'OPERATOR_ASSERTION_SCOPE_MISMATCH: rehearsal parameters do not match approved assertion scope'
            USING ERRCODE = '42501';
    END IF;

    IF p_duration_seconds < 60 OR p_duration_seconds > 86400 THEN
        RAISE EXCEPTION 'INVALID_REHEARSAL_DURATION: must be between 60 and 86400 seconds' USING ERRCODE = 'data_exception';
    END IF;

    IF p_max_atomic_amount <= 0 THEN
        RAISE EXCEPTION 'INVALID_MAX_ATOMIC_AMOUNT: must be greater than zero' USING ERRCODE = 'data_exception';
    END IF;

    IF EXISTS (
        SELECT 1 FROM flow.payment_rehearsal_authorizations
        WHERE payment_request_id = p_payment_request_id
          AND environment = 'mainnet'
          AND consumed_at IS NULL
          AND expires_at > CURRENT_TIMESTAMP
    ) THEN
        RAISE EXCEPTION 'ACTIVE_REHEARSAL_AUTHORIZATION_EXISTS: an active authorization already exists for this payment request'
            USING ERRCODE = '23505';
    END IF;

    IF lower(trim(p_allowed_recipient_address)) IN (
        '0xd8da6bf26964af9d7eed9e03e53415d37aa96045',
        '0x1111111111111111111111111111111111111111',
        '0x0000000000000000000000000000000000000000'
    ) THEN
        RAISE EXCEPTION 'PROHIBITED_RECIPIENT_ADDRESS: illustrative probe address % is strictly prohibited', p_allowed_recipient_address
            USING ERRCODE = '42501';
    END IF;

    SELECT destination_network, destination_asset_id, status
    INTO v_pr_dest_net, v_pr_dest_asset, v_pr_status
    FROM flow.payment_requests
    WHERE id = p_payment_request_id;

    IF v_pr_status IS NULL THEN
        RAISE EXCEPTION 'PAYMENT_REQUEST_NOT_FOUND: %', p_payment_request_id USING ERRCODE = 'data_exception';
    END IF;

    IF v_pr_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'PAYMENT_REQUEST_INACTIVE: status is %', v_pr_status USING ERRCODE = 'data_exception';
    END IF;

    IF v_pr_dest_net <> p_destination_network OR v_pr_dest_asset <> p_destination_asset_id THEN
        RAISE EXCEPTION 'REHEARSAL_ROUTE_MISMATCH: payment request destination %:% does not match authorized destination %:%',
            v_pr_dest_net, v_pr_dest_asset, p_destination_network, p_destination_asset_id
            USING ERRCODE = 'data_exception';
    END IF;

    SELECT w.id, w.status, COALESCE(wc.can_receive, false)
    INTO v_wallet_id, v_wallet_status, v_can_receive
    FROM flow.payment_requests pr
    JOIN flow.wallets w ON w.account_id = pr.account_id AND w.environment = 'mainnet'
    JOIN flow.wallet_addresses wa
      ON wa.wallet_id = w.id
     AND flow.networks_match(wa.network, p_destination_network)
    LEFT JOIN flow.wallet_capabilities wc
      ON wc.wallet_id = w.id
     AND (wc.network = wa.network OR flow.networks_match(wc.network, wa.network))
    WHERE pr.id = p_payment_request_id
      AND lower(trim(wa.address)) = lower(trim(p_allowed_recipient_address))
    LIMIT 1;

    IF v_wallet_id IS NULL THEN
        RAISE EXCEPTION 'UNVERIFIED_RECIPIENT_WALLET: recipient address % is not an owner-controlled mainnet wallet registered to this merchant account',
            p_allowed_recipient_address
            USING ERRCODE = '42501';
    END IF;

    IF v_wallet_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'RECIPIENT_WALLET_NOT_ACTIVE: merchant recipient wallet status is %, must be ACTIVE', v_wallet_status
            USING ERRCODE = '42501';
    END IF;

    IF NOT v_can_receive THEN
        RAISE EXCEPTION 'RECIPIENT_WALLET_CANNOT_RECEIVE: merchant recipient wallet capability can_receive is false'
            USING ERRCODE = '42501';
    END IF;

    v_expires_at := LEAST(CURRENT_TIMESTAMP + (p_duration_seconds || ' seconds')::interval, v_assertion.expires_at);

    INSERT INTO flow.payment_rehearsal_authorizations (
        payment_request_id,
        operator_auth_id,
        environment,
        source_network,
        source_asset_id,
        destination_network,
        destination_asset_id,
        max_atomic_amount,
        allowed_payer_refund_address,
        allowed_recipient_address,
        expires_at,
        assertion_id
    ) VALUES (
        p_payment_request_id,
        v_assertion.operator_auth_id,
        'mainnet',
        p_source_network,
        p_source_asset_id,
        p_destination_network,
        p_destination_asset_id,
        p_max_atomic_amount,
        p_allowed_payer_refund_address,
        p_allowed_recipient_address,
        v_expires_at,
        v_assertion.id
    )
    RETURNING id INTO v_auth_id;

    UPDATE flow.operator_approval_assertions
    SET consumed_at = CURRENT_TIMESTAMP,
        consumed_by_authorization_id = v_auth_id
    WHERE id = v_assertion.id;

    RETURN v_auth_id;
END;
$$;

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
   AND flow.networks_match(wa.network, v_job.source_network)
  WHERE w.id = v_job.wallet_id
    AND w.status = 'ACTIVE'
  ORDER BY (wa.network = v_job.source_network) DESC, wa.updated_at DESC
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION flow.networks_match(text, text) FROM PUBLIC;

DO $$
DECLARE
    role_suffix text;
    target_role text;
BEGIN
    FOREACH role_suffix IN ARRAY ARRAY[
        '_app', '_worker', '_operator', '_payment_worker', '_custody_worker', '_indexer_worker'
    ]
    LOOP
        target_role := current_database() || role_suffix;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role) THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION flow.networks_match(text, text) TO %I', target_role);
        END IF;
    END LOOP;
END $$;
