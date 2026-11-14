import type { ReactNode } from "react";
import Link from "next/link";
import { FlowLogo } from "../components/flow-logo.tsx";

type LegalSection = { title: string; body: ReactNode };

function LegalPage({
  title,
  intro,
  sections,
}: {
  title: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <main className="min-h-screen bg-[#F8F6F3] dark:bg-[#0B0B0B] px-5 py-8 text-[#0B0B0B] dark:text-neutral-100 sm:px-8 sm:py-12 transition-colors duration-200">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="FLOW home">
            <FlowLogo className="h-8 w-auto" />
          </Link>
          <nav aria-label="Legal pages" className="flex gap-4 text-sm">
            <Link className="hover:text-[#FF1A1A]" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-[#FF1A1A]" href="/terms">
              Terms
            </Link>
            <Link className="hover:text-[#FF1A1A]" href="/sign-in">
              Sign in
            </Link>
          </nav>
        </header>

        <div className="mt-12 rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-sm sm:mt-16 sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D51B24]">
            FLOW · Owner review required
          </p>
          <h1 className="mt-3 font-serif text-4xl sm:text-5xl dark:text-white">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#555] dark:text-neutral-400">
            {intro}
          </p>
          <aside className="mt-6 rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-950/30 p-4 text-sm leading-6 text-amber-950 dark:text-amber-200">
            <strong>Draft, not an effective policy.</strong> FLOW&apos;s legal
            entity and operating jurisdiction, controller details, support
            contact, retention periods, eligibility rules, and final custody and
            provider terms have not been confirmed. The owner must complete and
            approve these details with qualified counsel before treating this
            document as final or relying on it as a user agreement.
          </aside>

          <div className="mt-9 space-y-8">
            {sections.map((section, index) => (
              <section key={section.title} aria-labelledby={`section-${index}`}>
                <h2
                  id={`section-${index}`}
                  className="font-serif text-2xl sm:text-[26px] dark:text-white"
                >
                  {section.title}
                </h2>
                <div className="mt-3 space-y-3 text-[15px] leading-7 text-[#444] dark:text-neutral-300">
                  {section.body}
                </div>
              </section>
            ))}
          </div>
        </div>

        <footer className="flex flex-col gap-3 py-8 text-sm text-[#666] dark:text-neutral-400 sm:flex-row sm:items-center sm:justify-between">
          <span>FLOW · Draft for owner and legal review</span>
          <div className="flex gap-5">
            <Link
              className="hover:text-[#0B0B0B] dark:hover:text-white"
              href="/privacy"
            >
              Privacy
            </Link>
            <Link
              className="hover:text-[#0B0B0B] dark:hover:text-white"
              href="/terms"
            >
              Terms
            </Link>
            <Link
              className="hover:text-[#0B0B0B] dark:hover:text-white"
              href="/sign-in"
            >
              Sign in
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

export function PrivacyPage() {
  const sections: LegalSection[] = [
    {
      title: "1. Who is responsible for your information",
      body: (
        <>
          <p>
            FLOW is the name of a software service for account access, wallet
            interfaces, payment requests, and supported digital-asset workflows.
            The legal entity operating FLOW, its address, privacy contact, and
            applicable governing jurisdiction have not been supplied for this
            draft and must be confirmed before publication as a final notice.
          </p>
          <p>
            This notice describes information the current application is
            designed to process. Feature availability may vary; a screen or code
            path does not mean the related financial feature is enabled.
          </p>
        </>
      ),
    },
    {
      title: "2. Information FLOW may process",
      body: (
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Account and sign-in information, such as email address, verified
            status, Google provider subject and verified identity claims, and
            account-linking records.
          </li>
          <li>
            Authentication data, including hashed one-time-code records, session
            identifiers, security events, rate-limit metadata, and browser
            security cookies. FLOW does not need to store the readable one-time
            code after sending it.
          </li>
          <li>
            Profile, preference, notification, account, and onboarding data
            submitted through available screens.
          </li>
          <li>
            If wallet provisioning is enabled: public wallet addresses, provider
            wallet identifiers, encrypted provider credentials, and operational
            provisioning records. The precise legal custody and control
            relationship with OutLayer requires owner and legal review.
          </li>
          <li>
            If a payment or blockchain feature is enabled: selected assets and
            networks, quotes, payment instructions, transaction identifiers,
            wallet activity, ledger entries, amounts, fees, and reconciliation
            records.
          </li>
          <li>
            Technical and diagnostic information necessary to protect the
            service, such as request times, error codes, and security logs. The
            exact logging and retention schedule must be confirmed.
          </li>
        </ul>
      ),
    },
    {
      title: "3. How information is used",
      body: (
        <p>
          FLOW uses information to authenticate users, maintain sessions,
          prevent abuse, provide account and wallet features, create payment
          requests, retrieve provider quotes, monitor and reconcile transactions
          when those functions are enabled, respond to support requests, and
          maintain service security and reliability. FLOW should collect and
          retain only information needed for these purposes and any legal duties
          confirmed for its operating jurisdictions.
        </p>
      ),
    },
    {
      title: "4. Providers and disclosures",
      body: (
        <>
          <p>
            Depending on the feature used, information may be processed by
            Google for OAuth sign-in; Resend for verification email delivery;
            Railway for hosting and database infrastructure; OutLayer for wallet
            provisioning and custody-related services; and NEAR Intents / 1Click
            for token discovery, quotes, routing, or payment processing. A
            provider receives only information required for its relevant
            operation, subject to the actual integration and its terms.
          </p>
          <p>
            Public blockchain transactions are visible through their respective
            networks and may be difficult or impossible to remove. A transaction
            can reveal an address and associated activity. Provider policies,
            locations, subprocessors, and transfer safeguards must be reviewed
            and listed by the FLOW operator before this section is final.
          </p>
        </>
      ),
    },
    {
      title: "5. Cookies and account security",
      body: (
        <p>
          FLOW uses security cookies to preserve sign-in, OAuth state, and
          short-lived verification or linking flows. Production cookies are
          configured for HTTPS and restricted to the application host. Do not
          share verification codes or session access. FLOW uses access controls,
          encrypted provider credential storage, and restricted worker roles in
          its design; no security measure can guarantee absolute security.
        </p>
      ),
    },
    {
      title: "6. Retention, deletion, and your choices",
      body: (
        <>
          <p>
            FLOW has not confirmed final retention periods. Authentication
            records, security logs, financial ledgers, and transaction evidence
            may need different retention schedules. Blockchain records are
            maintained by independent networks and cannot be deleted by FLOW.
          </p>
          <p>
            Users may request access, correction, deletion, or other rights
            available under applicable law through the privacy contact that FLOW
            must publish before launch. Account deletion may not erase
            blockchain data or records FLOW is required to retain. The request
            process, identity verification steps, and response deadlines need
            owner and counsel confirmation.
          </p>
        </>
      ),
    },
    {
      title: "7. International processing and children",
      body: (
        <p>
          FLOW and its providers may process information in countries different
          from the user&apos;s location. Applicable transfer mechanisms and
          provider locations have not yet been confirmed. FLOW is not currently
          described as a service for children; minimum-age requirements and
          jurisdiction-specific restrictions require owner and legal review.
        </p>
      ),
    },
    {
      title: "8. Changes and contact",
      body: (
        <p>
          The operator should publish a dated revision and notify users when a
          material change requires notice or consent. A public privacy/support
          email or other request channel has not been provided and must be
          configured before this draft is adopted.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Privacy at FLOW"
      intro="This draft explains the data flows the FLOW application is designed to use. It is not yet an approved privacy notice."
      sections={sections}
    />
  );
}

export function TermsPage() {
  const sections: LegalSection[] = [
    {
      title: "1. About FLOW and acceptance",
      body: (
        <p>
          FLOW is being developed as an interface for accounts, digital-asset
          wallets, payment requests, and supported blockchain services. The
          contracting legal entity, governing law, dispute process, and
          effective date have not been confirmed. This draft is informational
          and is not a final user agreement.
        </p>
      ),
    },
    {
      title: "2. Availability and feature status",
      body: (
        <p>
          Features may be unavailable, limited, or disabled while FLOW is being
          tested. Quotes, token listings, previews, onboarding screens, and
          displayed balances are not proof that a transaction was submitted or
          settled. Do not rely on a screen as settlement confirmation; verify a
          transaction using its network and FLOW&apos;s confirmed status where
          available. Public signup, wallet registration, and financial execution
          may be restricted until their safety checks are complete.
        </p>
      ),
    },
    {
      title: "3. Accounts and security",
      body: (
        <p>
          You are responsible for access to your email and Google account,
          keeping verification codes and devices secure, and notifying the
          operator of suspected unauthorized access through the support channel
          it publishes. Identity linking must be authorized by the account
          holder. FLOW must not combine accounts merely because email text
          matches. Eligibility, age, restricted territories, and prohibited-use
          rules require owner and counsel confirmation before launch.
        </p>
      ),
    },
    {
      title: "4. Wallets, providers, and custody",
      body: (
        <>
          <p>
            If wallet registration is enabled, FLOW may request wallet
            provisioning through OutLayer. The exact allocation of control,
            signing authority, recovery, and custody responsibilities among the
            user, FLOW, and OutLayer has not been legally confirmed. Do not
            assume FLOW is non-custodial, insured, or able to recover assets.
            Those claims must not be made unless verified and approved.
          </p>
          <p>
            NEAR Intents / 1Click may provide token discovery, quotes, routing,
            or settlement services when enabled. Google, Resend, Railway,
            OutLayer, NEAR Intents, blockchain networks, and any other
            integrated service are separate providers and may apply their own
            terms and policies. Their availability and performance are outside
            FLOW&apos;s direct control.
          </p>
        </>
      ),
    },
    {
      title: "5. Digital-asset and transaction risks",
      body: (
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Blockchain transfers are generally irreversible. A wrong address,
            network, token, or memo can cause permanent loss.
          </li>
          <li>
            Network fees, provider fees, exchange rates, slippage, minimums,
            delays, congestion, forks, and provider availability can change.
            Quotes may expire and are not guarantees unless the provider and
            FLOW explicitly confirm otherwise.
          </li>
          <li>
            Token prices and token availability can change materially. Digital
            assets may lose value, and no deposit, balance, or settlement is
            guaranteed by this draft.
          </li>
          <li>
            Users must independently confirm the destination, asset, network,
            amount, refund address, and fees before authorizing any future
            transaction. Do not send assets to an address unless the live FLOW
            interface explicitly identifies the correct network and token.
          </li>
        </ul>
      ),
    },
    {
      title: "6. Payment requests and merchant responsibilities",
      body: (
        <p>
          If payment links are enabled, creators are responsible for accurate
          titles, amounts, recipient addresses, descriptions, and fulfillment
          terms. A link or quote does not establish that a payer has paid.
          Merchants must rely on verified settlement status and comply with
          applicable laws. Platform fees, refunds, disputes, and cancellation
          rules are not finalized and require owner confirmation.
        </p>
      ),
    },
    {
      title: "7. User conduct and restrictions",
      body: (
        <p>
          Users must provide accurate information, protect their accounts, and
          use FLOW only where permitted by applicable law and provider rules.
          The operator has not confirmed the final restricted jurisdictions,
          eligibility standards, prohibited activities, or suspension and appeal
          process. These details must be settled with counsel before this
          document becomes effective.
        </p>
      ),
    },
    {
      title: "8. Service changes, liability, and contact",
      body: (
        <p>
          The operator must define service-change notice, warranty disclaimers,
          liability limits, indemnities, dispute resolution, and support
          procedures with qualified counsel. No insurance or regulatory-license
          representation is made in this draft. A support contact has not been
          provided; users should not treat this draft as a substitute for a
          published support channel. Updated terms should include an effective
          date and revision history.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="FLOW terms of service"
      intro="Read this draft with care. It describes intended service boundaries and digital-asset risks, but it is not yet a final contract."
      sections={sections}
    />
  );
}
