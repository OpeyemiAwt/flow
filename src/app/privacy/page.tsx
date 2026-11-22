import type { Metadata } from "next";
import Link from "next/link";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";

export const metadata: Metadata = {
  title: "Privacy Policy · FLOW",
  description:
    "How FLOW collects, uses, stores, and protects your data across flow.devhub.forum.",
  alternates: {
    canonical: "https://flow.devhub.forum/privacy",
  },
  openGraph: {
    title: "Privacy Policy · FLOW",
    description:
      "Plain-English privacy policy for FLOW across NEAR, Solana, Base, and Ethereum.",
    url: "https://flow.devhub.forum/privacy",
    type: "website",
  },
};

export default function PrivacyPage() {
  return (
    <PublicSiteChrome activeRoute="privacy">
      <main className="mx-auto max-w-3xl px-5 sm:px-8 pt-10 pb-24 text-neutral-800 dark:text-neutral-200">
        {/* Header */}
        <header className="pb-8 border-b border-neutral-200/80 dark:border-white/[0.08]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF1A1A]">
            Legal
          </p>
          <h1 className="mt-2 font-serif text-4xl sm:text-5xl font-normal tracking-tight text-neutral-950 dark:text-white">
            Privacy Policy
          </h1>
          <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
            Last updated: 22 November 2026
          </p>
        </header>

        {/* The short version */}
        <section className="mt-8 rounded-[24px] border border-neutral-200/80 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 sm:p-7 shadow-xs space-y-3">
          <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
            The short version
          </h2>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            FLOW is a chain-abstracted payment and wallet application built on
            NEAR OutLayer MPC custody and NEAR Intents routing. We collect only
            what we need to run your account: your sign-in details, your @flow
            ID, your derived public wallet addresses on NEAR, Solana, Base, and
            Ethereum, and your in-app payment activity.
          </p>
          <p className="text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
            We show <strong>no ads</strong>, include{" "}
            <strong>no third-party advertising trackers</strong>, and{" "}
            <strong>never sell your data</strong>. You can update your profile
            or permanently delete your account at any time from Settings.
          </p>
        </section>

        <div className="mt-10 space-y-10 text-sm leading-relaxed">
          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Who we are
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              FLOW is an independent software project accessible at{" "}
              <Link
                href="/"
                className="underline decoration-neutral-300 hover:decoration-neutral-900 dark:hover:decoration-white"
              >
                flow.devhub.forum
              </Link>
              . This policy explains what personal data is collected when you
              use the FLOW web application, guest checkout links, and
              documentation.
            </p>
            <p className="text-neutral-700 dark:text-neutral-300">
              For questions about this policy or your data, contact{" "}
              <a
                href="mailto:support@flow.devhub.forum"
                className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
              >
                support@flow.devhub.forum
              </a>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Who can use FLOW
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              FLOW is intended for individuals aged 18 and older. We do not
              knowingly collect personal data from anyone under 18. If you
              believe someone under 18 has created an account, contact us and we
              will delete it.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              What we collect
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              What we collect depends on the features you use, grouped by
              feature below.
            </p>

            <div className="space-y-4">
              <div className="rounded-2xl border border-neutral-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] p-5 space-y-2">
                <h3 className="font-semibold text-neutral-950 dark:text-white">
                  Your account and sign-in
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-neutral-700 dark:text-neutral-300">
                  <li>
                    <strong>Sign-in details:</strong> your email address, name,
                    and provider identifier when you sign in with Email OTP or
                    Google SSO.
                  </li>
                  <li>
                    <strong>Profile and @flow ID:</strong> the display name,
                    optional profile photo (stored in your browser or profile
                    preferences), and @flow ID handle you claim so others can
                    pay you by name.
                  </li>
                  <li>
                    <strong>Session and security metadata:</strong> active
                    browser session tokens, timestamps, IP address, and user
                    agent so you can view and revoke sessions in Settings.
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-neutral-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] p-5 space-y-2">
                <h3 className="font-semibold text-neutral-950 dark:text-white">
                  Wallets, transfers, and payment links
                </h3>
                <ul className="list-disc pl-5 space-y-1.5 text-neutral-700 dark:text-neutral-300">
                  <li>
                    <strong>Public blockchain addresses:</strong> your derived
                    NEAR, Solana, Base, and Ethereum addresses and their indexed
                    on-chain balances and transaction hashes.
                  </li>
                  <li>
                    <strong>Payment links and guest checkout:</strong> link
                    titles, optional descriptions, requested amounts, payer
                    limits, settlement status, and any refund address a guest
                    payer enters for cross-chain settlement.
                  </li>
                  <li>
                    <strong>Earn activity:</strong> protocol deposit, unstake,
                    and claim records for LiNEAR and Burrow Finance on NEAR
                    Mainnet.
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl border border-neutral-200/70 dark:border-white/[0.08] bg-white/70 dark:bg-white/[0.02] p-5 space-y-2">
                <h3 className="font-semibold text-neutral-950 dark:text-white">
                  Flow AI Assistant
                </h3>
                <p className="text-neutral-700 dark:text-neutral-300">
                  If you use the Flow AI Assistant, the messages you send and
                  the account context needed to answer your question (such as
                  balances or transfer drafts) are processed by our configured
                  AI model provider to generate responses. Do not paste private
                  keys or sensitive secrets into chat.
                </p>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              How we use your data
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 text-neutral-700 dark:text-neutral-300">
              <li>
                Authenticate your sessions and protect your account against
                unauthorized access or abuse.
              </li>
              <li>
                Provision your multi-chain wallet addresses, quote cross-chain
                routes, and track settlement finality.
              </li>
              <li>
                Index your balances, activity history, payment link usage
                counts, and in-app notifications.
              </li>
              <li>
                Maintain reliability, diagnose bugs, and prevent spam or rate
                limit abuse.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Who we share data with
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              We only share the minimum data required with infrastructure
              partners that make FLOW work:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-neutral-700 dark:text-neutral-300">
              <li>
                <strong>NEAR OutLayer MPC &amp; blockchain RPCs:</strong> to
                derive wallets, sign authorized transactions, and verify
                on-chain settlement on NEAR, Solana, Base, and Ethereum.
              </li>
              <li>
                <strong>NEAR Intents (1Click):</strong> destination addresses,
                amounts, and refund addresses needed to quote and settle
                cross-chain transfers.
              </li>
              <li>
                <strong>Hosting, database, and email delivery:</strong> cloud
                infrastructure providers that host the application, database,
                and transactional OTP emails.
              </li>
              <li>
                <strong>Public blockchains:</strong> transactions you broadcast
                are permanently visible on public blockchains by design.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              How long we keep data and account deletion
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              We keep your account data while your account is active. You can
              delete your account directly inside{" "}
              <Link
                href="/security"
                className="font-medium text-neutral-950 dark:text-white underline decoration-neutral-300"
              >
                Settings
              </Link>{" "}
              at any time. Deleting your account immediately revokes all active
              sessions, removes your sign-in identities and profile preferences,
              releases your @flow ID, disables your payment links, and
              anonymizes your account record. Public on-chain transactions
              cannot be erased from their respective blockchains.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Cookies and browser storage
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              FLOW uses essential HTTP-only session cookies to keep you signed
              in and local browser storage for preferences like light/dark
              theme, language selection, and hiding balances. We do not use
              third-party advertising cookies.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="font-serif text-2xl font-normal text-neutral-950 dark:text-white">
              Changes to this policy
            </h2>
            <p className="text-neutral-700 dark:text-neutral-300">
              As FLOW evolves, we may update this policy and change the date at
              the top of the page. Continued use of FLOW after an update means
              you accept the revised policy.
            </p>
          </section>
        </div>
      </main>
    </PublicSiteChrome>
  );
}
