import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";

export const metadata: Metadata = {
  title: "Whitepaper · FLOW",
  description:
    "FLOW Whitepaper (Version 1.0): Chain-abstracted payments across NEAR, Solana, Base, and Ethereum, powered by NEAR OutLayer MPC custody, NEAR Intents, and native NEAR yield.",
  alternates: {
    canonical: "https://flow.devhub.forum/whitepaper",
  },
  openGraph: {
    title: "FLOW Whitepaper (Version 1.0)",
    description:
      "Move money across chains without seed phrases or manual bridges. Architecture, custody, cross-chain settlement, and native yield.",
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

const CHAPTERS = [
  { num: "01", id: "thesis", title: "Thesis" },
  { num: "02", id: "problem", title: "The problem" },
  { num: "03", id: "product", title: "The product" },
  { num: "04", id: "comparison", title: "How FLOW compares" },
  { num: "05", id: "architecture", title: "Architecture & MPC custody" },
  { num: "06", id: "settlement", title: "Cross-chain settlement" },
  { num: "07", id: "links-and-ids", title: "Payment links & @flow ID" },
  { num: "08", id: "earn", title: "Native yield (Earn)" },
  { num: "09", id: "fees", title: "Economics & fees" },
  { num: "10", id: "roadmap-risks", title: "Roadmap & risks" },
] as const;

export default function WhitepaperPage() {
  return (
    <PublicSiteChrome activeRoute="whitepaper">
      <main className="mx-auto max-w-5xl px-5 sm:px-8 pt-10 pb-24 text-neutral-800 dark:text-neutral-200">
        {/* Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pb-12 border-b border-neutral-200/80 dark:border-white/[0.08]">
          <div className="lg:col-span-7 space-y-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
              Whitepaper · Version 1.0 · Updated 22 November 2026
            </p>
            <h1 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-neutral-950 dark:text-white leading-[1.08]">
              Move money across chains, without the friction
            </h1>
            <p className="text-base text-neutral-600 dark:text-neutral-400 leading-relaxed max-w-xl">
              FLOW turns multi-chain crypto into money people can actually use:
              send to a human @flow ID, share payment links that settle from any
              supported coin, and earn native yield on NEAR without seed phrases
              or manual bridges.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <Link
                href="/app"
                className="flow-liquid-btn-primary px-6 py-3 rounded-full text-xs font-semibold"
              >
                Open FLOW
              </Link>
              <Link
                href="/docs"
                className="flow-liquid-btn px-6 py-3 rounded-full text-xs font-semibold text-neutral-900 dark:text-white"
              >
                Read the docs
              </Link>
            </div>
          </div>

          {/* Live Payment Visual Card (Talise-inspired editorial preview) */}
          <div className="lg:col-span-5">
            <div className="rounded-[28px] border border-neutral-200/90 dark:border-white/[0.1] bg-white dark:bg-[#141414] p-6 shadow-md space-y-5">
              <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
                <span className="font-semibold text-neutral-950 dark:text-white">
                  FLOW Settlement
                </span>
                <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Finalized
                </span>
              </div>
              <div>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Sent
                </p>
                <p className="font-mono text-3xl font-bold tracking-tight text-neutral-950 dark:text-white mt-0.5">
                  850.00 USDT
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                  to <span className="font-mono font-semibold text-neutral-900 dark:text-white">tunde@flow</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-neutral-100 dark:border-white/[0.08] text-xs">
                <div>
                  <p className="text-neutral-500 dark:text-neutral-400">Paid in</p>
                  <p className="font-semibold text-neutral-950 dark:text-white mt-0.5">
                    SOL on Solana
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500 dark:text-neutral-400">Settled as</p>
                  <p className="font-semibold text-neutral-950 dark:text-white mt-0.5">
                    USDT on Ethereum
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500 dark:text-neutral-400">Routing</p>
                  <p className="font-semibold text-neutral-950 dark:text-white mt-0.5">
                    NEAR Intents
                  </p>
                </div>
                <div>
                  <p className="text-neutral-500 dark:text-neutral-400">Custody</p>
                  <p className="font-semibold text-neutral-950 dark:text-white mt-0.5">
                    NEAR OutLayer MPC
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Numbers Strip */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-8 border-b border-neutral-200/80 dark:border-white/[0.08]">
          {[
            { value: "4", label: "Mainnet networks (NEAR, Solana, Base, ETH)" },
            { value: "0", label: "Seed phrases to write down or manage" },
            { value: "1Click", label: "Cross-chain routing via NEAR Intents" },
            { value: "2", label: "Native NEAR Earn protocols (LiNEAR & Burrow)" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-4"
            >
              <p className="font-mono text-2xl sm:text-3xl font-bold text-neutral-950 dark:text-white">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 leading-snug">
                {stat.label}
              </p>
            </div>
          ))}
        </section>

        {/* Abstract */}
        <section className="mt-8 rounded-[24px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-8 shadow-xs">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FF1A1A] mb-2">
            Abstract
          </p>
          <p className="text-sm sm:text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
            Global crypto payments are fragmented across incompatible networks.
            A sender holds SOL on Solana, a recipient wants USDT on Ethereum or
            native NEAR, and completing a simple transfer still requires seed
            phrases, bridge interfaces, multiple gas tokens, and long hex
            addresses. FLOW removes that friction. Built on NEAR OutLayer MPC
            wallets and NEAR Intents (1Click) cross-chain settlement, FLOW gives
            every user one unified account across NEAR, Solana, Base, and
            Ethereum, human-readable @flow IDs, shareable payment links with
            payer limits, and direct access to native NEAR yield through LiNEAR
            and Burrow Finance.
          </p>
        </section>

        {/* Main 2-Column Body: Sticky Contents + Chapters */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <aside className="lg:col-span-3 lg:sticky lg:top-24 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-neutral-400 mb-3">
              Contents
            </p>
            <nav className="space-y-1">
              {CHAPTERS.map((c) => (
                <a
                  key={c.id}
                  href={`#${c.id}`}
                  className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100/80 dark:hover:bg-white/[0.05] transition-colors"
                >
                  <span className="font-mono text-[11px] text-neutral-400">
                    {c.num}
                  </span>
                  <span>{c.title}</span>
                </a>
              ))}
            </nav>
          </aside>

          <article className="lg:col-span-9 space-y-12 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            <section id="thesis" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">01</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Thesis
              </h2>
              <p>
                People do not want to think about blockchains when they pay
                someone. They care about two things: what leaves their balance
                and what arrives in the recipient&apos;s wallet.
              </p>
              <p>
                Chain abstraction makes the network layer invisible. With MPC
                key management and intent-based solver routing, a single account
                can receive, send, convert, and earn across ecosystems while
                feeling as straightforward as a modern payment app.
              </p>
            </section>

            <section id="problem" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">02</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                The problem
              </h2>
              <p>
                Everyday on-chain payments break down at four predictable
                points:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Chain mismatch:</strong> A payer holds SOL or Base
                  USDC, while the recipient expects NEAR or Ethereum USDT.
                </li>
                <li>
                  <strong>Address anxiety:</strong> Copying 42 to 64 character
                  addresses across multiple chains invites costly mistakes.
                </li>
                <li>
                  <strong>Seed phrase drop-off:</strong> Asking new users to
                  back up 12 or 24 words before receiving their first payment
                  stops adoption cold.
                </li>
                <li>
                  <strong>Idle capital:</strong> Balances sitting in standard
                  payment wallets earn nothing unless users manually connect to
                  external DeFi apps.
                </li>
              </ul>
            </section>

            <section id="product" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">03</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                The product
              </h2>
              <p>
                FLOW brings four core workflows into one clean interface:
              </p>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>Unified multi-chain wallet:</strong> Sign in with
                  Email OTP or Google SSO to provision verified mainnet
                  addresses on NEAR, Solana, Base, and Ethereum automatically.
                </li>
                <li>
                  <strong>Guided Send, Convert &amp; @flow ID:</strong> Send to
                  any wallet address or human handle like{" "}
                  <code className="font-mono text-xs bg-neutral-100 dark:bg-white/[0.08] px-1.5 py-0.5 rounded">
                    amara@flow
                  </code>{" "}
                  with live quotes and Slide to Pay confirmation.
                </li>
                <li>
                  <strong>Shareable Payment Links:</strong> Request fixed or
                  open amounts, optionally cap how many people can pay, track
                  settled vs. remaining spots live, and let guest payers settle
                  from any supported coin.
                </li>
                <li>
                  <strong>Native NEAR Earn:</strong> Put idle NEAR or NEAR USDC
                  to work directly in LiNEAR liquid staking and Burrow Finance.
                </li>
              </ol>
            </section>

            <section id="comparison" className="scroll-mt-24 space-y-4">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">04</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                How FLOW compares
              </h2>
              <div className="overflow-x-auto rounded-2xl border border-neutral-200/80 dark:border-white/[0.08]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-white/[0.04] text-neutral-600 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Capability</th>
                      <th className="px-4 py-3 font-semibold">Traditional Wallet</th>
                      <th className="px-4 py-3 font-semibold">FLOW</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06] bg-white dark:bg-[#141414]">
                    <tr>
                      <td className="px-4 py-3 font-medium text-neutral-950 dark:text-white">Onboarding</td>
                      <td className="px-4 py-3">12/24-word seed phrase</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">Email OTP or Google SSO (MPC)</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-neutral-950 dark:text-white">Cross-chain pay</td>
                      <td className="px-4 py-3">Manual bridge + swap + send</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">Single flow via NEAR Intents</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-neutral-950 dark:text-white">Recipient identity</td>
                      <td className="px-4 py-3">Long hex / base58 addresses</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">Human @flow ID or address</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-neutral-950 dark:text-white">Payment links</td>
                      <td className="px-4 py-3">Not built in</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">Live guest checkout + payer limits</td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium text-neutral-950 dark:text-white">Idle balance yield</td>
                      <td className="px-4 py-3">External dApp connection</td>
                      <td className="px-4 py-3 font-semibold text-emerald-700 dark:text-emerald-400">Built-in LiNEAR &amp; Burrow Finance</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section id="architecture" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">05</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Architecture &amp; MPC custody
              </h2>
              <p>
                FLOW separates user authentication, wallet custody, payment
                monitoring, and blockchain indexing into dedicated services:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>NEAR OutLayer MPC:</strong> Each user account
                  provisions isolated multi-chain addresses across NEAR, Solana,
                  Base, and Ethereum. Signing credentials are encrypted at rest
                  and only invoked by the dedicated custody worker for
                  authorized jobs.
                </li>
                <li>
                  <strong>Direct RPC verification:</strong> Balances and
                  settlements are verified directly against chain RPCs, and
                  outgoing settlements immediately reconcile wallet balances and
                  activity records.
                </li>
                <li>
                  <strong>Live Payment Tracker:</strong> Every outgoing send,
                  conversion, Earn action, and guest checkout payment tracks
                  real on-chain milestones from initiation to finality.
                </li>
              </ul>
            </section>

            <section id="settlement" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">06</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Cross-chain settlement
              </h2>
              <p>
                When the source asset and destination asset differ (for example,
                paying in SOL on Solana to settle USDT on Ethereum or native
                NEAR), FLOW requests a live quote from NEAR Intents (1Click).
                Before you confirm, FLOW shows the estimated receive amount,
                minimum guaranteed output, exchange rate, and estimated arrival
                time.
              </p>
              <p>
                Once committed, the solver network absorbs the cross-chain
                execution and delivers the requested destination asset straight
                to the recipient&apos;s verified address. If a cross-chain
                deposit fails or expires, funds return to the specified refund
                address.
              </p>
            </section>

            <section id="links-and-ids" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">07</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Payment links &amp; @flow ID
              </h2>
              <p>
                Every FLOW user can claim a unique{" "}
                <code className="font-mono text-xs bg-neutral-100 dark:bg-white/[0.08] px-1.5 py-0.5 rounded">
                  name@flow
                </code>{" "}
                handle that resolves automatically to the right network address
                when another FLOW user pays them.
              </p>
              <p>
                For anyone outside FLOW, Request Links create a hosted guest
                checkout page at{" "}
                <code className="font-mono text-xs bg-neutral-100 dark:bg-white/[0.08] px-1.5 py-0.5 rounded">
                  flow.devhub.forum/pay/...
                </code>
                . Creators can choose a fixed or open amount, set a maximum
                number of payers (tracking settled payments and remaining spots
                live), pause or resume the link, or delete it at any time.
              </p>
            </section>

            <section id="earn" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">08</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Native yield (Earn)
              </h2>
              <p>
                FLOW integrates directly with established NEAR Mainnet
                protocols:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>LiNEAR Protocol:</strong> Deposit NEAR to receive
                  $LiNEAR and auto-compound validator staking rewards every
                  12-hour epoch. Standard unstaking follows NEAR&apos;s on-chain
                  cooldown (~48 hours / ~4 epochs) before claiming back to your
                  wallet.
                </li>
                <li>
                  <strong>Burrow Finance:</strong> Supply USDC on NEAR Mainnet
                  to earn variable lending yield directly from your FLOW wallet.
                </li>
              </ul>
            </section>

            <section id="fees" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">09</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Economics &amp; fees
              </h2>
              <p>
                FLOW keeps pricing simple and transparent by showing the exact
                quote and fee breakdown before confirmation:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Direct sends &amp; Payment Link checkouts:</strong> 0%
                  FLOW platform fee. Users only pay underlying network gas fees
                  and, on cross-chain checkouts, live solver spreads.
                </li>
                <li>
                  <strong>Earn deposits:</strong> 0.15% one-time FLOW platform
                  fee deducted on deposit into an Earn protocol. Withdrawals and
                  claims from Earn carry a 0% FLOW fee.
                </li>
                <li>
                  <strong>Convert &amp; Bridge:</strong> 1% FLOW platform fee
                  included natively inside the NEAR Intents / 1Click quote
                  across all supported chains.
                </li>
              </ul>
              <p>
                Collected platform fees are routed to the FLOW treasury and
                settled in NEAR to fund ongoing infrastructure and new-account
                policy sponsorship.
              </p>
            </section>

            <section id="roadmap-risks" className="scroll-mt-24 space-y-3">
              <p className="font-mono text-xs font-semibold text-[#FF1A1A]">10</p>
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Roadmap &amp; risks
              </h2>
              <p>
                Upcoming milestones include external wallet connections for
                deposits, expanded multi-chain token coverage, richer payment
                analytics, and deeper AI Assistant automation.
              </p>
              <p>
                Users should be aware of inherent on-chain risks: irreversible
                blockchain transactions, variable DeFi yields, smart contract
                risk in third-party protocols (LiNEAR, Burrow Finance), and
                cross-chain solver liquidity fluctuations. Review our{" "}
                <Link
                  href="/terms"
                  className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
                >
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link
                  href="/privacy"
                  className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
                >
                  Privacy Policy
                </Link>{" "}
                before using FLOW.
              </p>
            </section>
          </article>
        </div>
      </main>
    </PublicSiteChrome>
  );
}
