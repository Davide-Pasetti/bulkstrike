// Difesa in profondità contro indicizzazione e scraping AI. Le pagine dell'area
// riservata (es. /ordine, che può mostrare l'IBAN del fornitore per il bonifico)
// sono già dietro login; qui blocchiamo comunque i crawler e gli agenti AI noti,
// e disalloweremo l'area riservata a tutti i crawler.
const AI_BOTS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "CCBot",
  "Google-Extended",
  "anthropic-ai",
  "ClaudeBot",
  "Claude-Web",
  "PerplexityBot",
  "PerplexityBot/1.0",
  "Amazonbot",
  "Applebot-Extended",
  "Bytespider",
  "Meta-ExternalAgent",
  "cohere-ai",
  "Diffbot",
  "Omgilibot",
  "Timpibot",
];

export default function robots() {
  return {
    rules: [
      // Blocca del tutto i bot AI noti.
      { userAgent: AI_BOTS, disallow: "/" },
      // Per tutti gli altri crawler: escludi l'area riservata (dati personali/pagamenti).
      { userAgent: "*", disallow: ["/ordine", "/ordini", "/checkout", "/carrello", "/dashboard", "/admin"] },
    ],
  };
}
