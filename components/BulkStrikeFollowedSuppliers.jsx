"use client";
// BulkStrikeFollowedSuppliers — fornitori preferiti/seguiti (/preferiti).
// Stessa struttura a card della directory pubblica /fornitori (la RPC
// get_my_followed_suppliers restituisce la stessa proiezione di
// get_suppliers_directory), filtrata sui soli seguiti + bottone per smettere.
import { useState, useEffect } from "react";
import { Star, ShieldCheck, Package, Layers, Award, ArrowRight, ChevronRight, X } from "lucide-react";
import { getSession, poolErrorMessage, getMyFollowedSuppliers, unfollowSupplier } from "@/lib/api";
import BulkStrikeNav from "@/components/BulkStrikeNav";
import CountryFlag from "@/components/CountryFlag";

const C = { blue: "#0EA5E9", text: "#0F172A", muted: "#64748B", border: "#E2E8F0", bg: "#F8FAFE", green: "#059669", amber: "#D97706", red: "#DC2626" };

const TYPE_LABEL = { producer: "Produttore", distributor: "Distributore" };

export default function FollowedSuppliersPage({ inShell = false }) {
  const [loading, setLoading] = useState(true);
  const [needLogin, setNeedLogin] = useState(false);
  const [err, setErr] = useState("");
  const [suppliers, setSuppliers] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    (async () => {
      const session = await getSession().catch(() => null);
      if (!session) { setNeedLogin(true); setLoading(false); return; }
      try { setSuppliers(await getMyFollowedSuppliers()); }
      catch (e) { setErr(poolErrorMessage(e)); }
      setLoading(false);
    })();
  }, []);

  async function handleUnfollow(e, id) {
    e.stopPropagation();
    setBusyId(id); setErr("");
    try {
      await unfollowSupplier(id);
      setSuppliers((prev) => prev.filter((f) => f.id !== id));
    } catch (ex) { setErr(poolErrorMessage(ex)); }
    finally { setBusyId(null); }
  }

  return (
    <div style={{ background: "#fff", color: C.text, fontFamily: "'Inter',system-ui,sans-serif", minHeight: "100vh", colorScheme: "light" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing:border-box; }
        .fav-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:16px; }
        .fav-card { display:flex; flex-direction:column; gap:12px; border:1px solid ${C.border}; border-radius:16px; padding:18px; background:#fff; transition:box-shadow .15s; position:relative; }
        .fav-card:hover { box-shadow:0 8px 26px rgba(13,33,55,.10); }
        .fav-unfollow:focus-visible { outline:2px solid ${C.blue}; outline-offset:2px; }
      `}</style>

      {!inShell && <BulkStrikeNav />}

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted, marginBottom: 16 }}>
          <span onClick={() => { window.location.href = "/"; }} style={{ cursor: "pointer" }}>Home</span><ChevronRight size={13} />
          <span style={{ color: C.text, fontWeight: 600 }}>Fornitori preferiti</span>
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 6, display: "flex", alignItems: "center", gap: 10 }}>
          <Star size={24} color={C.amber} fill={C.amber} /> Fornitori preferiti
        </h1>
        <p style={{ fontSize: 13.5, color: C.muted, marginBottom: 20 }}>I fornitori che segui, con gli stessi dati vetrina della directory.</p>

        {err && <div style={{ marginBottom: 14, padding: "11px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 10, fontSize: 13, color: C.red }}>{err}</div>}

        {loading ? (
          <div style={{ padding: "50px 0", textAlign: "center", color: C.muted }}>Caricamento…</div>
        ) : needLogin ? (
          <div style={{ padding: "40px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Accedi per vedere i tuoi fornitori preferiti</div>
            <button onClick={() => { window.location.href = "/auth/login"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Accedi</button>
          </div>
        ) : suppliers.length === 0 ? (
          <div style={{ padding: "48px 20px", textAlign: "center", border: `1px solid ${C.border}`, borderRadius: 14 }}>
            <Star size={30} color={C.border} style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Non segui ancora nessun fornitore</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Apri il profilo di un fornitore dalla directory e premi &quot;Segui&quot;.</div>
            <button onClick={() => { window.location.href = "/fornitori"; }} style={{ background: C.blue, color: "#fff", border: "none", borderRadius: 9, padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "Inter,system-ui" }}>Esplora i fornitori</button>
          </div>
        ) : (
          <div className="fav-grid">
            {suppliers.map((f) => {
              const initials = (f.name || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
              const topSectors = (f.sector_names || []).slice(0, 3);
              const more = Math.max(0, (f.sector_names || []).length - 3);
              return (
                <div key={f.id} className="fav-card" onClick={() => { window.location.href = `/fornitore?id=${f.id}`; }} style={{ cursor: "pointer" }}>
                  <button
                    className="fav-unfollow"
                    onClick={(e) => handleUnfollow(e, f.id)}
                    disabled={busyId === f.id}
                    title="Smetti di seguire"
                    aria-label={`Smetti di seguire ${f.name}`}
                    style={{ position: "absolute", top: 12, right: 12, display: "flex", alignItems: "center", gap: 4, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 100, padding: "4px 10px", fontSize: 11, fontWeight: 700, color: C.muted, cursor: "pointer", fontFamily: "Inter,system-ui", opacity: busyId === f.id ? 0.5 : 1 }}
                  >
                    <X size={11} /> Non seguire più
                  </button>

                  <div style={{ display: "flex", gap: 12, alignItems: "center", paddingRight: 90 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 12, background: "#EFF6FF", border: "1px solid #BFDBFE", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
                      {f.logo_url
                        ? <img src={f.logo_url} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                        : <span style={{ fontSize: 17, fontWeight: 900, color: C.blue }}>{initials}</span>}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15.5, fontWeight: 800, lineHeight: 1.2 }}>{f.name}</span>
                        {f.status === "verified" && <ShieldCheck size={14} color={C.green} />}
                      </div>
                      <div style={{ fontSize: 12.5, color: C.muted, marginTop: 2 }}>
                        {TYPE_LABEL[f.supplier_type] || f.supplier_type} · <CountryFlag country={f.country} /> {f.country}{f.city ? ` · ${f.city}` : ""}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                    <Star size={13} fill={C.amber} color={C.amber} />
                    <b>{f.rating != null ? Number(f.rating).toFixed(1) : "—"}</b>
                    <span style={{ color: C.muted }}>({f.reviews_count ?? 0})</span>
                  </div>

                  <div style={{ display: "flex", gap: 14, fontSize: 12, color: C.muted }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Package size={12} /><b style={{ color: C.text }}>{f.product_count}</b> prodotti</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Layers size={12} /><b style={{ color: C.text }}>{(f.sector_names || []).length}</b> settori</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Award size={12} /><b style={{ color: C.text }}>{(f.certifications || []).length}</b> cert.</span>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {topSectors.map((s) => (
                      <span key={s.slug} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, borderRadius: 100, padding: "3px 9px", background: C.bg, border: `1px solid ${C.border}`, color: C.muted }}>
                        <span>{s.icon || "📦"}</span>{s.name}
                      </span>
                    ))}
                    {more > 0 && <span style={{ fontSize: 11, fontWeight: 700, borderRadius: 100, padding: "3px 9px", background: "#EFF6FF", color: "#0369A1" }}>+{more}</span>}
                  </div>

                  <div style={{ marginTop: "auto", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 5, fontSize: 13, fontWeight: 700, color: C.blue }}>
                    Vedi profilo <ArrowRight size={14} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
