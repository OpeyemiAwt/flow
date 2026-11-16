import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";
import {
  MAINNET_ECOSYSTEM_METADATA,
  MAINNET_SUPPORTED_DEPLOYMENTS,
} from "../../domain/supported-assets-catalog.ts";
import { DocsToc, type TocItem } from "./docs-toc.tsx";

export const metadata: Metadata = {
  title: "FLOW Documentation",
  description:
    "Learn how to use FLOW to manage wallets, receive, send, convert and request payments across supported networks.",
  alternates: {
    canonical: "https://flow.devhub.forum/docs",
  },
  openGraph: {
    title: "FLOW Documentation",
    description:
      "Practical instructions for using FLOW safely across NEAR, Solana, Ethereum, and Base.",
    url: "https://flow.devhub.forum/docs",
    type: "website",
  },
};

const TOC_ITEMS: readonly TocItem[] = [
  { id: "getting-started", label: "1. Getting started" },
  { id: "supported-networks", label: "2. Supported networks & assets" },
  { id: "dashboard", label: "3. Dashboard & activity" },
  { id: "receive", label: "4. Receive — direct deposits" },
  { id: "send", label: "5. Send & @flow IDs" },
  { id: "convert", label: "6. Convert" },
  { id: "add-money", label: "7. Add Money — native NEAR" },
  { id: "request-payment", label: "8. Request Payment / Links" },
  { id: "states-troubleshooting", label: "9. States & troubleshooting" },
  { id: "security-privacy", label: "10. Account security & privacy" },
  { id: "faq", label: "11. FAQ" },
];

const FAQ_ITEMS = [
  {
    q: "Do sender and recipient need the same network or asset?",
    a: "Not always. Direct Receive requires the exact matching asset and network. Payment Links and Add Money can bridge or swap from a different source asset/network only when a supported executable route is available.",
  },
  {
    q: "Does the payer need a FLOW account to use a payment link?",
    a: "No. Guest checkout allows a payer to open a payment link, select an eligible source asset/network, review the quote, and fund the provider-issued deposit address without signing in.",
  },
  {
    q: "Is Receive the same as Request Payment?",
    a: "No. Receive shows your permanent, account-linked wallet addresses for direct on-chain deposits. Request Payment creates a shareable payment link where a payer can request a live quote and pay cross-chain.",
  },
  {
    q: "Why do Ethereum and Base show the same address?",
    a: "Ethereum Mainnet and Base Mainnet both use the EVM 0x-prefixed address format derived for your account wallet, but they are separate blockchains with separate balances and gas.",
  },
  {
    q: "How long does a payment take?",
    a: "Timing depends on source-chain confirmations, cross-chain routing liquidity, and destination-chain finality. FLOW displays live transaction states rather than guaranteeing a fixed settlement time.",
  },
  {
    q: "Are all assets and routes available?",
    a: "No. Wallet holdings and direct operations are scoped to verified deployments on NEAR, Solana, Ethereum, and Base. Cross-chain routes depend on live NEAR Intents / 1Click liquidity and route availability.",
  },
] as const;

export default function DocsPage() {
  return (
    <PublicSiteChrome activeRoute="docs">
      <div className="mb-8 rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D51B24]">
          FLOW · User &amp; Operator Guide
        </p>
        <h1 className="mt-3 font-serif text-4xl tracking-tight text-[#0B0B0B] dark:text-white sm:text-5xl">
          FLOW Documentation
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-[#555] dark:text-neutral-300">
          Learn how to use FLOW to manage wallets, receive, send, convert and
          request payments across supported networks. Looking for architecture,
          design principles, and trust assumptions? Read the{" "}
          <Link
            href="/whitepaper"
            className="font-semibold text-[#D51B24] underline underline-offset-4 hover:opacity-80"
          >
            FLOW Whitepaper
          </Link>
          .
        </p>
      </div>

      <div className="lg:grid lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <DocsToc items={TOC_ITEMS} />

        <article className="space-y-8 rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs sm:p-10">
          {/* 2.1 Getting started */}
          <section
            id="getting-started"
            aria-labelledby="h-getting-started"
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id="h-getting-started"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              1. Getting started
            </h2>
            <p className="text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              FLOW is a multi-chain wallet and payment experience. Recipients
              can receive direct on-chain deposits or share payment links with a
              chosen settlement asset and network, while payers can fund from a
              different supported asset/network when an eligible route exists.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <li>
                <strong>Create an account:</strong> Sign in with Google or an
                8-digit email OTP verification code (subject to enrollment),
                complete Personal account onboarding, accept security/consent
                steps, provision your multi-chain wallet, and claim your
                permanent <code className="font-mono text-xs">@flow</code> ID.
              </li>
              <li>
                <strong>Returning users:</strong> Signing back in restores
                access to your existing account and permanent wallet addresses.
                Logging in never replaces your wallet with a fresh one.
              </li>
              <li>
                <strong>Provisioning states:</strong> Wallets move through{" "}
                <code className="font-mono text-xs">WAITING / QUEUED</code>,{" "}
                <code className="font-mono text-xs">PROVISIONING</code>{" "}
                (processing),{" "}
                <code className="font-mono text-xs">ACTIVE</code> (ready), or{" "}
                <code className="font-mono text-xs">
                  SETUP_FAILED / RECOVERY_PENDING
                </code>
                . Wallet readiness requires verified provider custody
                registration and security policy confirmation—a displayed address
                alone does not establish readiness.
              </li>
            </ul>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.2 Supported networks and assets */}
          <section
            id="supported-networks"
            aria-labelledby="h-supported-networks"
            className="scroll-mt-24 space-y-4"
          >
            <h2
              id="h-supported-networks"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              2. Supported networks and assets
            </h2>
            <p className="text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              Account wallets operate on four mainnet networks:{" "}
              <strong>NEAR Mainnet</strong>, <strong>Solana Mainnet</strong>,{" "}
              <strong>Ethereum Mainnet</strong>, and{" "}
              <strong>Base Mainnet</strong>. Wallet holdings cover five asset
              families (<strong>NEAR</strong>, <strong>SOL</strong>,{" "}
              <strong>ETH</strong>, <strong>USDC</strong>, and{" "}
              <strong>USDT</strong>) strictly on verified chain-specific
              deployments.
            </p>

            <div className="rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3] dark:bg-[#1A1A1C] p-4 text-sm text-[#3B3B3B] dark:text-neutral-300">
              <p className="font-semibold text-[#0B0B0B] dark:text-white">
                Network &amp; Address Distinction
              </p>
              <ul className="mt-2 space-y-1.5 text-xs leading-5">
                {MAINNET_ECOSYSTEM_METADATA.map((eco) => (
                  <li key={eco.family}>
                    <strong>{eco.label}:</strong> {eco.addressFormatHint}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[#666] dark:text-neutral-400">
                Ethereum Mainnet and Base Mainnet display the same{" "}
                <code className="font-mono">0x</code> EVM address for your
                account, but they are separate blockchains with separate assets
                and gas.
              </p>
            </div>

            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#0B0B0B] dark:text-white">
                Verified Mainnet Wallet Catalog (Live Registry)
              </h3>
              <p className="mt-1 text-xs text-[#666] dark:text-neutral-400">
                Rendered directly from FLOW&apos;s curated mainnet catalog.
                Guest-checkout source assets can span additional chains/tokens
                when supported by live NEAR Intents / 1Click discovery and an
                executable route—FLOW does not promise &ldquo;every
                token.&rdquo;
              </p>
              <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08]">
                <table className="w-full min-w-[600px] border-collapse text-left text-xs">
                  <thead className="bg-[#F8F6F3] dark:bg-[#1A1A1C] text-[#555] dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Asset</th>
                      <th className="px-4 py-3 font-semibold">Network</th>
                      <th className="px-4 py-3 font-semibold">Standard</th>
                      <th className="px-4 py-3 font-semibold">Decimals</th>
                      <th className="px-4 py-3 font-semibold">
                        Contract / Identifier
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EFECE6] dark:divide-white/[0.06] text-[#222] dark:text-neutral-200">
                    {MAINNET_SUPPORTED_DEPLOYMENTS.map((d) => (
                      <tr key={d.id}>
                        <td className="px-4 py-2.5 font-semibold">
                          {d.symbol}{" "}
                          <span className="font-normal text-[#666] dark:text-neutral-400">
                            ({d.name})
                          </span>
                        </td>
                        <td className="px-4 py-2.5">{d.networkName}</td>
                        <td className="px-4 py-2.5 font-mono">{d.standard}</td>
                        <td className="px-4 py-2.5 font-mono">{d.decimals}</td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-[#555] dark:text-neutral-400">
                          {d.contractIdentifier}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.3 Dashboard */}
          <section
            id="dashboard"
            aria-labelledby="h-dashboard"
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id="h-dashboard"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              3. Dashboard
            </h2>
            <p className="text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              The account dashboard displays verified token balances per network
              (with explicit network badges so Base USDC and Ethereum USDC are
              never confused), recent transactions, monthly inflow/outflow
              totals, and a dedicated Cashflow Insights view.
            </p>
            <p className="text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <strong>Confirmed vs. Pending:</strong> Portfolio balances reflect
              confirmed on-chain state synced by FLOW&apos;s chain indexers.
              Pending deposits, unexecuted quotes, or transfers still in
              processing appear in Activity and live payment timelines until
              finality is confirmed.
            </p>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.4 Receive */}
          <section
            id="receive"
            aria-labelledby="h-receive"
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id="h-receive"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              4. Receive — direct deposits
            </h2>
            <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <li>Choose the network and supported asset you want to receive.</li>
              <li>Copy or scan your permanent, account-linked wallet address.</li>
              <li>
                Send only the supported asset on that exact displayed network.
              </li>
              <li>
                Wait for network confirmation and check Activity and updated
                balances.
              </li>
            </ol>
            <div
              role="note"
              className="rounded-2xl border border-amber-300/80 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-950/30 p-4 text-xs leading-6 text-amber-950 dark:text-amber-200"
            >
              <strong>Warning:</strong> Sending an asset on the wrong network or
              sending an unsupported token to a Receive address can result in
              permanent loss or difficult recovery. Direct Receive is{" "}
              <strong>not</strong> a payment link—it does not generate a quote,
              swap route, or one-off deposit address.
            </div>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.5 Send */}
          <section
            id="send"
            aria-labelledby="h-send"
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id="h-send"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              5. Send &amp; @flow IDs
            </h2>
            <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <li>Choose a funded source asset and network.</li>
              <li>
                Enter and verify the recipient&apos;s wallet address—or enter
                their permanent <code className="font-mono text-xs">@flow</code>{" "}
                ID (e.g. <code className="font-mono text-xs">name@flow</code>)
                to resolve their active wallet address for the chosen
                destination asset and network.
              </li>
              <li>
                Enter the amount and review estimated gas/routing fees and your
                available balance.
              </li>
              <li>
                Approve the transfer using the app&apos;s required security and
                policy checks.
              </li>
              <li>Monitor broadcast and confirmation in Activity.</li>
            </ol>
            <p className="text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              Direct transfers require the source chain&apos;s native gas token
              where applicable (for example, ETH on Ethereum/Base, SOL on
              Solana, or NEAR on NEAR). All sends are subject to account policy,
              spending limits, and execution enablement on that chain; self-sends
              to your own address or <code className="font-mono text-xs">@flow</code>{" "}
              ID are blocked.
            </p>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.6 Convert */}
          <section
            id="convert"
            aria-labelledby="h-convert"
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id="h-convert"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              6. Convert
            </h2>
            <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <li>
                Select the source asset you hold and the target asset/network
                you want in your own wallet.
              </li>
              <li>Request an executable quote.</li>
              <li>
                Review estimated output, fees, quote expiration, slippage bounds,
                and funding requirements.
              </li>
              <li>Confirm and monitor settlement in the live timeline.</li>
            </ol>
            <p className="text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              A quote is an estimate with an expiration window, not a completed
              conversion. Route availability varies with provider liquidity and
              pair support.
            </p>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.7 Add Money */}
          <section
            id="add-money"
            aria-labelledby="h-add-money"
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id="h-add-money"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              7. Add Money — native NEAR
            </h2>
            <p className="text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              Add Money lets you fund your permanent NEAR Mainnet wallet with
              native NEAR starting from an eligible external asset and network,
              subject to an executable cross-chain route.
            </p>
            <p className="rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-4 py-3 font-mono text-xs text-[#222] dark:text-neutral-200">
              Source choice → Live quote → Refund address (if required) →
              Provider-issued deposit instructions → External funding → Routing →
              Settlement verification
            </p>
            <p className="text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <strong>Important distinction:</strong> Add Money issues a{" "}
              <em>quote-specific, one-off provider deposit address</em> for that
              cross-chain swap. Do not confuse it with your permanent Receive
              address.
            </p>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.8 Request Payment / Payment Links */}
          <section
            id="request-payment"
            aria-labelledby="h-request-payment"
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id="h-request-payment"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              8. Request Payment / Payment Links
            </h2>
            <ol className="list-decimal space-y-2 pl-5 text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <li>
                Recipient chooses the desired settlement network, asset,
                optional fixed or open amount, and description.
              </li>
              <li>Recipient creates and shares the payment link.</li>
              <li>
                Guest payer opens the link without needing a FLOW account.
              </li>
              <li>
                Payer independently selects an eligible source network and
                asset.
              </li>
              <li>
                Payer reviews the live quote (and refund details if applicable)
                and sends funds to the provider-issued deposit instructions.
              </li>
              <li>
                Both sides track live status until confirmed settlement or an
                appropriate expiry, failure, or refund outcome.
              </li>
            </ol>
            <div className="rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3] dark:bg-[#1A1A1C] p-4 text-xs leading-6 text-[#3B3B3B] dark:text-neutral-300">
              <strong>Illustrative Example:</strong> A payer holds{" "}
              <strong>SOL on Solana</strong> while the recipient requests{" "}
              <strong>USDC on Base</strong>. When NEAR Intents / 1Click returns
              an active executable route, the payer funds the quoted Solana
              deposit address and FLOW tracks settlement of USDC on Base into
              the recipient&apos;s wallet.
            </div>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.9 Transaction states and troubleshooting */}
          <section
            id="states-troubleshooting"
            aria-labelledby="h-states"
            className="scroll-mt-24 space-y-4"
          >
            <h2
              id="h-states"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              9. Transaction states and troubleshooting
            </h2>
            <div className="overflow-x-auto rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08]">
              <table className="w-full min-w-[540px] border-collapse text-left text-xs">
                <thead className="bg-[#F8F6F3] dark:bg-[#1A1A1C] text-[#555] dark:text-neutral-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">State</th>
                    <th className="px-4 py-3 font-semibold">Meaning</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6] dark:divide-white/[0.06] text-[#3B3B3B] dark:text-neutral-300">
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      QUOTE_OBSERVED / AWAITING_DEPOSIT / DEPOSIT_COMMITTED
                    </td>
                    <td className="px-4 py-2.5">
                      Awaiting payer funding at the quote-specific deposit
                      address before the quote deadline.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      DETECTED / DEPOSIT_CONFIRMED
                    </td>
                    <td className="px-4 py-2.5">
                      Source deposit observed on-chain; waiting for required
                      confirmations before execution.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      PROCESSING / SUBMITTED / SETTLING
                    </td>
                    <td className="px-4 py-2.5">
                      Cross-chain routing or destination broadcast is underway.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      SETTLED
                    </td>
                    <td className="px-4 py-2.5">
                      Destination transaction confirmed and reconciled in your
                      wallet and Activity.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      EXPIRED / FAILED
                    </td>
                    <td className="px-4 py-2.5">
                      Quote window elapsed before funding or execution could not
                      complete.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      REFUNDED / EXCEPTION_REFUND_REQUIRED
                    </td>
                    <td className="px-4 py-2.5">
                      Route did not settle; funds are returned to the configured
                      refund address or flagged for refund handling.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-mono font-semibold">
                      UNKNOWN_AMBIGUOUS / RECONCILIATION_REQUIRED
                    </td>
                    <td className="px-4 py-2.5">
                      Provider response was ambiguous; automatic retries are
                      paused while final on-chain status is verified.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <li>
                <strong>Payment not detected yet:</strong> Verify the exact
                network, token contract, deposit address, and that the source
                transaction has sufficient confirmations.
              </li>
              <li>
                <strong>Quote expired or rate changed:</strong> Request a fresh
                quote before sending funds; do not send to an expired deposit
                address.
              </li>
              <li>
                <strong>Insufficient gas or balance:</strong> Ensure you hold
                enough of the source chain&apos;s native gas token in addition
                to the transfer amount.
              </li>
              <li>
                <strong>Wallet provisioning pending or failed:</strong> Use the
                built-in onboarding recovery flow rather than attempting to
                recreate wallets manually.
              </li>
              <li>
                <strong>Wrong-network deposit:</strong> Recovery is not
                guaranteed and depends on the receiving infrastructure and asset
                mechanics.
              </li>
              <li>
                <strong>Finding hashes and references:</strong> Open{" "}
                <strong>Activity</strong> in your wallet to view the transaction
                hash, explorer link, and payment/transfer public ID.
              </li>
            </ul>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.10 Security and privacy */}
          <section
            id="security-privacy"
            aria-labelledby="h-security"
            className="scroll-mt-24 space-y-3"
          >
            <h2
              id="h-security"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              10. Account security and privacy
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#3B3B3B] dark:text-neutral-300">
              <li>
                Sign in only through the official{" "}
                <code className="font-mono text-xs">flow.devhub.forum</code>{" "}
                origin using Google or email OTP; enroll or link email
                explicitly in Settings when required.
              </li>
              <li>
                Never share OTP codes, session links, private keys, or seed
                phrases with anyone.
              </li>
              <li>
                Review active sessions in Settings and revoke unrecognized
                devices immediately.
              </li>
              <li>
                On-chain transaction confirmations can be irreversible—always
                double-check destination network, asset, and recipient before
                confirming.
              </li>
              <li>
                <strong>Custody model:</strong> FLOW provisions and operates
                wallets via provider-backed custody infrastructure (OutLayer)
                with encrypted custody credentials and policy enforcement; it
                should not be treated as purely local browser key custody.
              </li>
            </ul>
            <p className="text-sm text-[#555] dark:text-neutral-400">
              Review our{" "}
              <Link
                href="/privacy"
                className="font-semibold text-[#0B0B0B] dark:text-white underline underline-offset-4"
              >
                Privacy Policy
              </Link>{" "}
              and{" "}
              <Link
                href="/terms"
                className="font-semibold text-[#0B0B0B] dark:text-white underline underline-offset-4"
              >
                Terms of Service
              </Link>
              .
            </p>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 2.11 Compact FAQ */}
          <section
            id="faq"
            aria-labelledby="h-faq"
            className="scroll-mt-24 space-y-4"
          >
            <h2
              id="h-faq"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              11. Frequently asked questions
            </h2>
            <dl className="space-y-4">
              {FAQ_ITEMS.map((item) => (
                <div
                  key={item.q}
                  className="rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3]/60 dark:bg-[#1A1A1C] p-4"
                >
                  <dt className="text-sm font-bold text-[#0B0B0B] dark:text-white">
                    {item.q}
                  </dt>
                  <dd className="mt-1.5 text-sm leading-6 text-[#444] dark:text-neutral-300">
                    {item.a}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </article>
      </div>
    </PublicSiteChrome>
  );
}
