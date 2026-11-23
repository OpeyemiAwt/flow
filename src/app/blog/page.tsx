import type { Metadata } from "next";
import { PublicSiteChrome } from "../../components/public-site-chrome.tsx";
import { getAllBlogPosts } from "../../content/blog-posts.ts";
import { BlogIndexClient } from "./blog-index-client.tsx";

export const metadata: Metadata = {
  title: "Blog · FLOW",
  description:
    "Product releases, weekly shipping notes, and deep dives into the FLOW multi-chain wallet and payment platform.",
};

export default function BlogPage() {
  const posts = getAllBlogPosts();

  return (
    <PublicSiteChrome activeRoute="blog">
      <BlogIndexClient posts={posts} />
    </PublicSiteChrome>
  );
}
