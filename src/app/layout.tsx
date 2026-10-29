import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Jost } from "next/font/google";

// Editorial pairing: a high-contrast Didone for names and headlines, a clean geometric sans for everything you read or type.
const display = Bodoni_Moda({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-display", display: "swap" });
const text = Jost({ subsets: ["latin"], variable: "--font-text", display: "swap" });

export const metadata: Metadata = { title: process.env.APP_NAME ?? "Product Name Optimiser" };
export const viewport: Viewport = { colorScheme: "light", themeColor: "#f6f2ec" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${text.variable}`}>
      <body>{children}</body>
    </html>
  );
}
