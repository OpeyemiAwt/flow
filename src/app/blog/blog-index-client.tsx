"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BLOG_CATEGORIES,
  formatBlogDate,
  type BlogCategory,
  type BlogPost,
} from "../../content/blog-posts.ts";

function categoryBadgeClass(category: BlogCategory): string {
  switch (category) {
    case "Product":
      return "bg-[#FF1A1A]/10 text-[#CC1414] dark:bg-[#FF1A1A]/15 dark:text-[#FF6B6B]";
    case "Shipping":
      return "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300";
    case "Engineering":
      return "bg-violet-500/10 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300";
    case "Weekly Update":
      return "bg-amber-500/12 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300";
  }
}

export function BlogIndexClient({ posts }: { posts: readonly BlogPost[] }) {
  const [selectedCategory, setSelectedCategory] = useState<
    "All" | BlogCategory
  >("All");
  const [query, setQuery] = useState("");

  const filteredPosts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (selectedCategory !== "All" && post.category !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      const haystack = [
        post.title,
        post.summary,
        post.category,
        ...post.tags,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [posts, query, selectedCategory]);

  const showFeaturedLayout = selectedCategory === "All" && !query.trim();
  const featuredPost = showFeaturedLayout
    ? filteredPosts.find((p) => p.featured) ?? filteredPosts[0] ?? null
    : null;
  const gridPosts = featuredPost
    ? filteredPosts.filter((p) => p.slug !== featuredPost.slug)
    : filteredPosts;

  const latestDate = posts[0] ? formatBlogDate(posts[0].publishedAt) : "Live";

  return (
    <div className="min-w-0">
      {/* Hero (Matches Docs & Whitepaper) */}
      <section id="overview" className="scroll-mt-28">
        <h1 className="mt-3 text-balance text-[34px] font-light leading-[1.1] tracking-[-0.025em] text-[#0b0c0e] dark:text-white md:text-[44px] md:leading-[1.06]">
          Blog
        </h1>
        <p className="mt-4 max-w-[64ch] text-pretty text-[16px] sm:text-[17px] leading-[1.6] text-[#5f636a] dark:text-neutral-400">
          Product releases, weekly shipping notes, and deep dives into every
          layer of the FLOW multi-chain wallet and payment platform.
        </p>

        {/* Gloam-style Metadata Spec Grid (<dl>) */}
        <dl className="mt-7 grid grid-cols-2 gap-x-5 gap-y-4 rounded-[20px] bg-[#f3f4f5] dark:bg-white/[0.04] border border-[#e4e6e9]/70 dark:border-white/[0.07] p-4 sm:grid-cols-3 sm:gap-x-6 sm:p-6">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
              Published
            </dt>
            <dd className="mt-1 text-[14.5px] sm:text-[15px] leading-snug text-[#0b0c0e] dark:text-white tabular-nums">
              {posts.length} articles
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
              Latest update
            </dt>
            <dd className="mt-1 text-[14.5px] sm:text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
              {latestDate}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-1 min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
              Topics
            </dt>
            <dd className="mt-1 text-[14.5px] sm:text-[15px] leading-snug text-[#0b0c0e] dark:text-white">
              Product · Shipping · Engineering
            </dd>
          </div>
        </dl>
      </section>

      {/* Filter Pills + Search */}
      <section
        id="filter"
        className="scroll-mt-28 mt-8 flex flex-col gap-3 border-y border-[#e4e6e9] dark:border-white/[0.08] py-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div
          className="-mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:pb-0"
          role="tablist"
          aria-label="Filter blog posts by category"
        >
          {BLOG_CATEGORIES.map((category) => {
            const active = selectedCategory === category;
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedCategory(category)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "bg-[#0b0c0e] text-white dark:bg-white dark:text-[#0b0c0e]"
                    : "bg-[#f3f4f5] dark:bg-white/[0.06] text-[#5f636a] dark:text-neutral-300 hover:text-[#0b0c0e] dark:hover:text-white"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-56 shrink-0">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#6b6f76] dark:text-neutral-400"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter articles..."
            aria-label="Filter blog posts"
            className="h-9 w-full rounded-xl border border-transparent bg-[#f3f4f5] dark:bg-white/[0.06] pl-8 pr-3 text-[13px] text-[#0b0c0e] dark:text-white placeholder:text-[#6b6f76] dark:placeholder:text-neutral-400 focus:border-[#cfd2d6] dark:focus:border-white/20 focus:bg-white dark:focus:bg-[#141518] focus:outline-hidden transition-colors"
          />
        </div>
      </section>

      {/* Featured Article */}
      {featuredPost && (
        <section id="featured" className="scroll-mt-28 mt-8 space-y-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
            Featured release
          </p>

          <Link
            href={`/blog/${featuredPost.slug}`}
            className="group block overflow-hidden rounded-[22px] border border-[#e4e6e9] dark:border-white/[0.08] bg-white dark:bg-[#111214] hover:border-[#cfd2d6] dark:hover:border-white/[0.18] transition-colors"
          >
            <div className="aspect-[1200/630] w-full overflow-hidden bg-[#030305] border-b border-[#e4e6e9] dark:border-white/[0.06]">
              <img
                src={featuredPost.ogImage}
                alt={featuredPost.title}
                width={1200}
                height={630}
                className="h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
              />
            </div>

            <div className="p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12px]">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ${categoryBadgeClass(featuredPost.category)}`}
                >
                  {featuredPost.category}
                </span>
                <span className="text-[#5f636a] dark:text-neutral-400">
                  {formatBlogDate(featuredPost.publishedAt)}
                </span>
                <span className="text-[#cfd2d6] dark:text-neutral-700">·</span>
                <span className="text-[#5f636a] dark:text-neutral-400">
                  {featuredPost.readTime}
                </span>
              </div>

              <div className="space-y-2">
                <h2 className="text-[22px] sm:text-[26px] font-normal tracking-[-0.02em] leading-[1.2] text-[#0b0c0e] dark:text-white group-hover:text-[#FF1A1A] dark:group-hover:text-[#FF5C5C] transition-colors">
                  {featuredPost.title}
                </h2>
                <p className="text-[14.5px] sm:text-[15px] leading-[1.6] text-[#5f636a] dark:text-neutral-400">
                  {featuredPost.summary}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 pt-1">
                {featuredPost.highlights.map((item) => (
                  <div
                    key={item.label}
                    className="min-w-0 overflow-hidden rounded-[14px] bg-[#f3f4f5] dark:bg-white/[0.04] px-3.5 py-2.5"
                  >
                    <div className="text-[11px] font-medium text-[#6b6f76] dark:text-neutral-400">
                      {item.label}
                    </div>
                    <div className="mt-0.5 text-[13px] font-medium text-[#0b0c0e] dark:text-white [overflow-wrap:anywhere] leading-snug">
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-[#e4e6e9] dark:border-white/[0.07] text-[13px]">
                <span className="text-[#5f636a] dark:text-neutral-400 truncate">
                  By {featuredPost.author.name}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[#0b0c0e] dark:text-white group-hover:translate-x-0.5 transition-transform">
                  Read article
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </div>
          </Link>
        </section>
      )}

      {/* Articles Feed */}
      <section
        id="all-posts"
        aria-label="All blog posts"
        className="scroll-mt-28 mt-10 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08] space-y-5"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[22px] sm:text-[24px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
            {selectedCategory === "All" && !query.trim()
              ? "All articles"
              : `Matching articles (${filteredPosts.length})`}
          </h2>
          {(selectedCategory !== "All" || query.trim()) && (
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("All");
                setQuery("");
              }}
              className="text-[12.5px] font-medium text-[#5f636a] dark:text-neutral-400 hover:text-[#0b0c0e] dark:hover:text-white cursor-pointer"
            >
              Reset filter
            </button>
          )}
        </div>

        {gridPosts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {gridPosts.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="group min-w-0 flex flex-col justify-between overflow-hidden rounded-[20px] border border-[#e4e6e9] dark:border-white/[0.08] bg-white dark:bg-[#111214] hover:border-[#cfd2d6] dark:hover:border-white/[0.18] transition-colors"
              >
                <div className="min-w-0">
                  <div className="aspect-[1200/630] w-full overflow-hidden bg-[#030305] border-b border-[#e4e6e9]/80 dark:border-white/[0.06]">
                    <img
                      src={post.ogImage}
                      alt={post.title}
                      width={1200}
                      height={630}
                      loading="lazy"
                      className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                    />
                  </div>
                  <div className="p-4 sm:p-5 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${categoryBadgeClass(post.category)}`}
                      >
                        {post.category}
                      </span>
                      <span className="text-[#5f636a] dark:text-neutral-400">
                        {formatBlogDate(post.publishedAt)}
                      </span>
                      <span className="text-[#cfd2d6] dark:text-neutral-700">
                        ·
                      </span>
                      <span className="text-[#5f636a] dark:text-neutral-400">
                        {post.readTime}
                      </span>
                    </div>

                    <h3 className="text-[18px] font-normal tracking-[-0.015em] leading-[1.3] text-[#0b0c0e] dark:text-white group-hover:text-[#FF1A1A] dark:group-hover:text-[#FF5C5C] transition-colors">
                      {post.title}
                    </h3>

                    <p className="text-[13.5px] leading-[1.55] text-[#5f636a] dark:text-neutral-400 line-clamp-3">
                      {post.summary}
                    </p>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-3 sm:px-5 sm:pb-5 border-t border-[#e4e6e9]/70 dark:border-white/[0.06] flex items-center justify-between gap-2 text-[12.5px]">
                  <div className="flex flex-wrap gap-1.5 min-w-0">
                    {post.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-[#f3f4f5] dark:bg-white/[0.06] px-2 py-0.5 text-[11px] text-[#5f636a] dark:text-neutral-400 truncate max-w-[120px]"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 font-medium text-[#0b0c0e] dark:text-white group-hover:translate-x-0.5 transition-transform">
                    Read
                    <span aria-hidden="true">→</span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : !featuredPost ? (
          <div className="rounded-[20px] bg-[#f3f4f5] dark:bg-white/[0.04] border border-[#e4e6e9]/70 dark:border-white/[0.07] p-8 text-center space-y-2">
            <p className="text-[15px] font-medium text-[#0b0c0e] dark:text-white">
              No matching articles found
            </p>
            <p className="text-[13.5px] text-[#5f636a] dark:text-neutral-400">
              Try switching categories or clearing your search filter.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelectedCategory("All");
                setQuery("");
              }}
              className="mt-2 inline-flex h-9 items-center rounded-full bg-[#0b0c0e] dark:bg-white px-4 text-[13px] font-medium text-white dark:text-[#0b0c0e] cursor-pointer"
            >
              Show all articles
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
