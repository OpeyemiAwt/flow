import test from "node:test";
import assert from "node:assert/strict";
import { authenticatedEntryPath } from "../src/server/onboarding/routing.ts";

test("a verified personal wallet opens the dashboard", () => {
  assert.equal(
    authenticatedEntryPath([
      { id: "personal-1", kind: "PERSONAL", provisioningComplete: true },
    ]),
    "/accounts/personal-1",
  );
});

test("a walletless or pending personal account resumes onboarding", () => {
  for (const provisioningComplete of [false]) {
    assert.equal(
      authenticatedEntryPath([
        { id: "personal-1", kind: "PERSONAL", provisioningComplete },
      ]),
      "/onboarding",
    );
  }
});

test("a business account cannot bypass Personal wallet onboarding", () => {
  assert.equal(
    authenticatedEntryPath([
      { id: "business-1", kind: "BUSINESS", provisioningComplete: true },
    ]),
    "/onboarding",
  );
});

test("missing account records resume onboarding", () => {
  assert.equal(authenticatedEntryPath([]), "/onboarding");
});
