<p align="center">
  <img src="public/assets/flow-logo.png" alt="FLOW Logo" width="180" />
</p>

# FLOW

**Pay with what you hold. Receive what you want. Earn native yield on NEAR.**

FLOW is a chain-abstracted multi-chain wallet, payments, and DeFi yield platform built on **NEAR OutLayer**, **NEAR Intents (1Click)**, and **NEAR DeFi**. Users sign in with Google or an email code, get a unified wallet across **NEAR**, **Solana**, **Base**, and **Ethereum**, and can send, convert, get paid across 39+ chains, and **earn up to 9.2% APY on NEAR**—all from one interface.

- **Live Application:** [https://flow.devhub.forum](https://flow.devhub.forum)
- **Repository:** [https://github.com/OpeyemiMoses/Flow](https://github.com/OpeyemiMoses/Flow)
- **X (Twitter):** [@use_flowapp](https://x.com/use_flowapp)

---

## Judges Guide

### Project Summary

- **What FLOW does:** Gives every user a single multi-chain wallet (`NEAR`, `Solana`, `Base`, `Ethereum`) where senders pay with whatever asset and chain they hold, recipients receive the exact asset and chain they want, and idle balances earn real yield on NEAR Protocol.
- **Problem it solves:** Crypto payments and DeFi yield are fragmented across incompatible wallets, gas tokens, and bridges. Getting paid in NEAR when your client holds SOL on Solana—or moving idle USDC/SOL into NEAR staking and lending—takes multiple apps and manual bridging.
- **How NEAR powers FLOW:**
  1. **NEAR OutLayer (`outlayer.near`):** Policy-governed MPC wallet custody and transaction signing across NEAR, Solana, Ethereum, and Base without seed phrases.
  2. **NEAR Intents (1Click):** Instant cross-chain quoting, swaps, and payment link settlement across 230+ tokens and 39+ blockchains.
  3. **FLOW Earn on NEAR (`LiNEAR` & `Burrow`):** Direct in-wallet liquid staking (`6.26% APY`) and DeFi supply yield (`9.20% APY`) on NEAR Protocol, with 1-step **Swap & Earn** from any chain.

### How to Evaluate (Live on Mainnet)

1. **Sign In & Auto-Provisioning:** Open [https://flow.devhub.forum/sign-in](https://flow.devhub.forum/sign-in) and continue with **Google** or an **email code**. FLOW automatically provisions your multi-chain wallet across NEAR, Solana, Base, and Ethereum.
2. **FLOW Earn on NEAR (`Earn` Tab):** Click **Earn** in the navigation bar:
   - Stake native NEAR with **LiNEAR Protocol** (`6.26% variable APY`) or supply to **Burrow Finance** (`9.20% variable APY`).
   - Hold `USDC` or `SOL` on another chain? Click **Swap now →** to convert any asset into native `NEAR` in one step via NEAR Intents and deploy directly into Earn.
3. **Cross-Chain Payment Links (`Request` Tab → `/pay/[id]`):** Create a shareable payment link requesting your preferred token (e.g., `NEAR` on NEAR Protocol). Any sender can open the link in their browser—no FLOW account required—and pay with what they hold (e.g., `SOL` on Solana or `USDC` on Base).
4. **Send, Convert & Add Money:** Swap between assets with live quotes as you type, or receive funds directly to your permanent multi-chain addresses.
5. **FLOW AI Assistant:** Open the AI assistant in the top bar to ask questions about your balances, recent settlements, or yield routes.

### Onchain Verification

| Network | Protocol / Contract | Role in FLOW |
| :--- | :--- | :--- |
| **NEAR Mainnet** | [`outlayer.near`](https://nearblocks.io/address/outlayer.near) | OutLayer MPC wallet custody & on-chain policy sponsorship |
| **NEAR Mainnet** | [`linear-protocol.near`](https://nearblocks.io/address/linear-protocol.near) | FLOW Earn — Native NEAR liquid staking (`6.26% variable APY`) |
| **NEAR Mainnet** | [`contract.main.burrow.near`](https://nearblocks.io/address/contract.main.burrow.near) | FLOW Earn — NEAR DeFi money-market yield (`9.20% variable APY`) |
| **Multi-Chain** | NEAR Intents (1Click API) | Cross-chain swaps, deposits, and payment link settlement across NEAR, Solana, Base & Ethereum |

---

## Architecture & Production Infrastructure

FLOW runs a real, mainnet-connected multi-service architecture backed by PostgreSQL, Prisma, and live blockchain RPCs—not simulated balances or mock callbacks:

- **NEAR OutLayer Custody & Policy Engine:** Multi-chain MPC wallet provisioning (`NEAR`, `Solana`, `Base`, `Ethereum`), encrypted and signed custody policies (`/wallet/v1/policy`, `/wallet/v1/encrypt-policy`, `/wallet/v1/sign-policy`), and sponsored NEAR account/policy setup (`near-policy-sponsor.ts`).
- **NEAR Intents (1Click SDK):** Uses `@defuse-protocol/one-click-sdk-typescript` for real-time token discovery across 39+ chains, live route quoting, cross-chain deposit address generation, and settlement status tracking.
- **Native NEAR DeFi Execution:** Direct NEAR Mainnet RPC state queries and contract execution against **LiNEAR** (`linear-protocol.near`) and **Burrow** (`contract.main.burrow.near`), including storage deposit checks, gas reserve enforcement, and instant or delayed unstaking.
- **Four Dedicated Background Workers:**
  - `worker:custody` — Asynchronous OutLayer wallet provisioning, policy signing, and custody state machine recovery.
  - `worker:payments` — Outgoing transfer, swap, and Earn execution with idempotency keys.
  - `worker:monitoring` — Cross-chain 1Click settlement observation and payment link monitoring.
  - `worker:indexer` — Multi-chain RPC balance reconciliation and activity indexing.
- **On-Chain Verification & Security:** Server-side transaction verification across NEAR, EVM, and Solana RPCs (`on-chain-verifier.ts`), strict Zod request validation, Prisma schema migrations with least-privilege DB role discipline, and crash-recovery state machines.

---

## Key Features

- **FLOW Earn on NEAR (`LiNEAR` & `Burrow Finance`):**
  - **Native Liquid Staking:** Stake NEAR into **LiNEAR Protocol** (`6.26% variable APY`) with auto-compounding validator rewards.
  - **DeFi Money Market Yield:** Supply USDC on NEAR Mainnet to **Burrow Finance** (`9.20% variable APY` including NEAR rewards).
  - **1-Step Swap & Earn via NEAR Intents:** Convert idle `SOL`, `USDC`, or `ETH` from other chains directly into native `NEAR` and start earning in a single workflow.
  - **Live Yield & Flexible Withdrawals:** Preview projected annual returns before depositing, track live on-chain positions, and withdraw anytime via **Instant Unstake** or **Standard (~48h)**.
- **Cross-Chain Payment Links (`/pay/[id]`):** Request payment in the exact token and network you want; your payer settles from any of 230+ supported tokens across 39+ chains without needing a FLOW account, complete with a live settlement tracker.
- **One Wallet, Four Mainnets:** A single Google or passwordless email login provisions permanent addresses across **NEAR**, **Solana**, **Base**, and **Ethereum** secured by NEAR OutLayer MPC custody.
- **Personal & Business Workspaces + Flow ID:** Switch between personal and business accounts, claim a `@handle` Flow ID for instant P2P transfers, and manage workspace preferences.
- **Live Convert, Send & Cross-Chain Add Money:** Swap between assets or send across chains with instant NEAR Intents quotes, live step-by-step transaction trackers that persist across page reloads, and built-in gas/balance safety checks.
- **Cashflow Insights, Notifications & Docs:** Real DB-backed monthly inflow/outflow insights, real-time activity notifications, and built-in Docs, FAQ, and Whitepaper pages.
- **Account-Aware FLOW AI Assistant:** Built-in assistant that reads your live portfolio, recent settlements, and real-time 1Click quotes to explain routes, draft payment links, and preview swaps or sends.

---

## How It Works

```mermaid
flowchart LR
  U["User / Payer"] -->|"Sign in with Google or Email"| W["FLOW Multi-Chain Wallet (NEAR, SOL, Base, ETH)"]
  W -->|"MPC Custody & Signing"| OL["NEAR OutLayer (outlayer.near)"]
  W -->|"Swap, Send & Pay Links"| OC["NEAR Intents (1Click)"]
  OC -->|"1-Step Swap & Earn"| E["FLOW Earn on NEAR"]
  W -->|"Direct Deposit"| E
  E -->|"6.26% APY"| L["LiNEAR Protocol (linear-protocol.near)"]
  E -->|"9.20% APY"| B["Burrow Finance (contract.main.burrow.near)"]
```

1. **Instant Wallet Setup:** Sign in with Google or an email code. FLOW provisions your multi-chain wallet via **NEAR OutLayer** and sponsors your on-chain wallet security policy on NEAR Mainnet.
2. **Pay or Get Paid Across Chains:** Create a payment link or initiate a swap/transfer. **NEAR Intents (1Click)** quotes the route in real time and settles the destination asset directly into the recipient's wallet.
3. **Swap & Earn on NEAR:** Convert idle assets from Solana, Base, or Ethereum into native NEAR via NEAR Intents and deploy into **LiNEAR Protocol** or **Burrow Finance** to earn passive yield.

---

## Screenshots and Product Walkthrough

<p align="center">
  <img src="public/assets/hero-phones.png" alt="FLOW Multi-Chain Wallet Overview" width="720" />
  <br />
  <em>FLOW multi-chain wallet interface across mobile and desktop</em>
</p>

<p align="center">
  <img src="public/assets/auth-mockup.png" alt="FLOW Authentication" width="720" />
  <br />
  <em>One-click Google sign-in and passwordless email onboarding</em>
</p>

<p align="center">
  <img src="public/assets/qr-standee.png" alt="FLOW Payment Link Checkout" width="540" />
  <br />
  <em>Shareable payment links with cross-chain settlement</em>
</p>

---

## Running Locally

```bash
git clone https://github.com/OpeyemiMoses/Flow.git
cd Flow
npm ci
(umask 077; cp -n .env.example .env)
npm run dev
```

### Testing & Verification

The `test/` directory includes 35+ automated test suites covering custody crash recovery, provisioning state machines, on-chain verification, financial authorization, 1Click quoting, and security integration:

```bash
npm test            # Unit test suite
npm run test:db     # Database integration tests
npm run test:security
```

---

## Contact and Links

- **Live App:** [https://flow.devhub.forum](https://flow.devhub.forum)
- **X (Twitter):** [https://x.com/use_flowapp](https://x.com/use_flowapp)
- **GitHub:** [https://github.com/OpeyemiMoses/Flow](https://github.com/OpeyemiMoses/Flow)
