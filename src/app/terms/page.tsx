import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";

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

export default function TermsPage() {
  return (
    <PublicSiteChrome activeRoute="terms">
      <main className="mx-auto max-w-3xl px-5 sm:px-8 pt-10 pb-24 text-neutral-800 dark:text-neutral-200">
        {/* Header */}
        <header className="pb-8 border-b border-neutral-200/80 dark:border-white/[0.08]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF1A1A]">
            Legal
          </p>
          <h1 className="mt-2 font-serif text-4xl sm:text-5xl font-normal tracking-tight text-neutral-950 dark:text-white">
            Terms of Service
          </h1>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            Last updated: 22 November 2026
          </p>
        </header>

        <div className="mt-10 space-y-10 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Agreeing to these terms
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              These terms apply when you use FLOW at{" "}
              <Link
                href="/"
                className="underline decoration-neutral-300 hover:decoration-neutral-900 dark:hover:decoration-white"
              >
                flow.devhub.forum
              </Link>
              , including your FLOW account, payment links, guest checkout, and
              Earn integrations. FLOW is an independent software project. By
              creating an account or using the service, you agree to these
              terms. If you do not agree, do not use FLOW.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Who can use FLOW
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              You must be at least 18 years old and legally able to enter into
              these terms in your jurisdiction. You are responsible for ensuring
              that using blockchain networks, digital assets, and DeFi protocols
              is lawful where you live.
            </p>
          </section>

          <section className="rounded-[24px] border border-amber-200/80 dark:border-amber-900/40 bg-amber-50/60 dark:bg-amber-950/20 p-6 space-y-2">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              FLOW is an early product
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              FLOW is actively evolving. Features may change, pause, or be
              updated as we refine the platform. Treat the service accordingly
              and never hold more value in FLOW than you are comfortable
              managing on-chain.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Your wallet, MPC custody, and security
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              FLOW provisions multi-chain wallet addresses on NEAR, Solana,
              Base, and Ethereum using NEAR OutLayer MPC infrastructure so you
              do not have to manage raw seed phrases. Transactions are signed
              only when authorized by your authenticated session.
            </p>
            <p className="text-neutral-700 dark:text-neutral-300">
              Because your email or Google sign-in controls access to your FLOW
              account, you are responsible for keeping your email and Google
              account secure with a strong password and two-factor
              authentication. Blockchain transactions are irreversible once
              confirmed on-chain, and FLOW cannot reverse completed transfers.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Cross-chain routing, payment links, and Earn
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-neutral-700 dark:text-neutral-300">
              <li>
                <strong>Cross-chain transfers and swaps:</strong> Cross-chain
                deposits, conversions, and guest checkout payments are routed
                through NEAR Intents (1Click) solvers. Quotes are time-limited
                and depend on live market liquidity. Always send the exact
                quoted asset on the specified network before the deposit window
                expires.
              </li>
              <li>
                <strong>Payment links:</strong> When you create a payment link,
                you set the amount (fixed or open), destination asset, and
                optional maximum payer limit. Once a link is paused, deleted, or
                reaches its payer limit, new deposits are blocked.
              </li>
              <li>
                <strong>Earn (LiNEAR &amp; Burrow Finance):</strong> FLOW
                provides a direct interface to third-party smart contracts on
                NEAR Mainnet (LiNEAR liquid staking and Burrow Finance USDC
                lending). APYs are variable and set by on-chain protocol state.
                Standard LiNEAR unstaking carries an on-chain cooldown of
                approximately 48 hours (~4 epochs) before claiming. Third-party
                smart contract risk rests with the user.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              No financial, investment, or tax advice
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              Nothing in FLOW, including the app, documentation, whitepaper, or
              Flow AI Assistant responses, is financial, investment, legal, or
              tax advice. You alone decide how to hold, move, or stake your
              assets and are responsible for any taxes in your jurisdiction.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Fees
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              Before you confirm any transfer, swap, or stake, FLOW displays the
              estimated receive amount and applicable route details:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-neutral-700 dark:text-neutral-300">
              <li>
                <strong>Direct on-chain transfers:</strong> standard network gas
                fees apply (NEAR reserves a small gas buffer for transactions
                and contract storage).
              </li>
              <li>
                <strong>Cross-chain routes and conversions:</strong> solver
                spreads and network execution fees are reflected in the live
                quote before you slide to confirm.
              </li>
              <li>
                <strong>Earn protocols:</strong> protocol-level fees and
                on-chain NEAR storage deposits (for example, Burrow first-time
                storage) are handled on-chain by the respective protocol.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Acceptable use
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              You agree not to use FLOW for illegal activity, fraud, money
              laundering, sanctions evasion, exploiting software bugs, or
              attempting to disrupt or overload our infrastructure or third-party
              RPCs.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Closing or deleting your account
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              You can delete your account at any time from{" "}
              <Link
                href="/security"
                className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
              >
                Settings
              </Link>
              . Withdraw any remaining funds before deleting your account, as
              account deletion permanently revokes access and cannot be undone.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Service provided as is
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              FLOW is provided on an &ldquo;as is&rdquo; and &ldquo;as
              available&rdquo; basis without warranties of any kind. To the
              maximum extent permitted by law, FLOW and its contributors are not
              liable for indirect or consequential losses, blockchain network
              outages, third-party protocol failures, or user errors such as
              sending funds to the wrong address or unsupported network.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Changes and contact
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              We may update these terms as FLOW grows. Continued use after
              updates means you agree to the latest version. Questions? Reach us
              at{" "}
              <a
                href="mailto:support@flow.devhub.forum"
                className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
              >
                support@flow.devhub.forum
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </PublicSiteChrome>
  );
}
