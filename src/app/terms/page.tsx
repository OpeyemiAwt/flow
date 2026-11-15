import type { Metadata } from "next";
import { TermsPage } from "../legal-content";

export const metadata: Metadata = {
  title: "Terms of Service | FLOW",
  description:
    "Terms governing multi-chain wallet access, payment links, and cross-chain routing on FLOW.",
};

export default function Page() {
  return <TermsPage />;
}
