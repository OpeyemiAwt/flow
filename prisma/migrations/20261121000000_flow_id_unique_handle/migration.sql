ALTER TABLE flow.accounts
ADD COLUMN IF NOT EXISTS flow_id VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_flow_id_lower_key
ON flow.accounts (LOWER(flow_id))
WHERE flow_id IS NOT NULL;
