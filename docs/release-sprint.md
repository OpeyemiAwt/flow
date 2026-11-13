# FLOW complete-product release acceptance

Owner scope correction recorded 13 November 2026 (Africa/Lagos).

> SUCCESS MEANS A FULLY FUNCTIONING, VERIFIED FLOW APPLICATION, NOT JUST A PRESENTABLE DEMO.

The 28-hour target covers complete implementation, integration, testing, production deployment, and hackathon submission. It does not authorize omission or simplification of agreed capabilities. A preview is only a preview. A safety guard is a verification gate, not permission to abandon implementation.

## Preserved baseline

- Approved UI commit: `86388d68292372222d7db8329b67fab6730ab77d`.
- Approved branch remains `codex/flow-ui-recovery-phase-1`.
- Implementation branch: `codex/flow-release-sprint`.
- Preserve the funded Personal account, original provider container, four registered wallet addresses, encrypted credentials, encryption master key, ledger, and settlement history.
- Keep the approved visual direction, landing, signup, and OTP appearance. The standalone Wallets & Assets page must remain absent while its financial data and wallet capabilities remain available through the agreed flows.
- Use isolated databases/accounts for testing. No funded database reset, reseed, key replacement, or silent production connection to the funded local database.

## Full scope and completion evidence

| Capability                       | Required verified result                                                                                                                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email authentication             | Real delivery, hashed and expiring OTPs, persistent rate/attempt limits, resend throttling, replay rejection, correct onboarding/dashboard redirects                               |
| Google OAuth and account linking | Final HTTPS callback, verified identity, explicit safe linking, unrelated users never merged                                                                                       |
| Sessions and recovery            | Durable authenticated sessions, server-side logout/revocation, recovery appropriate to the passwordless model, tenant isolation                                                    |
| Wallet onboarding                | Dedicated OutLayer provisioning worker, unique wallet per account, encrypted credentials, four-chain addresses, retry/crash recovery, same wallet after re-login                   |
| Profile and notifications        | Authenticated server persistence, cross-session consistency, tenant isolation, real event/read state where applicable                                                              |
| Asset discovery and quotes       | Broad eligible NEAR Intents catalog, exact selected token/network, verified identity and precision, genuine fees/minimums/deadlines, no silent substitution                        |
| Direct Receive and balances      | Correct permanent registered addresses, verified chain synchronization, no invented balances                                                                                       |
| Payment Links and guest checkout | Persistent links, Stablecoins and Any Token, payer refund validation, authorized provider commitment, actual deposit instructions, final settlement and receipt                    |
| Cross-chain Add Money            | Durable intent, unique provider deposit instructions, native NEAR settlement into the registered wallet, confirmed ledger/balance/Activity                                         |
| Send and Convert                 | Real held assets, exact destination and token, explicit approval, gas funding, custody signing, broadcast, finality, accounting and failure recovery                               |
| Financial history and reporting  | Complete Activity and monthly reporting backed by chain evidence and posted ledger, idempotent reconciliation                                                                      |
| Production                       | Railway application, isolated PostgreSQL, persistent worker, HTTPS/custom domain, production email/OAuth/provider configuration, health/restart checks, secure backup and recovery |
| Release verification             | Full automated suite, build/security checks, CI, desktop/mobile visual checks, live service evidence, controlled end-to-end financial tests                                        |

## Verification and authorization sequence

For every blocked capability:

1. Identify the exact missing component or external dependency.
2. Implement and integrate it without changing the approved product scope.
3. Test in isolated environments, including rejection, concurrency, restart, and recovery paths.
4. Present concrete financial test details and evidence for separate authorization where required.
5. Run only the authorized controlled transaction, verify the exact operation end to end, and progress toward completion.

Fund-moving operations stay disabled until their exact acceptance gates pass. Dry quotes alone never authorize Send or Convert. No transaction authorization is implied by this document. Genuine external/security blockers must remain explicit and cannot be represented as successful functionality.

## Owner coordination

- Authorized email-delivery test inbox: supplied by the owner in the release conversation; use only that authorized destination and do not commit inbox/provider secrets.
- Owner deferred Railway project/workspace and DNS coordination until later. Continue implementation and deployment preparation in the meantime.
- Report each completed workstream with branch/commit, functionality, automated/manual tests, screenshots for UI changes, sanitized real-service evidence, remaining blockers, and owner actions.
- Work in recoverable commits. Preserve the approved branch.

## Owner's full implementation authorization (13 November 2026)

The Phase 2 audit is the implementation backlog. Complete all seven approved stages: financial database and execution safety; guest checkout; cross-chain Add Money; OutLayer outgoing execution; authentication and new-user provisioning; approved product integration; production integrations and deployment. Do not stop at preview-only functionality or another audit. Build each complete capability behind its safety gate, prove it in isolated environments, and request specific authorization only for irreversible financial tests, custody-sensitive operations, funded database changes, or live financial activation.

Preserve source branch `codex/flow-ui-recovery-phase-1` and commit `86388d68292372222d7db8329b67fab6730ab77d` as the UI/source baseline. Current work is on recoverable branch `codex/flow-release-sprint`. Preserve the original funded Personal account, OutLayer wallet/container, addresses, encrypted credentials/key versions, balances, posted ledger, settlement and verification evidence. Do not reprovision that owner, reset the funded database, reveal credentials, or move funds without exact owner approval.

Implement safe forward migrations and clone-tested funded upgrade compatibility. Harden trusted provider commitments, idempotency, immutable intents, quarantine, chain proofs, retries, fencing, expiry, and worker restart recovery. Finish catalog-supported guest checkout, payer refund and provider deposit instructions, settlement and exactly-once accounting. Finish native-NEAR Add Money separately from permanent-address Direct Receive. Implement safe chain-specific Send/Convert builders, estimates, user-bound approval, caps/reservations, OutLayer authorization/signing/broadcast, unknown outcome recovery, final proof and ledger accounting. Complete email/Google authentication, account recovery, persistent sessions, owner-only origin-checked provisioning through dedicated workers, same-wallet retry behavior, profile and notification persistence. Integrate the approved Home, Receive, Add Money, Send, Convert, Payment Links, Checkout, Activity, Settings, Profile, Notifications and Flow AI experiences without redesign. Prepare Railway app, workers, PostgreSQL, migrations, secrets, OAuth, email, HTTPS, DNS, operations and recovery.

Implementation, isolated tests, public metadata reads, and dry quotes are authorized. Creating live mainnet wallets, payable commitments, sending funds, enabling outgoing signatures, mutating the funded database, or releasing live financial execution remain distinct approval gates. For every stage report the commit, implemented behavior, tests, real-versus-mock evidence, blockers, required owner action, and preservation confirmation. Full success means verified production FLOW meeting the complete product's documented security and financial acceptance gates.
