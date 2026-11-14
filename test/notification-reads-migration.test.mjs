import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../prisma/migrations/20261116000000_persist_notification_reads/migration.sql",
    import.meta.url,
  ),
  "utf8",
);

test("notification read state is durable and session/account scoped", () => {
  assert.match(migration, /CREATE TABLE flow\.account_notification_reads/);
  assert.match(
    migration,
    /PRIMARY KEY \(account_id, viewer_user_id, notification_id\)/,
  );
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /FORCE ROW LEVEL SECURITY/);
  assert.match(migration, /flow\.current_session_flow_user_id\(\)/);
  assert.match(migration, /flow\.can_access_account\(account_id\)/);
  assert.match(
    migration,
    /GRANT SELECT, INSERT ON flow\.account_notification_reads/,
  );
  assert.doesNotMatch(migration, /GRANT .*UPDATE|GRANT .*DELETE/i);
  assert.doesNotMatch(migration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});
