import type { Metadata } from "next";
import { TermsPage } from "../legal-content";

export const metadata: Metadata = {
  title: "Terms | FLOW",
  description:
    "Draft terms for the FLOW application, pending owner and legal review.",
};

export default function Page() {
  return <TermsPage />;
}
