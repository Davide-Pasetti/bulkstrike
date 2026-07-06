// utils/supabase/client.js
// Shim di compatibilità: alcuni file (app/admin/ricevute/[id]/page.jsx,
// app/fornitore/richieste-termini/page.jsx) importano createClient da qui,
// seguendo la convenzione standard dello starter Supabase. Il progetto usa
// invece un client singleton in lib/supabase.js (createBrowserClient di
// @supabase/ssr, sessione nei cookie — necessario perché condivide la
// sessione con il login e il middleware). Per non creare un secondo client
// e non rompere quella sessione condivisa, createClient() qui restituisce
// semplicemente lo stesso client già configurato.
import { supabase } from "@/lib/supabase";

export function createClient() {
  return supabase;
}
