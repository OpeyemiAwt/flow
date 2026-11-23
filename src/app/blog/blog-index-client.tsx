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
  const [selectedCategory, setSelectedCategory] = useState<"All" | BlogCategory>(
    "All",
  );
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

  return (
    <div className="space-y-10">
      {/* Header */}
      <section className="space-y-4 max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-[#E6E2DA] dark:border-white/[0.1] bg-white dark:bg-white/[0.04] px-3 py-1 text-xs font-semibold text-[#3B3B3B] dark:text-neutral-300">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FF1A1A]" />
          <span>FLOW Journal &amp; Shipping Updates</span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-[#0B0B0B] dark:text-white leading-[1.08]">
          What we&apos;re building &amp; shipping
        </h1>
        <p className="text-base sm:text-lg text-[#555555] dark:text-neutral-400 leading-relaxed">
          Product releases, weekly updates, and deep dives into every part of
          the FLOW multi-chain wallet and payment platform.
        </p>
      </section>

      {/* Filter Pills + Search */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-y border-[#E6E2DA]/90 dark:border-white/[0.08] py-4">
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0"
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
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  active
                    ? "bg-[#0B0B0B] text-white dark:bg-white dark:text-[#0B0B0B]"
                    : "bg-white dark:bg-white/[0.05] border border-[#E6E2DA] dark:border-white/[0.08] text-[#444] dark:text-neutral-300 hover:border-[#0B0B0B]/30 dark:hover:border-white/25"
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-neutral-400"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles..."
            aria-label="Search blog posts"
            className="w-full rounded-full border border-[#E6E2DA] dark:border-white/[0.1] bg-white dark:bg-[#141414] pl-9 pr-4 py-2 text-xs text-[#0B0B0B] dark:text-white placeholder:text-neutral-400 focus:outline-hidden focus:border-[#0B0B0B] dark:focus:border-white/30"
          />
        </div>
      </section>

      {/* Featured Article */}
      {featuredPost && (
        <Link
          href={`/blog/${featuredPost.slug}`}
          className="group block overflow-hidden rounded-[28px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] shadow-xs hover:shadow-md hover:border-[#0B0B0B]/25 dark:hover:border-white/20 transition-all"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-5 bg-[#030305] overflow-hidden">
              <img
                src={featuredPost.ogImage}
                alt={featuredPost.title}
                width={1200}
                height={630}
                className="h-full w-full aspect-[1200/630] lg:aspect-auto object-cover group-hover:scale-[1.02] transition-transform duration-500"
              />
            </div>
            <div
              className={`lg:col-span-7 bg-gradient-to-br ${featuredPost.accent} p-6 sm:p-8 space-y-5 flex flex-col justify-between`}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${categoryBadgeClass(featuredPost.category)}`}
                  >
                    {featuredPost.category}
                  </span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {formatBlogDate(featuredPost.publishedAt)}
                  </span>
                  <span className="text-neutral-300 dark:text-neutral-700">·</span>
                  <span className="text-neutral-500 dark:text-neutral-400">
                    {featuredPost.readTime}
                  </span>
                  <span className="ml-auto hidden sm:inline-flex items-center rounded-full bg-[#0B0B0B]/5 dark:bg-white/[0.07] px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 dark:text-neutral-200">
                    Featured MVP Launch
                  </span>
                </div>

                <div className="space-y-2.5">
                  <h2 className="font-serif text-2xl sm:text-3xl font-normal tracking-tight text-[#0B0B0B] dark:text-white group-hover:text-[#FF1A1A] dark:group-hover:text-[#FF5C5C] transition-colors leading-[1.15]">
                    {featuredPost.title}
                  </h2>
                  <p className="text-sm text-[#555555] dark:text-neutral-300 leading-relaxed">
                    {featuredPost.summary}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                  {featuredPost.highlights.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-[#E6E2DA]/80 dark:border-white/[0.08] bg-white/80 dark:bg-black/25 px-3.5 py-2.5"
                    >
                      <div className="text-[10.5px] font-medium text-neutral-500 dark:text-neutral-400">
                        {item.label}
                      </div>
                      <div className="mt-0.5 text-xs font-semibold text-[#0B0B0B] dark:text-white">
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 text-xs font-semibold text-[#0B0B0B] dark:text-white">
                <span className="text-neutral-500 dark:text-neutral-400 font-medium">
                  By {featuredPost.author.name}
                </span>
                <span className="inline-flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform">
                  Read full post
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </div>
          </div>
        </Link>
      )}

      {/* Articles Grid */}
      {gridPosts.length > 0 ? (
        <section
          aria-label="All blog posts"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {gridPosts.map((post) => (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col justify-between overflow-hidden rounded-[24px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] shadow-2xs hover:shadow-md hover:border-[#0B0B0B]/25 dark:hover:border-white/20 transition-all"
            >
              <div>
                <div className="aspect-[1200/630] w-full overflow-hidden bg-[#030305] border-b border-[#E6E2DA]/70 dark:border-white/[0.06]">
                  <img
                    src={post.ogImage}
                    alt={post.title}
                    width={1200}
                    height={630}
                    loading="lazy"
                    className="h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                </div>
                <div className="p-6 space-y-3.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-semibold ${categoryBadgeClass(post.category)}`}
                    >
                      {post.category}
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {formatBlogDate(post.publishedAt)}
                    </span>
                    <span className="text-neutral-300 dark:text-neutral-700">
                      ·
                    </span>
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {post.readTime}
                    </span>
                  </div>

                  <h3 className="font-serif text-xl font-normal tracking-tight text-[#0B0B0B] dark:text-white group-hover:text-[#FF1A1A] dark:group-hover:text-[#FF5C5C] transition-colors leading-snug">
                    {post.title}
                  </h3>

                  <p className="text-xs sm:text-[13px] text-[#555555] dark:text-neutral-400 leading-relaxed line-clamp-3">
                    {post.summary}
                  </p>
                </div>
              </div>

              <div className="px-6 pb-6 pt-3 border-t border-neutral-100 dark:border-white/[0.06] flex items-center justify-between text-xs font-semibold text-[#0B0B0B] dark:text-white">
                <div className="flex flex-wrap gap-1.5">
                  {post.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-neutral-100 dark:bg-white/[0.06] px-2 py-0.5 text-[10.5px] font-medium text-neutral-600 dark:text-neutral-400"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <span className="inline-flex items-center gap-1 shrink-0 group-hover:translate-x-0.5 transition-transform">
                  Read
                  <span aria-hidden="true">→</span>
                </span>
              </div>
            </Link>
          ))}
        </section>
      ) : !featuredPost ? (
        <div className="rounded-[24px] border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-[#0B0B0B] dark:text-white">
            No matching posts yet
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Try switching categories or clearing your search filter.
          </p>
          <button
            type="button"
            onClick={() => {
              setSelectedCategory("All");
              setQuery("");
            }}
            className="mt-2 inline-flex rounded-full bg-[#0B0B0B] dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-[#0B0B0B] cursor-pointer"
          >
            Show all posts
          </button>
        </div>
      ) : null}
    </div>
  );
}
