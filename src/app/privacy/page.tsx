import type { Metadata } from "next";
import { PrivacyPage } from "../legal-content";

export const metadata: Metadata = {
  title: "Privacy | FLOW",
  description:
    "Draft privacy notice for the FLOW application, pending owner and legal review.",
};

export default function Page() {
  return <PrivacyPage />;
}
