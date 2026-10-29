import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Jost } from "next/font/google";
import { PRODUCT_NAME, TAGLINE } from "@/components/Logo";

// Editorial pairing: a high-contrast Didone for names and headlines, a clean geometric sans for everything you read or type.
const display = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-display", display: "swap" });
const text = Jost({ subsets: ["latin"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = { title: { default: `${PRODUCT_NAME} · ${TAGLINE}`, template: `%s · ${PRODUCT_NAME}` }, description: "Evidence-led product names for fashion retail." };
export const viewport: Viewport = { colorScheme: "light", themeColor: "#f6f2ec" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
