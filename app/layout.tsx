import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const defaultUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(defaultUrl),
  title: "BulkStrike | Materie prime sfuse a prezzi industriali",
  description: "Marketplace B2B ad asta inversa per materie prime sfuse. Aggrega la domanda, fa competere i fornitori al ribasso, zero commissioni. Da 1 kg a 50 tonnellate.",
};

// Unica famiglia per body e titoli: Inter (Geist rimosso — troppo simile a Inter
// per leggersi come scelta, e una richiesta font in meno). JetBrains Mono resta
// solo per numeri tabellari/prezzi/codici, caricato dalle pagine che lo usano.
const interSans = Inter({
  variable: "--font-inter-sans",
  display: "swap",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" suppressHydrationWarning>
      <body className={`${interSans.className} antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
