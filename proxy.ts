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
"/((?!_next/static|_next/image|favicon.ico|api|welcome|registrati|pool|prodotto|prodotti|categorie|aste|fornitore|fornitori|dashboard|catalogo|corriere|corrieri|legale|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ],
};
