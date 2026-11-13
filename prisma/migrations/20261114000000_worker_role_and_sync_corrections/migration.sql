BEGIN;

-- Serialize account sync requests so concurrent web requests cannot both
-- bypass the durable cooldown. A rate-limited request returns the existing
-- job ID with an internal RATE_LIMITED status; no public data is exposed.
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

  PERFORM pg_advisory_xact_lock(
    hashtextextended(p_account_id::text || ':' || p_job_type, 0)
  );

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
    RETURN QUERY SELECT v_job.id, 'RATE_LIMITED'::text;
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

DO $$
DECLARE
  db_name text := current_database();
  payment_role text := current_database() || '_payment_worker';
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = payment_role) THEN
    EXECUTE format('GRANT EXECUTE ON FUNCTION flow.enqueue_settlement_balance_sync(text) TO %I', payment_role);
  END IF;
END;
$$;

COMMIT;
