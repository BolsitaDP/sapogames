import type { Metadata } from "next";
import { Azeret_Mono, Space_Grotesk } from "next/font/google";

import { LanguageProvider } from "@/components/language-provider";
import "./globals.css";

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: [ "latin" ],
});

const monoFont = Azeret_Mono({
  variable: "--font-mono",
  subsets: [ "latin" ],
});

export const metadata: Metadata = {
  title: "Sapos",
  description: "WIP",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${displayFont.variable} ${monoFont.variable} antialiased`}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
