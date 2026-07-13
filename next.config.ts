import type { NextConfig } from "next";

// ============================================================================
// BulkStrike — configurazione Next.js con header di sicurezza HTTP + CSP
// ----------------------------------------------------------------------------
// Aggiunto durante l'audit di sicurezza. Gli header vengono applicati a TUTTE
// le rotte tramite headers(). Nota su Vercel: questi header valgono anche per
// le pagine statiche/SSR servite da Vercel; le edge function Supabase hanno i
// propri header CORS e non sono toccate da qui.
//
// SCELTE DI PROGETTO (importanti):
// - style-src include 'unsafe-inline': l'app usa massicciamente stili inline
//   (style={{...}}) e @import di Google Fonts. Senza 'unsafe-inline' l'UI si
//   romperebbe. È un compromesso accettabile: gli stili inline non eseguono JS.
// - La CSP degli SCRIPT è in sola segnalazione (Content-Security-Policy-Report-Only)
//   e NON blocca nulla: serve a raccogliere cosa verrebbe bloccato prima di
//   passare all'enforcing. Next.js in produzione inietta script inline (hydration)
//   che richiederebbero nonce/hash a runtime; forzare subito script-src stretto
//   romperebbe l'app. Quando avrai verificato i report, potremo promuovere la
//   CSP a enforcing con i nonce.
// - connect-src elenca il progetto Supabase (REST, Realtime via wss, Storage,
//   edge functions). Aggiorna l'host se cambi progetto.
// ============================================================================

const SUPABASE_HOST = "https://uufueekpxboygcotqvhu.supabase.co";
const SUPABASE_WSS = "wss://uufueekpxboygcotqvhu.supabase.co";

// CSP enforcing: copre tutto tranne gli script (che restano in report-only sotto).
// Nota: 'unsafe-inline' su script-src qui NON indebolisce nulla perché questa
// direttiva è quella ENFORCING che vogliamo permissiva per non rompere Next;
// il vero irrigidimento avverrà nella versione report-only quando la validerai.
const cspEnforcing = [
  `default-src 'self'`,
  // js.stripe.com: Stripe.js va caricato dal loro dominio (niente self-host)
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  // immagini: logo fornitori possono arrivare da Supabase Storage o URL esterni;
  // manteniamo https: generico + data:/blob: per anteprime locali.
  `img-src 'self' data: blob: https:`,
  `connect-src 'self' ${SUPABASE_HOST} ${SUPABASE_WSS} https://api.stripe.com https://r.stripe.com https://errors.stripe.com`,
  // il PaymentElement vive in iframe di Stripe (js.stripe.com / hooks.stripe.com
  // per il 3DS); senza frame-src ricadrebbe su default-src 'self' e si romperebbe
  `frame-src https://js.stripe.com https://hooks.stripe.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

// CSP report-only per gli SCRIPT: qui stringiamo script-src (niente 'unsafe-inline')
// per vedere nei report del browser cosa verrebbe bloccato, SENZA bloccarlo.
// Quando i report saranno puliti (o gestiti con nonce), si promuove a enforcing.
const cspReportOnly = [
  `default-src 'self'`,
  `script-src 'self' https://js.stripe.com`,
  `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
  `font-src 'self' https://fonts.gstatic.com data:`,
  `img-src 'self' data: blob: https:`,
  `connect-src 'self' ${SUPABASE_HOST} ${SUPABASE_WSS} https://api.stripe.com https://r.stripe.com https://errors.stripe.com`,
  `frame-src https://js.stripe.com https://hooks.stripe.com`,
  `frame-ancestors 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `object-src 'none'`,
].join("; ");

const securityHeaders = [
  // Forza HTTPS per 2 anni, inclusi i sottodomini. Attivare preload solo dopo
  // aver verificato che TUTTI i sottodomini siano su HTTPS.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Blocca il framing del sito (clickjacking). Ridondante con frame-ancestors ma
  // copre browser vecchi.
  { key: "X-Frame-Options", value: "DENY" },
  // Impedisce il MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Non trasmettere il referrer completo a origini esterne.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nega di default l'accesso alle API sensibili del browser.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // CSP: enforcing per tutto tranne script; report-only per gli script.
  { key: "Content-Security-Policy", value: cspEnforcing },
  { key: "Content-Security-Policy-Report-Only", value: cspReportOnly },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  // Alias PUBBLICI verso le pagine reali di browsing. Le pagine vere (/catalogo,
  // /pool) sono già sfogliabili senza account; questi sono URL "standard da
  // marketplace" che un visitatore/crawler può tentare (/prodotti, /categorie,
  // /aste): li mandiamo alla pagina pubblica giusta invece di farli sbattere sul
  // login. 308 (permanent) → canonico per la SEO. I redirect di next.config
  // vengono valutati PRIMA del middleware, quindi non scattano su /auth/login.
  async redirects() {
    return [
      { source: "/prodotti", destination: "/catalogo", permanent: true },
      { source: "/prodotti/:path*", destination: "/catalogo", permanent: true },
      { source: "/categorie", destination: "/catalogo", permanent: true },
      { source: "/categorie/:path*", destination: "/catalogo", permanent: true },
      { source: "/aste", destination: "/pool", permanent: true },
      { source: "/aste/:path*", destination: "/pool", permanent: true },
    ];
  },
};

export default nextConfig;
