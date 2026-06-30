/* eslint-disable react/no-unescaped-entities */
import { AuthButton } from "@/components/auth-button";
import { EnvVarWarning } from "@/components/env-var-warning";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { hasEnvVars } from "@/lib/utils";
import Link from "next/link";
import { Suspense } from "react";

const steps = [
  {
    n: "01",
    t: "Apri o unisciti a un pool",
    d: "Pubblichi cosa ti serve oppure ti unisci a un pool già aperto sullo stesso prodotto. Più acquirenti significa più volume.",
  },
  {
    n: "02",
    t: "I fornitori rilanciano al ribasso",
    d: "Restano anonimi e competono in asta inversa. Ogni offerta valida abbassa il prezzo di riferimento del lotto.",
  },
  {
    n: "03",
    t: "Spunti il prezzo più basso",
    d: "Alla chiusura vince sempre l'offerta più bassa. Zero commissioni sul prezzo, nessun favoritismo per chi paga di più.",
  },
];

const bids = [
  { id: "Fornitore #7", price: "4,18", best: false },
  { id: "Fornitore #3", price: "4,11", best: false },
  { id: "Fornitore #12", price: "4,02", best: true },
];

const settori = [
  "Enologia",
  "Chimica di base",
  "Solventi",
  "Additivi",
  "Fertilizzanti",
  "Detergenti",
  "Coloranti",
  "Cosmetica",
  "Gas tecnici",
  "Metalli",
  "Plastiche",
  "Adesivi",
  "Carta",
  "Alimentare",
  "Trattamento acque",
  "Sanificazione",
];

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center">
      <div className="flex-1 w-full flex flex-col items-center">
        {/* NAV */}
        <nav className="w-full flex justify-center border-b border-b-foreground/10 h-16 sticky top-0 z-50 bg-background/80 backdrop-blur">
          <div className="w-full max-w-6xl flex justify-between items-center px-5 text-sm">
            <Link
              href="/"
              className="flex items-center gap-2 font-bold text-base tracking-tight"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500 text-black">
                <svg
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
                </svg>
              </span>
              <span>
                Bulk<span className="text-amber-500">Strike</span>
              </span>
            </Link>
            {!hasEnvVars ? (
              <EnvVarWarning />
            ) : (
              <Suspense>
                <AuthButton />
              </Suspense>
            )}
          </div>
        </nav>

        {/* HERO */}
        <section className="w-full max-w-6xl px-5 py-16 sm:py-24 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="flex flex-col gap-6">
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-amber-500">
              Asta inversa B2B · Materie prime sfuse
            </span>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.05]">
              Fai scendere il prezzo.
              <br />
              <span className="text-muted-foreground">Insieme.</span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-lg leading-relaxed">
              BulkStrike aggrega la domanda di più acquirenti e fa competere i
              fornitori in asta inversa. Più volume, prezzi più bassi, zero
              commissioni sulle transazioni.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center justify-center rounded-md bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
              >
                Inizia gratis
              </Link>
              <Link
                href="/auth/login"
                className="inline-flex items-center justify-center rounded-md border border-foreground/15 px-6 py-3 text-sm font-semibold transition-colors hover:bg-foreground/5"
              >
                Accedi
              </Link>
            </div>
            <p className="font-mono text-xs text-muted-foreground pt-2">
              Gratis per gli acquirenti · 0% commissioni · 440+ prodotti in 16
              settori
            </p>
          </div>

          {/* SIGNATURE: live reverse auction panel */}
          <div className="rounded-2xl border border-foreground/10 bg-foreground/[0.03] p-5 sm:p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-foreground/10 pb-4">
              <div className="flex flex-col">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Lotto #A-2291
                </span>
                <span className="font-semibold">Acido tartarico L(+) 99%</span>
                <span className="font-mono text-xs text-muted-foreground">
                  1.000 kg · 1 pallet
                </span>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[11px] font-medium text-emerald-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Asta aperta
              </span>
            </div>

            <div className="flex items-end justify-between py-5">
              <div className="flex flex-col">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Migliore offerta
                </span>
                <span className="font-mono text-4xl font-bold tabular-nums text-emerald-500">
                  4,02{" "}
                  <span className="text-base font-medium text-muted-foreground">
                    €/kg
                  </span>
                </span>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                  Chiude tra
                </span>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  06:23:41
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              {bids.map((b) => (
                <div
                  key={b.id}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2 font-mono text-sm ${
                    b.best
                      ? "border-emerald-500/40 bg-emerald-500/[0.06]"
                      : "border-foreground/10"
                  }`}
                >
                  <span className="text-muted-foreground">{b.id}</span>
                  <span
                    className={`tabular-nums ${
                      b.best ? "font-semibold text-emerald-500" : ""
                    }`}
                  >
                    {b.price} €/kg
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-foreground/10 pt-3 font-mono text-xs text-muted-foreground">
              <span>Riferimento (mediana attiva)</span>
              <span className="tabular-nums">4,55 €/kg · −12%</span>
            </div>
          </div>
        </section>

        {/* COME FUNZIONA */}
        <section className="w-full border-t border-foreground/10">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-10">
              Come funziona
            </h2>
            <div className="grid gap-8 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="flex flex-col gap-3">
                  <span className="font-mono text-sm text-amber-500">{s.n}</span>
                  <h3 className="text-lg font-semibold">{s.t}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {s.d}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SETTORI */}
        <section className="w-full border-t border-foreground/10">
          <div className="mx-auto w-full max-w-6xl px-5 py-16">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  16 settori industriali
                </span>
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                  Materie prime per ogni filiera
                </h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {settori.map((s) => (
                  <span
                    key={s}
                    className="rounded-full border border-foreground/10 px-3 py-1.5 font-mono text-xs text-muted-foreground"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="w-full border-t border-foreground/10">
          <div className="mx-auto w-full max-w-6xl px-5 py-20">
            <div className="flex flex-col items-center gap-5 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] px-6 py-14 text-center">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Pronto a spuntare prezzi migliori?
              </h2>
              <p className="max-w-xl text-muted-foreground">
                Crea il tuo account gratuito e apri la tua prima richiesta
                d'acquisto in pochi minuti.
              </p>
              <Link
                href="/auth/sign-up"
                className="inline-flex items-center justify-center rounded-md bg-amber-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-amber-400"
              >
                Crea account gratuito
              </Link>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="w-full border-t border-foreground/10">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-5 py-10 text-center sm:flex-row sm:text-left">
            <p className="font-mono text-xs text-muted-foreground">
              © 2026 BulkStrike · Marketplace B2B materie prime sfuse
            </p>
            <ThemeSwitcher />
          </div>
        </footer>
      </div>
    </main>
  );
}
