import type { Metadata } from "next";
import Link from "next/link";
import { DocsShell, type DocsTocItem } from "../../components/docs-shell.tsx";

export const metadata: Metadata = {
  title: "Whitepaper · FLOW",
  description:
    "The technical and product thesis for FLOW: non-custodial multi-chain payments, @flow IDs, cross-chain routing via NEAR Intents, and native NEAR yield.",
  alternates: {
    canonical: "https://flow.devhub.forum/whitepaper",
  },
  openGraph: {
    title: "FLOW Whitepaper",
    description:
      "Multi-chain payments, cross-chain conversion, and native NEAR yield without seed phrases or manual bridging.",
    url: "https://flow.devhub.forum/whitepaper",
    type: "website",
    images: [
      {
        url: "https://flow.devhub.forum/assets/og-whitepaper.png",
        width: 1200,
        height: 630,
        alt: "FLOW Whitepaper · Architecture & Multi-Chain Vision",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FLOW Whitepaper",
    description:
      "The technical and product thesis for FLOW across NEAR, Solana, Base, and Ethereum.",
    images: ["https://flow.devhub.forum/assets/og-whitepaper.png"],
  },
};

const WHITEPAPER_TOC: readonly DocsTocItem[] = [
  { id: "abstract", label: "01 · Abstract" },
  { id: "problem", label: "02 · The problem" },
  { id: "architecture", label: "03 · System architecture" },
  { id: "mpc", label: "04 · Non-custodial MPC" },
  { id: "identity", label: "05 · @flow ID & links" },
  { id: "routing", label: "06 · Cross-chain routing" },
  { id: "reconciliation", label: "07 · Live reconciliation" },
  { id: "earn", label: "08 · Native yield (Earn)" },
  { id: "fees", label: "09 · Economics & fees" },
  { id: "risks", label: "10 · Roadmap & risks" },
];

export default function WhitepaperPage() {
  return (
    <DocsShell activeRoute="whitepaper" eyebrow="Deeper" toc={WHITEPAPER_TOC}>
      {/* Hero */}
      <h1 className="mt-3 text-balance text-[34px] font-light leading-[1.1] tracking-[-0.025em] text-[#0b0c0e] dark:text-white md:text-[44px] md:leading-[1.06]">
        Whitepaper
      </h1>
      <p className="mt-4 max-w-[64ch] text-pretty text-[17px] leading-[1.6] text-[#5f636a] dark:text-neutral-400">
        Multi-chain money without the friction wall. The technical and product
        thesis for FLOW: non-custodial payments, shareable checkout links,
        cross-chain conversion, and native yield across NEAR, Solana, Base, and
        Ethereum.
      </p>

      {/* Gloam-style Metadata Spec Grid (<dl>) */}
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 rounded-[20px] bg-[#f3f4f5] dark:bg-white/[0.04] border border-[#e4e6e9]/70 dark:border-white/[0.07] p-5 sm:grid-cols-3 sm:p-6">
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Version
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white tabular-nums">
            1.0
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Status
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            Public mainnet
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Networks
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            NEAR · Solana · Base · Ethereum
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Live
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            Send · @flow ID · Links · Convert · Earn
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Custody
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            Non-custodial MPC (OutLayer)
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Routing
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            NEAR Intents (1Click)
          </dd>
        </div>
      </dl>

      {/* Quick Links */}
      <nav aria-label="Quick links" className="mt-4 flex flex-wrap gap-x-6 gap-y-1">
        <Link
          href="/docs"
          className="inline-flex h-9 items-center gap-1.5 text-[14px] text-[#34373c] dark:text-neutral-300 hover:text-[#0b0c0e] dark:hover:text-white transition-colors"
        >
          Documentation
        </Link>
        <Link
          href="/sign-in"
          className="inline-flex h-9 items-center gap-1.5 text-[14px] text-[#34373c] dark:text-neutral-300 hover:text-[#0b0c0e] dark:hover:text-white transition-colors"
        >
          Open the app
        </Link>
        <Link
          href="/terms"
          className="inline-flex h-9 items-center gap-1.5 text-[14px] text-[#34373c] dark:text-neutral-300 hover:text-[#0b0c0e] dark:hover:text-white transition-colors"
        >
          Terms of Service
        </Link>
        <Link
          href="/privacy"
          className="inline-flex h-9 items-center gap-1.5 text-[14px] text-[#34373c] dark:text-neutral-300 hover:text-[#0b0c0e] dark:hover:text-white transition-colors"
        >
          Privacy Policy
        </Link>
      </nav>

      {/* Living Document Notice */}
      <div className="mt-8 rounded-[14px] bg-[#f3f4f5] dark:bg-white/[0.04] px-5 py-4 text-[14px] leading-relaxed text-[#5f636a] dark:text-neutral-400">
        This document is a living public specification for FLOW, an independent
        non-custodial software project. It describes live mainnet capabilities,
        architectural choices, fee mechanics, and known protocol risks.
      </div>

      {/* Numbered Sections */}
      <div className="mt-10 space-y-12 text-[16px] leading-[26px] text-[#34373c] dark:text-neutral-300">
        <section id="abstract" className="scroll-mt-28 space-y-4">
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            01
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Abstract
          </h2>
          <p>
            On-chain stablecoins and digital assets settle globally in seconds,
            yet everyday payments still feel fragmented across chains, wallets,
            gas tokens, and bridges. FLOW unifies multi-chain ownership,
            human-readable identity, cross-chain routing, and native NEAR yield
            into a single non-custodial application.
          </p>
          <p>
            Users sign in with familiar web credentials, receive live mainnet
            addresses on NEAR, Solana, Base, and Ethereum, and transact without
            worrying which chain their counterparty uses.
          </p>
        </section>

        <section
          id="problem"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            02
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            The problem
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Chain fragmentation:</strong> Payers hold USDC on Solana
              or ETH on Base while recipients want funds on NEAR or Ethereum.
              Manual bridging adds friction and user error.
            </li>
            <li>
              <strong>Key management anxiety:</strong> Seed phrases and
              browser-extension popups block mainstream adoption for everyday
              payments and invoicing.
            </li>
            <li>
              <strong>Idle payment balances:</strong> Funds sitting in standard
              wallets earn nothing unless users manually connect to external
              DeFi interfaces and track positions separately.
            </li>
          </ul>
        </section>

        <section
          id="architecture"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            03
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            System architecture
          </h2>
          <p>
            FLOW is built as four decoupled subsystems that communicate through
            signed intents and idempotent background workers:
          </p>
          <figure className="my-6 rounded-[22px] border border-[#e4e6e9] dark:border-white/[0.08] p-2 sm:p-2.5">
            <figcaption className="px-3 pb-3 pt-2 sm:px-3.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-400">
                Execution layers
              </span>
            </figcaption>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-[16px] bg-[#f3f4f5] dark:bg-white/[0.04] p-4">
                <p className="text-[12px] text-[#6b6f76] dark:text-neutral-400">
                  Layer 1
                </p>
                <p className="mt-1 text-[17px] font-medium text-[#0b0c0e] dark:text-white">
                  Auth &amp; Policy
                </p>
                <p className="mt-2 text-[13.5px] leading-[1.5] text-[#5f636a] dark:text-neutral-400">
                  Google OAuth / Email OTP sessions paired with OutLayer MPC
                  signing policies on NEAR.
                </p>
              </div>
              <div className="rounded-[16px] bg-[#f3f4f5] dark:bg-white/[0.04] p-4">
                <p className="text-[12px] text-[#6b6f76] dark:text-neutral-400">
                  Layer 2
                </p>
                <p className="mt-1 text-[17px] font-medium text-[#0b0c0e] dark:text-white">
                  Intents &amp; Workers
                </p>
                <p className="mt-2 text-[13.5px] leading-[1.5] text-[#5f636a] dark:text-neutral-400">
                  Signed 1Click quotes, custody execution workers, and live
                  on-chain finality reconciliation.
                </p>
              </div>
              <div className="rounded-[16px] bg-[#f3f4f5] dark:bg-white/[0.04] p-4">
                <p className="text-[12px] text-[#6b6f76] dark:text-neutral-400">
                  Layer 3
                </p>
                <p className="mt-1 text-[17px] font-medium text-[#0b0c0e] dark:text-white">
                  Direct Settlement
                </p>
                <p className="mt-2 text-[13.5px] leading-[1.5] text-[#5f636a] dark:text-neutral-400">
                  Balances settle straight to user addresses on NEAR, Solana,
                  Base, Ethereum, LiNEAR, and Burrow.
                </p>
              </div>
            </div>
          </figure>
        </section>

        <section
          id="mpc"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            04
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Non-custodial MPC &amp; signing policies
          </h2>
          <p>
            FLOW never pools user funds into an omnibus hot wallet. Each account
            provisions dedicated mainnet addresses through OutLayer MPC,
            governed by an on-chain wallet policy on NEAR. New accounts have
            their initial policy storage sponsored by the FLOW sponsor wallet so
            onboarding requires zero upfront gas.
          </p>
        </section>

        <section
          id="identity"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            05
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            @flow ID &amp; programmable payment links
          </h2>
          <p>
            Every user can claim a unique <code className="rounded-md bg-[#f3f4f5] dark:bg-white/[0.08] px-1.5 py-0.5 text-[14px]">@handle</code>{" "}
            for instant peer-to-peer transfers. For invoices and group
            collections, Payment Links provide guest-friendly checkout URLs with
            fixed or open amounts, optional max-payer caps with live remaining
            counts, creator-selectable fee payer settings (payer or creator),
            and soft-delete lifecycle controls.
          </p>
        </section>

        <section
          id="routing"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            06
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Cross-chain routing (NEAR Intents)
          </h2>
          <p>
            Cross-chain conversions and multi-chain payment link checkouts route
            through NEAR Intents / 1Click. Every quote is cryptographically
            verified for signature validity, route match, and expiration before
            a user confirms. Payment links support both{" "}
            <code className="rounded-md bg-[#f3f4f5] dark:bg-white/[0.08] px-1.5 py-0.5 text-[14px]">EXACT_OUTPUT</code>{" "}
            (payer covers routing fees) and{" "}
            <code className="rounded-md bg-[#f3f4f5] dark:bg-white/[0.08] px-1.5 py-0.5 text-[14px]">EXACT_INPUT</code>{" "}
            (creator absorbs routing fees).
          </p>
        </section>

        <section
          id="reconciliation"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            07
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Live on-chain reconciliation
          </h2>
          <p>
            FLOW never fabricates balances. As soon as an outgoing transfer,
            conversion, payment link settlement, or Earn claim hits on-chain
            finality, FLOW&apos;s custody and indexer workers reconcile live RPC
            balances and ingest the finalized transaction directly into the
            account&apos;s activity feed and notifications page.
          </p>
        </section>

        <section
          id="earn"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            08
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Native yield (Earn)
          </h2>
          <p>
            FLOW integrates directly with established NEAR Mainnet protocols so
            yield positions remain owned directly by the user&apos;s own wallet:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>LiNEAR Protocol:</strong> Deposit NEAR to receive
              $LiNEAR and auto-compound validator staking rewards every 12-hour
              epoch. Standard unstaking follows NEAR&apos;s ~48-hour (~4 epoch)
              cooldown before claiming back to your wallet.
            </li>
            <li>
              <strong>Burrow Finance:</strong> Supply USDC on NEAR Mainnet to
              earn variable lending yield directly from your FLOW wallet.
            </li>
          </ul>
        </section>

        <section
          id="fees"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            09
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Economics &amp; fees
          </h2>
          <p>
            FLOW keeps pricing transparent by showing the exact quote and fee
            breakdown before confirmation:
          </p>
          <div className="overflow-hidden rounded-[16px] border border-[#e4e6e9] dark:border-white/[0.08]">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-[#f3f4f5] dark:bg-white/[0.04] text-[12px] font-medium uppercase tracking-[0.06em] text-[#5f636a] dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Flow</th>
                  <th className="px-4 py-3">Platform Fee</th>
                  <th className="px-4 py-3">Settlement</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e4e6e9] dark:divide-white/[0.06]">
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    Direct sends (same asset) &amp; Payment Links
                  </td>
                  <td className="px-4 py-3 font-medium text-[#2e7d53] dark:text-emerald-400">
                    0%
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    Network gas &amp; solver spread only
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    Cross-asset sends
                  </td>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    0.3%
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    Charged from wallet balance via 1Click appFee
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    Earn deposits
                  </td>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    0.3%
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    One-shot from balance on deposit; 0% on withdraw / claim
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    Convert &amp; Bridge
                  </td>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    1.5%
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    Charged from wallet balance via native 1Click appFee
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-[14.5px] text-[#5f636a] dark:text-neutral-400">
            Collected platform fees are routed to the FLOW treasury and settled
            in NEAR to sustain infrastructure and new-account policy
            sponsorship.
          </p>
        </section>

        <section
          id="risks"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            10
          </p>
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Roadmap &amp; risks
          </h2>
          <p>
            Upcoming milestones include external wallet connections for
            one-click deposits, expanded multi-chain token coverage, deeper AI
            Assistant automation, and richer treasury analytics.
          </p>
          <p>
            Users should understand inherent on-chain risks: irreversible
            blockchain transactions, variable DeFi yields, smart contract risk
            in third-party protocols (LiNEAR, Burrow Finance), and cross-chain
            solver liquidity fluctuations. Review our{" "}
            <Link
              href="/terms"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4"
            >
              Privacy Policy
            </Link>{" "}
            for full details.
          </p>
        </section>
      </div>
    </DocsShell>
  );
}
