import type { Metadata } from "next";
import Link from "next/link";
import { DocsShell, type DocsTocItem } from "../../components/docs-shell.tsx";

export const metadata: Metadata = {
  title: "Terms of Service · FLOW",
  description:
    "Plain-English Terms of Service for using FLOW across NEAR, Solana, Base, and Ethereum.",
  alternates: {
    canonical: "https://flow.devhub.forum/terms",
  },
  openGraph: {
    title: "Terms of Service · FLOW",
    description:
      "Plain-English Terms of Service for using FLOW at flow.devhub.forum.",
    url: "https://flow.devhub.forum/terms",
    type: "website",
  },
};

const TERMS_TOC: readonly DocsTocItem[] = [
  { id: "agreeing", label: "Agreeing to these terms" },
  { id: "eligibility", label: "Who can use FLOW" },
  { id: "early-product", label: "Early product notice" },
  { id: "custody", label: "Wallet & MPC security" },
  { id: "routing-earn", label: "Routing, links & Earn" },
  { id: "no-advice", label: "No financial advice" },
  { id: "fees", label: "Fees" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "closing-account", label: "Deleting your account" },
  { id: "as-is", label: "Service provided as is" },
  { id: "contact", label: "Changes & contact" },
];

export default function TermsPage() {
  return (
    <DocsShell activeRoute="terms" eyebrow="Legal" toc={TERMS_TOC}>
      {/* Hero */}
      <h1 className="mt-3 text-balance text-[34px] font-light leading-[1.1] tracking-[-0.025em] text-[#0b0c0e] dark:text-white md:text-[44px] md:leading-[1.06]">
        Terms of Service
      </h1>
      <p className="mt-4 max-w-[64ch] text-pretty text-[17px] leading-[1.6] text-[#5f636a] dark:text-neutral-400">
        Plain-English rules for using the FLOW interface, multi-chain wallets,
        payment links, conversions, and Earn integrations.
      </p>

      {/* Metadata Spec Grid */}
      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 rounded-[20px] bg-[#f3f4f5] dark:bg-white/[0.04] border border-[#e4e6e9]/70 dark:border-white/[0.07] p-5 sm:grid-cols-3 sm:p-6">
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Last updated
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            22 Nov 2026
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Custody model
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            Non-custodial MPC
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Eligibility
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            18+ · Lawful use
          </dd>
        </div>
      </dl>

      {/* Body Prose */}
      <div className="mt-10 space-y-12 text-[16px] leading-[26px] text-[#34373c] dark:text-neutral-300">
        <section id="agreeing" className="scroll-mt-28 space-y-4">
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Agreeing to these terms
          </h2>
          <p>
            These terms apply when you use FLOW at{" "}
            <Link
              href="/"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4"
            >
              flow.devhub.forum
            </Link>
            , including your FLOW account, payment links, guest checkout, and
            Earn integrations. FLOW is an independent software project. By
            creating an account or using the service, you agree to these terms.
            If you do not agree, do not use FLOW.
          </p>
        </section>

        <section
          id="eligibility"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Who can use FLOW
          </h2>
          <p>
            You must be at least 18 years old and legally able to enter into
            these terms in your jurisdiction. You are responsible for ensuring
            that using blockchain networks, digital assets, and DeFi protocols is
            lawful where you live.
          </p>
        </section>

        <section id="early-product" className="scroll-mt-28">
          <div className="rounded-[18px] bg-[#fbf3e4] dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-900/40 p-5 sm:p-6 space-y-2">
            <h2 className="text-[20px] font-normal tracking-[-0.015em] text-[#0b0c0e] dark:text-white">
              FLOW is an early product
            </h2>
            <p className="text-[15px] leading-[24px] text-[#34373c] dark:text-neutral-300">
              FLOW is actively evolving. Features may change, pause, or be
              updated as we refine the platform. Treat the service accordingly
              and never hold more value in FLOW than you are comfortable
              managing on-chain.
            </p>
          </div>
        </section>

        <section
          id="custody"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Your wallet, MPC custody, and security
          </h2>
          <p>
            FLOW provisions multi-chain wallet addresses on NEAR, Solana, Base,
            and Ethereum using NEAR OutLayer MPC infrastructure so you do not
            have to manage raw seed phrases. Transactions are signed only when
            authorized by your authenticated session.
          </p>
          <p>
            Because your email or Google sign-in controls access to your FLOW
            account, you are responsible for keeping your email and Google
            account secure with a strong password and two-factor authentication.
            Blockchain transactions are irreversible once confirmed on-chain,
            and FLOW cannot reverse completed transfers.
          </p>
        </section>

        <section
          id="routing-earn"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Cross-chain routing, payment links, and Earn
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Cross-chain transfers and swaps:</strong> Cross-chain
              deposits, conversions, and guest checkout payments are routed
              through NEAR Intents (1Click) solvers. Quotes are time-limited and
              depend on live market liquidity. Always send the exact quoted
              asset on the specified network before the deposit window expires.
            </li>
            <li>
              <strong>Payment links:</strong> When you create a payment link,
              you set the amount (fixed or open), destination asset, fee payer
              preference, and optional maximum payer limit. Once a link is
              paused, deleted, or reaches its payer limit, new deposits are
              blocked.
            </li>
            <li>
              <strong>Earn (LiNEAR &amp; Burrow Finance):</strong> FLOW
              provides a direct interface to third-party smart contracts on NEAR
              Mainnet (LiNEAR liquid staking and Burrow Finance USDC lending).
              APYs are variable and set by on-chain protocol state. Standard
              LiNEAR unstaking carries an on-chain cooldown of approximately 48
              hours (~4 epochs) before claiming. Third-party smart contract risk
              rests with the user.
            </li>
          </ul>
        </section>

        <section
          id="no-advice"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            No financial, investment, or tax advice
          </h2>
          <p>
            Nothing in FLOW, including the app, documentation, whitepaper, or
            Flow AI Assistant responses, is financial, investment, legal, or tax
            advice. You alone decide how to hold, move, or stake your assets and
            are responsible for any taxes in your jurisdiction.
          </p>
        </section>

        <section
          id="fees"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Fees
          </h2>
          <p>
            Before you confirm any transfer, conversion, or Earn deposit, FLOW
            displays the estimated receive amount and applicable fees:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>Direct sends (same asset) &amp; Payment Link checkouts:</strong>{" "}
              0% FLOW platform fee. Standard underlying network gas fees apply
              (and NEAR reserves a small gas buffer for transactions and
              contract storage). Cross-chain payment link checkouts reflect live
              solver spreads and network execution fees.
            </li>
            <li>
              <strong>Cross-asset sends:</strong> 0.3% FLOW platform fee (30
              bps) when sending one asset and settling a different asset via
              NEAR Intents, charged from your wallet balance alongside solver
              spreads and network settlement costs and shown in the live quote
              before you slide to confirm.
            </li>
            <li>
              <strong>Convert &amp; Bridge:</strong> 1.5% FLOW platform fee (150
              bps) charged from your wallet balance via NEAR Intents before you
              slide to confirm, in addition to solver spreads and network
              settlement costs.
            </li>
            <li>
              <strong>Earn deposits &amp; withdrawals:</strong> 0.3% one-time
              FLOW platform fee (30 bps) charged from your wallet balance when
              moving funds into an Earn protocol. Moving funds out of Earn
              (withdrawals and claims) carries a 0% FLOW fee. Protocol-level
              fees and on-chain NEAR storage deposits (for example, Burrow
              first-time storage) are handled on-chain by the respective
              protocol.
            </li>
          </ul>
          <p className="text-[14.5px] text-[#5f636a] dark:text-neutral-400">
            All FLOW platform fees are charged from your remaining wallet
            balance (like network transaction fees) rather than deducted from
            the amount being sent or deposited, and clicking Max automatically
            reserves room for both gas and applicable platform fees. Collected
            fees are routed to the FLOW treasury and settled in NEAR to support
            protocol operations and account sponsorship.
          </p>
        </section>

        <section
          id="acceptable-use"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Acceptable use
          </h2>
          <p>
            You agree not to use FLOW for illegal activity, fraud, money
            laundering, sanctions evasion, exploiting software bugs, or
            attempting to disrupt or overload our infrastructure or third-party
            RPCs.
          </p>
        </section>

        <section
          id="closing-account"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Closing or deleting your account
          </h2>
          <p>
            You can delete your account at any time from{" "}
            <Link
              href="/security"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4"
            >
              Settings
            </Link>
            . Withdraw any remaining funds before deleting your account, as
            account deletion permanently revokes access and cannot be undone.
          </p>
        </section>

        <section
          id="as-is"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Service provided as is
          </h2>
          <p>
            FLOW is provided on an &ldquo;as is&rdquo; and &ldquo;as
            available&rdquo; basis without warranties of any kind. To the
            maximum extent permitted by law, FLOW and its contributors are not
            liable for indirect or consequential losses, blockchain network
            outages, third-party protocol failures, or user errors such as
            sending funds to the wrong address or unsupported network.
          </p>
        </section>

        <section
          id="contact"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Changes and contact
          </h2>
          <p>
            We may update these terms as FLOW grows. Continued use after updates
            means you agree to the latest version. Questions? Reach us at{" "}
            <a
              href="mailto:support@flow.devhub.forum"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4"
            >
              support@flow.devhub.forum
            </a>
            .
          </p>
        </section>
      </div>
    </DocsShell>
  );
}
