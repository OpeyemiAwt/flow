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
| **NEAR Mainnet** | [`contract.burrow.near`](https://nearblocks.io/address/contract.burrow.near) | FLOW Earn — NEAR DeFi money-market yield (`9.20% variable APY`) |
| **Multi-Chain** | NEAR Intents (1Click API) | Cross-chain swaps, deposits, and payment link settlement acrossNEAR, Solana, Base & Ethereum |

---

## Key Features

- **FLOW Earn on NEAR (`LiNEAR` & `Burrow Finance`):**
  - **Native Liquid Staking:** Stake NEAR into **LiNEAR Protocol** (`6.26% variable APY`) with auto-compounding validator rewards.
  - **DeFi Money Market Yield:** Supply assets to **Burrow Finance** (`9.20% variable APY` including NEAR rewards).
  - **1-Step Swap & Earn via NEAR Intents:** Convert idle `SOL`, `USDC`, or `ETH` from other chains directly into native `NEAR` and start earning in a single workflow.
  - **Live Yield & Flexible Withdrawals:** Preview projected annual returns before depositing, track real-time yield accrual, and withdraw anytime via **Instant Unstake** or **Standard (~48h)**.
- **Cross-Chain Payment Links (`/pay/[id]`):** Request payment in the exact token and network you want; your payer settles from any of 230+ supported tokens across 39+ chains without needing a FLOW account.
- **One Wallet, Four Mainnets:** A single login provisions permanent addresses across **NEAR**, **Solana**, **Base**, and **Ethereum** secured by NEAR OutLayer MPC custody.
- **Live Convert & Cross-Chain Send:** Swap between assets or send across chains with instant NEAR Intents quotes and built-in gas/balance safety checks.
- **Account-Aware FLOW AI Assistant:** Built-in wallet assistant that understands your portfolio, recent transactions, and cross-chain routes.

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
  E -->|"9.20% APY"| B["Burrow Finance (contract.burrow.near)"]
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

---

## Contact and Links

- **Live App:** [https://flow.devhub.forum](https://flow.devhub.forum)
- **X (Twitter):** [https://x.com/use_flowapp](https://x.com/use_flowapp)
- **GitHub:** [https://github.com/OpeyemiMoses/Flow](https://github.com/OpeyemiMoses/Flow)
