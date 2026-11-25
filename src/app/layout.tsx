import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { LanguageProvider } from "../components/language-provider.tsx";
import { RouteSkeletonTransition } from "../components/route-skeleton-transition.tsx";

export const metadata: Metadata = {
  title: "FLOW",
  description: "The FLOW multi-chain payment foundation.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("flow-theme");if(t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches)){document.documentElement.classList.add("dark")}else{document.documentElement.classList.remove("dark")}}catch(e){}try{var l=localStorage.getItem("flow-locale");if(l&&["en","es","fr","pt","zh","ja","ko","ar","de"].indexOf(l)!==-1){document.documentElement.lang=l;document.documentElement.dir=l==="ar"?"rtl":"ltr"}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-screen bg-[var(--surface-canvas)] font-sans text-[var(--text-primary)] antialiased">
        <LanguageProvider>
          <RouteSkeletonTransition>{children}</RouteSkeletonTransition>
        </LanguageProvider>
      </body>
    </html>
  );
}
