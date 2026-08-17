import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
// NB: le esclusioni sono le rotte raggiungibili SENZA sessione (le pagine
// gestiscono l'auth lato client). "corrieri" (directory pubblica) e "legale"
// (termini) erano assenti: gli anonimi venivano rediretti a /auth/login.
// "prodotti|categorie|aste" sono alias pubblici (redirect in next.config verso
// catalogo/pool): esclusi qui così, se il redirect non scattasse, non finiscono
// comunque sul login.
// "ricezione" (conferma consegna via QR, DAV-74) è pubblica per design: il
// token nell'URL è la credenziale, validata server-side con rate limit.
// "disiscrizione" idem: la apre un fornitore NON registrato dal link in fondo
// alle email di richiesta, quindi non può passare dal login.
"/((?!_next/static|_next/image|favicon.ico|api|welcome|registrati|pool|prodotto|prodotti|categorie|aste|andamento-prezzi|fornitore|fornitori|dashboard|catalogo|corriere|corrieri|legale|ricezione|disiscrizione|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ],
};
