import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";
import { MAINNET_SUPPORTED_DEPLOYMENTS } from "../../domain/supported-assets-catalog.ts";

export const metadata: Metadata = {
  title: "Docs · FLOW",
  description:
    "Learn how to use FLOW to send, receive, convert, request payments, and earn yield across NEAR, Solana, Base, and Ethereum.",
  alternates: {
    canonical: "https://flow.devhub.forum/docs",
  },
  openGraph: {
    title: "FLOW Documentation",
    description:
      "Practical instructions for using FLOW safely across NEAR, Solana, Ethereum, and Base.",
    url: "https://flow.devhub.forum/docs",
    type: "website",
    images: [
      {
        url: "https://flow.devhub.forum/assets/og-docs.png",
        width: 1200,
        height: 630,
        alt: "What is FLOW? Why are we building? · FLOW Documentation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FLOW Documentation",
    description:
      "What is FLOW? Why are we building? Practical instructions for using FLOW across NEAR, Solana, Ethereum, and Base.",
    images: ["https://flow.devhub.forum/assets/og-docs.png"],
  },
};

const NAV_GROUPS = [
  {
    label: "Get started",
    items: [
      { id: "introduction", label: "Introduction" },
      { id: "quickstart", label: "Quickstart" },
      { id: "how-flow-works", label: "How FLOW works" },
      { id: "networks", label: "Networks & assets" },
      { id: "security", label: "Security & account" },
    ],
  },
  {
    label: "Core concepts",
    items: [
      { id: "flow-id", label: "@flow IDs" },
      { id: "balances-activity", label: "Balances, activity & notifications" },
    ],
  },
  {
    label: "Guides",
    items: [
      { id: "send", label: "Send money" },
      { id: "add-money", label: "Add money & direct receive" },
      { id: "convert", label: "Convert & bridge" },
      { id: "payment-links", label: "Request & payment links" },
      { id: "earn", label: "Earn (LiNEAR & Burrow)" },
      { id: "fees", label: "Fees" },
      { id: "assistant", label: "Flow AI Assistant" },
    ],
  },
] as const;

export default function DocsPage() {
  return (
    <PublicSiteChrome activeRoute="docs">
      <main className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 pb-24 text-neutral-800 dark:text-neutral-200">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          {/* Left Sidebar (Talise-style grouped docs navigation) */}
          <aside className="lg:col-span-3 lg:sticky lg:top-24 space-y-6">
            {NAV_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 mb-2 px-2.5">
                  {group.label}
                </p>
                <nav className="space-y-0.5">
                  {group.items.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className="block px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white hover:bg-neutral-100/80 dark:hover:bg-white/[0.05] transition-colors"
                    >
                      {item.label}
                    </a>
                  ))}
                </nav>
              </div>
            ))}

            <div className="pt-4 border-t border-neutral-200/70 dark:border-white/[0.08]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-neutral-400 mb-2 px-2.5">
                Resources
              </p>
              <div className="space-y-0.5">
                <Link
                  href="/whitepaper"
                  className="block px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                >
                  Whitepaper
                </Link>
                <Link
                  href="/privacy"
                  className="block px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                >
                  Privacy Policy
                </Link>
                <Link
                  href="/terms"
                  className="block px-2.5 py-1.5 rounded-xl text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-950 dark:hover:text-white"
                >
                  Terms of Service
                </Link>
              </div>
            </div>
          </aside>

          {/* Main Documentation Content */}
          <article className="lg:col-span-9 space-y-12 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            {/* Introduction */}
            <section
              id="introduction"
              className="scroll-mt-24 pb-8 border-b border-neutral-200/80 dark:border-white/[0.08] space-y-4"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#FF1A1A]">
                Get started · Introduction
              </p>
              <h1 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-neutral-950 dark:text-white">
                What is FLOW?
              </h1>
              <p className="text-base text-neutral-600 dark:text-neutral-400 max-w-2xl">
                FLOW is a multi-chain payment wallet that lets you send,
                receive, convert, request payments, and earn yield across NEAR,
                Solana, Base, and Ethereum from one simple account.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <a
                  href="#quickstart"
                  className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-4 hover:border-neutral-400 dark:hover:border-white/25 transition-colors"
                >
                  <p className="text-xs font-bold text-neutral-950 dark:text-white">
                    Quickstart →
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Sign in, fund your wallet, and make your first payment in
                    minutes.
                  </p>
                </a>
                <a
                  href="#payment-links"
                  className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-4 hover:border-neutral-400 dark:hover:border-white/25 transition-colors"
                >
                  <p className="text-xs font-bold text-neutral-950 dark:text-white">
                    Payment links →
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Create shareable links with payer limits and cross-chain
                    checkout.
                  </p>
                </a>
                <a
                  href="#earn"
                  className="rounded-2xl border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-4 hover:border-neutral-400 dark:hover:border-white/25 transition-colors"
                >
                  <p className="text-xs font-bold text-neutral-950 dark:text-white">
                    Earn on NEAR →
                  </p>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    Stake NEAR with LiNEAR or supply USDC on Burrow Finance.
                  </p>
                </a>
              </div>
            </section>

            {/* Quickstart */}
            <section id="quickstart" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Quickstart
              </h2>
              <ol className="list-decimal pl-5 space-y-2">
                <li>
                  <strong>Sign in:</strong> Go to{" "}
                  <Link
                    href="/sign-in"
                    className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
                  >
                    Sign in
                  </Link>{" "}
                  using Email OTP or Google SSO. No seed phrase is required.
                </li>
                <li>
                  <strong>Provision your wallet:</strong> FLOW automatically
                  provisions your multi-chain NEAR OutLayer MPC wallet addresses
                  for NEAR, Solana, Base, and Ethereum.
                </li>
                <li>
                  <strong>Claim your @flow ID:</strong> Claim a human handle
                  such as{" "}
                  <code className="font-mono text-xs bg-neutral-100 dark:bg-white/[0.08] px-1.5 py-0.5 rounded">
                    yourname@flow
                  </code>{" "}
                  from your notifications or Settings.
                </li>
                <li>
                  <strong>Add money:</strong> Deposit directly to any of your
                  chain addresses or bridge in from another chain via Add money.
                </li>
              </ol>
            </section>

            {/* How FLOW works */}
            <section id="how-flow-works" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                How FLOW works
              </h2>
              <p>
                Under the hood, FLOW combines two primitives:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>NEAR OutLayer MPC:</strong> Derives and secures your
                  multi-chain wallet addresses across NEAR, Solana, Base, and
                  Ethereum without exposing raw private keys in your browser.
                </li>
                <li>
                  <strong>NEAR Intents (1Click):</strong> Handles cross-chain
                  quotes and settlement when the coin you send differs from the
                  coin the recipient wants (for example, paying in SOL on Solana
                  while the recipient settles in USDT on Ethereum or native
                  NEAR).
                </li>
              </ul>
            </section>

            {/* Supported Networks & Assets */}
            <section id="networks" className="scroll-mt-24 space-y-4">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Networks &amp; assets
              </h2>
              <p>
                FLOW supports verified mainnet assets across NEAR Mainnet,
                Solana, Base, and Ethereum:
              </p>
              <div className="overflow-x-auto rounded-2xl border border-neutral-200/80 dark:border-white/[0.08]">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 dark:bg-white/[0.04] text-neutral-600 dark:text-neutral-300">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Asset</th>
                      <th className="px-4 py-3 font-semibold">Network</th>
                      <th className="px-4 py-3 font-semibold">Standard</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-white/[0.06] bg-white dark:bg-[#141414]">
                    {MAINNET_SUPPORTED_DEPLOYMENTS.map((dep) => (
                      <tr key={dep.id}>
                        <td className="px-4 py-2.5 font-semibold text-neutral-950 dark:text-white">
                          {dep.symbol}
                        </td>
                        <td className="px-4 py-2.5">{dep.networkName}</td>
                        <td className="px-4 py-2.5 font-mono text-[11px] text-neutral-500">
                          {dep.standard}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Security & Account */}
            <section id="security" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Security &amp; account
              </h2>
              <p>
                Open{" "}
                <Link
                  href="/security"
                  className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
                >
                  Settings
                </Link>{" "}
                from your profile menu to update your display name or avatar,
                manage notification preferences, view and revoke active browser
                sessions, or permanently delete your account. Always withdraw
                any remaining wallet balances before deleting your account.
              </p>
            </section>

            {/* @flow IDs */}
            <section id="flow-id" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                @flow IDs
              </h2>
              <p>
                A @flow ID (for example,{" "}
                <code className="font-mono text-xs bg-neutral-100 dark:bg-white/[0.08] px-1.5 py-0.5 rounded">
                  amara@flow
                </code>
                ) maps your account to a short, memorable name. When another
                FLOW user enters your @flow ID on the Send page, FLOW verifies
                it live and automatically routes funds to your matching chain
                address.
              </p>
            </section>

            {/* Balances, activity & notifications */}
            <section id="balances-activity" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Balances, activity &amp; notifications
              </h2>
              <p>
                Your dashboard displays your combined USD balance across all
                four networks, monthly inflows and outflows, and recent
                finalized transactions. When any outgoing send, swap, or Earn
                claim settles on-chain, FLOW automatically reconciles your
                balances and indexes the transaction. Click the bell icon in the
                header to open the dedicated{" "}
                <Link
                  href="/notifications"
                  className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
                >
                  Notifications
                </Link>{" "}
                page.
              </p>
            </section>

            {/* Send money */}
            <section id="send" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Send money
              </h2>
              <p>
                Sending in FLOW follows a clean guided flow: pick the asset you
                want to pay with, pick what the recipient should receive, enter
                the amount and recipient address or @flow ID, review the compact
                quote (with a reload button to refresh rates), and drag{" "}
                <strong>Slide to Pay</strong> to confirm. Once submitted, the
                Live Payment Tracker displays each milestone until on-chain
                settlement completes.
              </p>
            </section>

            {/* Add money & Direct receive */}
            <section id="add-money" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Add money &amp; direct receive
              </h2>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Direct receive:</strong> Select NEAR, Solana, Base, or
                  Ethereum to view your permanent wallet address and QR code for
                  direct deposits from any wallet or exchange.
                </li>
                <li>
                  <strong>Deposit from another chain:</strong> Bring assets in
                  from external chains into native NEAR via NEAR Intents with a
                  live quote and time-limited deposit address.
                </li>
              </ul>
            </section>

            {/* Convert & bridge */}
            <section id="convert" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Convert &amp; bridge
              </h2>
              <p>
                Use <strong>Convert &amp; Bridge</strong> to swap between assets
                across your own FLOW wallets (for example, SOL on Solana into
                USDC on Base or NEAR on NEAR Mainnet). Convert &amp; Bridge
                quotes include a <strong>1% FLOW platform fee</strong> settled
                via NEAR Intents alongside network and solver rates. Review the
                live output and drag <strong>Slide to Convert</strong> to
                execute.
              </p>
            </section>

            {/* Payment links */}
            <section id="payment-links" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Request &amp; payment links
              </h2>
              <p>
                Open the <strong>Request</strong> tab and click{" "}
                <strong>+ New request</strong> to create a shareable checkout
                link:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Set a title, optional description, fixed or open amount, and
                  the asset/network you want to receive.
                </li>
                <li>
                  Choose <strong>Unlimited</strong> or set a{" "}
                  <strong>Max payers</strong> limit. FLOW tracks how many people
                  have successfully settled and how many spots remain, closing
                  the link automatically once full.
                </li>
                <li>
                  Pause, resume, copy, or delete any link directly from{" "}
                  <strong>Your requests</strong>. Anyone opening a deleted link
                  sees a clear &ldquo;Link deleted&rdquo; screen.
                </li>
              </ul>
            </section>

            {/* Earn */}
            <section id="earn" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Earn (LiNEAR &amp; Burrow Finance)
              </h2>
              <p>
                Put idle NEAR ecosystem balances to work directly inside the{" "}
                <strong>Earn</strong> tab:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>LiNEAR liquid staking:</strong> Deposit NEAR to
                  receive $LiNEAR and earn auto-compounding staking rewards.
                  Deposits reserve a small NEAR gas buffer. Standard unstaking
                  takes approximately 48 hours (~4 epochs) before you click{" "}
                  <strong>Claim</strong> to settle NEAR back to your wallet.
                </li>
                <li>
                  <strong>Burrow Finance:</strong> Supply USDC on NEAR Mainnet
                  to earn variable lending yield. First-time deposits require a
                  small NEAR storage and gas reserve on-chain.
                </li>
              </ul>
              <p>
                Deposits into any Earn protocol include a one-time{" "}
                <strong>0.15% FLOW platform fee</strong> deducted automatically
                before staking or supplying. Withdrawing or claiming from Earn
                carries a <strong>0% FLOW fee</strong>.
              </p>
            </section>

            {/* Fees */}
            <section id="fees" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Fees
              </h2>
              <p>
                FLOW displays all estimated amounts and platform fees up front
                before you confirm:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <strong>Send &amp; Payment Link checkouts:</strong> 0% FLOW
                  platform fee (standard network gas and any cross-chain solver
                  spread still apply).
                </li>
                <li>
                  <strong>Earn deposits:</strong> 0.15% one-time FLOW platform
                  fee taken on deposit in the deposited asset.{" "}
                  <strong>Earn withdrawals &amp; claims:</strong> 0% FLOW fee.
                </li>
                <li>
                  <strong>Convert &amp; Bridge:</strong> 1% FLOW platform fee
                  included directly in the live NEAR Intents quote.
                </li>
              </ul>
            </section>

            {/* Flow AI Assistant */}
            <section id="assistant" className="scroll-mt-24 space-y-3">
              <h2 className="font-serif text-3xl font-normal text-neutral-950 dark:text-white">
                Flow AI Assistant
              </h2>
              <p>
                Click the Flow AI icon in the top bar to ask questions about
                your balances, recent activity, or cross-chain routes, or to
                draft payment actions in plain English. All outgoing transfers
                still require your explicit confirmation before signing.
              </p>
            </section>
          </article>
        </div>
      </main>
    </PublicSiteChrome>
  );
}
