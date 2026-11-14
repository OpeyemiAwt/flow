# FLOW hackathon handoff (working draft)

## Product

FLOW is a multi-chain payments application built around a Personal account, wallet onboarding, payment links, cross-chain routing, verified settlement, and a transaction history. The approved interface uses a light neutral canvas, black primary actions, serif page titles, rounded cards, and restrained red/green status accents. Preserve the approved UI baseline `86388d68292372222d7db8329b67fab6730ab77`.

## Project links

- Repository: <https://github.com/OpeyemiAwt/flow>
- Production URL: <https://flow.devhub.forum>
- Staging URL: <https://flow-web-staging.up.railway.app>

These are project configuration references, not claims that the current deployed builds passed acceptance. The production app and its public routes must be rechecked before submission.

## Architecture at a glance

- Next.js web application with server-side authentication and account-scoped API routes.
- PostgreSQL with forward-only Prisma migrations and separated web, auth-ticket, payment, custody, and indexer privileges.
- Separate payment, custody, and indexer processes; workers support heartbeat-only modes while execution gates remain disabled.
- Google OAuth and Resend email integration are configured by the owner in Railway. Secret values are never included in this handoff.
- NEAR Intents/1Click and OutLayer are provider integrations. A provider response alone is not proof of payment; finality requires chain verification and reconciled ledger state.

## Demo walkthrough checklist

1. Start at the FLOW landing/sign-in page and show the approved visual direction.
2. Demonstrate the real authentication flow only after staging inbox/browser verification.
3. Show onboarding state without implying a wallet exists until provider-derived addresses are verified.
4. Show actual holdings and permanent Direct Receive address only when backed by current wallet/provider data.
5. Demonstrate payment-link creation, guest source selection and quote preview using an isolated test link and genuine quote data.
6. Show Add Money/Send/Convert execution as disabled unless each operation has passed its authorization and real settlement gates.
7. Open Activity and show only persisted, verified events.
8. Visit `/privacy`, `/terms`, `/api/health/live`, and `/api/health/ready` on the deployment being presented.

## Evidence to attach before submission

- Fresh desktop and mobile screenshots captured from the verified deployment.
- Exact deployed commit SHA and production health route results.
- Current isolated security/database test commands, versions, and summaries.
- One real Google login result and one owner-authorized OTP delivery result, if completed.
- Provider quote IDs and chain transaction/explorer references only for separately authorized real operations.
- A clear feature ledger distinguishing implemented code, deployed code, test fixtures, dry quotes, and real-provider/on-chain evidence.

## Safety and truthful status

Financial execution, wallet registration, and the historical funded-account migration remain separately gated. Do not describe preview-only Send/Convert or mocked provider tests as completed live functionality. Preserve the original funded wallet, provider container, encryption keys, ledger, and transaction history.
