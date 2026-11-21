import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";

export const metadata: Metadata = {
  title: "FLOW Whitepaper",
  description:
    "Product & Technical Whitepaper (Version 1.0): Chain-abstracted personal payments, NEAR OutLayer MPC custody, NEAR Intents routing, and native NEAR yield.",
  alternates: {
    canonical: "https://flow.devhub.forum/whitepaper",
  },
  openGraph: {
    title: "FLOW Whitepaper (Version 1.0)",
    description:
      "A simpler payment and yield experience across blockchain networks. Architecture, custody policies, cross-chain settlement, and risk disclosures.",
    url: "https://flow.devhub.forum/whitepaper",
    type: "article",
    images: [
      {
        url: "https://flow.devhub.forum/assets/og-whitepaper.png",
        width: 1200,
        height: 630,
        alt: "FLOW White Paper (Version 1.0)",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FLOW Whitepaper (Version 1.0)",
    description:
      "Chain-abstracted personal payments, NEAR OutLayer MPC custody, NEAR Intents routing, and native NEAR yield.",
    images: ["https://flow.devhub.forum/assets/og-whitepaper.png"],
  },
};

const SECTIONS = [
  { id: "abstract", label: "1. Abstract" },
  { id: "problem", label: "2. Industry Background & Problem" },
  { id: "solution", label: "3. Solution & Value Proposition" },
  { id: "architecture", label: "4. Technical Architecture" },
  { id: "economics", label: "5. Economic Model & Yield" },
  { id: "gtm", label: "6. Go-To-Market Strategy" },
  { id: "roadmap", label: "7. Roadmap" },
  { id: "contributors", label: "8. Ecosystem & Contributors" },
  { id: "risks", label: "9. Risks & Disclaimers" },
  { id: "references", label: "10. References & Metadata" },
] as const;

export default function WhitepaperPage() {
  return (
    <PublicSiteChrome activeRoute="whitepaper">
      <div className="mx-auto max-w-4xl space-y-8">
        {/* 1.1 Title Page & Document Metadata */}
        <header className="rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D51B24]">
              Product &amp; Technical Whitepaper
            </p>
            <span className="rounded-full border border-[#E6E2DA] dark:border-white/[0.12] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 font-mono text-[11px] font-semibold text-[#444] dark:text-neutral-300">
              v1.0 | November 2026
            </span>
          </div>
          <h1 className="mt-4 font-serif text-4xl tracking-tight text-[#0B0B0B] dark:text-white sm:text-5xl">
            FLOW Whitepaper
          </h1>
          <p className="mt-3 text-lg text-[#555] dark:text-neutral-300">
            Pay with what you hold. Receive what you want. Earn native yield on
            NEAR.
          </p>

          {/* Official Links */}
          <div className="mt-5 flex flex-wrap gap-3 text-xs">
            <a
              href="https://flow.devhub.forum"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[#E6E2DA] dark:border-white/[0.12] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 font-mono text-[#222] dark:text-neutral-200 hover:border-[#0B0B0B] dark:hover:border-white"
            >
              App: flow.devhub.forum
            </a>
            <Link
              href="/docs"
              className="rounded-full border border-[#E6E2DA] dark:border-white/[0.12] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 font-mono text-[#222] dark:text-neutral-200 hover:border-[#0B0B0B] dark:hover:border-white"
            >
              Docs: /docs
            </Link>
            <a
              href="https://github.com/OpeyemiAwt/flow"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[#E6E2DA] dark:border-white/[0.12] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 font-mono text-[#222] dark:text-neutral-200 hover:border-[#0B0B0B] dark:hover:border-white"
            >
              GitHub: OpeyemiAwt/flow
            </a>
            <a
              href="https://x.com/use_flowapp"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-[#E6E2DA] dark:border-white/[0.12] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 font-mono text-[#222] dark:text-neutral-200 hover:border-[#0B0B0B] dark:hover:border-white"
            >
              X: @use_flowapp
            </a>
          </div>

          {/* Section Jump Links */}
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
        <article className="space-y-10 rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-xs sm:p-12">
          {/* 1.2 Abstract */}
          <section
            id="abstract"
            aria-labelledby="wp-abstract"
            className="scroll-mt-24 max-w-[68ch] space-y-3"
          >
            <h2
              id="wp-abstract"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              1. Abstract &amp; Executive Summary
            </h2>
            <p className="text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              FLOW is a chain-abstracted personal money application built on
              NEAR Protocol. It unifies multi-chain custody, cross-chain
              payments, and native NEAR DeFi yield into a single Web2-familiar
              interface for individual users. With a Google login or email
              verification code, FLOW provisions permanent mainnet addresses
              across NEAR, Solana, Base, and Ethereum without requiring seed
              phrases or browser wallet extensions.
            </p>
            <p className="text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              By combining <strong>NEAR OutLayer</strong> policy-governed MPC
              custody with <strong>NEAR Intents (1Click)</strong> cross-chain
              settlement and live <strong>LiNEAR</strong> and{" "}
              <strong>Burrow Finance</strong> integrations, FLOW solves crypto&apos;s
              coordination gap: senders pay with whatever asset and chain they
              hold, recipients receive the exact asset and chain they want, and
              idle balances earn verifiable on-chain yield.
            </p>
          </section>

          {/* 1.3 Industry Background & Problem Statement */}
          <section
            id="problem"
            aria-labelledby="wp-problem"
            className="scroll-mt-24 max-w-[68ch] space-y-3 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="wp-problem"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              2. Industry Background &amp; Problem Statement
            </h2>
            <p className="text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              Multi-chain adoption has created liquidity across dozens of
              networks, yet everyday payment UX remains broken for individual
              users:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              <li>
                <strong>Asset and Chain Mismatch:</strong> A payer holding USDC
                on Base or SOL on Solana cannot settle a recipient&apos;s
                request for NEAR without manually bridging, swapping, and
                acquiring destination gas.
              </li>
              <li>
                <strong>Seed-Phrase and Extension Friction:</strong> Traditional
                self-custody forces consumers to manage 12-word or 24-word
                recovery phrases and switch networks manually across multiple
                wallet extensions.
              </li>
              <li>
                <strong>Opaque Settlement &amp; Silent Failures:</strong> Many
                apps leave users staring at raw RPC error codes, stalled bridges,
                or unverified balance states when a route times out or runs
                short on gas/storage.
              </li>
              <li>
                <strong>Fragmented Yield Access:</strong> Moving idle tokens
                into staking or lending requires navigating separate DeFi
                frontends and tracking protocol-specific storage deposits and
                cooldown rules.
              </li>
            </ul>
          </section>

          {/* 1.4 The Solution & Value Proposition */}
          <section
            id="solution"
            aria-labelledby="wp-solution"
            className="scroll-mt-24 max-w-[68ch] space-y-3 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="wp-solution"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              3. Solution &amp; Value Proposition
            </h2>
            <p className="text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              FLOW separates <strong>what the user wants</strong> (a personal
              balance, a payment request, a swap, or a yield position) from{" "}
              <strong>how blockchains execute it</strong>. FLOW is scoped
              exclusively to <strong>personal accounts</strong> (no business or
              multi-user team accounts), keeping every flow fast and
              uncluttered.
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              <li>
                <strong>One Login, Four Mainnets:</strong> Google or email OTP
                sign-in provisions NEAR, Solana, Base, and Ethereum addresses
                via NEAR OutLayer MPC.
              </li>
              <li>
                <strong>Cross-Chain Payment Links (/pay/[id]):</strong> Create
                fixed or open-amount payment requests where external payers
                settle from 230+ tokens across 39+ blockchains without needing a
                FLOW account.
              </li>
              <li>
                <strong>Live Send, Convert &amp; Flow IDs:</strong> Send to
                external wallets or <span className="font-mono text-xs">@handle.flow</span>{" "}
                Flow IDs, convert cross-chain with live 1Click quotes, and
                monitor progress on a persistent timeline tracker.
              </li>
              <li>
                <strong>FLOW Earn on NEAR:</strong> Stake NEAR in LiNEAR
                (<span className="font-mono text-xs">linear-protocol.near</span>)
                or supply NEAR-Mainnet USDC to Burrow Finance (
                <span className="font-mono text-xs">contract.main.burrow.near</span>
                ) with live on-chain APY/APR reads and built-in gas/storage
                protection.
              </li>
              <li>
                <strong>Cashflow Insights &amp; FLOW AI:</strong> Track monthly
                external inflows and outflows (excluding internal Earn staking
                round-trips) and query balances or live 1Click routes via FLOW
                AI.
              </li>
            </ul>
          </section>

          {/* 1.5 Technical Architecture */}
          <section
            id="architecture"
            aria-labelledby="wp-architecture"
            className="scroll-mt-24 max-w-[68ch] space-y-4 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="wp-architecture"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              4. Technical Architecture &amp; Security Model
            </h2>
            <p className="text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              FLOW runs a production multi-service architecture backed by
              PostgreSQL, Prisma, and live mainnet RPCs across four dedicated
              worker processes:
            </p>
            <div className="overflow-x-auto rounded-2xl border border-[#EFECE6] dark:border-white/[0.08]">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="bg-[#F8F6F3] dark:bg-[#1A1A1C] text-[#222] dark:text-neutral-200">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Layer / Worker</th>
                    <th className="px-4 py-3 font-semibold">Responsibility</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EFECE6] dark:divide-white/[0.06] text-[#444] dark:text-neutral-300">
                  <tr>
                    <td className="px-4 py-3 font-mono font-semibold">Web App (Next.js)</td>
                    <td className="px-4 py-3">
                      Auth sessions, API validation (Zod), live quoting, UI state persistence, and portfolio views.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono font-semibold">worker:custody</td>
                    <td className="px-4 py-3">
                      OutLayer MPC wallet provisioning, sponsored NEAR policy setup, and signed contract execution.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono font-semibold">worker:payments</td>
                    <td className="px-4 py-3">
                      Outgoing send, convert, and Earn job orchestration with idempotency keys and crash recovery.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono font-semibold">worker:monitoring</td>
                    <td className="px-4 py-3">
                      Observes NEAR Intents 1Click deposit addresses and cross-chain settlement status.
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-mono font-semibold">worker:indexer</td>
                    <td className="px-4 py-3">
                      Multi-chain RPC balance reconciliation and canonical wallet activity indexing.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h3 className="font-serif text-xl text-[#0B0B0B] dark:text-white pt-2">
              Security Model &amp; Threat Mitigation
            </h3>
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              <li>
                <strong>No Raw Private Keys in FLOW:</strong> Wallet keys are
                managed by NEAR OutLayer MPC enclaves. Stored provider API
                credentials are encrypted at rest with AES-256-GCM envelopes.
              </li>
              <li>
                <strong>Least-Privilege Database Roles:</strong> Web handlers
                and workers connect under scoped PostgreSQL roles with
                row-level session context (<span className="font-mono text-xs">set_config</span>).
              </li>
              <li>
                <strong>On-Chain Verification:</strong> Inbound deposits and
                outgoing settlements are verified independently against live
                NEAR, Solana, Base, and Ethereum RPC nodes before crediting
                balances or marking jobs settled.
              </li>
            </ul>
          </section>

          {/* 1.6 Economic Model & Yield */}
          <section
            id="economics"
            aria-labelledby="wp-economics"
            className="scroll-mt-24 max-w-[68ch] space-y-3 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="wp-economics"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              5. Economic Model &amp; DeFi Yield Mechanics
            </h2>
            <p className="text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              FLOW has <strong>no native token</strong> and does not issue
              inflationary emissions or speculative tokenomics. Economic flows
              are strictly transparent:
            </p>
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              <li>
                <strong>Network Gas &amp; Storage:</strong> Users pay standard
                on-chain gas on the source network. For NEAR Earn deposits, FLOW
                enforces a 0.12 NEAR gas and storage reserve on LiNEAR and a
                0.37 NEAR reserve on first-time Burrow deposits (0.25 NEAR
                contract storage plus 0.12 NEAR gas), while withdrawals require
                a 0.05 NEAR gas floor.
              </li>
              <li>
                <strong>Cross-Chain Routing:</strong> Swaps and cross-chain
                payment links are quoted live by NEAR Intents (1Click) solvers,
                with exact output amounts and deadlines shown before execution.
              </li>
              <li>
                <strong>Live On-Chain Yield:</strong> LiNEAR APY is calculated
                live from on-chain <span className="font-mono text-xs">ft_price</span>{" "}
                appreciation on NEAR archival RPC, and Burrow USDC APR is read
                live from <span className="font-mono text-xs">get_asset</span> on{" "}
                <span className="font-mono text-xs">contract.main.burrow.near</span>.
              </li>
            </ul>
          </section>

          {/* 1.7 Go-To-Market */}
          <section
            id="gtm"
            aria-labelledby="wp-gtm"
            className="scroll-mt-24 max-w-[68ch] space-y-3 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="gtm"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              6. Go-To-Market Strategy
            </h2>
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              <li>
                <strong>Phase 1 (Bootstrapping):</strong> Live mainnet release
                for personal cross-chain payments, guest checkout links, and
                native NEAR Earn yield, eliminating onboarding friction via
                sponsored NEAR policy setup.
              </li>
              <li>
                <strong>Phase 2 (Viral Payment Links &amp; Flow IDs):</strong>{" "}
                Every shared <span className="font-mono text-xs">/pay/[id]</span>{" "}
                link and <span className="font-mono text-xs">@handle.flow</span>{" "}
                request introduces external payers across 39+ chains to instant
                NEAR Intents settlement without requiring sign-up first.
              </li>
              <li>
                <strong>Phase 3 (Ecosystem Scale):</strong> Expanding supported
                yield strategies, deeper NEAR AI / Shade Agent automation, and
                on-chain NEAR subaccount resolution for Flow IDs.
              </li>
            </ul>
          </section>

          {/* 1.8 Roadmap */}
          <section
            id="roadmap"
            aria-labelledby="wp-roadmap"
            className="scroll-mt-24 max-w-[68ch] space-y-3 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="roadmap"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              7. Roadmap
            </h2>
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              <li>
                <strong>Completed (Live on Mainnet):</strong> Multi-chain
                OutLayer MPC provisioning, Google &amp; email OTP auth,
                sponsored policy registration, 1Click Send/Convert/Add Money,
                guest checkout <span className="font-mono text-xs">/pay/[id]</span>,
                LiNEAR &amp; Burrow Earn with live on-chain APY/APR and claim
                support, persistent live timeline trackers, Cashflow Insights,
                and FLOW AI.
              </li>
              <li>
                <strong>Near-Term:</strong> Automated end-to-end browser test
                coverage, instant DEX swap-out route for LiNEAR positions, and
                expanded notification preferences.
              </li>
              <li>
                <strong>Long-Term:</strong> On-chain{" "}
                <span className="font-mono text-xs">*.flow.near</span> subaccount
                mapping for Flow IDs and decentralized inference integration
                via NEAR AI.
              </li>
            </ul>
          </section>

          {/* 1.9 Contributors */}
          <section
            id="contributors"
            aria-labelledby="wp-contributors"
            className="scroll-mt-24 max-w-[68ch] space-y-3 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="contributors"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              8. Core Contributors &amp; Ecosystem Alignment
            </h2>
            <p className="text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              FLOW is engineered as a consumer-first showcase of NEAR
              Protocol&apos;s chain abstraction stack, integrating directly with{" "}
              <span className="font-mono text-xs">outlayer.near</span>,{" "}
              <span className="font-mono text-xs">intents.near</span> (Defuse
              1Click), <span className="font-mono text-xs">linear-protocol.near</span>,
              and <span className="font-mono text-xs">contract.main.burrow.near</span>.
              Source code and migration history are maintained openly at{" "}
              <a
                href="https://github.com/OpeyemiAwt/flow"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-[#FF1A1A]"
              >
                github.com/OpeyemiAwt/flow
              </a>
              .
            </p>
          </section>

          {/* 1.10 Risk Factors & Disclaimers */}
          <section
            id="risks"
            aria-labelledby="wp-risks"
            className="scroll-mt-24 max-w-[68ch] space-y-3 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="risks"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              9. Risk Factors &amp; Legal Disclaimers
            </h2>
            <ul className="list-disc space-y-2 pl-6 text-[15px] leading-7 text-[#404040] dark:text-neutral-300">
              <li>
                <strong>Smart Contract &amp; Protocol Risk:</strong> DeFi
                protocols (LiNEAR, Burrow), cross-chain solvers (1Click), and
                MPC custody (OutLayer) carry smart contract, liquidity, and
                operational risks outside FLOW&apos;s unilateral control.
              </li>
              <li>
                <strong>Market &amp; Finality Risk:</strong> Digital asset
                prices fluctuate, and confirmed blockchain transactions are
                irreversible.
              </li>
              <li>
                <strong>No Financial Advice:</strong> This whitepaper is
                informational only. It does not constitute investment advice, a
                solicitation, or an offer to sell any security or financial
                instrument. See our{" "}
                <Link href="/terms" className="underline hover:text-[#FF1A1A]">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline hover:text-[#FF1A1A]">
                  Privacy Policy
                </Link>
                .
              </li>
            </ul>
          </section>

          {/* References */}
          <section
            id="references"
            aria-labelledby="wp-references"
            className="scroll-mt-24 max-w-[68ch] space-y-3 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8"
          >
            <h2
              id="wp-references"
              className="font-serif text-2xl text-[#0B0B0B] dark:text-white sm:text-3xl"
            >
              10. Technical References &amp; Version History
            </h2>
            <ul className="list-disc space-y-1.5 pl-6 text-sm text-[#404040] dark:text-neutral-300">
              <li>
                NEAR Intents &amp; 1Click API:{" "}
                <a
                  href="https://docs.near-intents.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline hover:text-[#FF1A1A]"
                >
                  docs.near-intents.org
                </a>
              </li>
              <li>
                NEAR Protocol Documentation:{" "}
                <a
                  href="https://docs.near.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline hover:text-[#FF1A1A]"
                >
                  docs.near.org
                </a>
              </li>
              <li>
                LiNEAR Protocol Contract:{" "}
                <a
                  href="https://nearblocks.io/address/linear-protocol.near"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline hover:text-[#FF1A1A]"
                >
                  linear-protocol.near
                </a>
              </li>
              <li>
                Burrow Finance Contract:{" "}
                <a
                  href="https://nearblocks.io/address/contract.main.burrow.near"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono underline hover:text-[#FF1A1A]"
                >
                  contract.main.burrow.near
                </a>
              </li>
            </ul>
            <p className="pt-2 font-mono text-xs text-[#666] dark:text-neutral-400">
              Document Version: v1.0 | Last Updated: November 20, 2026
            </p>
          </section>
        </article>
      </div>
    </PublicSiteChrome>
  );
}
