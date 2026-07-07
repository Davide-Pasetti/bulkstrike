import { useState } from "react";
import { BSIcon } from "@/components/BSLogo";

// ─── WORDMARK ─────────────────────────────────────────────────────────────────
function BSWordmark({ fontSize = 32, dark = true }) {
  const textColor = dark ? "#F0F6FF" : "#07111E";
  const spacing = "-0.03em";
  return (
    <div style={{ display: "flex", alignItems: "baseline", lineHeight: 1, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <span style={{ fontSize, fontWeight: 900, color: textColor, letterSpacing: spacing }}>Bulk</span>
      <span style={{
        fontSize, fontWeight: 900, letterSpacing: spacing,
        background: "linear-gradient(90deg, #0EA5E9 0%, #22D3EE 100%)",
        WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent"
      }}>Strike</span>
    </div>
  );
}

// ─── FULL LOGO ────────────────────────────────────────────────────────────────
function BSLogo({ iconSize = 48, fontSize = 28, dark = true, uid = "x" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: Math.round(iconSize * 0.3) }}>
      <BSIcon size={iconSize} uid={uid} />
      <BSWordmark fontSize={fontSize} dark={dark} />
    </div>
  );
}

// ─── SWATCH ──────────────────────────────────────────────────────────────────
function Swatch({ color, label, hex }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ width: 48, height: 48, background: color, borderRadius: 10, border: "1px solid rgba(255,255,255,0.06)" }}/>
      <div style={{ fontSize: 12, color: "#8BAFC9", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 11, color: "#3B5A7A", fontFamily: "monospace" }}>{hex}</div>
    </div>
  );
}

// ─── SECTION LABEL ───────────────────────────────────────────────────────────
function Label({ children }) {
  return (
    <div style={{ fontSize: 10, color: "#0EA5E9", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>
      {children}
    </div>
  );
}

// ─── PREVIEW CARD ─────────────────────────────────────────────────────────────
function Card({ bg, border, children, style = {} }) {
  return (
    <div style={{
      background: bg, borderRadius: 14, padding: "28px 28px",
      border: border ? `1px solid ${border}` : "none",
      display: "flex", alignItems: "center", justifyContent: "center",
      ...style
    }}>
      {children}
    </div>
  );
}

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function LogoShowcase() {
  const [tab, setTab] = useState("primary");

  const tabs = [
    { id: "primary", label: "Logo completo" },
    { id: "icon", label: "Icona" },
    { id: "sizes", label: "Dimensioni" },
    { id: "palette", label: "Palette" },
    { id: "usage", label: "Utilizzo" },
  ];

  const tabStyle = (active) => ({
    padding: "8px 16px", borderRadius: 100, fontSize: 13, fontWeight: 600,
    border: "none", cursor: "pointer", transition: "all 0.18s",
    background: active ? "#0EA5E9" : "rgba(14,165,233,0.08)",
    color: active ? "#fff" : "#6B94B8",
    whiteSpace: "nowrap",
  });

  return (
    <div style={{
      background: "#050D18", minHeight: "100vh",
      fontFamily: "'Inter', system-ui, sans-serif",
      padding: "32px 24px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        * { box-sizing: border-box; }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 10, color: "#0EA5E9", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 6 }}>
          Brand Identity
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: "#F0F6FF", letterSpacing: "-0.02em", margin: "0 0 4px" }}>
          BulkStrike — Logo System
        </h1>
        <p style={{ fontSize: 13, color: "#6B94B8", margin: 0 }}>
          Tutte le varianti per uso digitale, stampa e favicon
        </p>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 32, overflowX: "auto", paddingBottom: 4 }}>
        {tabs.map(t => (
          <button key={t.id} style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── TAB: PRIMARY ─────────────────────────────────────────────────────── */}
      {tab === "primary" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Label>Versione principale — sfondo scuro</Label>
          <Card bg="#07111E" border="#1A3454" style={{ justifyContent: "flex-start", padding: "36px 36px" }}>
            <BSLogo iconSize={56} fontSize={34} dark={true} uid="p1" />
          </Card>

          <Label>Versione su sfondo bianco</Label>
          <Card bg="#FFFFFF" border={null}>
            <BSLogo iconSize={56} fontSize={34} dark={false} uid="p2" />
          </Card>

          <Label>Versione su sfondo blu (per CTA)</Label>
          <Card bg="#0EA5E9" border={null}>
            <BSLogo iconSize={56} fontSize={34} dark={true} uid="p3" />
          </Card>

          <Label>In navbar (contesto reale)</Label>
          <div style={{
            background: "rgba(7,17,30,0.95)", borderRadius: 14,
            border: "1px solid #1A3454", padding: "0 24px",
            display: "flex", alignItems: "center", justifyContent: "space-between",
            height: 64
          }}>
            <BSLogo iconSize={36} fontSize={22} dark={true} uid="nav" />
            <div style={{ display: "flex", gap: 20 }}>
              {["Prodotti", "Pool", "Prezzi"].map(l => (
                <span key={l} style={{ fontSize: 14, color: "#6B94B8" }}>{l}</span>
              ))}
            </div>
            <button style={{
              background: "#0EA5E9", color: "white", border: "none",
              borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer"
            }}>Registrati</button>
          </div>
        </div>
      )}

      {/* ── TAB: ICON ────────────────────────────────────────────────────────── */}
      {tab === "icon" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <Label>Varianti dimensione</Label>
            <div style={{ background: "#07111E", border: "1px solid #1A3454", borderRadius: 14, padding: 24 }}>
              <div style={{ display: "flex", gap: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
                {[16, 24, 32, 48, 64, 96].map(s => (
                  <div key={s} style={{ textAlign: "center" }}>
                    <BSIcon size={s} uid={`sz${s}`} />
                    <div style={{ fontSize: 10, color: "#3B5A7A", marginTop: 6 }}>{s}px</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div>
            <Label>Su diversi sfondi</Label>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {[
                ["Scuro", "#07111E", "1px solid #1A3454"],
                ["Nero", "#000000", "none"],
                ["Grigio", "#374151", "none"],
                ["Bianco", "#FFFFFF", "none"],
                ["Blu", "#0EA5E9", "none"],
                ["Cyan", "#22D3EE", "none"],
              ].map(([label, bg, border]) => (
                <div key={label} style={{ textAlign: "center" }}>
                  <div style={{ background: bg, border, borderRadius: 16, padding: 16, display: "inline-flex" }}>
                    <BSIcon size={48} uid={`bg${label}`} />
                  </div>
                  <div style={{ fontSize: 11, color: "#6B94B8", marginTop: 8 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Favicon preview</Label>
            <div style={{ background: "#07111E", border: "1px solid #1A3454", borderRadius: 14, padding: 24 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 12 }}>
                <BSIcon size={16} uid="fav16" />
                <BSIcon size={32} uid="fav32" />
                <span style={{ fontSize: 12, color: "#6B94B8" }}>16px e 32px (favicon browser)</span>
              </div>
              <div style={{ fontSize: 12, color: "#3B5A7A", lineHeight: 1.6 }}>
                Le barre rimangono leggibili anche a 16px grazie al contrasto bianco su scuro.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: SIZES ───────────────────────────────────────────────────────── */}
      {tab === "sizes" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            { label: "Display (hero, splash)", iconSize: 72, fontSize: 44, uid: "dsp" },
            { label: "Large (header desktop)", iconSize: 52, fontSize: 32, uid: "lg" },
            { label: "Default (navbar)", iconSize: 36, fontSize: 22, uid: "md" },
            { label: "Small (footer, sidebar)", iconSize: 28, fontSize: 17, uid: "sm" },
            { label: "XSmall (watermark)", iconSize: 20, fontSize: 12, uid: "xs" },
          ].map(({ label, iconSize, fontSize, uid }) => (
            <div key={uid}>
              <Label>{label}</Label>
              <div style={{ background: "#07111E", border: "1px solid #1A3454", borderRadius: 12, padding: "20px 24px" }}>
                <BSLogo iconSize={iconSize} fontSize={fontSize} dark={true} uid={uid} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: PALETTE ─────────────────────────────────────────────────────── */}
      {tab === "palette" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div>
            <Label>Colori primari del brand</Label>
            <div style={{ background: "#0D1F35", border: "1px solid #1A3454", borderRadius: 14, padding: 24 }}>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <Swatch color="#07111E" label="Navy BG" hex="#07111E" />
                <Swatch color="linear-gradient(135deg,#0D2137,#0C4A6E)" label="Icon BG" hex="#0D2137→#0C4A6E" />
                <Swatch color="#0EA5E9" label="Blue Primary" hex="#0EA5E9" />
                <Swatch color="#22D3EE" label="Cyan Accent" hex="#22D3EE" />
                <Swatch color="linear-gradient(90deg,#0EA5E9,#22D3EE)" label="Gradient" hex="Blue→Cyan" />
                <Swatch color="#F0F6FF" label="Text Light" hex="#F0F6FF" />
                <Swatch color="#10B981" label="Green" hex="#10B981" />
                <Swatch color="#F43F5E" label="Red Alert" hex="#F43F5E" />
              </div>
            </div>
          </div>

          <div>
            <Label>Anatomia del logo</Label>
            <div style={{ background: "#0D1F35", border: "1px solid #1A3454", borderRadius: 14, padding: 24 }}>
              <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
                <BSLogo iconSize={64} fontSize={40} dark={true} uid="anat" />
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {[
                    ["Barre (bulk lots)", "Bianco #F0F6FF — opacità decrescente", "→ Volume aggregato"],
                    ["Freccia (reverse auction)", "Gradiente #38BDF8→#22D3EE", "→ Prezzo al ribasso"],
                    ['"Bulk"', "Bianco #F0F6FF — Inter 900", "→ Materie prime sfuse"],
                    ['"Strike"', "Gradiente #0EA5E9→#22D3EE", "→ Aggiudicazione asta"],
                  ].map(([el, color, meaning]) => (
                    <div key={el} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#F0F6FF", minWidth: 120 }}>{el}</div>
                      <div>
                        <div style={{ fontSize: 11, color: "#6B94B8" }}>{color}</div>
                        <div style={{ fontSize: 11, color: "#0EA5E9" }}>{meaning}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label>Specifiche tipografia</Label>
            <div style={{ background: "#0D1F35", border: "1px solid #1A3454", borderRadius: 14, padding: 24 }}>
              {[
                ["Font", "Inter", "Google Fonts — gratuito"],
                ["Peso", "900 (ExtraBold)", "Massimo peso disponibile"],
                ["Letter-spacing", "-0.03em", "Tracking stretto — industrial"],
                ["Radius icona", "13px", "~23% del lato = 56px"],
              ].map(([label, val, note]) => (
                <div key={label} style={{ display: "flex", gap: 16, alignItems: "baseline", marginBottom: 10 }}>
                  <span style={{ fontSize: 12, color: "#6B94B8", minWidth: 110 }}>{label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#F0F6FF", fontFamily: "monospace" }}>{val}</span>
                  <span style={{ fontSize: 11, color: "#3B5A7A" }}>{note}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB: USAGE ───────────────────────────────────────────────────────── */}
      {tab === "usage" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Label>✅ Usi corretti</Label>
          <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 14, padding: 24 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <Card bg="#07111E" border="#1A3454">
                <BSLogo iconSize={44} fontSize={28} dark={true} uid="ok1" />
              </Card>
              <Card bg="#FFFFFF">
                <BSLogo iconSize={44} fontSize={28} dark={false} uid="ok2" />
              </Card>
            </div>
          </div>

          <Label>❌ Usi da evitare</Label>
          <div style={{ background: "rgba(244,63,94,0.06)", border: "1px solid rgba(244,63,94,0.2)", borderRadius: 14, padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
            {[
              ["Non schiacciare il logo", { transform: "scaleX(0.6)" }],
              ["Non ruotare il logo", { transform: "rotate(-15deg)" }],
              ["Non invertire i colori", { filter: "invert(1)" }],
            ].map(([label, style]) => (
              <div key={label}>
                <div style={{ fontSize: 11, color: "#F43F5E", marginBottom: 10 }}>{label}</div>
                <div style={{ background: "#0A1929", borderRadius: 8, padding: "16px 20px", display: "inline-block" }}>
                  <div style={style}>
                    <BSLogo iconSize={36} fontSize={22} dark={true} uid={`no${label}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ background: "#0D1F35", border: "1px solid #1A3454", borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 13, color: "#6B94B8", lineHeight: 1.7 }}>
              <strong style={{ color: "#F0F6FF" }}>Spazio di rispetto:</strong> lasciare sempre attorno al logo uno spazio minimo pari all'altezza della lettera "B" del wordmark.<br/>
              <strong style={{ color: "#F0F6FF" }}>Dimensione minima:</strong> 120px larghezza totale per il logo completo. Sotto questa soglia usare solo l'icona.<br/>
              <strong style={{ color: "#F0F6FF" }}>File disponibili:</strong> SVG (vettoriale), PNG 1x/2x/3x, ICO favicon.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
