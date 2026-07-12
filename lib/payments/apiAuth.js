// Autenticazione per gli endpoint /api/stripe/*: sessione dai cookie Supabase
// (createServerClient) + azienda dell'utente. Tutte le letture/scritture DB
// avvengono con la sessione dell'utente sotto RLS — niente service role.
import { createClient } from "@/lib/supabase/server";

export async function getAuthedCompany() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, company: null };
  const { data: profile } = await supabase
    .from("profiles").select("company_id").eq("id", user.id).single();
  if (!profile?.company_id) return { supabase, user, company: null };
  const { data: company } = await supabase
    .from("companies")
    .select("id, legal_name, stripe_customer_id")
    .eq("id", profile.company_id)
    .single();
  return { supabase, user, company };
}

// Riusa il customer Stripe dell'azienda o lo crea al primo pagamento; il
// salvataggio passa dalla RPC set_my_stripe_customer (scrive solo la PROPRIA
// company, una sola volta), così l'endpoint non ha bisogno di service role.
export async function ensureStripeCustomer(supabase, user, company, stripe) {
  if (company.stripe_customer_id) return company.stripe_customer_id;
  const customer = await stripe.customers.create({
    email: user.email || undefined,
    name: company.legal_name || undefined,
    metadata: { bulkstrike_company_id: company.id },
  });
  const { error } = await supabase.rpc("set_my_stripe_customer", { p_customer: customer.id });
  if (error) throw error;
  return customer.id;
}
