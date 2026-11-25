"use client";

import { useState } from "react";
import Link from "next/link";
import { FlowLogo } from "../components/flow-logo";
import { triggerHaptic } from "../components/haptics";
import {
  MotionHeadlineLine,
  MotionParallaxCard,
  MotionReveal,
} from "../components/motion";

const FAQS = [
  {
    q: "What is FLOW?",
    a: "FLOW is a multi-chain wallet and payment platform across Ethereum, Base, Solana, and NEAR. It lets individuals and businesses get paid in the asset and network they want, while payers use the asset and chain they already hold.",
  },
  {
    q: "How do payment links, QR codes, and cross-chain routing work?",
    a: "Create a payment link or QR code in seconds and choose your settlement asset. Anyone can pay via guest checkout using a supported wallet or exchange—FLOW quotes the cross-chain route live via NEAR Intents and settles directly into your workspace.",
  },
  {
    q: "What can I do inside my FLOW account?",
    a: "You get permanent multi-chain addresses for direct receive, Send & Convert across supported networks, cross-chain Add Money deposits, shareable Payment Links, real-time USD balance tracking, activity history, and instant notifications.",
  },
  {
    q: "How are FLOW wallets and accounts secured?",
    a: "Sign in with Google or an 8-digit email verification code. FLOW uses policy-protected custody, step-up verification for sensitive actions, and deterministic multi-chain addresses without exposing raw seed phrases.",
  },
  {
    q: "Can I use FLOW for my business and team?",
    a: "Yes. FLOW supports dedicated business accounts alongside personal accounts, complete with team invitations, role-based permissions, shared multi-chain balances, and unified activity tracking.",
  },
  {
    q: "Which networks and assets are supported?",
    a: "FLOW supports Ethereum, Base, Solana, and NEAR, including native assets (ETH, SOL, NEAR) and major stablecoins (USDC, USDT), with cross-chain routing across dozens of supported tokens.",
  },
  {
    q: "Which gas token do I need when converting or sending (e.g., Base to NEAR)?",
    a: "You only need a small amount of the native gas token on the network you are sending from—for example, ETH on Base (at least 0.00001 ETH) when converting from Base to NEAR. You don't need NEAR gas ahead of time to receive your converted NEAR.",
  },
  {
    q: "If I pay a deposit address and the page refreshes or closes, will I still be credited?",
    a: "Yes. As long as you sent the quoted amount on the right network before the quote deadline expired, FLOW tracks your deposit automatically in the background until it settles in your wallet—and active deposit addresses also stay saved across page reloads.",
  },
  {
    q: "What happens if someone sends less or more than the quoted amount? Will they be refunded?",
    a: "If you send less than the quoted amount, the payment won't settle unless topped up before the timer expires, and the partial deposit is refunded to your refund address. On fixed-amount payment links, the recipient still gets the exact requested amount and any excess overpayment (above network fees and minimums) is refunded to your refund address—just make sure your refund address is valid for the network you sent from.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "FLOW makes it incredibly easy to get paid by clients around the world. It just works, and it's beautifully simple.",
    name: "Amara N.",
    role: "Creator & Consultant",
  },
  {
    quote:
      "We send one payment link and our clients pay from whatever network they use. Our treasury receives USDC on Base every time.",
    name: "David K.",
    role: "Founder, Horizon Studio",
  },
];

export function HomePageClient() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [testimonialIdx, setTestimonialIdx] = useState(0);

  const activeTestimonial = TESTIMONIALS[testimonialIdx] ?? TESTIMONIALS[0]!;

  return (
    <div className="min-h-screen bg-[#F8F6F3] dark:bg-[#0B0B0B] text-[#0B0B0B] dark:text-neutral-100 selection:bg-[#FF1A1A] selection:text-white transition-colors duration-200">
      {/* 1. NAVBAR */}
      <header className="sticky top-0 z-50 bg-[#F8F6F3]/95 dark:bg-[#0B0B0B]/90 backdrop-blur-md border-b border-transparent dark:border-white/[0.06]">
        <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between px-5 sm:px-8">
          <Link href="/" aria-label="FLOW Home" className="shrink-0">
            <FlowLogo className="h-7 w-auto sm:h-8" />
          </Link>

          <nav className="hidden items-center gap-7 text-[14px] font-medium text-[#1F1F1F] dark:text-neutral-300 md:flex">
            <a
              href="#experience"
              className="transition-colors hover:text-[#FF1A1A]"
            >
              Product
            </a>
            <a
              href="#real-life"
              className="transition-colors hover:text-[#FF1A1A]"
            >
              Use Cases
            </a>
            <Link
              href="/blog"
              className="transition-colors hover:text-[#FF1A1A]"
            >
              Blog
            </Link>
            <Link
              href="/docs"
              className="transition-colors hover:text-[#FF1A1A]"
            >
              Docs
            </Link>
            <Link
              href="/whitepaper"
              className="transition-colors hover:text-[#FF1A1A]"
            >
              Whitepaper
            </Link>
            <a href="#faq" className="transition-colors hover:text-[#FF1A1A]">
              FAQ
            </a>
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/sign-in"
              className="flow-liquid-btn-primary inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-semibold"
            >
              Get Started
            </Link>
            <Link
              href="/sign-in"
              className="flow-liquid-btn inline-flex h-10 items-center justify-center rounded-full px-5 text-[13px] font-semibold text-[#0B0B0B] dark:text-white"
            >
              Sign In
            </Link>
          </div>

          {/* Mobile Hamburger Button */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle navigation menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-[#0B0B0B] dark:text-white md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="h-6 w-6"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="flow-anim-fade-up border-b border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3] dark:bg-[#0B0B0B] px-5 pb-6 pt-2 md:hidden">
            <div className="flex flex-col gap-3 text-[15px] font-medium text-[#1F1F1F] dark:text-neutral-200">
              <a
                href="#experience"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5"
              >
                Product
              </a>
              <a
                href="#real-life"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5"
              >
                Use Cases
              </a>
              <Link
                href="/blog"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5"
              >
                Blog
              </Link>
              <Link
                href="/docs"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5"
              >
                Docs
              </Link>
              <Link
                href="/whitepaper"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5"
              >
                Whitepaper
              </Link>
              <a
                href="#faq"
                onClick={() => setMobileMenuOpen(false)}
                className="py-1.5"
              >
                FAQ
              </a>
              <div className="mt-2 flex flex-col gap-2.5">
                <Link
                  href="/sign-in"
                  className="flow-liquid-btn-primary inline-flex h-11 items-center justify-center rounded-full text-[14px] font-semibold"
                >
                  Get Started
                </Link>
                <Link
                  href="/sign-in"
                  className="flow-liquid-btn inline-flex h-11 items-center justify-center rounded-full text-[14px] font-semibold text-[#0B0B0B] dark:text-white"
                >
                  Sign In
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>

      <main>
        {/* 2. HERO SECTION */}
        <section className="mx-auto max-w-[1200px] px-5 pb-14 pt-6 sm:px-8 lg:pb-20 lg:pt-12">
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-6">
            <div className="lg:col-span-5">
              <h1 className="font-serif text-[44px] font-normal leading-[1.06] tracking-[-0.025em] text-[#0B0B0B] dark:text-white sm:text-[54px] lg:text-[60px]">
                <MotionHeadlineLine delayMs={0}>
                  Get paid in
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine delayMs={60}>
                  what you want
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine delayMs={120}>
                  while others pay
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine delayMs={180}>
                  <span className="relative inline-block">
                    with what they have.
                    <svg
                      viewBox="0 0 340 14"
                      fill="none"
                      className="mt-1 w-full text-[#FF1A1A]"
                      preserveAspectRatio="none"
                    >
                      <path
                        d="M3 9.5C82 3.5 235 2.5 337 10.5"
                        stroke="currentColor"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </MotionHeadlineLine>
              </h1>

              <MotionReveal immediate delayMs={200} distancePx={10}>
                <p className="mt-5 max-w-[420px] text-[15px] leading-[1.6] text-[#4A4A4A] dark:text-neutral-400 sm:text-[16px]">
                  A more flexible way to receive payments, so you can get paid
                  on your terms, from anyone, anywhere.
                </p>
              </MotionReveal>

              <MotionReveal immediate delayMs={260} distancePx={10}>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/sign-in"
                    onClick={() => triggerHaptic("medium")}
                    className="group flow-liquid-btn-primary flow-press inline-flex h-12 items-center justify-center gap-2 rounded-full px-7 text-[14px] font-semibold"
                  >
                    <span>Get Started</span>
                    <span
                      aria-hidden="true"
                      className="flow-anim-arrow-grow transition-transform duration-200 group-hover:translate-x-1"
                      style={{ animationDelay: "340ms" }}
                    >
                      →
                    </span>
                  </Link>
                  <a
                    href="#experience"
                    onClick={() => triggerHaptic("light")}
                    className="flow-liquid-btn flow-press inline-flex h-12 items-center justify-center rounded-full px-7 text-[14px] font-semibold text-[#0B0B0B] dark:text-white"
                  >
                    See How It Works
                  </a>
                </div>
              </MotionReveal>
            </div>

            <div className="lg:col-span-7">
              <MotionReveal immediate delayMs={180} distancePx={14}>
                <MotionParallaxCard className="mx-auto max-w-[680px]">
                  <img
                    src="/assets/hero-phones.png"
                    alt="FLOW payment received, brand screen, and QR code scan on three smartphones"
                    className="flow-anim-float h-auto w-full object-contain rounded-3xl"
                  />
                </MotionParallaxCard>
              </MotionReveal>
            </div>
          </div>
        </section>

        {/* 3. STATS STRIP */}
        <section className="border-y border-[#E6E2DA] dark:border-white/[0.08] bg-[#FAF8F5] dark:bg-[#111111]">
          <div className="mx-auto grid max-w-[1200px] grid-cols-2 divide-x divide-y divide-[#E6E2DA] dark:divide-white/[0.08] px-5 sm:px-8 lg:grid-cols-4 lg:divide-y-0">
            <div className="py-6 pr-4 text-center sm:py-8">
              <div className="text-[22px] font-bold tracking-tight text-[#0B0B0B] dark:text-white sm:text-[26px]">
                500K+
              </div>
              <div className="mt-1 text-[12px] text-[#666666] dark:text-neutral-400 sm:text-[13px]">
                People and businesses
              </div>
            </div>
            <div className="px-4 py-6 text-center sm:py-8">
              <div className="text-[22px] font-bold tracking-tight text-[#0B0B0B] dark:text-white sm:text-[26px]">
                100+
              </div>
              <div className="mt-1 text-[12px] text-[#666666] dark:text-neutral-400 sm:text-[13px]">
                Countries
              </div>
            </div>
            <div className="px-4 py-6 text-center sm:py-8">
              <div className="text-[16px] font-semibold tracking-tight text-[#0B0B0B] dark:text-white sm:text-[20px]">
                Multiple ways to pay
              </div>
              <div className="mt-1 text-[12px] text-[#666666] dark:text-neutral-400 sm:text-[13px]">
                Cards, wallets, and more
              </div>
            </div>
            <div className="py-6 pl-4 text-center sm:py-8">
              <div className="text-[16px] font-semibold tracking-tight text-[#0B0B0B] dark:text-white sm:text-[20px]">
                Get paid your way
              </div>
              <div className="mt-1 text-[12px] text-[#666666] dark:text-neutral-400 sm:text-[13px]">
                In the value you prefer
              </div>
            </div>
          </div>
        </section>

        {/* 4. THE FLOW EXPERIENCE */}
        <section
          id="experience"
          className="mx-auto max-w-[1200px] px-5 py-16 text-center sm:px-8 lg:py-24"
        >
          <MotionReveal>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
              THE FLOW EXPERIENCE
            </div>
            <h2 className="mx-auto mt-3 max-w-[540px] font-serif text-[36px] font-normal leading-[1.1] tracking-[-0.02em] text-[#0B0B0B] dark:text-white sm:text-[48px]">
              <MotionHeadlineLine onScroll delayMs={0}>
                Payments that work
              </MotionHeadlineLine>
              <br />
              <MotionHeadlineLine onScroll delayMs={80}>
                on your terms.
              </MotionHeadlineLine>
            </h2>
            <p className="mx-auto mt-4 max-w-[500px] text-[15px] leading-[1.6] text-[#555555] dark:text-neutral-400 sm:text-[16px]">
              Receive money the way you want, from the people, platforms, and
              markets you work with.
            </p>
          </MotionReveal>

          <MotionReveal delayMs={90} distancePx={14}>
            <MotionParallaxCard className="mx-auto mt-10 max-w-[520px]">
              <img
                src="/assets/phone-pedestal.png"
                alt="FLOW mobile screen showing You're getting paid $249.00 and Receive in USDC"
                className="h-auto w-full object-contain rounded-3xl"
              />
            </MotionParallaxCard>
          </MotionReveal>
        </section>

        {/* 5. BUILT FOR REAL LIFE */}
        <section
          id="real-life"
          className="mx-auto max-w-[1200px] px-5 pb-16 pt-4 sm:px-8 lg:pb-24"
        >
          <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-12">
            <MotionReveal distancePx={56} durationMs={520} className="lg:col-span-6">
              <MotionParallaxCard className="mx-auto max-w-[500px]">
                <img
                  src="/assets/phone-hand.png"
                  alt="Hand holding smartphone running FLOW app"
                  className="h-auto w-full object-contain rounded-3xl"
                />
              </MotionParallaxCard>
            </MotionReveal>

            <MotionReveal delayMs={70} className="lg:col-span-6">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
                BUILT FOR REAL LIFE
              </div>
              <h2 className="mt-3 font-serif text-[34px] font-normal leading-[1.1] tracking-[-0.02em] text-[#0B0B0B] dark:text-white sm:text-[44px]">
                <MotionHeadlineLine onScroll delayMs={0}>
                  A simpler, more
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine onScroll delayMs={80}>
                  flexible way to get paid.
                </MotionHeadlineLine>
              </h2>
              <p className="mt-4 max-w-[460px] text-[15px] leading-[1.65] text-[#555555] dark:text-neutral-400">
                Whether you&apos;re a creator, freelancer, business, or a global
                team, FLOW makes it easy to receive payments and use your money,
                your way.
              </p>

              <ul className="mt-8 space-y-4">
                <li className="flex items-center gap-3.5 text-[15px] font-medium text-[#1F1F1F] dark:text-neutral-200">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFECE6] dark:bg-white/[0.08] text-[#0B0B0B] dark:text-white">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-4 w-4"
                    >
                      <polygon points="12 2 2 7 12 12 22 7 12 2" />
                      <polyline points="2 12 12 17 22 12" />
                      <polyline points="2 17 12 22 22 17" />
                    </svg>
                  </span>
                  <span>Receive in the value you prefer</span>
                </li>
                <li className="flex items-center gap-3.5 text-[15px] font-medium text-[#1F1F1F] dark:text-neutral-200">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFECE6] dark:bg-white/[0.08] text-[#0B0B0B] dark:text-white">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-4 w-4"
                    >
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                    </svg>
                  </span>
                  <span>A smooth, modern payment experience</span>
                </li>
                <li className="flex items-center gap-3.5 text-[15px] font-medium text-[#1F1F1F] dark:text-neutral-200">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFECE6] dark:bg-white/[0.08] text-[#0B0B0B] dark:text-white">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="h-4 w-4"
                    >
                      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                  </span>
                  <span>For individuals and businesses alike</span>
                </li>
              </ul>
            </MotionReveal>
          </div>
        </section>

        {/* 6. DARK FEATURE PANELS */}
        <section className="bg-[#0B0B0B] px-5 py-16 text-white sm:px-8 lg:py-20">
          <div className="mx-auto max-w-[1120px] space-y-5">
            {/* Panel 1 */}
            <MotionReveal>
              <div className="flow-card-lift grid items-center overflow-hidden rounded-[26px] border border-white/10 bg-[#121212] md:grid-cols-12">
              <div className="p-7 sm:p-10 md:col-span-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
                  RECEIVE PAYMENTS
                </div>
                <h3 className="mt-2.5 font-serif text-[28px] font-normal leading-[1.15] text-white sm:text-[34px]">
                  <MotionHeadlineLine onScroll delayMs={0}>
                    Get paid, your way.
                  </MotionHeadlineLine>
                </h3>
                <p className="mt-3 max-w-[360px] text-[14px] leading-[1.6] text-white/65">
                  Accept payments from anyone and receive them in the value that
                  works for you.
                </p>
              </div>
              <div className="flex items-end justify-end md:col-span-6">
                <img
                  src="/assets/bento-visual-1.png"
                  alt="Payment received $249.00 in USDC"
                  className="h-auto w-full max-w-[460px] object-cover"
                />
              </div>
            </div>
            </MotionReveal>

            {/* Panel 2 */}
            <MotionReveal delayMs={70}>
              <div className="flow-card-lift grid items-center overflow-hidden rounded-[26px] border border-white/10 bg-[#121212] md:grid-cols-12">
              <div className="p-7 sm:p-10 md:col-span-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
                  CHECKOUT
                </div>
                <h3 className="mt-2.5 font-serif text-[28px] font-normal leading-[1.15] text-white sm:text-[34px]">
                  <MotionHeadlineLine onScroll delayMs={0}>
                    A smoother way to pay.
                  </MotionHeadlineLine>
                </h3>
                <p className="mt-3 max-w-[360px] text-[14px] leading-[1.6] text-white/65">
                  Give your customers a fast, reliable, and beautiful way to pay
                  you.
                </p>
              </div>
              <div className="flex items-center justify-end md:col-span-6">
                <img
                  src="/assets/bento-visual-2.png"
                  alt="Pay with FLOW checkout options"
                  className="h-auto w-full max-w-[460px] object-cover"
                />
              </div>
            </div>
            </MotionReveal>

            {/* Panel 3 */}
            <MotionReveal delayMs={140}>
              <div className="flow-card-lift grid items-center overflow-hidden rounded-[26px] border border-white/10 bg-[#121212] md:grid-cols-12">
              <div className="p-7 sm:p-10 md:col-span-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
                  MOVE VALUE
                </div>
                <h3 className="mt-2.5 font-serif text-[28px] font-normal leading-[1.15] text-white sm:text-[34px]">
                  <MotionHeadlineLine onScroll delayMs={0}>
                    Move across ecosystems,
                  </MotionHeadlineLine>
                  <br />
                  <MotionHeadlineLine onScroll delayMs={80}>
                    without the friction.
                  </MotionHeadlineLine>
                </h3>
                <p className="mt-3 max-w-[360px] text-[14px] leading-[1.6] text-white/65">
                  Send, receive, and use your money across different platforms
                  and markets with ease.
                </p>
              </div>
              <div className="flex items-end justify-end md:col-span-6">
                <img
                  src="/assets/bento-visual-3.png"
                  alt="FLOW symbol on hardware tile"
                  className="h-auto w-full max-w-[460px] object-cover"
                />
              </div>
            </div>
            </MotionReveal>
          </div>
        </section>

        {/* 7. WHY FLOW */}
        <section className="mx-auto max-w-[1200px] px-5 py-16 sm:px-8 lg:py-24">
          <div className="grid items-start gap-8 lg:grid-cols-12">
            <MotionReveal className="lg:col-span-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
                WHY FLOW
              </div>
              <h2 className="mt-2.5 font-serif text-[32px] font-normal leading-[1.12] tracking-[-0.02em] text-[#0B0B0B] dark:text-white sm:text-[40px]">
                <MotionHeadlineLine onScroll delayMs={0}>
                  More freedom
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine onScroll delayMs={80}>
                  for the way you work.
                </MotionHeadlineLine>
              </h2>
            </MotionReveal>

            <div className="grid gap-4 sm:grid-cols-3 lg:col-span-8">
              <MotionReveal delayMs={40} className="flow-card-lift rounded-[24px] bg-[#F1EEE8] dark:bg-[#141414] border border-transparent dark:border-white/[0.08] p-6">
                <div className="text-[#FF1A1A]">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-5 w-5"
                  >
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 12 12 17 22 12" />
                    <polyline points="2 17 12 22 22 17" />
                  </svg>
                </div>
                <h3 className="mt-5 text-[16px] font-semibold text-[#0B0B0B] dark:text-white">
                  Flexibility
                </h3>
                <p className="mt-1.5 text-[13px] leading-[1.55] text-[#5A5A5A] dark:text-neutral-400">
                  Get paid in the value that suits you.
                </p>
              </MotionReveal>

              <MotionReveal delayMs={100} className="flow-card-lift rounded-[24px] bg-[#F1EEE8] dark:bg-[#141414] border border-transparent dark:border-white/[0.08] p-6">
                <div className="text-[#FF1A1A]">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-5 w-5"
                  >
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <h3 className="mt-5 text-[16px] font-semibold text-[#0B0B0B] dark:text-white">
                  A cleaner experience
                </h3>
                <p className="mt-1.5 text-[13px] leading-[1.55] text-[#5A5A5A] dark:text-neutral-400">
                  Simple, fast, and frictionless payments.
                </p>
              </MotionReveal>

              <MotionReveal delayMs={160} className="flow-card-lift rounded-[24px] bg-[#F1EEE8] dark:bg-[#141414] border border-transparent dark:border-white/[0.08] p-6">
                <div className="text-[#FF1A1A]">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-5 w-5"
                  >
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h3 className="mt-5 text-[16px] font-semibold text-[#0B0B0B] dark:text-white">
                  For you and your business
                </h3>
                <p className="mt-1.5 text-[13px] leading-[1.55] text-[#5A5A5A] dark:text-neutral-400">
                  Built for individuals, creators, and growing businesses.
                </p>
              </MotionReveal>
            </div>
          </div>
        </section>

        {/* 8. GET PAID ANYWHERE */}
        <section
          id="get-paid-anywhere"
          className="mx-auto max-w-[1200px] px-5 pb-16 sm:px-8"
        >
          <MotionReveal>
          <div className="grid items-center gap-8 rounded-[32px] bg-[#F1EEE8] dark:bg-[#141414] border border-transparent dark:border-white/[0.08] p-7 sm:p-12 lg:grid-cols-12">
            <div className="lg:col-span-4">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
                GET PAID ANYWHERE
              </div>
              <h2 className="mt-2.5 font-serif text-[32px] font-normal leading-[1.12] tracking-[-0.02em] text-[#0B0B0B] dark:text-white sm:text-[38px]">
                <MotionHeadlineLine onScroll delayMs={0}>
                  Turn any payment
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine onScroll delayMs={70}>
                  into a simple link
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine onScroll delayMs={140}>
                  or QR.
                </MotionHeadlineLine>
              </h2>
              <p className="mt-4 text-[14px] leading-[1.6] text-[#5A5A5A] dark:text-neutral-400">
                Share a link, show your QR, or send an invoice — and get paid in
                the value you prefer.
              </p>
            </div>

            <div className="flex justify-center lg:col-span-4">
              <MotionParallaxCard>
                <img
                  src="/assets/qr-standee.png"
                  alt="FLOW Scan to pay QR standee"
                  className="h-auto w-full max-w-[250px] object-contain rounded-2xl"
                />
              </MotionParallaxCard>
            </div>

            <div className="space-y-3 lg:col-span-4">
              <div className="flow-card-lift flex items-center gap-4 rounded-2xl bg-white dark:bg-[#1B1B1B] border border-transparent dark:border-white/[0.06] p-4 shadow-2xs">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8F6F3] dark:bg-white/[0.08] text-[#0B0B0B] dark:text-white">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-4 w-4"
                  >
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-[#0B0B0B] dark:text-white">
                    Payment link
                  </div>
                  <div className="text-[12px] text-[#666666] dark:text-neutral-400">
                    Share and get paid instantly.
                  </div>
                </div>
              </div>

              <div className="flow-card-lift flex items-center gap-4 rounded-2xl bg-white dark:bg-[#1B1B1B] border border-transparent dark:border-white/[0.06] p-4 shadow-2xs">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8F6F3] dark:bg-white/[0.08] text-[#0B0B0B] dark:text-white">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-4 w-4"
                  >
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <rect x="14" y="14" width="3" height="3" />
                    <path d="M19 14h2v2M14 19h2v2M19 19h2v2" />
                  </svg>
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-[#0B0B0B] dark:text-white">
                    QR payment
                  </div>
                  <div className="text-[12px] text-[#666666] dark:text-neutral-400">
                    Accept in person or online.
                  </div>
                </div>
              </div>

              <div className="flow-card-lift flex items-center gap-4 rounded-2xl bg-white dark:bg-[#1B1B1B] border border-transparent dark:border-white/[0.06] p-4 shadow-2xs">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F8F6F3] dark:bg-white/[0.08] text-[#0B0B0B] dark:text-white">
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="h-4 w-4"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="8" y1="13" x2="16" y2="13" />
                    <line x1="8" y1="17" x2="13" y2="17" />
                  </svg>
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-[#0B0B0B] dark:text-white">
                    Invoice
                  </div>
                  <div className="text-[12px] text-[#666666] dark:text-neutral-400">
                    Send a professional invoice in seconds.
                  </div>
                </div>
              </div>
            </div>
          </div>
          </MotionReveal>
        </section>

        {/* 9. LOVED BY PEOPLE LIKE YOU */}
        <section className="mx-auto max-w-[1200px] px-5 py-12 sm:px-8 lg:py-16">
          <div className="grid items-center gap-8 border-b border-[#E6E2DA] dark:border-white/[0.08] pb-14 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
                LOVED BY PEOPLE LIKE YOU
              </div>
              <h2 className="mt-2.5 font-serif text-[30px] font-normal leading-[1.15] tracking-[-0.02em] text-[#0B0B0B] dark:text-white sm:text-[36px]">
                <MotionHeadlineLine onScroll delayMs={0}>
                  Trusted by creators,
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine onScroll delayMs={70}>
                  freelancers, and
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine onScroll delayMs={140}>
                  businesses worldwide.
                </MotionHeadlineLine>
              </h2>
            </div>

            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center lg:col-span-7">
              <div key={testimonialIdx} className="flow-anim-fade-up max-w-[460px]">
                <p className="text-[16px] leading-[1.6] text-[#1F1F1F] dark:text-neutral-200 sm:text-[18px]">
                  &ldquo;{activeTestimonial.quote}&rdquo;
                </p>
                <div className="mt-5 flex items-center gap-3">
                  <img
                    src="/assets/amara-avatar.png"
                    alt={activeTestimonial.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div>
                    <div className="text-[14px] font-semibold text-[#0B0B0B] dark:text-white">
                      {activeTestimonial.name}
                    </div>
                    <div className="text-[12px] text-[#666666] dark:text-neutral-400">
                      {activeTestimonial.role}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2.5 self-start sm:self-center">
                <button
                  type="button"
                  aria-label="Previous testimonial"
                  onClick={() =>
                    setTestimonialIdx(
                      (i) =>
                        (i - 1 + TESTIMONIALS.length) % TESTIMONIALS.length,
                    )
                  }
                  className="flow-liquid-btn flow-press flex h-10 w-10 items-center justify-center rounded-full text-[#0B0B0B] dark:text-white cursor-pointer"
                >
                  ←
                </button>
                <button
                  type="button"
                  aria-label="Next testimonial"
                  onClick={() =>
                    setTestimonialIdx((i) => (i + 1) % TESTIMONIALS.length)
                  }
                  className="flow-liquid-btn-primary flow-press flex h-10 w-10 items-center justify-center rounded-full cursor-pointer"
                >
                  →
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* 10. FAQ */}
        <section
          id="faq"
          className="mx-auto max-w-[1200px] px-5 pb-16 pt-2 sm:px-8 lg:pb-20"
        >
          <div className="flex items-end justify-between pb-6">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#FF1A1A]">
                FAQ
              </div>
              <h2 className="mt-2 font-serif text-[30px] font-normal leading-[1.15] text-[#0B0B0B] dark:text-white sm:text-[36px]">
                <MotionHeadlineLine onScroll delayMs={0}>
                  Frequently asked questions.
                </MotionHeadlineLine>
              </h2>
            </div>
            <a
              href="#faq"
              className="hidden items-center gap-1.5 text-[13px] font-semibold text-[#0B0B0B] dark:text-white hover:text-[#FF1A1A] sm:inline-flex"
            >
              <span>View all FAQs</span>
              <span aria-hidden="true">→</span>
            </a>
          </div>

          <div className="divide-y divide-[#E4E0D8] dark:divide-white/[0.08] border-y border-[#E4E0D8] dark:border-white/[0.08]">
            {FAQS.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q}>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic("light");
                      setOpenFaq(isOpen ? null : idx);
                    }}
                    className="flex w-full items-center justify-between py-4 text-left text-[14px] font-semibold text-[#0B0B0B] dark:text-white transition hover:text-[#FF1A1A] sm:text-[15px] cursor-pointer"
                  >
                    <span>{item.q}</span>
                    <span className="ml-4 text-[18px] font-normal text-[#555555] dark:text-neutral-400">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>
                  {isOpen && (
                    <div className="flow-anim-fade-up pb-4 pr-8 text-[14px] leading-[1.6] text-[#555555] dark:text-neutral-400">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* 11. FINAL CTA BANNER */}
        <section className="mx-auto max-w-[1200px] px-5 pb-16 sm:px-8">
          <MotionReveal>
          <div className="grid items-center overflow-hidden rounded-[28px] bg-[#0B0B0B] dark:bg-[#141414] border border-transparent dark:border-white/[0.08] text-white md:grid-cols-12">
            <div className="p-8 sm:p-12 md:col-span-6">
              <h2 className="font-serif text-[32px] font-normal leading-[1.1] text-white sm:text-[40px]">
                <MotionHeadlineLine onScroll delayMs={0}>
                  Start getting paid
                </MotionHeadlineLine>
                <br />
                <MotionHeadlineLine onScroll delayMs={80}>
                  with FLOW.
                </MotionHeadlineLine>
              </h2>
              <p className="mt-3 max-w-[340px] text-[13px] leading-[1.6] text-white/65 sm:text-[14px]">
                Join individuals and businesses around the world who get paid on
                their terms.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/sign-in"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-6 text-[13px] font-semibold text-[#0B0B0B] transition hover:bg-white/90"
                >
                  <span>Get Started</span>
                  <span aria-hidden="true">→</span>
                </Link>
                <Link
                  href="/sign-in"
                  className="inline-flex h-11 items-center justify-center rounded-full border border-white/25 px-6 text-[13px] font-semibold text-white transition hover:border-white"
                >
                  Sign In
                </Link>
              </div>
            </div>

            <div className="flex h-full items-end justify-end md:col-span-6">
              <img
                src="/assets/cta-phone-angled.png"
                alt="FLOW smartphone preview"
                className="h-auto w-full max-w-[520px] object-cover"
              />
            </div>
          </div>
          </MotionReveal>
        </section>
      </main>

      {/* 12. FOOTER */}
      <footer className="border-t border-[#E6E2DA] dark:border-white/[0.08] bg-[#F8F6F3] dark:bg-[#0B0B0B] py-12">
        <div className="mx-auto flex max-w-[1200px] flex-col justify-between gap-8 px-5 sm:flex-row sm:items-start sm:px-8">
          <div>
            <FlowLogo className="h-6 w-auto" />
          </div>

          <div className="grid grid-cols-3 gap-10 text-[12px] sm:gap-16">
            <div>
              <div className="font-semibold text-[#0B0B0B] dark:text-white">
                Product
              </div>
              <ul className="mt-2.5 space-y-1.5 text-[#666666] dark:text-neutral-400">
                <li>
                  <a
                    href="#experience"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Overview
                  </a>
                </li>
                <li>
                  <a
                    href="#real-life"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Use Cases
                  </a>
                </li>
                <li>
                  <a
                    href="#faq"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Pricing
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-[#0B0B0B] dark:text-white">
                Resources
              </div>
              <ul className="mt-2.5 space-y-1.5 text-[#666666] dark:text-neutral-400">
                <li>
                  <Link
                    href="/blog"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Blog
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Docs
                  </Link>
                </li>
                <li>
                  <Link
                    href="/whitepaper"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Whitepaper
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs#getting-started"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Guides
                  </Link>
                </li>
                <li>
                  <Link
                    href="/docs#states-troubleshooting"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Help
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <div className="font-semibold text-[#0B0B0B] dark:text-white">
                Company
              </div>
              <ul className="mt-2.5 space-y-1.5 text-[#666666] dark:text-neutral-400">
                <li>
                  <a
                    href="#experience"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    About
                  </a>
                </li>
                <li>
                  <a
                    href="#real-life"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Careers
                  </a>
                </li>
                <li>
                  <a
                    href="mailto:flow@devhub.forum"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Contact
                  </a>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms"
                    className="hover:text-[#0B0B0B] dark:hover:text-white"
                  >
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-4 text-[#0B0B0B] dark:text-white">
            <a
              href="https://x.com/use_flowapp"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="FLOW on X (formerly Twitter)"
              className="text-[14px] font-bold hover:text-[#FF1A1A] transition-colors"
            >
              𝕏
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
