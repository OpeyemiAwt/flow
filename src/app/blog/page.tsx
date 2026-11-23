import type { Metadata } from "next";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";
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

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <PublicSiteChrome activeRoute="blog">
      <BlogIndexClient posts={posts} />
    </PublicSiteChrome>
  );
}
