import type { Metadata } from "next";
import Link from "next/link";
import { DocsShell, type DocsTocItem } from "../../components/docs-shell.tsx";

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

const PRIVACY_TOC: readonly DocsTocItem[] = [
  { id: "short-version", label: "The short version" },
  { id: "who-we-are", label: "Who we are" },
  { id: "eligibility", label: "Who can use FLOW" },
  { id: "what-we-collect", label: "What we collect" },
  { id: "how-we-use", label: "How we use your data" },
  { id: "sharing", label: "Who we share data with" },
  { id: "retention", label: "Retention & deletion" },
  { id: "cookies", label: "Cookies & storage" },
  { id: "changes", label: "Changes to this policy" },
];

export default function PrivacyPage() {
  return (
    <DocsShell activeRoute="privacy" eyebrow="Legal" toc={PRIVACY_TOC}>
      {/* Hero */}
      <h1 className="mt-3 text-balance text-[34px] font-light leading-[1.1] tracking-[-0.025em] text-[#0b0c0e] dark:text-white md:text-[44px] md:leading-[1.06]">
        Privacy Policy
      </h1>
      <p className="mt-4 max-w-[64ch] text-pretty text-[17px] leading-[1.6] text-[#5f636a] dark:text-neutral-400">
        Plain-English overview of what FLOW collects, what stays private, and
        the controls you have over your account data.
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
            Tracking &amp; ads
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            None · Never sold
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Account deletion
          </dt>
          <dd className="mt-1.5 text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
            Self-serve in Settings
          </dd>
        </div>
      </dl>

      {/* Body Prose */}
      <div className="mt-10 space-y-12 text-[16px] leading-[26px] text-[#34373c] dark:text-neutral-300">
        <section id="short-version" className="scroll-mt-28 space-y-4">
          <div className="rounded-[18px] bg-[#f3f4f5] dark:bg-white/[0.04] p-5 sm:p-6 space-y-3">
            <h2 className="text-[20px] font-normal tracking-[-0.015em] text-[#0b0c0e] dark:text-white">
              The short version
            </h2>
            <p className="text-[15px] leading-[24px] text-[#34373c] dark:text-neutral-300">
              FLOW is a chain-abstracted payment and wallet application built on
              NEAR OutLayer MPC custody and NEAR Intents routing. We collect
              only what we need to run your account: your sign-in details, your
              @flow ID, your derived public wallet addresses on NEAR, Solana,
              Base, and Ethereum, and your in-app payment activity.
            </p>
            <p className="text-[15px] leading-[24px] text-[#34373c] dark:text-neutral-300">
              We show <strong>no ads</strong>, include{" "}
              <strong>no third-party advertising trackers</strong>, and{" "}
              <strong>never sell your data</strong>. You can update your profile
              or permanently delete your account at any time from Settings.
            </p>
          </div>
        </section>

        <section
          id="who-we-are"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Who we are
          </h2>
          <p>
            FLOW is an independent software project accessible at{" "}
            <Link
              href="/"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4 hover:decoration-[#0b0c0e] dark:hover:decoration-white"
            >
              flow.devhub.forum
            </Link>
            . This policy explains what personal data is collected when you use
            the FLOW web application, guest checkout links, and documentation.
          </p>
          <p>
            For questions about this policy or your data, contact{" "}
            <a
              href="mailto:support@flow.devhub.forum"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4"
            >
              support@flow.devhub.forum
            </a>
            .
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
            FLOW is intended for individuals aged 18 and older. We do not
            knowingly collect personal data from anyone under 18. If you believe
            someone under 18 has created an account, contact us and we will
            delete it.
          </p>
        </section>

        <section
          id="what-we-collect"
          className="scroll-mt-28 space-y-5 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            What we collect
          </h2>
          <p>
            What we collect depends on the features you use, grouped by feature
            below.
          </p>

          <div className="space-y-3">
            <div className="rounded-[16px] border border-[#e4e6e9] dark:border-white/[0.08] bg-[#f3f4f5]/50 dark:bg-white/[0.03] p-5 space-y-2">
              <h3 className="text-[15px] font-medium text-[#0b0c0e] dark:text-white">
                Your account and sign-in
              </h3>
              <ul className="list-disc pl-5 space-y-1.5 text-[14.5px] text-[#5f636a] dark:text-neutral-400">
                <li>
                  <strong className="text-[#0b0c0e] dark:text-white">
                    Sign-in details:
                  </strong>{" "}
                  your email address, name, and provider identifier when you
                  sign in with Email OTP or Google SSO.
                </li>
                <li>
                  <strong className="text-[#0b0c0e] dark:text-white">
                    Profile and @flow ID:
                  </strong>{" "}
                  the display name, optional profile photo (stored in your
                  browser or profile preferences), and @flow ID handle you claim
                  so others can pay you by name.
                </li>
                <li>
                  <strong className="text-[#0b0c0e] dark:text-white">
                    Session and security metadata:
                  </strong>{" "}
                  active browser session tokens, timestamps, IP address, and
                  user agent so you can view and revoke sessions in Settings.
                </li>
              </ul>
            </div>

            <div className="rounded-[16px] border border-[#e4e6e9] dark:border-white/[0.08] bg-[#f3f4f5]/50 dark:bg-white/[0.03] p-5 space-y-2">
              <h3 className="text-[15px] font-medium text-[#0b0c0e] dark:text-white">
                Wallets, transfers, and payment links
              </h3>
              <ul className="list-disc pl-5 space-y-1.5 text-[14.5px] text-[#5f636a] dark:text-neutral-400">
                <li>
                  <strong className="text-[#0b0c0e] dark:text-white">
                    Public blockchain addresses:
                  </strong>{" "}
                  your derived NEAR, Solana, Base, and Ethereum addresses and
                  their indexed on-chain balances and transaction hashes.
                </li>
                <li>
                  <strong className="text-[#0b0c0e] dark:text-white">
                    Payment links and guest checkout:
                  </strong>{" "}
                  link titles, optional descriptions, requested amounts, payer
                  limits, fee payer settings, settlement status, and any refund
                  address a guest payer enters for cross-chain settlement.
                </li>
                <li>
                  <strong className="text-[#0b0c0e] dark:text-white">
                    Earn activity:
                  </strong>{" "}
                  protocol deposit, unstake, and claim records for LiNEAR and
                  Burrow Finance on NEAR Mainnet.
                </li>
              </ul>
            </div>

            <div className="rounded-[16px] border border-[#e4e6e9] dark:border-white/[0.08] bg-[#f3f4f5]/50 dark:bg-white/[0.03] p-5 space-y-2">
              <h3 className="text-[15px] font-medium text-[#0b0c0e] dark:text-white">
                Flow AI Assistant
              </h3>
              <p className="text-[14.5px] text-[#5f636a] dark:text-neutral-400">
                If you use the Flow AI Assistant, the messages you send and the
                account context needed to answer your question (such as balances
                or transfer drafts) are processed by our configured AI model
                provider to generate responses. Do not paste private keys or
                sensitive secrets into chat.
              </p>
            </div>
          </div>
        </section>

        <section
          id="how-we-use"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            How we use your data
          </h2>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              Authenticate your sessions and protect your account against
              unauthorized access or abuse.
            </li>
            <li>
              Provision your multi-chain wallet addresses, quote cross-chain
              routes, and track settlement finality.
            </li>
            <li>
              Index your balances, activity history, payment link usage counts,
              and in-app notifications.
            </li>
            <li>
              Maintain reliability, diagnose bugs, and prevent spam or rate
              limit abuse.
            </li>
          </ul>
        </section>

        <section
          id="sharing"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Who we share data with
          </h2>
          <p>
            We only share the minimum data required with infrastructure partners
            that make FLOW work:
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong>NEAR OutLayer MPC &amp; blockchain RPCs:</strong> to
              derive wallets, sign authorized transactions, and verify on-chain
              settlement on NEAR, Solana, Base, and Ethereum.
            </li>
            <li>
              <strong>NEAR Intents (1Click):</strong> destination addresses,
              amounts, and refund addresses needed to quote and settle
              cross-chain transfers.
            </li>
            <li>
              <strong>Hosting, database, and email delivery:</strong> cloud
              infrastructure providers that host the application, database, and
              transactional OTP emails.
            </li>
            <li>
              <strong>Public blockchains:</strong> transactions you broadcast
              are permanently visible on public blockchains by design.
            </li>
          </ul>
        </section>

        <section
          id="retention"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            How long we keep data and account deletion
          </h2>
          <p>
            We keep your account data while your account is active. You can
            delete your account directly inside{" "}
            <Link
              href="/security"
              className="text-[#0b0c0e] dark:text-white underline decoration-[#cfd2d6] dark:decoration-white/30 underline-offset-4"
            >
              Settings
            </Link>{" "}
            at any time. Deleting your account immediately revokes all active
            sessions, removes your sign-in identities and profile preferences,
            releases your @flow ID, disables your payment links, and anonymizes
            your account record. Public on-chain transactions cannot be erased
            from their respective blockchains.
          </p>
        </section>

        <section
          id="cookies"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Cookies and browser storage
          </h2>
          <p>
            FLOW uses essential HTTP-only session cookies to keep you signed in
            and local browser storage for preferences like light/dark theme,
            language selection, and hiding balances. We do not use third-party
            advertising cookies.
          </p>
        </section>

        <section
          id="changes"
          className="scroll-mt-28 space-y-4 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
        >
          <h2 className="text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            Changes to this policy
          </h2>
          <p>
            As FLOW evolves, we may update this policy and change the date at
            the top of the page. Continued use of FLOW after an update means you
            accept the revised policy.
          </p>
        </section>
      </div>
    </DocsShell>
  );
}
