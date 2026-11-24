import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  DocsShell,
  type DocsTocItem,
} from "../../../components/docs-shell.tsx";
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

function slugifySectionId(heading: string, index: number): string {
  const slug = heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `s-${index + 1}-${slug}` : `s-${index + 1}`;
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

  const sectionsWithIds = post.sections.map((section, idx) => ({
    ...section,
    id: slugifySectionId(section.heading, idx),
    num: String(idx + 1).padStart(2, "0"),
  }));

  const toc: DocsTocItem[] = [
    { id: "overview", label: "Overview" },
    ...sectionsWithIds.map((s) => ({
      id: s.id,
      label: `${s.num} · ${s.heading}`,
    })),
    ...(related.length > 0
      ? [{ id: "continue-reading", label: "Continue reading" }]
      : []),
  ];

  return (
    <DocsShell
      activeRoute="blog"
      activeBlogSlug={post.slug}
      eyebrow={`Blog · ${post.category}`}
      toc={toc}
    >
      {/* Back to all articles */}
      <div className="mt-4">
        <Link
          href="/blog"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#5f636a] dark:text-neutral-400 hover:text-[#0b0c0e] dark:hover:text-white transition-colors"
        >
          <span aria-hidden="true">←</span>
          <span>All articles</span>
        </Link>
      </div>

      {/* Article Hero (Matches Docs & Whitepaper) */}
      <header id="overview" className="scroll-mt-28 mt-4 min-w-0">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[12.5px]">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-medium ${categoryBadgeClass(post.category)}`}
          >
            {post.category}
          </span>
          <time
            dateTime={post.publishedAt}
            className="text-[#5f636a] dark:text-neutral-400"
          >
            {formatBlogDate(post.publishedAt)}
          </time>
          <span className="text-[#cfd2d6] dark:text-neutral-700">·</span>
          <span className="text-[#5f636a] dark:text-neutral-400">
            {post.readTime}
          </span>
        </div>

        <h1 className="mt-3 text-balance text-[30px] font-light leading-[1.12] tracking-[-0.025em] text-[#0b0c0e] dark:text-white sm:text-[40px] sm:leading-[1.08]">
          {post.title}
        </h1>

        <p className="mt-4 max-w-[64ch] text-pretty text-[16px] sm:text-[17px] leading-[1.6] text-[#5f636a] dark:text-neutral-400">
          {post.summary}
        </p>

        {/* Gloam-style Metadata + Highlights Spec Grid (<dl>) */}
        <dl className="mt-7 grid grid-cols-1 gap-x-6 gap-y-4 rounded-[20px] bg-[#f3f4f5] dark:bg-white/[0.04] border border-[#e4e6e9]/70 dark:border-white/[0.07] p-4 sm:grid-cols-3 sm:p-6">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
              Author
            </dt>
            <dd className="mt-1 text-[14.5px] leading-snug text-[#0b0c0e] dark:text-white [overflow-wrap:anywhere]">
              {post.author.name}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
              Published
            </dt>
            <dd className="mt-1 text-[14.5px] leading-snug text-[#0b0c0e] dark:text-white">
              {formatBlogDate(post.publishedAt)}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
              Read time
            </dt>
            <dd className="mt-1 text-[14.5px] leading-snug text-[#0b0c0e] dark:text-white">
              {post.readTime}
            </dd>
          </div>
        </dl>

        {/* Tags */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {post.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-[#f3f4f5] dark:bg-white/[0.06] px-2.5 py-1 text-[11.5px] text-[#5f636a] dark:text-neutral-400"
            >
              {tag}
            </span>
          ))}
        </div>
      </header>

      {/* Preview Image Figure (Matches Docs Figure Frame) */}
      <figure className="mt-8 rounded-[20px] sm:rounded-[22px] border border-[#e4e6e9] dark:border-white/[0.08] p-1.5 sm:p-2">
        <div className="overflow-hidden rounded-[14px] sm:rounded-[16px] bg-[#030305]">
          <img
            src={post.ogImage}
            alt={post.title}
            width={1200}
            height={630}
            className="w-full h-auto block object-cover"
          />
        </div>
      </figure>

      {/* Numbered Sections (Exact Whitepaper / Docs Prose Rhythm) */}
      <div className="mt-10 space-y-10 sm:space-y-12 text-[15.5px] sm:text-[16px] leading-[1.7] text-[#34373c] dark:text-neutral-300">
        {sectionsWithIds.map((section, idx) => (
          <section
            key={section.id}
            id={section.id}
            className={`scroll-mt-28 space-y-4 min-w-0 ${
              idx > 0
                ? "pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08]"
                : ""
            }`}
          >
            <p className="text-[12px] font-medium uppercase tracking-[0.08em] text-[#6b6f76] dark:text-neutral-500">
              {section.num}
            </p>
            <h2 className="text-[22px] sm:text-[24px] font-normal tracking-[-0.02em] leading-[1.25] text-[#0b0c0e] dark:text-white">
              {section.heading}
            </h2>

            <div className="space-y-4">
              {section.paragraphs.map((paragraph, pIdx) => (
                <p key={pIdx} className="[overflow-wrap:anywhere]">
                  {paragraph}
                </p>
              ))}
            </div>

            {section.bullets && section.bullets.length > 0 && (
              <ul className="space-y-2.5 rounded-[16px] bg-[#f3f4f5] dark:bg-white/[0.04] p-4 sm:p-5 text-[14.5px] sm:text-[15px] leading-[1.6] text-[#34373c] dark:text-neutral-200">
                {section.bullets.map((bullet, bIdx) => (
                  <li
                    key={bIdx}
                    className="flex items-start gap-2.5 min-w-0 [overflow-wrap:anywhere]"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#FF1A1A]"
                    />
                    <span className="min-w-0">{bullet}</span>
                  </li>
                ))}
              </ul>
            )}

            {section.callout && (
              <aside className="rounded-[14px] bg-[#f3f4f5] dark:bg-white/[0.04] border border-[#e4e6e9]/70 dark:border-white/[0.07] px-4 py-3.5 sm:px-5 sm:py-4 space-y-1.5">
                <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-[#0b0c0e] dark:text-white">
                  {section.callout.title}
                </p>
                <p className="text-[14px] leading-relaxed text-[#5f636a] dark:text-neutral-400 [overflow-wrap:anywhere]">
                  {section.callout.body}
                </p>
              </aside>
            )}
          </section>
        ))}
      </div>

      {/* Bottom CTA Card */}
      <section className="mt-12 rounded-[22px] bg-[#0b0c0e] dark:bg-[#141518] border border-transparent dark:border-white/[0.08] p-5 sm:p-7 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div className="space-y-1.5 max-w-lg min-w-0">
          <h3 className="text-[20px] sm:text-[22px] font-normal tracking-[-0.02em] text-white leading-snug">
            {post.cta.title}
          </h3>
          <p className="text-[14px] text-white/70 leading-relaxed">
            {post.cta.description}
          </p>
        </div>
        <Link
          href={post.cta.href}
          className="inline-flex h-10 w-full sm:w-auto shrink-0 items-center justify-center rounded-full bg-white px-5 text-[13px] font-medium text-[#0b0c0e] hover:opacity-90 transition-opacity"
        >
          {post.cta.label}
        </Link>
      </section>

      {/* Continue Reading */}
      {related.length > 0 && (
        <section
          id="continue-reading"
          className="scroll-mt-28 mt-12 pt-8 border-t border-[#e4e6e9] dark:border-white/[0.08] space-y-5"
        >
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[20px] sm:text-[22px] font-normal tracking-[-0.02em] text-[#0b0c0e] dark:text-white">
              Continue reading
            </h2>
            <Link
              href="/blog"
              className="text-[13px] font-medium text-[#5f636a] dark:text-neutral-400 hover:text-[#0b0c0e] dark:hover:text-white transition-colors shrink-0"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.slug}
                href={`/blog/${item.slug}`}
                className="group min-w-0 rounded-[18px] border border-[#e4e6e9] dark:border-white/[0.08] bg-[#f3f4f5]/55 dark:bg-white/[0.03] p-4 flex flex-col justify-between gap-3 hover:border-[#cfd2d6] dark:hover:border-white/[0.18] transition-colors"
              >
                <div className="space-y-2 min-w-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${categoryBadgeClass(item.category)}`}
                  >
                    {item.category}
                  </span>
                  <h3 className="text-[15px] font-normal tracking-[-0.01em] text-[#0b0c0e] dark:text-white group-hover:text-[#FF1A1A] dark:group-hover:text-[#FF5C5C] transition-colors leading-snug">
                    {item.title}
                  </h3>
                </div>
                <div className="text-[11.5px] text-[#6b6f76] dark:text-neutral-400 flex items-center justify-between gap-2">
                  <span>{formatBlogDate(item.publishedAt)}</span>
                  <span className="shrink-0">{item.readTime}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </DocsShell>
  );
}
