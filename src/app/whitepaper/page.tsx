import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";

export const metadata: Metadata = {
  title: "FLOW Whitepaper",
  description:
    "Product & Technical Whitepaper (Version 1.0): A simpler payment experience across blockchain networks.",
  alternates: {
    canonical: "https://flow.devhub.forum/whitepaper",
  },
  openGraph: {
    title: "FLOW Whitepaper — Version 1.0",
    description:
      "A simpler payment experience across blockchain networks. Product design, cross-chain architecture, security boundaries, and trust assumptions.",
    url: "https://flow.devhub.forum/whitepaper",
    type: "article",
  },
};

const SECTIONS = [
  { id: "abstract", label: "1. Abstract" },
  { id: "problem", label: "2. The problem" },
  { id: "design-principle", label: "3. Design principle" },
  { id: "capabilities", label: "4. Core capabilities" },
  { id: "architecture", label: "5. Architecture" },
  { id: "payment-paths", label: "6. Two payment paths" },
  { id: "wallet-security", label: "7. Wallet security & sponsorship" },
  { id: "risks", label: "8. Risks & trust assumptions" },
  { id: "conclusion", label: "9. Conclusion" },
  { id: "references", label: "10. References & version" },
] as const;

export default function WhitepaperPage() {
  return (
    <PublicSiteChrome activeRoute="whitepaper">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Document Header */}
        <header className="rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D51B24]">
              Product &amp; Technical Whitepaper
            </p>
            <span className="rounded-full border border-[#E6E2DA] dark:border-white/[0.12] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 font-mono text-[11px] font-semibold text-[#444] dark:text-neutral-300">
              Version 1.0 · Published November 16, 2026
            </span>
          </div>
          <h1 className="mt-4 font-serif text-4xl tracking-tight text-[#0B0B0B] dark:text-white sm:text-5xl">
            FLOW Whitepaper
          </h1>
          <p className="mt-3 text-lg text-[#555] dark:text-neutral-300">
            A simpler payment experience across blockchain networks.
          </p>

          {/* Compact Jump Links */}
          <nav
            aria-label="Whitepaper sections"
            className="mt-6 flex flex-wrap gap-2 border-t border-[#EFECE6] dark:border-white/[0.08] pt-5"
          >
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-full border border-[#E6E2DA] dark:border-white/[0.1] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 text-xs font-medium text-[#3B3B3B] dark:text-neutral-300 hover:border-[#0B0B0B] dark:hover:border-white hover:text-[#0B0B0B] dark:hover:text-white focus-visible:outline-2 focus-visible:outline-[#FF1A1A]"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </header>

        {/* Whitepaper Body */}
        <article className="space-y-9 rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs sm:p-12">
          {/* 3.1 Abstract */}
          <section
            id="abstract"
            aria-labelledby="wp-abstract"
            className="scroll-mt-24 max-w-[68ch] space-y-3"
          >
            <h2
              id="wp-abstract"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              1. Abstract
            </h2>
            <p className="text-[15.5px] leading-7 text-[#333] dark:text-neutral-300">
              FLOW is a multi-chain wallet and payment platform designed around
              account-linked permanent addresses and cross-chain payment
              routing. Rather than forcing a payer and recipient to coordinate
              around the same blockchain, token, and bridge, FLOW separates what
              the recipient settles in from what the payer already holds. Inside a
              single interface, FLOW brings together onboarding, permanent
              receiving addresses across NEAR, Solana, Ethereum, and Base,
              direct sends (including human-readable{" "}
              <code className="font-mono text-xs">@flow</code> IDs), conversions,
              shareable payment links with unauthenticated guest checkout, and
              verifiable activity and cashflow visibility. Cross-chain
              settlement and transfers depend on valid executable routes,
              account policy authorization, and underlying on-chain and provider
              finality rather than off-chain promises.
            </p>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.2 The Problem */}
          <section
            id="problem"
            aria-labelledby="wp-problem"
            className="scroll-mt-24 max-w-[68ch] space-y-3"
          >
            <h2
              id="wp-problem"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              2. The problem
            </h2>
            <p className="text-[15.5px] leading-7 text-[#333] dark:text-neutral-300">
              Multi-chain cryptocurrency payments break down at the point of
              coordination. Wallets, token standards, and networks do not share
              one universal payment flow:
            </p>
            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#333] dark:text-neutral-300">
              <li>
                A recipient may require a specific stablecoin on a specific
                chain (such as USDC on Base), while a payer holds an unrelated
                asset on another network (such as SOL on Solana).
              </li>
              <li>
                Asking payers to manually bridge, swap, acquire destination gas,
                and copy multi-step deposit instructions introduces high error
                rates and wrong-network losses.
              </li>
              <li>
                Individuals and businesses need simple shareable payment
                requests and clear settlement visibility—knowing what was
                quoted, what is confirming, and what actually settled on-chain.
              </li>
            </ul>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.3 Design Principle */}
          <section
            id="design-principle"
            aria-labelledby="wp-design"
            className="scroll-mt-24 max-w-[68ch] space-y-4"
          >
            <h2
              id="wp-design"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              3. FLOW&apos;s design principle
            </h2>
            <blockquote className="rounded-2xl border-l-4 border-[#FF1A1A] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-5 py-4 font-serif text-xl leading-snug text-[#0B0B0B] dark:text-white">
              &ldquo;The recipient chooses what arrives. The payer chooses from
              what they already hold. FLOW coordinates an eligible route.&rdquo;
            </blockquote>
            <p className="text-[15.5px] leading-7 text-[#333] dark:text-neutral-300">
              The phrase <em>eligible route</em> is central to the design.
              Coordinating cross-chain execution does not eliminate liquidity
              constraints, routing fees, slippage, network confirmation times,
              or smart-contract and provider risk. When no live route exists for
              a requested source and destination pair, FLOW surfaces that
              constraint explicitly rather than hiding it.
            </p>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.4 Core Product Capabilities */}
          <section
            id="capabilities"
            aria-labelledby="wp-capabilities"
            className="scroll-mt-24 max-w-[68ch] space-y-3"
          >
            <h2
              id="wp-capabilities"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              4. Core product capabilities
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#333] dark:text-neutral-300">
              <li>
                <strong>Account access &amp; onboarding:</strong> Google and
                email OTP authentication paired with structured onboarding,
                policy acceptance, wallet provisioning, and permanent{" "}
                <code className="font-mono text-xs">@flow</code> handle
                claiming.
              </li>
              <li>
                <strong>Account-linked multi-chain wallets:</strong> Permanent
                wallet addresses across NEAR Mainnet, Solana Mainnet, Ethereum
                Mainnet, and Base Mainnet.
              </li>
              <li>
                <strong>Network-aware asset catalog:</strong> Verified mainnet
                deployments across NEAR, SOL, ETH, USDC, and USDT where
                supported.
              </li>
              <li>
                <strong>Direct Receive &amp; Send:</strong> Direct on-chain
                deposits to permanent addresses, plus outgoing transfers to raw
                addresses or active <code className="font-mono text-xs">@flow</code>{" "}
                IDs resolved to the recipient&apos;s chosen destination network.
              </li>
              <li>
                <strong>Convert &amp; Add Money:</strong> Cross-asset
                conversions within the account and native NEAR funding from
                eligible external assets via live quotes.
              </li>
              <li>
                <strong>Payment Links &amp; guest checkout:</strong> Shareable
                payment requests where unauthenticated payers select an eligible
                source asset/network and track live settlement.
              </li>
              <li>
                <strong>Visibility, Insights &amp; Flow AI:</strong> Real-time
                balances, reconciled Activity, personal Cashflow Insights,
                9-language localization, security/session management, and Flow
                AI as a contextual assistant that prepares previews and requires
                explicit user confirmation rather than moving funds
                autonomously.
              </li>
            </ul>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.5 Architecture & Responsibility Boundaries */}
          <section
            id="architecture"
            aria-labelledby="wp-arch"
            className="scroll-mt-24 space-y-5"
          >
            <div className="max-w-[68ch] space-y-3">
              <h2
                id="wp-arch"
                className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
              >
                5. Architecture and responsibility boundaries
              </h2>
              <p className="text-[15.5px] leading-7 text-[#333] dark:text-neutral-300">
                FLOW isolates user-facing web logic from database state,
                custody signing credentials, quote routing, and chain indexing:
              </p>
            </div>

            {/* Restrained Architecture Diagram */}
            <div className="rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3] dark:bg-[#1A1A1C] p-5 sm:p-6">
              <p className="mb-4 font-mono text-[11px] font-semibold uppercase tracking-wider text-[#666] dark:text-neutral-400">
                Service &amp; Trust Boundary Overview
              </p>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-[#E6E2DA] dark:border-white/[0.1] bg-white dark:bg-[#141414] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#D51B24]">
                    1. Web &amp; Auth
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0B0B0B] dark:text-white">
                    Next.js / TypeScript
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[#555] dark:text-neutral-400">
                    Serves UI, sessions, and APIs under least-privilege DB
                    access. Holds no custody signing keys.
                  </p>
                </div>

                <div className="rounded-xl border border-[#E6E2DA] dark:border-white/[0.1] bg-white dark:bg-[#141414] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#D51B24]">
                    2. State &amp; Ledger
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0B0B0B] dark:text-white">
                    PostgreSQL / Prisma
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[#555] dark:text-neutral-400">
                    Stores account-scoped RLS state, payment requests, quotes,
                    double-entry ledger records, and job leases.
                  </p>
                </div>

                <div className="rounded-xl border border-[#E6E2DA] dark:border-white/[0.1] bg-white dark:bg-[#141414] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#D51B24]">
                    3. Isolated Workers
                  </p>
                  <p className="mt-1 text-sm font-bold text-[#0B0B0B] dark:text-white">
                    Custody · Payments · Indexer
                  </p>
                  <p className="mt-1.5 text-xs leading-5 text-[#555] dark:text-neutral-400">
                    Separate workers interface with OutLayer custody, NEAR
                    Intents / 1Click routing, and chain RPCs.
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-[#D8D3C8] dark:border-white/[0.12] px-4 py-2.5 text-xs text-[#555] dark:text-neutral-400">
                <span>
                  External Infrastructure: <strong>OutLayer</strong> (custody &amp;
                  signing) · <strong>NEAR</strong> (policy &amp; settlement) ·{" "}
                  <strong>NEAR Intents / 1Click</strong> (quotes &amp; routing) ·{" "}
                  <strong>Chain RPCs</strong>
                </span>
                <span className="font-mono text-[11px]">Hosted on Railway</span>
              </div>
            </div>

            <ul className="max-w-[68ch] list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#333] dark:text-neutral-300">
              <li>
                <strong>Next.js / TypeScript:</strong> Application shell,
                authenticated dashboard, public checkout, and API validation.
              </li>
              <li>
                <strong>PostgreSQL / Prisma:</strong> Canonical account state,
                payment attempt lifecycle, ledger journals, and RLS boundaries.
              </li>
              <li>
                <strong>OutLayer:</strong> Wallet provisioning and
                provider-backed chain-specific custody and signing interfaces.
              </li>
              <li>
                <strong>NEAR &amp; NEAR Intents / 1Click:</strong> On-chain
                custody-policy storage and native NEAR settlement contexts, plus
                executable cross-chain quote discovery and routing.
              </li>
              <li>
                <strong>Restricted workers on Railway:</strong> Custody,
                payment monitoring, and chain indexing run in isolated worker
                processes so the web application never holds raw custody signing
                secrets.
              </li>
            </ul>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.6 Two Payment Paths */}
          <section
            id="payment-paths"
            aria-labelledby="wp-paths"
            className="scroll-mt-24 max-w-[68ch] space-y-4"
          >
            <h2
              id="wp-paths"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              6. Two payment paths — kept distinct
            </h2>
            <div className="space-y-3 text-[15px] leading-7 text-[#333] dark:text-neutral-300">
              <p>
                <strong>Direct Receive:</strong> The user selects a supported
                network and asset, shares their permanent wallet address, and
                receives a native on-chain transfer. The chain indexer observes
                finality and reconciles balances and Activity.
              </p>
              <p>
                <strong>Payment Link (Cross-Chain Guest Checkout):</strong> The
                recipient defines the desired settlement asset and network. A
                guest payer selects a supported source asset and network; the
                routing provider returns an executable quote and quote-specific
                deposit instructions. Once source funding is detected, routing
                and settlement execute and FLOW records the verified outcome.
              </p>
            </div>
            <div className="rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3] dark:bg-[#1A1A1C] p-4 text-xs leading-6 text-[#3B3B3B] dark:text-neutral-300">
              <strong>Illustrative Example (Independent Choices):</strong> A
              freelancer creates a payment link requesting{" "}
              <strong>USDC on Base</strong>. A client paying via guest checkout
              chooses <strong>SOL on Solana</strong>, reviews the live 1Click
              quote, and funds the quoted Solana deposit address. Upon
              confirmation and route completion, Base USDC arrives in the
              freelancer&apos;s Base wallet address.
            </div>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.7 Wallet Security and Sponsorship */}
          <section
            id="wallet-security"
            aria-labelledby="wp-security"
            className="scroll-mt-24 max-w-[68ch] space-y-3"
          >
            <h2
              id="wp-security"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              7. Wallet security and sponsorship
            </h2>
            <p className="text-[15.5px] leading-7 text-[#333] dark:text-neutral-300">
              Wallet provisioning requires durable provider registration,
              encrypted custody credentials, and verified custody policy
              evidence before an account wallet is marked{" "}
              <code className="font-mono text-xs">ACTIVE</code>; address
              derivation alone does not grant readiness.
            </p>
            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#333] dark:text-neutral-300">
              <li>
                <strong>Operational safeguards:</strong> Database role
                isolation, account-scoped RLS, idempotent transfer and
                provisioning jobs, lease fencing, and automatic quarantine (
                <code className="font-mono text-xs">UNKNOWN_AMBIGUOUS</code>)
                when an upstream provider response is indeterminate.
              </li>
              <li>
                <strong>Automated NEAR policy sponsorship design:</strong> To
                allow new wallets to register on-chain custody policies without
                pre-funding NEAR gas, FLOW implements a dedicated sponsor design
                that funds eligible policy-storage deposits under per-wallet
                limits, daily caps, balance checks, and circuit-breaker
                controls.
              </li>
              <li>
                <strong>Trust boundaries:</strong> Sponsor gas funding is
                architecturally separated from ownership of user wallet funds.
                Nevertheless, custody credentials, sponsor-controller keys, and
                provider infrastructure carry governance and key-custody trust
                assumptions that require strict access controls and ongoing
                operational validation.
              </li>
            </ul>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.8 Settlement, Risks and Trust Assumptions */}
          <section
            id="risks"
            aria-labelledby="wp-risks"
            className="scroll-mt-24 max-w-[68ch] space-y-3"
          >
            <h2
              id="wp-risks"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              8. Settlement, risks and trust assumptions
            </h2>
            <ul className="list-disc space-y-2 pl-5 text-[15px] leading-7 text-[#333] dark:text-neutral-300">
              <li>
                Network congestion, RPC instability, or cross-chain routing
                failures can delay or prevent settlement.
              </li>
              <li>
                Cross-chain quotes expire; exchange rates, routing fees, and
                liquidity depth fluctuate continuously.
              </li>
              <li>
                Sending unsupported tokens or transferring on the wrong network
                to a wallet or deposit address risks permanent loss.
              </li>
              <li>
                OutLayer custody APIs, blockchain RPC nodes, and NEAR Intents /
                1Click routing are external dependencies outside FLOW&apos;s
                sole control.
              </li>
              <li>
                Compromise of custody-policy controls or sponsor-controller
                credentials is a critical operational risk mitigated through
                isolation and caps, not an impossibility.
              </li>
              <li>
                On-chain broadcasts are generally irreversible once confirmed;
                users must verify recipient, asset, and network details prior to
                signing or funding.
              </li>
            </ul>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.9 Conclusion */}
          <section
            id="conclusion"
            aria-labelledby="wp-conclusion"
            className="scroll-mt-24 max-w-[68ch] space-y-3"
          >
            <h2
              id="wp-conclusion"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              9. Why this matters
            </h2>
            <p className="text-[15.5px] leading-7 text-[#333] dark:text-neutral-300">
              More useful cryptocurrency payments come from separating how the
              sender pays from what the recipient receives, while keeping the
              quote, route, and on-chain settlement state transparent and
              understandable to both sides.
            </p>
          </section>

          <hr className="border-[#EFECE6] dark:border-white/[0.08]" />

          {/* 3.10 References & Versioning */}
          <section
            id="references"
            aria-labelledby="wp-refs"
            className="scroll-mt-24 max-w-[68ch] space-y-3"
          >
            <h2
              id="wp-refs"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-[28px]"
            >
              10. References and versioning
            </h2>
            <ul className="list-disc space-y-1.5 pl-5 text-sm leading-6 text-[#444] dark:text-neutral-300">
              <li>
                NEAR Protocol Documentation — Account model, finality, and RPC
                specifications (
                <a
                  href="https://docs.near.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-[#FF1A1A]"
                >
                  docs.near.org
                </a>
                )
              </li>
              <li>
                NEAR Intents / 1Click API — Cross-chain token discovery, quotes,
                and settlement status (
                <a
                  href="https://docs.near-intents.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-[#FF1A1A]"
                >
                  docs.near-intents.org
                </a>
                )
              </li>
              <li>
                OutLayer Documentation — Provider-backed multi-chain wallet and
                custody interfaces (
                <a
                  href="https://outlayer.fastnear.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-4 hover:text-[#FF1A1A]"
                >
                  outlayer.fastnear.com
                </a>
                )
              </li>
            </ul>
            <p className="pt-2 text-xs leading-6 text-[#666] dark:text-neutral-400">
              <strong>Version 1.0 · Published November 16, 2026.</strong>{" "}
              Capabilities, supported networks, and eligible cross-chain routes
              can change over time; see{" "}
              <Link
                href="/docs"
                className="font-semibold text-[#0B0B0B] dark:text-white underline underline-offset-4"
              >
                FLOW Documentation
              </Link>{" "}
              for current operational behavior.
            </p>
          </section>
        </article>
      </div>
    </PublicSiteChrome>
  );
}
