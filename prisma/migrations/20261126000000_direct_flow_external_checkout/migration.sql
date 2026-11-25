-- Support direct @flow link display-name lookup and permanent open-amount
-- external-wallet checkout settling on NEAR Mainnet (near-mainnet:NEAR).

BEGIN;

CREATE OR REPLACE FUNCTION flow.lookup_public_flow_id_display(
  p_flow_id text
)
RETURNS TABLE (
  flow_id text,
  display_name text,
  has_active_wallet boolean,
  has_near_address boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
BEGIN
  IF p_flow_id IS NULL OR BTRIM(p_flow_id) = '' THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.flow_id::text AS flow_id,
    COALESCE(
      NULLIF(BTRIM(up.display_name), ''),
      NULLIF(BTRIM(au.name), ''),
      CASE
        WHEN LOWER(BTRIM(COALESCE(a.name, ''))) NOT IN ('', 'personal', 'personal account', 'default', 'main account')
          THEN BTRIM(a.name)
        ELSE NULL
      END,
      NULLIF(split_part(a.flow_id, '@', 1), ''),
      a.flow_id
    )::text AS display_name,
    (w.status = 'ACTIVE')::boolean AS has_active_wallet,
    EXISTS (
      SELECT 1
      FROM flow.wallet_addresses wa
      WHERE wa.wallet_id = w.id
        AND (
          wa.chain_id = 'near-mainnet'
          OR LOWER(wa.network) IN ('near', 'near-mainnet')
        )
    )::boolean AS has_near_address
  FROM flow.accounts a
  LEFT JOIN flow.wallets w
    ON w.account_id = a.id AND w.environment = 'mainnet'
  LEFT JOIN flow.users u
    ON u.id = a.personal_owner_id
  LEFT JOIN flow.auth_users au
    ON au.id = u.auth_user_id
  LEFT JOIN flow.user_profile_preferences up
    ON up.user_id = u.id
  WHERE LOWER(a.flow_id) = LOWER(BTRIM(p_flow_id))
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION flow.get_or_create_direct_flow_external_checkout(
  p_flow_id text
)
RETURNS TABLE (
  public_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, flow
AS $$
DECLARE
  v_account_id uuid;
  v_flow_id text;
  v_display_name text;
  v_existing_public_id text;
  v_new_public_id text;
BEGIN
  IF p_flow_id IS NULL OR BTRIM(p_flow_id) = '' THEN
    RETURN;
  END IF;

  SELECT
    a.id,
    a.flow_id::text,
    COALESCE(
      NULLIF(BTRIM(up.display_name), ''),
      NULLIF(BTRIM(au.name), ''),
      CASE
        WHEN LOWER(BTRIM(COALESCE(a.name, ''))) NOT IN ('', 'personal', 'personal account', 'default', 'main account')
          THEN BTRIM(a.name)
        ELSE NULL
      END,
      NULLIF(split_part(a.flow_id, '@', 1), ''),
      a.flow_id
    )::text
  INTO v_account_id, v_flow_id, v_display_name
  FROM flow.accounts a
  JOIN flow.wallets w
    ON w.account_id = a.id
   AND w.environment = 'mainnet'
   AND w.status = 'ACTIVE'
  LEFT JOIN flow.users u
    ON u.id = a.personal_owner_id
  LEFT JOIN flow.auth_users au
    ON au.id = u.auth_user_id
  LEFT JOIN flow.user_profile_preferences up
    ON up.user_id = u.id
  WHERE LOWER(a.flow_id) = LOWER(BTRIM(p_flow_id))
    AND EXISTS (
      SELECT 1
      FROM flow.wallet_addresses wa
      WHERE wa.wallet_id = w.id
        AND (
          wa.chain_id = 'near-mainnet'
          OR LOWER(wa.network) IN ('near', 'near-mainnet')
        )
    )
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RETURN;
  END IF;

  -- Serialize concurrent creation per account
  PERFORM pg_advisory_xact_lock(hashtext('direct_flow_ext:' || v_account_id::text));

  SELECT pr.public_id::text
  INTO v_existing_public_id
  FROM flow.payment_requests pr
  WHERE pr.account_id = v_account_id
    AND pr.status = 'ACTIVE'
    AND pr.amount_mode = 'OPTIONAL'
    AND pr.destination_network = 'near-mainnet'
    AND pr.destination_asset_id = 'near-mainnet:NEAR'
    AND COALESCE((pr.metadata->>'directFlowExternalCheckout')::boolean, false) = true
    AND COALESCE((pr.metadata->>'deleted')::boolean, false) = false
  ORDER BY pr.created_at DESC
  LIMIT 1;

  IF v_existing_public_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_public_id::text;
    RETURN;
  END IF;

  v_new_public_id := 'pr_flw_' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO flow.payment_requests (
    account_id,
    public_id,
    title,
    description,
    destination_network,
    destination_asset_id,
    destination_asset_symbol,
    destination_decimals,
    amount_mode,
    requested_atomic_amount,
    status,
    expires_at,
    payer_memo_required,
    metadata
  )
  VALUES (
    v_account_id,
    v_new_public_id,
    left('Pay ' || v_display_name, 120),
    'Pay ' || v_flow_id || ' from any external wallet. Settles on NEAR Mainnet.',
    'near-mainnet',
    'near-mainnet:NEAR',
    'NEAR',
    24,
    'OPTIONAL'::flow.payment_amount_mode,
    NULL,
    'ACTIVE'::flow.payment_request_status,
    NULL,
    false,
    jsonb_build_object(
      'feePayer', 'PAYER',
      'directFlowExternalCheckout', true,
      'flowId', v_flow_id
    )
  );

  RETURN QUERY SELECT v_new_public_id::text;
END;
$$;

REVOKE ALL ON FUNCTION flow.lookup_public_flow_id_display(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION flow.get_or_create_direct_flow_external_checkout(text) FROM PUBLIC;

DO $$
DECLARE
  db_name text := current_database();
  app_role text := db_name || '_app';
  migrator_role text := db_name || '_migrator';
  definer_role text := current_user;
  r text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.lookup_public_flow_id_display(text) TO %I', app_role);
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.get_or_create_direct_flow_external_checkout(text) TO %I', app_role);
  END IF;

  FOREACH r IN ARRAY ARRAY[migrator_role, definer_role] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON flow.payment_requests', 'definer_all_' || r);
      EXECUTE format('CREATE POLICY %I ON flow.payment_requests FOR ALL TO %I USING (true) WITH CHECK (true)', 'definer_all_' || r, r);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
