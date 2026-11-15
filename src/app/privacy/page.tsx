import type { Metadata } from "next";
import { PrivacyPage } from "../legal-content";

export const metadata: Metadata = {
  title: "Privacy Policy | FLOW",
  description:
    "How FLOW handles account authentication, wallet addresses, and on-chain payment data.",
};

export default function Page() {
  return <PrivacyPage />;
}
