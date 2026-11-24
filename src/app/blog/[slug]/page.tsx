import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicSiteChrome } from "../../../components/public-site-chrome.tsx";
import {
  BLOG_POSTS,
  formatBlogDate,
  getBlogPostBySlug,
  getRelatedBlogPosts,
  type BlogCategory,
} from "../../../content/blog-posts.ts";

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

export function generateStaticParams() {
  return BLOG_POSTS.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) {
    return { title: "Post not found · FLOW Blog" };
  }
  const canonicalUrl = `https://flow.devhub.forum/blog/${post.slug}`;
  const ogImageUrl = `https://flow.devhub.forum${post.ogImage}`;
  return {
    title: `${post.title} · FLOW Blog`,
    description: post.summary,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: post.title,
      description: post.summary,
      url: canonicalUrl,
      type: "article",
      publishedTime: `${post.publishedAt}T00:00:00Z`,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: post.title,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.summary,
      images: [ogImageUrl],
    },
  };
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) {
    notFound();
  }
  const related = getRelatedBlogPosts(post.slug, 3);

  return (
    <PublicSiteChrome activeRoute="blog">
      <article className="mx-auto max-w-3xl space-y-10">
        {/* Back link */}
        <div>
          <Link
            href="/blog"
            className="inline-flex items-center gap-2 rounded-full border border-[#E6E2DA] dark:border-white/[0.1] bg-white dark:bg-[#141414] px-3.5 py-1.5 text-xs font-semibold text-[#0B0B0B] dark:text-white hover:border-[#0B0B0B]/30 dark:hover:border-white/25 transition-colors"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M19 12H5" />
              <path d="m12 19-7-7 7-7" />
            </svg>
            <span>All posts</span>
          </Link>
        </div>

        {/* Article Header */}
        <header className="space-y-5">
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 font-semibold ${categoryBadgeClass(post.category)}`}
            >
              {post.category}
            </span>
            <time
              dateTime={post.publishedAt}
              className="text-neutral-500 dark:text-neutral-400"
            >
              {formatBlogDate(post.publishedAt)}
            </time>
            <span className="text-neutral-300 dark:text-neutral-700">·</span>
            <span className="text-neutral-500 dark:text-neutral-400">
              {post.readTime}
            </span>
          </div>

          <h1 className="font-serif text-3xl sm:text-5xl font-normal tracking-tight text-[#0B0B0B] dark:text-white leading-[1.1]">
            {post.title}
          </h1>

          <p className="text-base sm:text-lg text-[#555555] dark:text-neutral-300 leading-relaxed">
            {post.summary}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E6E2DA] dark:border-white/[0.08] text-xs">
            <div>
              <span className="font-semibold text-[#0B0B0B] dark:text-white">
                {post.author.name}
              </span>
              <span className="text-neutral-400 dark:text-neutral-600">
                {" "}
                ·{" "}
              </span>
              <span className="text-neutral-500 dark:text-neutral-400">
                {post.author.role}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-white dark:bg-white/[0.06] border border-[#E6E2DA] dark:border-white/[0.08] px-2.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </header>

        {/* Preview Banner */}
        <figure className="overflow-hidden rounded-[24px] border border-[#E6E2DA] dark:border-white/[0.1] bg-[#030305] shadow-sm">
          <img
            src={post.ogImage}
            alt={post.title}
            width={1200}
            height={630}
            className="w-full h-auto block object-cover"
          />
        </figure>

        {/* Key Highlights Card */}
        <section
          aria-label="Key highlights"
          className={`rounded-[24px] border border-[#E6E2DA] dark:border-white/[0.08] bg-gradient-to-br ${post.accent} bg-white dark:bg-[#141414] p-5 sm:p-6`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {post.highlights.map((item) => (
              <div
                key={item.label}
                className="min-w-0 overflow-hidden rounded-2xl border border-[#E6E2DA]/80 dark:border-white/[0.08] bg-white/85 dark:bg-black/25 px-4 py-3"
              >
                <div className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                  {item.label}
                </div>
                <div className="mt-0.5 text-sm font-semibold text-[#0B0B0B] dark:text-white [overflow-wrap:anywhere] leading-snug">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Article Body */}
        <div className="space-y-9">
          {post.sections.map((section) => (
            <section key={section.heading} className="space-y-4">
              <h2 className="font-serif text-2xl sm:text-[28px] font-normal tracking-tight text-[#0B0B0B] dark:text-white leading-snug">
                {section.heading}
              </h2>

              <div className="space-y-4 text-[15px] sm:text-base leading-[1.75] text-[#2B2B2B] dark:text-neutral-300">
                {section.paragraphs.map((paragraph, idx) => (
                  <p key={idx}>{paragraph}</p>
                ))}
              </div>

              {section.bullets && section.bullets.length > 0 && (
                <ul className="space-y-2.5 rounded-2xl border border-[#E6E2DA]/90 dark:border-white/[0.08] bg-white dark:bg-[#141414] p-5 text-sm sm:text-[15px] leading-relaxed text-[#2B2B2B] dark:text-neutral-200">
                  {section.bullets.map((bullet, idx) => (
                    <li key={idx} className="flex items-start gap-2.5">
                      <span
                        aria-hidden="true"
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF1A1A]"
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}

              {section.callout && (
                <aside className="rounded-2xl border border-[#E6E2DA] dark:border-white/[0.1] bg-[#0B0B0B]/[0.03] dark:bg-white/[0.04] p-5 space-y-1.5">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#0B0B0B] dark:text-white">
                    {section.callout.title}
                  </div>
                  <p className="text-sm text-[#4A4A4A] dark:text-neutral-300 leading-relaxed">
                    {section.callout.body}
                  </p>
                </aside>
              )}
            </section>
          ))}
        </div>

        {/* Bottom CTA */}
        <section className="rounded-[28px] bg-[#0B0B0B] dark:bg-white/[0.06] border border-white/[0.08] p-6 sm:p-8 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-lg">
            <h3 className="font-serif text-2xl font-normal tracking-tight text-white">
              {post.cta.title}
            </h3>
            <p className="text-sm text-neutral-300 leading-relaxed">
              {post.cta.description}
            </p>
          </div>
          <Link
            href={post.cta.href}
            className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-white px-6 text-xs font-bold text-[#0B0B0B] hover:bg-neutral-100 transition-colors"
          >
            {post.cta.label}
          </Link>
        </section>

        {/* Continue Reading */}
        {related.length > 0 && (
          <section className="pt-6 border-t border-[#E6E2DA] dark:border-white/[0.08] space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="font-serif text-2xl font-normal tracking-tight text-[#0B0B0B] dark:text-white">
                Continue reading
              </h2>
              <Link
                href="/blog"
                className="text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:text-[#0B0B0B] dark:hover:text-white transition-colors"
              >
                View all →
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {related.map((item) => (
                <Link
                  key={item.slug}
                  href={`/blog/${item.slug}`}
                  className="group rounded-2xl border border-[#E6E2DA] dark:border-white/[0.08] bg-white dark:bg-[#141414] p-4 flex flex-col justify-between gap-3 hover:border-[#0B0B0B]/25 dark:hover:border-white/20 transition-colors"
                >
                  <div className="space-y-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${categoryBadgeClass(item.category)}`}
                    >
                      {item.category}
                    </span>
                    <h3 className="font-serif text-base font-normal text-[#0B0B0B] dark:text-white group-hover:text-[#FF1A1A] dark:group-hover:text-[#FF5C5C] transition-colors leading-snug">
                      {item.title}
                    </h3>
                  </div>
                  <div className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center justify-between">
                    <span>{formatBlogDate(item.publishedAt)}</span>
                    <span>{item.readTime}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </PublicSiteChrome>
  );
}
