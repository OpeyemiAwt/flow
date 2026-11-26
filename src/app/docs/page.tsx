import type { Metadata } from "next";
import Link from "next/link";
import { DocsShell, type DocsTocItem } from "../../components/docs-shell.tsx";
import { MAINNET_SUPPORTED_DEPLOYMENTS } from "../../domain/supported-assets-catalog.ts";

export const metadata: Metadata = {
  title: "Docs · FLOW",
  description:
    "Multi-chain money without the friction wall. Learn how to send, receive, convert, request payments, and earn yield across NEAR, Solana, Base, and Ethereum.",
  alternates: {
    canonical: "https://flow.devhub.forum/docs",
  },
  openGraph: {
    title: "FLOW Documentation",
    description:
      "What is FLOW? Why are we building? Practical instructions for using FLOW safely across NEAR, Solana, Ethereum, and Base.",
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

const DOCS_TOC: readonly DocsTocItem[] = [
  { id: "introduction", label: "What is FLOW?" },
  { id: "quickstart", label: "Quickstart" },
  { id: "how-flow-works", label: "How FLOW works" },
  { id: "send", label: "Send & @flow ID" },
  { id: "payment-links", label: "Payment links" },
  { id: "convert", label: "Convert & Bridge" },
  { id: "earn", label: "Earn (LiNEAR & Burrow)" },
  { id: "assistant", label: "Flow AI Assistant" },
  { id: "networks", label: "Networks & assets" },
  { id: "security", label: "Security & custody" },
  { id: "fees", label: "Fees" },
];

export default function DocsPage() {
  return (
    <DocsShell activeRoute="docs" eyebrow="Start here" toc={DOCS_TOC}>
      {/* Hero */}
      <h1 className="mt-3 text-balance text-[34px] font-light leading-[1.1] tracking-[-0.025em] text-[#0b0c0e] dark:text-white md:text-[44px] md:leading-[1.06]">
        Docs
      </h1>
      <p className="mt-4 max-w-[64ch] text-pretty text-[17px] leading-[1.6] text-[#5f636a] dark:text-neutral-400">
        Multi-chain payments and yield on public networks, explained without the
        jargon wall. Start here.
      </p>

      {/* Body Prose */}
      <div className="mt-10 space-y-12 text-[16px] leading-[26px] text-[#34373c] dark:text-neutral-300">
        {/* Introduction */}
        <section id="introduction" className="scroll-mt-28 space-y-5">
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            What is FLOW?
          </h2>
          <p>
            FLOW is a non-custodial multi-chain payment wallet that lets you
            send, receive, convert, request payments, and earn native yield
            across <strong>NEAR, Solana, Base, and Ethereum</strong> from one
            account, without managing seed phrases or manually switching
            networks.
          </p>
          <p>
            You sign in with Google or an email one-time code, and FLOW
            provisions real mainnet addresses on all four networks backed by
            OutLayer MPC key management. Cross-chain swaps, bridges, and
            multi-chain payment links settle through NEAR Intents (1Click). See
            the{" "}
            <Link
              href="/whitepaper"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4 hover:decoration-[#0b0c0e] dark:hover:decoration-white transition-colors"
            >
              FLOW Whitepaper
            </Link>{" "}
            for the full architecture.
          </p>

          {/* Gloam-style "One picture" 3-tile visual figure */}
          <figure className="my-8 rounded-[22px] border border-[#e4e6e9] dark:border-white/[0.08] p-2 sm:p-2.5">
            <figcaption className="px-3 pb-3 pt-2.5 sm:px-3.5">
              <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-400">
                One picture
              </span>
            </figcaption>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="flex flex-col rounded-[16px] bg-[#f3f4f5] dark:bg-white/[0.04] p-5">
                <span className="text-[13px] text-[#5f636a] dark:text-neutral-400">
                  Your account
                </span>
                <span className="mt-2.5 block text-[22px] font-light leading-tight tracking-[-0.015em] text-[#0b0c0e] dark:text-white">
                  4 mainnets
                </span>
                <div className="mt-4 flex flex-col gap-1 rounded-xl bg-white dark:bg-[#141518] border border-[#e4e6e9]/70 dark:border-white/[0.06] px-3.5 py-3">
                  <span className="text-[11.5px] text-[#6b6f76] dark:text-neutral-400">
                    Provisioned automatically
                  </span>
                  <span className="text-[14px] font-medium text-[#0b0c0e] dark:text-white tabular-nums">
                    NEAR · SOL · Base · ETH
                  </span>
                </div>
                <p className="mt-4 text-[13.5px] leading-[1.55] text-[#5f636a] dark:text-neutral-400">
                  One login creates real non-custodial addresses you control on
                  every supported chain.
                </p>
              </div>

              <div className="flex flex-col rounded-[16px] bg-[#f3f4f5] dark:bg-white/[0.04] p-5">
                <span className="text-[13px] text-[#5f636a] dark:text-neutral-400">
                  Payments &amp; swaps
                </span>
                <span className="mt-2.5 block text-[22px] font-light leading-tight tracking-[-0.015em] text-[#0b0c0e] dark:text-white">
                  Any chain
                </span>
                <div className="mt-4 flex flex-col gap-1 rounded-xl bg-white dark:bg-[#141518] border border-[#e4e6e9]/70 dark:border-white/[0.06] px-3.5 py-3">
                  <span className="text-[11.5px] text-[#6b6f76] dark:text-neutral-400">
                    Powered by NEAR Intents
                  </span>
                  <span className="text-[14px] font-medium text-[#0b0c0e] dark:text-white tabular-nums">
                    0% Direct · 0.3% Cross-asset · 1.5% Convert
                  </span>
                </div>
                <p className="mt-4 text-[13.5px] leading-[1.55] text-[#5f636a] dark:text-neutral-400">
                  Share a payment link or convert between chains with live
                  quotes before you confirm.
                </p>
              </div>

              <div className="flex flex-col rounded-[16px] bg-[#f3f4f5] dark:bg-white/[0.04] p-5">
                <span className="text-[13px] text-[#5f636a] dark:text-neutral-400">
                  Native yield
                </span>
                <span className="mt-2.5 block text-[22px] font-light leading-tight tracking-[-0.015em] text-[#0b0c0e] dark:text-white">
                  Earn
                </span>
                <div className="mt-4 flex flex-col gap-1 rounded-xl bg-white dark:bg-[#141518] border border-[#e4e6e9]/70 dark:border-white/[0.06] px-3.5 py-3">
                  <span className="text-[11.5px] text-[#6b6f76] dark:text-neutral-400">
                    LiNEAR &amp; Burrow
                  </span>
                  <span className="text-[14px] font-medium text-[#0b0c0e] dark:text-white tabular-nums">
                    0.3% in · 0% withdraw
                  </span>
                </div>
                <p className="mt-4 text-[13.5px] leading-[1.55] text-[#5f636a] dark:text-neutral-400">
                  Stake NEAR or supply USDC directly from your wallet with zero
                  withdrawal fees.
                </p>
              </div>
            </div>
          </figure>
        </section>

        {/* Quickstart */}
        <section
          id="quickstart"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Quickstart
          </h2>
          <ol className="space-y-3 list-decimal pl-5">
            <li>
              <strong>Sign in:</strong> Go to{" "}
              <Link
                href="/sign-in"
                className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4"
              >
                Open app
              </Link>{" "}
              and authenticate with Google or an email one-time code.
            </li>
            <li>
              <strong>Claim your @flow ID:</strong> Choose a handle (for
              example, <code className="rounded-md bg-[#f3f4f5] dark:bg-white/[0.08] px-1.5 py-0.5 text-[14px]">@alex</code>) so anyone
              can send you funds without copying a raw blockchain address.
            </li>
            <li>
              <strong>Fund your wallet:</strong> Open <strong>Receive</strong>{" "}
              to copy your NEAR, Solana, Base, or Ethereum address, or create a
              shareable <strong>Payment Link</strong>.
            </li>
            <li>
              <strong>Send, convert, or earn:</strong> Move money across
              chains, swap assets, or deposit NEAR / USDC into Earn in one step.
            </li>
          </ol>
        </section>

        {/* How FLOW works */}
        <section
          id="how-flow-works"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            How FLOW works
          </h2>
          <p>
            FLOW separates identity, custody, routing, and yield into four clean
            layers so you get web-app simplicity with real on-chain ownership:
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              {
                title: "1. Identity & @flow ID",
                body: "Your login session maps to your profile and optional @flow handle, resolving human-readable names to verified wallet addresses.",
              },
              {
                title: "2. Non-custodial MPC wallets",
                body: "OutLayer provisions real mainnet addresses on NEAR, Solana, Base, and Ethereum protected by on-chain wallet policies.",
              },
              {
                title: "3. NEAR Intents (1Click) routing",
                body: "Cross-chain swaps, bridges, and multi-chain payment links use signed quotes from 1Click solvers with live output previews.",
              },
              {
                title: "4. Direct protocol Earn",
                body: "Earn deposits go straight from your own NEAR wallet into LiNEAR Protocol or Burrow Finance. Positions stay in your wallet.",
              },
            ].map((card) => (
              <div
                key={card.title}
                className="rounded-[16px] bg-[#f3f4f5] dark:bg-white/[0.04] p-4 sm:p-5"
              >
                <p className="text-[14.5px] font-medium text-[#0b0c0e] dark:text-white">
                  {card.title}
                </p>
                <p className="mt-1.5 text-[14px] leading-[1.55] text-[#5f636a] dark:text-neutral-400">
                  {card.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Send & @flow ID */}
        <section
          id="send"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Send &amp; @flow ID
          </h2>
          <p>
            Open the <strong>Send</strong> tab to transfer any supported asset
            to a raw wallet address or a recipient&apos;s{" "}
            <strong>@flow ID</strong>. Same-asset direct transfers execute
            on-chain with <strong>0% FLOW platform fee</strong>. Cross-asset
            sends (sending one asset while the recipient receives another)
            automatically route through NEAR Intents with a{" "}
            <strong>0.3% FLOW platform fee</strong> charged from your wallet
            balance so the full amount you enter is routed, and show the exact
            estimated receive amount in both asset and USD before you slide to
            confirm.
          </p>
        </section>

        {/* Payment links */}
        <section
          id="payment-links"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Payment links
          </h2>
          <p>
            Open <strong>Request</strong> and click{" "}
            <strong>+ New request</strong> to create a shareable checkout page.
            Your payer can settle from any supported chain or coin without
            needing a FLOW account.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Fixed or open amount:</strong> Lock an exact settlement
              amount or let the payer enter their own amount at checkout.
            </li>
            <li>
              <strong>Who pays routing fees:</strong> On fixed-amount links,
              choose whether <strong>Your payer</strong> covers cross-chain
              routing fees (you receive the exact amount) or{" "}
              <strong>You</strong> absorb them (deducted from settlement with a
              live net estimate shown up front).
            </li>
            <li>
              <strong>Max payers &amp; tracking:</strong> Choose Unlimited or
              set a maximum payer count. FLOW tracks completed settlements and
              closes the link automatically when full.
            </li>
            <li>
              <strong>Pause or delete anytime:</strong> Manage links in{" "}
              <strong>Your requests</strong>. Anyone opening a deleted link sees
              a clear &ldquo;Link deleted&rdquo; state.
            </li>
          </ul>
        </section>

        {/* Convert & Bridge */}
        <section
          id="convert"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Convert &amp; Bridge
          </h2>
          <p>
            Use <strong>Convert &amp; Bridge</strong> to swap between assets
            across your own FLOW wallets (for example, SOL on Solana into USDC
            on Base or NEAR on NEAR Mainnet). Live quotes are fetched from NEAR
            Intents / 1Click and display the{" "}
            <strong>1.5% FLOW platform fee</strong> (charged from your wallet
            balance rather than deducted from the converted amount) alongside
            solver rates, USD estimates, and network execution costs before you
            slide to confirm.
          </p>
        </section>

        {/* Earn */}
        <section
          id="earn"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Earn (LiNEAR &amp; Burrow Finance)
          </h2>
          <p>
            Put idle NEAR ecosystem balances to work directly from your own
            wallet inside the <strong>Earn</strong> tab:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>LiNEAR liquid staking:</strong> Deposit NEAR to receive
              $LiNEAR and earn auto-compounding staking rewards. Standard
              unstaking follows NEAR&apos;s ~48-hour (~4 epoch) cooldown before
              you click <strong>Claim</strong> to settle NEAR back to your
              wallet.
            </li>
            <li>
              <strong>Burrow Finance:</strong> Supply USDC on NEAR Mainnet to
              earn variable lending yield. First-time deposits reserve a small
              on-chain NEAR storage deposit.
            </li>
          </ul>
          <div className="rounded-[14px] bg-[#f3f4f5] dark:bg-white/[0.04] px-5 py-4 text-[14px] leading-relaxed text-[#5f636a] dark:text-neutral-400">
            <strong className="text-[#0b0c0e] dark:text-white">
              One-shot deposit fee:
            </strong>{" "}
            Moving funds into an Earn protocol includes a{" "}
            <strong className="text-[#0b0c0e] dark:text-white">0.3%</strong>{" "}
            FLOW platform fee charged from your wallet balance on deposit so
            your full entered amount is supplied. Moving funds out of Earn
            (withdrawals and claims) carries a{" "}
            <strong className="text-[#0b0c0e] dark:text-white">0%</strong> FLOW
            fee.
          </div>
        </section>

        {/* Flow AI Assistant */}
        <section
          id="assistant"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Flow AI Assistant
          </h2>
          <p>
            Open the Flow AI Assistant to inspect your balances, check recent
            activity, preview cross-chain conversion quotes, or draft sends in
            plain English. Every financial action still requires your explicit
            confirmation before signing.
          </p>
        </section>

        {/* Networks & assets */}
        <section
          id="networks"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Networks &amp; assets
          </h2>
          <p>
            FLOW currently supports live mainnet balances, sends, payment links,
            and conversions across four networks:
          </p>
          <div className="overflow-hidden rounded-[16px] border border-[#e4e6e9] dark:border-white/[0.08]">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-[#f3f4f5] dark:bg-white/[0.04] text-[12px] font-medium uppercase tracking-[0.06em] text-[#5f636a] dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Network</th>
                  <th className="px-4 py-3">Standard</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e4e6e9] dark:divide-white/[0.06]">
                {MAINNET_SUPPORTED_DEPLOYMENTS.map((dep) => (
                  <tr key={dep.id}>
                    <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                      {dep.symbol}
                    </td>
                    <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                      {dep.networkName}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12.5px] text-[#6b6f76] dark:text-neutral-400">
                      {dep.standard}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Security & custody */}
        <section
          id="security"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Security &amp; custody
          </h2>
          <p>
            FLOW wallets are non-custodial MPC accounts provisioned via
            OutLayer. In <strong>Settings</strong>, you can manage active
            sessions, revoke other devices, connect Google sign-in, review
            privacy and legal policies, or permanently delete your FLOW account
            at any time.
          </p>
        </section>

        {/* Fees */}
        <section
          id="fees"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Fees
          </h2>
          <p>
            FLOW displays all estimated receive amounts and applicable fees
            before you confirm any transaction:
          </p>
          <div className="overflow-hidden rounded-[16px] border border-[#e4e6e9] dark:border-white/[0.08]">
            <table className="w-full text-left text-[14px]">
              <thead className="bg-[#f3f4f5] dark:bg-white/[0.04] text-[12px] font-medium uppercase tracking-[0.06em] text-[#5f636a] dark:text-neutral-400">
                <tr>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">FLOW Fee</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e4e6e9] dark:divide-white/[0.06]">
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    NEAR-to-NEAR Send &amp; Convert
                  </td>
                  <td className="px-4 py-3 font-medium text-[#2e7d53] dark:text-emerald-400">
                    0% + Gas Sponsored
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    FLOW pays NEAR gas and token storage deposits when both
                    source and destination are on NEAR Mainnet.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    Direct sends (same asset, other chains)
                  </td>
                  <td className="px-4 py-3 font-medium text-[#2e7d53] dark:text-emerald-400">
                    0%
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    Underlying network gas only.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    Cross-chain sends
                  </td>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    0.3%
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    Charged from wallet balance when sending across chains;
                    shown in the live quote.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    Payment Link checkouts
                  </td>
                  <td className="px-4 py-3 font-medium text-[#2e7d53] dark:text-emerald-400">
                    0%
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    Creator chooses whether payer or creator absorbs routing fees.
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
                    One-shot fee charged from wallet balance on deposit.
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-[#0b0c0e] dark:text-white">
                    Earn withdrawals &amp; claims
                  </td>
                  <td className="px-4 py-3 font-medium text-[#2e7d53] dark:text-emerald-400">
                    0%
                  </td>
                  <td className="px-4 py-3 text-[#5f636a] dark:text-neutral-400">
                    Standard NEAR gas only.
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
                    Charged from wallet balance via the live NEAR Intents /
                    1Click quote.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </DocsShell>
  );
}
