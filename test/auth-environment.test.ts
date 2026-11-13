import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import { readAuthConfig } from "../src/foundation/auth-environment.ts";

function local() {
  return {
    FLOW_APP_ORIGIN: "http://127.0.0.1:3000",
    FLOW_AUTH_SECRET: randomBytes(32).toString("hex"),
    FLOW_OTP_KEY: randomBytes(32).toString("hex"),
    FLOW_GOOGLE_CLIENT_ID: "000000-local-example.apps.googleusercontent.com",
    FLOW_GOOGLE_CLIENT_SECRET: "example-only-local-client-secret",
    FLOW_MAIL_API_KEY: "re_example_only_local_mail",
    FLOW_MAIL_FROM: "local@example.test",
  };
}

function fixture() {
  return {
    ...local(),
    FLOW_GOOGLE_CLIENT_ID: "000000-flow-fixture.apps.googleusercontent.com",
    FLOW_GOOGLE_CLIENT_SECRET: "flow-fixture-example-only-client",
    FLOW_MAIL_API_KEY: "re_flow_fixture_example_only",
  };
}

const invalid = { code: "INVALID_CONFIGURATION" };

test("deployed auth requires a canonical HTTPS origin and host-only cookie names", () => {
  const source = local();
  const config = readAuthConfig(
    { ...source, FLOW_APP_ORIGIN: "https://flow.example" },
    "production",
  );
  assert.equal(config.cookies.session, "__Host-flow-production-session");
  assert.equal(config.secure, true);
  assert.equal(
    readAuthConfig(source, "local").cookies.session,
    "flow-local-session",
  );
  for (const origin of [
    "https://127.0.0.1:3000",
    "http://flow.example",
    "https://flow.example/path",
    "https://x:secret@flow.example",
    "https://flow.example?token=bad",
  ]) {
    assert.throws(
      () =>
        readAuthConfig({ ...source, FLOW_APP_ORIGIN: origin }, "production"),
      invalid,
    );
  }
});

test("public signup is closed by default in production and can be explicitly gated elsewhere", () => {
  const deployed = { ...local(), FLOW_APP_ORIGIN: "https://flow.example" };
  assert.equal(
    readAuthConfig(deployed, "production").publicSignupEnabled,
    false,
  );
  assert.equal(
    readAuthConfig(
      { ...deployed, FLOW_PUBLIC_SIGNUP_ENABLED: "enabled" },
      "production",
    ).publicSignupEnabled,
    true,
  );
  assert.equal(
    readAuthConfig(
      { ...deployed, FLOW_PUBLIC_SIGNUP_ENABLED: "disabled" },
      "production",
    ).publicSignupEnabled,
    false,
  );
  assert.equal(readAuthConfig(local(), "local").publicSignupEnabled, true);
  assert.equal(
    readAuthConfig(
      { ...local(), FLOW_PUBLIC_SIGNUP_ENABLED: "disabled" },
      "local",
    ).publicSignupEnabled,
    false,
  );
});

test("test requires loopback and fixture credentials while every other environment rejects the fixture", () => {
  assert.equal(
    readAuthConfig(fixture(), "test").cookies.session,
    "flow-test-session",
  );
  assert.throws(() => readAuthConfig(local(), "test"), invalid);
  assert.throws(() => readAuthConfig(fixture(), "local"), invalid);
  const deployed = { ...fixture(), FLOW_APP_ORIGIN: "https://flow.example" };
  assert.throws(() => readAuthConfig(deployed, "staging"), invalid);
  assert.throws(() => readAuthConfig(deployed, "production"), invalid);
  assert.throws(() => readAuthConfig(deployed, "test"), invalid);
});

test("absent, reused and placeholder authentication secrets fail without exposing input", () => {
  const source = local();
  assert.throws(() => readAuthConfig({}, "production"), invalid);
  assert.throws(
    () =>
      readAuthConfig(
        { ...source, FLOW_OTP_KEY: source.FLOW_AUTH_SECRET },
        "local",
      ),
    invalid,
  );
  assert.throws(
    () =>
      readAuthConfig(
        {
          ...source,
          FLOW_GOOGLE_CLIENT_ID:
            "replace-with-client.apps.googleusercontent.com",
        },
        "local",
      ),
    invalid,
  );
  assert.throws(
    () =>
      readAuthConfig(
        { ...source, FLOW_GOOGLE_CLIENT_SECRET: "private/fixture/value" },
        "local",
      ),
    {
      ...invalid,
      message: "Invalid authentication settings: FLOW_GOOGLE_CLIENT_SECRET.",
    },
  );
});

test("Resend sender accepts bare and display-name mailbox forms but rejects header injection", () => {
  const source = local();
  const displayFrom = "FLOW <auth@mail.devhub.forum>";
  assert.equal(
    readAuthConfig({ ...source, FLOW_MAIL_FROM: displayFrom }, "local")
      .mailFrom,
    displayFrom,
  );
  assert.equal(
    readAuthConfig(
      { ...source, FLOW_MAIL_FROM: '"FLOW Payments" <auth@mail.devhub.forum>' },
      "local",
    ).mailFrom,
    '"FLOW Payments" <auth@mail.devhub.forum>',
  );
  for (const sender of [
    "FLOW <auth@mail.devhub.forum>\r\nBcc: attacker@example.com",
    "FLOW auth@mail.devhub.forum",
    "FLOW <not-an-address>",
  ]) {
    assert.throws(
      () => readAuthConfig({ ...source, FLOW_MAIL_FROM: sender }, "local"),
      {
        code: "INVALID_CONFIGURATION",
        message: "Invalid authentication settings: FLOW_MAIL_FROM.",
      },
    );
  }
});
