import { updateSession } from "@/lib/supabase/proxy";
import { type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
"/((?!_next/static|_next/image|favicon.ico|api|welcome|registrati|pool|prodotto|fornitore|fornitori|dashboard|catalogo|corriere|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ],
};
