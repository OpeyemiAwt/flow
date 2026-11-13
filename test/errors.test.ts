import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticCategory, FlowError } from "../src/foundation/errors.ts";

test("diagnostic categories are fixed and do not expose arbitrary errors", () => {
  const privateError = Object.assign(
    new Error("postgres://user:secret@db.internal/flow_staging"),
    { code: "P2021" },
  );
  assert.equal(diagnosticCategory(privateError), "DATABASE_SCHEMA");
  assert.equal(
    diagnosticCategory(Object.assign(new Error("private"), { code: "42501" })),
    "DATABASE_PERMISSION",
  );
  assert.equal(
    diagnosticCategory(Object.assign(new Error("private"), { code: "P2002" })),
    "DATABASE_CONSTRAINT",
  );
  assert.equal(
    diagnosticCategory(Object.assign(new Error("private"), { code: "P1001" })),
    "DATABASE_CONNECTION",
  );
  assert.equal(
    diagnosticCategory(
      Object.assign(new Error("private"), { name: "APIError" }),
    ),
    "AUTH_PROVIDER",
  );
  assert.equal(
    diagnosticCategory(new FlowError("DATABASE_UNAVAILABLE", "private")),
    "DATABASE_CONNECTION",
  );
  assert.equal(
    diagnosticCategory(new FlowError("DATABASE_NOT_READY", "private")),
    "DATABASE_NOT_READY",
  );
  assert.equal(
    diagnosticCategory(new FlowError("INVALID_CONFIGURATION", "private")),
    "CONFIGURATION",
  );
  assert.equal(
    diagnosticCategory(
      Object.assign(new Error("secret value"), { code: "secret value" }),
    ),
    "UNCLASSIFIED",
  );
});
