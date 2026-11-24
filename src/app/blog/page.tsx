import type { Metadata } from "next";
import { DocsShell, type DocsTocItem } from "../../components/docs-shell.tsx";
import { getAllBlogPosts } from "../../content/blog-posts.ts";
import { BlogIndexClient } from "./blog-index-client.tsx";

export const metadata: Metadata = {
  title: "Blog · FLOW",
  description:
    "Product releases, weekly shipping notes, and deep dives into the FLOW multi-chain wallet and payment platform.",
  alternates: {
    canonical: "https://flow.devhub.forum/blog",
  },
  openGraph: {
    title: "FLOW Blog",
    description:
      "Product releases, weekly shipping updates, and multi-chain deep dives from the FLOW team.",
    url: "https://flow.devhub.forum/blog",
    type: "website",
    images: [
      {
        url: "https://flow.devhub.forum/assets/blog/og-blog.png",
        width: 1200,
        height: 630,
        alt: "FLOW Blog · Product releases, weekly updates & multi-chain deep dives",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "FLOW Blog",
    description:
      "Product releases, weekly shipping updates, and multi-chain deep dives from the FLOW team.",
    images: ["https://flow.devhub.forum/assets/blog/og-blog.png"],
  },
};

const BLOG_INDEX_TOC: readonly DocsTocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "filter", label: "Browse & filter" },
  { id: "featured", label: "Featured release" },
  { id: "all-posts", label: "All articles" },
];

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <DocsShell
      activeRoute="blog"
      eyebrow="Journal & Shipping"
      toc={BLOG_INDEX_TOC}
    >
      <BlogIndexClient posts={posts} />
    </DocsShell>
  );
}
