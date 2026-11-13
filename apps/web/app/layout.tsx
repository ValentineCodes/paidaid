import type { Metadata } from "next";
import Script from "next/script";
import { DM_Sans, JetBrains_Mono, Manrope } from "next/font/google";
import { AppShell } from "../components/app-shell";
import { THEME_INIT_SCRIPT } from "../components/theme-script";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "PaidAid",
  description:
    "If you can pay for it, someone can do it. Open marketplace for real tasks between people.",
  icons: {
    icon: "/favicon.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${dmSans.variable} ${manrope.variable} ${jetbrainsMono.variable} font-sans`}
    >
      <body className="app flex min-h-full flex-col font-sans">
        <Script id="paidaid-theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
