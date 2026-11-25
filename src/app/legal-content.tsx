import type { ReactNode } from "react";
import Link from "next/link";
import { FlowLogo } from "../components/flow-logo.tsx";

type LegalSection = { id: string; title: string; body: ReactNode };

function LegalPage({
  title,
  effectiveDate,
  lastUpdated,
  intro,
  sections,
  activePage,
}: {
  title: string;
  effectiveDate: string;
  lastUpdated: string;
  intro: string;
  sections: LegalSection[];
  activePage: "privacy" | "terms";
}) {
  return (
    <main className="min-h-screen bg-[#F8F6F3] dark:bg-[#0B0B0B] px-5 py-8 text-[#0B0B0B] dark:text-neutral-100 sm:px-8 sm:py-12 transition-colors duration-200">
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" aria-label="FLOW home">
            <FlowLogo className="h-8 w-auto" />
          </Link>
          <nav aria-label="Legal pages" className="flex flex-wrap gap-4 text-sm">
            <Link className="hover:text-[#FF1A1A]" href="/docs">
              Docs
            </Link>
            <Link className="hover:text-[#FF1A1A]" href="/whitepaper">
              Whitepaper
            </Link>
            <Link
              className={
                activePage === "privacy"
                  ? "font-semibold text-[#FF1A1A]"
                  : "hover:text-[#FF1A1A]"
              }
              href="/privacy"
            >
              Privacy
            </Link>
            <Link
              className={
                activePage === "terms"
                  ? "font-semibold text-[#FF1A1A]"
                  : "hover:text-[#FF1A1A]"
              }
              href="/terms"
            >
              Terms
            </Link>
            <Link className="hover:text-[#FF1A1A]" href="/sign-in">
              Sign in
            </Link>
          </nav>
        </header>

        <div className="mt-10 rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-6 shadow-sm sm:mt-14 sm:p-10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#D51B24]">
              FLOW Legal &amp; Compliance
            </p>
            <span className="rounded-full border border-[#E6E2DA] dark:border-white/[0.12] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 font-mono text-[11px] font-semibold text-[#444] dark:text-neutral-300">
              Effective {effectiveDate} | Updated {lastUpdated}
            </span>
          </div>
          <h1 className="mt-4 font-serif text-4xl sm:text-5xl dark:text-white">
            {title}
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#555] dark:text-neutral-400">
            {intro}
          </p>

          <nav
            aria-label="Document sections"
            className="mt-6 flex flex-wrap gap-2 border-t border-[#EFECE6] dark:border-white/[0.08] pt-5"
          >
            {sections.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="rounded-full border border-[#E6E2DA] dark:border-white/[0.1] bg-[#F8F6F3] dark:bg-[#1A1A1C] px-3 py-1 text-xs font-medium text-[#3B3B3B] dark:text-neutral-300 hover:border-[#0B0B0B] dark:hover:border-white hover:text-[#0B0B0B] dark:hover:text-white"
              >
                {section.title}
              </a>
            ))}
          </nav>

          <div className="mt-9 space-y-9 border-t border-[#EFECE6] dark:border-white/[0.08] pt-8">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`heading-${section.id}`}
                className="scroll-mt-24"
              >
                <h2
                  id={`heading-${section.id}`}
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
          <span>FLOW: Personal multi-chain payments &amp; NEAR yield</span>
          <div className="flex flex-wrap gap-5">
            <Link
              className="hover:text-[#0B0B0B] dark:hover:text-white"
              href="/docs"
            >
              Docs
            </Link>
            <Link
              className="hover:text-[#0B0B0B] dark:hover:text-white"
              href="/whitepaper"
            >
              Whitepaper
            </Link>
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
      id: "controller",
      title: "1. Introduction & Data Controller Identity",
      body: (
        <>
          <p>
            FLOW (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;)
            operates the web application hosted at{" "}
            <span className="font-mono text-xs">https://flow.devhub.forum</span>{" "}
            and its associated APIs, documentation, and payment link pages. This
            Privacy Policy explains how we collect, use, store, and protect
            information when you access or use FLOW.
          </p>
          <p>
            <strong>Scope:</strong> This policy applies to all personal FLOW
            accounts, guest checkout payers visiting{" "}
            <span className="font-mono text-xs">/pay/[id]</span> links, and
            visitors to our documentation, whitepaper, and support pages. For
            privacy inquiries or data rights requests, contact{" "}
            <span className="font-mono text-xs">flow@devhub.forum</span>.
          </p>
        </>
      ),
    },
    {
      id: "data-collected",
      title: "2. Categories of Data We Collect",
      body: (
        <>
          <p>
            <strong>A. Information You Provide Directly:</strong>
          </p>
          <ul className="list-disc space-y-1.5 pl-6">
            <li>
              Account and authentication details: your email address, email
              verification status, Google OAuth subject identifier, display
              name, and claimed Flow ID (<span className="font-mono text-xs">@handle.flow</span>).
            </li>
            <li>
              Payment link and transfer details: payment request descriptions,
              requested asset amounts, recipient addresses, and refund addresses
              submitted during guest checkout or cross-chain transfers.
            </li>
            <li>
              Preferences and communications: language selection, theme
              preference, notification read states, and support or feedback
              messages sent to our team.
            </li>
          </ul>
          <p>
            <strong>B. Information Collected Automatically:</strong>
          </p>
          <ul className="list-disc space-y-1.5 pl-6">
            <li>
              Authentication and security metadata: hashed one-time verification
              codes (plaintext codes are never stored after delivery), session
              tokens, HTTP-only security cookies, rate-limiting counters, IP
              addresses, and user-agent strings.
            </li>
            <li>
              Operational telemetry: error logs, worker job state transitions,
              and API diagnostics used to keep settlement and indexing reliable.
            </li>
          </ul>
          <p>
            <strong>C. Public &amp; On-Chain Blockchain Data:</strong>
          </p>
          <ul className="list-disc space-y-1.5 pl-6">
            <li>
              Provisioned public wallet addresses across NEAR, Solana, Base, and
              Ethereum, transaction hashes, token balances, LiNEAR staking
              positions, Burrow lending positions, and block timestamps.
            </li>
            <li>
              <strong>Public Ledger Notice:</strong> Data broadcast to NEAR,
              Solana, Base, or Ethereum is public, permanent, and outside the
              control of FLOW or any single operator.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "lawful-bases",
      title: "3. How & Why We Use Your Data",
      body: (
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Service Delivery &amp; Contract Performance:</strong>{" "}
            Authenticating your personal account, provisioning multi-chain
            wallets via NEAR OutLayer, generating cross-chain quotes via NEAR
            Intents (1Click), displaying portfolio balances, and tracking live
            settlements.
          </li>
          <li>
            <strong>Security &amp; Abuse Prevention:</strong> Enforcing login
            throttles, verifying session integrity, detecting automated abuse,
            and protecting custody policy operations.
          </li>
          <li>
            <strong>Product Reliability &amp; Diagnostics:</strong> Investigating
            failed RPC calls, indexer lag, or settlement errors and improving UI
            responsiveness.
          </li>
          <li>
            <strong>Essential Service Communications:</strong> Delivering
            sign-in verification codes and displaying in-app payment or
            withdrawal notifications.
          </li>
          <li>
            <strong>Legal Compliance:</strong> Complying with applicable laws,
            sanctions obligations, or valid legal process.
          </li>
        </ul>
      ),
    },
    {
      id: "cookies",
      title: "4. Cookies & Local Browser Storage",
      body: (
        <>
          <p>
            FLOW uses strictly necessary cookies and local browser storage to
            keep your session secure and preserve your interface state:
          </p>
          <ul className="list-disc space-y-1.5 pl-6">
            <li>
              <strong>Strictly Necessary Cookies:</strong> Session
              authentication cookies and OAuth state/nonce verification cookies.
              Without these, sign-in and account routes cannot function.
            </li>
            <li>
              <strong>Functional Local Storage:</strong> Remembers your dark or
              light theme, selected language, balance-hiding toggle, active
              workspace tab, and active cross-chain deposit card across page
              reloads.
            </li>
          </ul>
          <p>
            You can clear or block cookies and local storage in your browser
            settings at any time, though blocking essential session cookies will
            prevent you from staying signed in.
          </p>
        </>
      ),
    },
    {
      id: "sharing",
      title: "5. Data Sharing & Third-Party Processors",
      body: (
        <>
          <p>
            <strong>No Sale of Personal Data:</strong> FLOW does not sell, rent,
            or trade your personal information to data brokers or advertisers.
          </p>
          <p>
            We share only the minimum data required for core infrastructure
            providers to operate the Service:
          </p>
          <ul className="list-disc space-y-1.5 pl-6">
            <li>
              <strong>Custody &amp; Policy Infrastructure:</strong> NEAR
              OutLayer (<span className="font-mono text-xs">outlayer.near</span>)
              for MPC wallet provisioning and policy-authorized transaction
              signing.
            </li>
            <li>
              <strong>Cross-Chain Routing &amp; DeFi Protocols:</strong> NEAR
              Intents (1Click API) for cross-chain quotes and settlement
              monitoring, plus public RPC endpoints for NEAR Mainnet, Solana,
              Base, Ethereum, LiNEAR, and Burrow Finance.
            </li>
            <li>
              <strong>Cloud Hosting, Database &amp; Email Delivery:</strong>{" "}
              Managed cloud infrastructure, PostgreSQL hosting, and
              transactional email providers used to deliver one-time sign-in
              codes.
            </li>
            <li>
              <strong>Optional AI Assistant Providers:</strong> When you send a
              message in FLOW AI, your prompt and relevant account summary
              context are processed to generate your response.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "transfers",
      title: "6. International Data Transfers",
      body: (
        <p>
          FLOW operates on cloud infrastructure and decentralized blockchain
          networks whose servers and validator nodes span multiple countries.
          Where personal data is transferred across borders, we rely on
          contractual safeguards, encrypted transport, and data minimization to
          protect your information in line with applicable privacy frameworks.
        </p>
      ),
    },
    {
      id: "retention-security",
      title: "7. Data Retention & Security Measures",
      body: (
        <>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Retention Periods:</strong> Short-lived authentication
              intents and one-time codes expire automatically. Operational logs
              are retained for diagnostics and security review, while account
              and transaction records remain available as long as your account
              is active or as required for ledger integrity and legal compliance.
            </li>
            <li>
              <strong>Technical &amp; Organizational Controls:</strong> All
              traffic uses TLS/HTTPS encryption in transit. Sensitive provider
              credentials stored by FLOW are encrypted at rest using envelope
              encryption (AES-256-GCM), database access is segmented under
              least-privilege PostgreSQL roles with row-level session scoping,
              and state-changing requests require strict schema validation.
            </li>
            <li>
              <strong>Breach Notification:</strong> If we become aware of a
              security incident affecting your off-chain personal data, we will
              investigate promptly and notify affected users and applicable
              authorities as required by law.
            </li>
          </ul>
        </>
      ),
    },
    {
      id: "rights",
      title: "8. Your Privacy Rights",
      body: (
        <>
          <p>
            Depending on your jurisdiction (including GDPR, UK GDPR, CCPA/CPRA,
            and NDPA), you may have the right to:
          </p>
          <ul className="list-disc space-y-1.5 pl-6">
            <li>
              <strong>Access &amp; Portability:</strong> Request a copy of the
              off-chain personal data associated with your FLOW account.
            </li>
            <li>
              <strong>Rectification:</strong> Request correction of inaccurate
              profile or account details.
            </li>
            <li>
              <strong>Erasure:</strong> Request deletion of off-chain account
              profile data and server logs where retention is not legally
              required.
            </li>
            <li>
              <strong>Restriction &amp; Objection:</strong> Object to or
              restrict non-essential processing.
            </li>
          </ul>
          <p>
            <strong>Blockchain Immutability Limitation:</strong> Transactions,
            wallet addresses, and smart-contract events recorded on public
            blockchains (NEAR, Solana, Base, Ethereum) are immutable and cannot
            be edited or deleted by FLOW. To submit a privacy request, email{" "}
            <span className="font-mono text-xs">flow@devhub.forum</span>.
            We aim to respond within 30 days.
          </p>
        </>
      ),
    },
    {
      id: "children-updates",
      title: "9. Children's Privacy & Policy Updates",
      body: (
        <>
          <p>
            FLOW is strictly intended for individuals aged 18 or older (or the
            age of legal majority in your jurisdiction). We do not knowingly
            collect personal data from minors and will delete any such off-chain
            data immediately if discovered.
          </p>
          <p>
            We may update this Privacy Policy as FLOW evolves. Material updates
            will be reflected by updating the &quot;Updated&quot; date at the
            top of this page and, where appropriate, via an in-app notice.
          </p>
        </>
      ),
    },
  ];

  return (
    <LegalPage
      title="Privacy Policy"
      effectiveDate="Nov 16, 2026"
      lastUpdated="Nov 20, 2026"
      activePage="privacy"
      intro="This Privacy Policy explains what information FLOW collects for personal multi-chain accounts and guest payment links, how we secure it, and what rights you have over your data."
      sections={sections}
    />
  );
}

export function TermsPage() {
  const sections: LegalSection[] = [
    {
      id: "preamble",
      title: "1. Preamble & Acceptance of Terms",
      body: (
        <>
          <p>
            These Terms of Service (&quot;Terms&quot;) govern your access to and
            use of the FLOW web application at{" "}
            <span className="font-mono text-xs">https://flow.devhub.forum</span>,
            related APIs, payment checkout pages, and documentation (collectively,
            the &quot;Service&quot;).
          </p>
          <p>
            By accessing FLOW, creating a personal account, initiating a guest
            checkout payment, or interacting with any supported workflow, you
            agree to be bound by these Terms. We may update these Terms from
            time to time by posting a revised version with an updated effective
            date; continued use after updates constitutes acceptance.
          </p>
        </>
      ),
    },
    {
      id: "eligibility",
      title: "2. Eligibility & Jurisdictional Restrictions",
      body: (
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Minimum Age:</strong> You must be at least 18 years old (or
            the age of legal majority in your jurisdiction) to use FLOW.
          </li>
          <li>
            <strong>Personal Accounts Only:</strong> FLOW is designed and
            provided exclusively for personal, individual accounts. Business,
            corporate treasury, and multi-user team accounts are not supported.
          </li>
          <li>
            <strong>Sanctions &amp; Restricted Territories:</strong> You may not
            use FLOW if you are located in, or a resident of, any jurisdiction
            subject to comprehensive international sanctions (including OFAC
            sanctioned regions), or if you appear on any restricted-party list.
          </li>
          <li>
            <strong>Local Law Compliance:</strong> You are solely responsible
            for ensuring that accessing digital-asset interfaces and protocols
            is lawful in your jurisdiction.
          </li>
        </ul>
      ),
    },
    {
      id: "services",
      title: "3. Description of Services & Protocol Clarifications",
      body: (
        <>
          <p>
            FLOW provides a unified software interface for personal multi-chain
            wallets across NEAR, Solana, Base, and Ethereum, including direct
            transfers, cross-chain swaps and payment links powered by NEAR
            Intents (1Click), and protocol integrations for LiNEAR liquid
            staking and Burrow Finance lending on NEAR Mainnet.
          </p>
          <p>
            <strong>Interface vs. Underlying Protocols:</strong> FLOW does not
            operate the underlying blockchains, validators, liquidity solvers,
            or third-party smart contracts (<span className="font-mono text-xs">outlayer.near</span>,{" "}
            <span className="font-mono text-xs">intents.near</span>,{" "}
            <span className="font-mono text-xs">linear-protocol.near</span>,{" "}
            <span className="font-mono text-xs">contract.main.burrow.near</span>).
            Transaction finality, yield rates, and liquidity depend on those
            independent networks and contracts.
          </p>
          <p>
            <strong>No Fiduciary Duty:</strong> FLOW is not a bank, broker,
            investment advisor, money transmitter, or fiduciary. Nothing on FLOW,
            including FLOW AI responses or live APY/APR displays, constitutes
            financial, investment, legal, or tax advice.
          </p>
        </>
      ),
    },
    {
      id: "accounts-custody",
      title: "4. Accounts, MPC Custody & Security Responsibilities",
      body: (
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Account Access:</strong> You access your personal FLOW
            account using verified Google sign-in or passwordless email codes.
            You are responsible for safeguarding your email inbox, Google
            account, and devices.
          </li>
          <li>
            <strong>OutLayer MPC &amp; Policy Custody:</strong> Multi-chain
            addresses are provisioned and authorized through NEAR OutLayer
            policy-governed custody rather than browser-stored seed phrases.
          </li>
          <li>
            <strong>Irreversibility:</strong> Once a blockchain transaction is
            signed and broadcast to NEAR, Solana, Base, or Ethereum, FLOW
            cannot cancel, reverse, or modify it. Always verify destination
            addresses, networks, and amounts before confirming.
          </li>
          <li>
            <strong>Security Notice:</strong> Notify us immediately at{" "}
            <span className="font-mono text-xs">flow@devhub.forum</span> if
            you suspect unauthorized access to your account.
          </li>
        </ul>
      ),
    },
    {
      id: "prohibited",
      title: "5. Permitted Use & Prohibited Conduct",
      body: (
        <>
          <p>
            Subject to these Terms, we grant you a limited, revocable,
            non-exclusive, non-transferable license to use FLOW for lawful
            personal purposes. You agree not to:
          </p>
          <ul className="list-disc space-y-1.5 pl-6">
            <li>
              Use FLOW for money laundering, terrorist financing, sanctions
              evasion, fraud, or market manipulation.
            </li>
            <li>
              Attempt to bypass authentication, rate limits, custody policies,
              or access controls, or launch automated scraping or denial-of-service
              attacks against our servers or RPC endpoints.
            </li>
            <li>
              Impersonate FLOW, register misleading handles, or use payment
              links for unlawful commerce.
            </li>
          </ul>
          <p>
            We reserve the right to suspend, rate-limit, or restrict access to
            the interface if we detect security abuse or Terms violations.
          </p>
        </>
      ),
    },
    {
      id: "fees-taxes",
      title: "6. Fees, Network Gas, Refunds & Taxes",
      body: (
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>Network &amp; Protocol Fees:</strong> You are responsible
            for blockchain network gas fees, storage deposits (such as NEAR
            account storage and Burrow first-time storage reserves), and any
            cross-chain solver spreads quoted prior to confirmation.
          </li>
          <li>
            <strong>No Refunds on Settled Transactions:</strong> Confirmed
            blockchain transactions and spent network gas fees are final and
            non-refundable. For cross-chain 1Click quotes, automatic refunds for
            underfunded or expired deposits are handled by the routing provider
            only when a valid source-chain refund address is supplied and the
            amount exceeds minimum network fees.
          </li>
          <li>
            <strong>Taxes:</strong> You are solely responsible for determining,
            reporting, and paying any taxes applicable to your transfers, swaps,
            or DeFi staking/lending rewards.
          </li>
        </ul>
      ),
    },
    {
      id: "ip",
      title: "7. Intellectual Property Rights",
      body: (
        <p>
          All FLOW trademarks, logos, visual designs, interface code, and
          original documentation remain the property of FLOW and its
          contributors, except where open-source components or public
          repositories are governed by their respective open-source licenses.
          Any product feedback or suggestions you share may be used to improve
          FLOW without obligation or compensation.
        </p>
      ),
    },
    {
      id: "third-parties",
      title: "8. Third-Party Services & External Links",
      body: (
        <p>
          FLOW integrates with external infrastructure including NEAR OutLayer,
          NEAR Intents (1Click), LiNEAR Protocol, Burrow Finance, Google OAuth,
          public RPC providers, and block explorers (Nearblocks, Basescan,
          Etherscan, Solscan). We do not control and are not responsible for
          outages, smart contract bugs, pricing inaccuracies, or policy changes
          at third-party providers.
        </p>
      ),
    },
    {
      id: "disclaimers",
      title: "9. Disclaimers, Assumption of Risk & Limitation of Liability",
      body: (
        <>
          <p>
            <strong>As-Is Service:</strong> FLOW is provided on an &quot;AS
            IS&quot; and &quot;AS AVAILABLE&quot; basis without warranties of
            any kind, whether express or implied, including merchantability,
            fitness for a particular purpose, or uninterrupted availability.
          </p>
          <p>
            <strong>Assumption of Risk:</strong> You acknowledge the inherent
            risks of digital assets and decentralized protocols, including token
            price volatility, smart contract vulnerabilities, bridge or solver
            delays, RPC congestion, and regulatory changes.
          </p>
          <p>
            <strong>Limitation of Liability:</strong> To the maximum extent
            permitted by law, FLOW and its contributors shall not be liable for
            any indirect, incidental, special, consequential, or punitive
            damages, or loss of funds or profits. Aggregate liability arising out
            of or relating to the Service is capped at the greater of $100 USD
            or the platform fees you paid directly to FLOW in the preceding 12
            months. You agree to indemnify FLOW against claims arising from your
            misuse of the Service or breach of these Terms.
          </p>
        </>
      ),
    },
    {
      id: "disputes",
      title: "10. Dispute Resolution & Governing Principles",
      body: (
        <p>
          Before initiating any formal claim, you agree to contact us at{" "}
          <span className="font-mono text-xs">flow@devhub.forum</span> and
          attempt to resolve the dispute informally for at least 30 days. To
          the fullest extent permitted by applicable law, unresolved disputes
          shall be resolved through individual binding arbitration rather than
          court litigation, and you waive any right to participate in a
          class-action lawsuit or class-wide arbitration.
        </p>
      ),
    },
    {
      id: "miscellaneous",
      title: "11. Miscellaneous & Legal Contact",
      body: (
        <p>
          If any provision of these Terms is held unenforceable, the remaining
          provisions remain in full force. FLOW is not liable for delays or
          failures caused by events beyond reasonable control (including
          network outages, natural disasters, or regulatory actions). These
          Terms constitute the entire agreement between you and FLOW regarding
          use of the Service. Contact:{" "}
          <span className="font-mono text-xs">flow@devhub.forum</span>.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      title="Terms of Service"
      effectiveDate="Nov 16, 2026"
      lastUpdated="Nov 20, 2026"
      activePage="terms"
      intro="These Terms of Service establish the rules, protocol boundaries, and risk disclosures governing your use of FLOW personal accounts, cross-chain payments, and NEAR DeFi yield."
      sections={sections}
    />
  );
}
