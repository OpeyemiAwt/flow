export type BlogCategory =
  | "Product"
  | "Shipping"
  | "Engineering"
  | "Weekly Update";

export interface BlogSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
  readonly callout?: {
    readonly title: string;
    readonly body: string;
  };
}

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly category: BlogCategory;
  readonly publishedAt: string; // YYYY-MM-DD
  readonly readTime: string;
  readonly author: {
    readonly name: string;
    readonly role: string;
  };
  readonly featured?: boolean;
  readonly ogImage: string;
  readonly accent: string; // Tailwind gradient/tint token
  readonly highlights: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  readonly tags: readonly string[];
  readonly sections: readonly BlogSection[];
  readonly cta: {
    readonly title: string;
    readonly description: string;
    readonly href: string;
    readonly label: string;
  };
}

export const BLOG_POSTS: readonly BlogPost[] = [
  {
    slug: "introducing-flow-multi-chain-wallet-mvp",
    title: "Introducing FLOW: One Wallet Across NEAR, Solana, Base, and Ethereum",
    summary:
      "Why we built FLOW as a single, non-custodial multi-chain workspace with Google and Email sign-in, OutLayer MPC custody, sponsored NEAR activation, and live balances.",
    category: "Product",
    publishedAt: "2026-11-23",
    readTime: "5 min read",
    author: { name: "FLOW Team", role: "Product & Engineering" },
    featured: true,
    ogImage: "/assets/blog/introducing-flow-multi-chain-wallet-mvp.png",
    accent: "from-[#FF1A1A]/12 via-amber-500/8 to-transparent",
    highlights: [
      { label: "Supported chains", value: "NEAR, Solana, Base, Ethereum" },
      { label: "Wallet custody", value: "Non-custodial OutLayer MPC" },
      { label: "Seed phrases", value: "Zero required" },
    ],
    tags: ["MVP", "Multi-chain", "MPC", "Wallet"],
    sections: [
      {
        heading: "Why crypto payments still feel fragmented",
        paragraphs: [
          "Sending money on-chain today still forces everyday users to think like protocol engineers. You have to manage seed phrases, switch RPC networks, hunt for gas tokens on four different chains, and double-check long hexadecimal addresses just to pay a friend or settle an invoice.",
          "FLOW was built to collapse all of that complexity into one calm, fast, multi-chain payment workspace. When you sign in with Google or an email one-time code, FLOW provisions a non-custodial multi-chain wallet across NEAR, Solana, Base, and Ethereum so you can receive, send, convert, request, and earn from one dashboard.",
        ],
      },
      {
        heading: "Non-custodial OutLayer MPC under the hood",
        paragraphs: [
          "Instead of asking users to write down a 12-word recovery phrase or locking funds inside a centralized omnibus hot wallet, FLOW uses OutLayer MPC custody. Every account receives its own dedicated on-chain addresses on NEAR, Solana, Base, and Ethereum, while signing policies enforce authorization before any transaction is broadcast.",
          "For new accounts, FLOW also sponsors the initial NEAR implicit account activation and policy setup from our sponsor treasury so users can start using their wallet immediately without needing to buy NEAR first.",
        ],
        bullets: [
          "Dedicated mainnet addresses across NEAR, Solana, Base, and Ethereum.",
          "Real-time multi-chain balance reconciliation and activity indexing.",
          "Unified USD portfolio valuation with offline price caching and one-tap balance privacy toggle.",
          "Full session management, passkey/email security controls, and self-serve account controls.",
        ],
      },
      {
        heading: "Built for real-time speed and reliability",
        paragraphs: [
          "A wallet only feels trustworthy when balances and activity update the moment funds move. Our background indexer worker continuously tracks on-chain transfers across all four networks and immediately indexes incoming and outgoing activity alongside push-style in-app notifications as balances change.",
        ],
        callout: {
          title: "What is live in the MVP today",
          body: "You can sign in, claim your @flow ID, send same-asset or cross-asset payments, create 0% payment links, swap and bridge via NEAR Intents, earn yield on LiNEAR and Burrow, and chat with Flow AI right now.",
        },
      },
    ],
    cta: {
      title: "Try the FLOW MVP",
      description:
        "Create your multi-chain wallet in under a minute and explore every feature live on mainnet.",
      href: "/sign-in",
      label: "Open FLOW",
    },
  },
  {
    slug: "send-anywhere-and-flow-id",
    title: "Send Anywhere & @flow ID: Human-Readable Multi-Chain Transfers",
    summary:
      "Send funds to a wallet address or a simple @flow ID, type in token or live USD, pay 0% on direct sends or 0.3% from balance on cross-asset routes, and authorize with Slide to Pay.",
    category: "Shipping",
    publishedAt: "2026-11-22",
    readTime: "4 min read",
    author: { name: "FLOW Team", role: "Payments" },
    ogImage: "/assets/blog/send-anywhere-and-flow-id.png",
    accent: "from-emerald-500/12 via-teal-500/6 to-transparent",
    highlights: [
      { label: "Direct same-asset send", value: "0% FLOW fee" },
      { label: "Cross-asset send", value: "0.3% from balance" },
      { label: "Receipts", value: "PNG & PDF export" },
    ],
    tags: ["Send", "@flow ID", "Cross-chain", "Slide to Pay"],
    sections: [
      {
        heading: "Pay people by name with @flow ID",
        paragraphs: [
          "Copying and pasting 44-character Solana keys or 64-character NEAR implicit addresses is one of the easiest ways to lose funds. Every FLOW account can claim a unique @flow ID that automatically resolves to the recipient's registered address on whichever destination network you choose.",
          "When you send to another FLOW user, the transaction receipt records the sender's @flow ID and optional payment memo so both sides know exactly what a payment was for.",
        ],
      },
      {
        heading: "Direct sends are free; cross-asset sends route automatically",
        paragraphs: [
          "Sending the same asset on the same network (for example, NEAR to NEAR or USDC on Base to USDC on Base) executes directly on-chain with a 0% FLOW platform fee. You only pay the underlying network gas.",
          "When you hold one asset and the recipient wants another (for example, sending NEAR while your recipient receives SOL on Solana), FLOW automatically routes the transfer through NEAR Intents / 1Click with a 0.3% FLOW platform fee.",
        ],
        bullets: [
          "All platform fees are charged from your remaining wallet balance rather than deducted from the amount you enter, so the full intended amount is routed.",
          "Clicking Max automatically reserves headroom for both native network gas and the 0.3% cross-asset platform fee.",
          "Switch seamlessly between entering an amount in the asset or directly in USD using the inline currency switcher.",
          "Live quotes display both the destination token amount and its live USD value right underneath before you slide to pay.",
        ],
      },
      {
        heading: "Built for mobile ergonomics and verifiable receipts",
        paragraphs: [
          "Every send ends with a deliberate Slide to Pay confirmation built for smooth touch interaction on both iOS and Android, followed by a live settlement timeline that returns you to your dashboard as soon as the transfer settles.",
          "Need proof of payment? Open any activity item to view a color-coded status receipt and download a clean PNG or PDF copy.",
        ],
      },
    ],
    cta: {
      title: "Claim your @flow ID",
      description:
        "Sign in to reserve your @flow handle and start sending across chains in seconds.",
      href: "/sign-in",
      label: "Get your @flow ID",
    },
  },
  {
    slug: "payment-links-and-universal-checkout",
    title: "Payment Links & Universal Checkout: Get Paid From Any Chain",
    summary:
      "Create shareable fixed or open-amount payment links with 0% FLOW platform fee. Anyone can pay you from any supported chain or coin without needing a FLOW account.",
    category: "Shipping",
    publishedAt: "2026-11-21",
    readTime: "4 min read",
    author: { name: "FLOW Team", role: "Checkout & Merchants" },
    ogImage: "/assets/blog/payment-links-and-universal-checkout.png",
    accent: "from-sky-500/12 via-blue-500/6 to-transparent",
    highlights: [
      { label: "FLOW platform fee", value: "0%" },
      { label: "Amount modes", value: "Fixed or Open" },
      { label: "Payer account", value: "None required" },
    ],
    tags: ["Payment Links", "Checkout", "Invoicing", "0% Fee"],
    sections: [
      {
        heading: "One link that accepts any supported chain",
        paragraphs: [
          "Getting paid in crypto usually means asking the sender which chain they use, which stablecoin they hold, and sending them a matching address. FLOW Payment Links flip that flow around: you pick the exact asset and chain you want to receive, and FLOW generates a hosted checkout page.",
          "Your payer opens the link, picks whatever supported asset and network they prefer to pay with, sees a live verified quote, and sends the deposit from any wallet or exchange. Settlement lands directly in your chosen FLOW wallet.",
        ],
      },
      {
        heading: "Flexible controls for freelancers, merchants, and groups",
        paragraphs: [
          "We designed Payment Links to handle everything from one-off client invoices to group splits and recurring tips:",
        ],
        bullets: [
          "Fixed or open amount: lock an exact invoice total or let the payer enter any amount at checkout.",
          "Configurable fee payer: on fixed-amount links, choose whether your payer covers cross-chain routing fees (so you receive the exact total) or you absorb them with a live net estimate shown upfront.",
          "Max payer limits: allow unlimited payments or cap a link at an exact number of completed settlements.",
          "Full lifecycle control: pause, resume, or delete any link at any time from your Request tab.",
        ],
      },
      {
        heading: "Zero FLOW platform fee on checkout",
        paragraphs: [
          "FLOW charges 0% platform fee on Payment Link checkouts. Same-asset settlements only incur standard network gas, and cross-chain settlements reflect transparent live solver quotes before the payer sends funds.",
        ],
      },
    ],
    cta: {
      title: "Create your first payment link",
      description:
        "Generate a shareable multi-chain checkout link in under 30 seconds.",
      href: "/sign-in",
      label: "Create a link",
    },
  },
  {
    slug: "convert-and-bridge-powered-by-near-intents",
    title: "Convert & Bridge: Cross-Chain Swaps Inside Your Wallet",
    summary:
      "Swap and bridge between NEAR, Solana, Base, and Ethereum directly inside your own FLOW wallets using NEAR Intents / 1Click with live USD previews and crash-safe execution.",
    category: "Engineering",
    publishedAt: "2026-11-20",
    readTime: "4 min read",
    author: { name: "FLOW Team", role: "Protocol & Routing" },
    ogImage: "/assets/blog/convert-and-bridge-powered-by-near-intents.png",
    accent: "from-violet-500/12 via-purple-500/6 to-transparent",
    highlights: [
      { label: "Routing engine", value: "NEAR Intents / 1Click" },
      { label: "Platform fee", value: "1.5% from balance" },
      { label: "Settlement", value: "Direct to your wallet" },
    ],
    tags: ["Convert", "Bridge", "NEAR Intents", "1Click"],
    sections: [
      {
        heading: "Bridging without leaving your portfolio",
        paragraphs: [
          "Rebalancing between chains normally requires connecting to an external bridge UI, signing token approvals, waiting on an opaque relayer, and hoping your destination wallet is configured properly.",
          "Inside FLOW's Convert & Bridge tab, you pick any held asset as the source and any supported asset across NEAR, Solana, Base, or Ethereum as the destination. Funds automatically settle into your own registered destination address on that chain.",
        ],
      },
      {
        heading: "How our 1Click quote and execution pipeline works",
        paragraphs: [
          "Every preview calls NEAR Intents / 1Click dry quotes with signature verification and strict parameter matching so the rate, minimum output, estimated settlement time, and live USD value are validated before you ever slide to convert.",
          "When you authorize a conversion, FLOW commits a dedicated provider deposit address and hands the job to our crash-safe custody worker, which signs and broadcasts the source transaction and tracks cross-chain settlement end to end.",
        ],
        bullets: [
          "Live exchange rate, minimum receive guarantee, estimated settlement duration, and USD value below the receive amount.",
          "1.5% FLOW platform fee charged from your wallet balance (rather than deducted from the amount you convert), with automatic Max headroom calculation.",
          "Automatic refund routing back to your own origin-chain address if a cross-chain route ever expires or fails.",
        ],
      },
    ],
    cta: {
      title: "Explore the routing architecture",
      description:
        "Read the full technical breakdown of NEAR Intents and 1Click settlement in our docs.",
      href: "/docs#convert",
      label: "Read the docs",
    },
  },
  {
    slug: "earn-native-yield-linear-and-burrow",
    title: "FLOW Earn: Native NEAR Staking with LiNEAR & USDC Lending on Burrow",
    summary:
      "Put idle NEAR and USDC to work directly on NEAR Mainnet with live protocol APYs, automatic storage handling, a 0.3% one-shot deposit fee from balance, and 0% withdrawal fees.",
    category: "Product",
    publishedAt: "2026-11-19",
    readTime: "4 min read",
    author: { name: "FLOW Team", role: "DeFi & Yield" },
    ogImage: "/assets/blog/earn-native-yield-linear-and-burrow.png",
    accent: "from-amber-500/12 via-orange-500/6 to-transparent",
    highlights: [
      { label: "Protocols", value: "LiNEAR & Burrow" },
      { label: "Deposit fee", value: "0.3% from balance" },
      { label: "Withdraw & claim", value: "0% FLOW fee" },
    ],
    tags: ["Earn", "LiNEAR", "Burrow", "Yield"],
    sections: [
      {
        heading: "On-chain yield without protocol friction",
        paragraphs: [
          "Idle balances in a wallet should be able to earn native on-chain yield without requiring separate DeFi frontends or manual contract storage deposits. FLOW Earn integrates directly with two battle-tested NEAR Mainnet protocols right inside the Earn tab.",
        ],
        bullets: [
          "LiNEAR Liquid Staking: deposit NEAR to mint $LiNEAR and earn auto-compounding staking rewards. Standard unstaking follows NEAR's ~48-hour (~4 epoch) cooldown, after which you tap Claim to settle NEAR back to your wallet.",
          "Burrow Finance USDC Lending: supply native USDC on NEAR Mainnet to earn variable lending yield. FLOW automatically checks and registers first-time NEAR contract storage so deposits succeed smoothly on the first try.",
        ],
      },
      {
        heading: "Transparent one-shot fee model",
        paragraphs: [
          "FLOW charges a simple 0.3% one-shot platform fee on Earn deposits, taken from your wallet balance so the full amount you enter is supplied to the protocol. Clicking Max automatically accounts for both the NEAR gas reserve and the 0.3% fee.",
          "Moving funds back out of Earn (both withdrawals and unstaked NEAR claims) carries a 0% FLOW fee.",
        ],
        callout: {
          title: "Live protocol rates, never hardcoded",
          body: "FLOW fetches live APY figures and your exact on-chain staked and supplied balances directly from LiNEAR and Burrow, displaying estimated yearly returns before you confirm.",
        },
      },
    ],
    cta: {
      title: "Start earning on NEAR",
      description:
        "Stake NEAR with LiNEAR or supply USDC on Burrow directly from your FLOW wallet.",
      href: "/sign-in",
      label: "Open Earn",
    },
  },
  {
    slug: "flow-ai-assistant-and-live-insights",
    title: "Flow AI Assistant, Live Insights & Real-Time Notifications",
    summary:
      "Ask Flow AI about your balances, recent activity, or cross-chain quotes in plain English, monitor monthly inflows and outflows in Insights, and get notified the moment funds arrive.",
    category: "Product",
    publishedAt: "2026-11-18",
    readTime: "4 min read",
    author: { name: "FLOW Team", role: "AI & Experience" },
    ogImage: "/assets/blog/flow-ai-assistant-and-live-insights.png",
    accent: "from-rose-500/12 via-pink-500/6 to-transparent",
    highlights: [
      { label: "Assistant", value: "Live wallet context" },
      { label: "Indexing", value: "Instant on balance change" },
      { label: "Insights", value: "Monthly UTC ledger" },
    ],
    tags: ["Flow AI", "Insights", "Notifications", "UX"],
    sections: [
      {
        heading: "A wallet assistant grounded in your live account",
        paragraphs: [
          "Flow AI is built directly into the header of your workspace so you can check balances across chains, summarize recent activity, preview live cross-chain swap quotes, or draft payment links through natural conversation.",
          "Because Flow AI operates with read-only inspection and explicit confirmation cards for any action, you stay in full control before any transfer or link is executed.",
        ],
      },
      {
        heading: "Instant notifications synced with your balance",
        paragraphs: [
          "Nothing is worse than seeing your balance update while your activity feed and notifications lag behind. Our indexer worker triggers immediate activity ingestion and notification creation the moment a wallet's balance changes on NEAR, Solana, Base, or Ethereum.",
        ],
        bullets: [
          "Real-time toast alerts and a dedicated Notifications center with Payments and System filters.",
          "Monthly inflow, outflow, and net movement summaries on your dashboard plus full analytics in Insights.",
          "Offline-resilient price caching so your balances and monthly summaries stay readable even if your connection drops.",
        ],
      },
    ],
    cta: {
      title: "Read the FLOW Whitepaper",
      description:
        "Dive deeper into our product architecture, security model, and long-term roadmap.",
      href: "/whitepaper",
      label: "Read Whitepaper",
    },
  },
];

export const BLOG_CATEGORIES: readonly ("All" | BlogCategory)[] = [
  "All",
  "Product",
  "Shipping",
  "Engineering",
  "Weekly Update",
];

export function getAllBlogPosts(): readonly BlogPost[] {
  return [...BLOG_POSTS].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  );
}

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((post) => post.slug === slug);
}

export function getRelatedBlogPosts(
  slug: string,
  limit = 3,
): readonly BlogPost[] {
  const current = getBlogPostBySlug(slug);
  return getAllBlogPosts()
    .filter((post) => post.slug !== slug)
    .sort((a, b) => {
      const aSame = current && a.category === current.category ? 1 : 0;
      const bSame = current && b.category === current.category ? 1 : 0;
      if (aSame !== bSame) return bSame - aSame;
      return b.publishedAt.localeCompare(a.publishedAt);
    })
    .slice(0, limit);
}

export function formatBlogDate(isoDate: string): string {
  const parsed = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
