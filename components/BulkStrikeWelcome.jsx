import { useState } from "react";
import { Globe, Check, X, Shield, Cookie, SlidersHorizontal, ChevronRight } from "lucide-react";

const C = { blue:"#0EA5E9", dark:"#0284C7", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", bg:"#F8FAFE", green:"#059669", amber:"#D97706", purple:"#7C3AED" };

// ─── LANGUAGES ────────────────────────────────────────────────────────────────
const LANGS = [
  { code:"it", flag:"🇮🇹", name:"Italiano" },
  { code:"en", flag:"🇬🇧", name:"English" },
  { code:"es", flag:"🇪🇸", name:"Español" },
  { code:"fr", flag:"🇫🇷", name:"Français" },
  { code:"de", flag:"🇩🇪", name:"Deutsch" },
  { code:"zh", flag:"🇨🇳", name:"中文" },
];

// ─── CURRENCIES (indicative rates from EUR) ───────────────────────────────────
const CURR = [
  { code:"EUR", symbol:"€",  locale:"it-IT", rate:1 },
  { code:"USD", symbol:"$",  locale:"en-US", rate:1.08 },
  { code:"GBP", symbol:"£",  locale:"en-GB", rate:0.85 },
  { code:"CHF", symbol:"Fr", locale:"de-CH", rate:0.96 },
  { code:"CNY", symbol:"¥",  locale:"zh-CN", rate:7.85 },
];

// ─── TRANSLATIONS ─────────────────────────────────────────────────────────────
const T = {
  it:{ title:"Benvenuto su BulkStrike", sub:"Imposta lingua e valuta per la tua esperienza",
    lang:"Lingua", cur:"Valuta", example:"Prezzo di esempio",
    cookieTitle:"Privacy e cookie", cookieText:"Usiamo cookie tecnici necessari al funzionamento e, con il tuo consenso, cookie funzionali e analitici.",
    necessary:"Necessari", always:"Sempre attivi", functional:"Funzionali", functionalD:"Preferenze e funzioni avanzate", analytics:"Analitici", analyticsD:"Statistiche di utilizzo anonime",
    customize:"Personalizza", back:"Indietro", acceptAll:"Accetta tutti", onlyNec:"Solo necessari", save:"Salva preferenze",
    confirmTitle:"Preferenze salvate", confirmText:"Puoi modificarle quando vuoi dal footer del sito.", reopen:"Rivedi il banner",
    chosen:"Le tue impostazioni" },
  en:{ title:"Welcome to BulkStrike", sub:"Set your language and currency",
    lang:"Language", cur:"Currency", example:"Example price",
    cookieTitle:"Privacy & cookies", cookieText:"We use technical cookies needed to run the site and, with your consent, functional and analytics cookies.",
    necessary:"Necessary", always:"Always on", functional:"Functional", functionalD:"Preferences and advanced features", analytics:"Analytics", analyticsD:"Anonymous usage statistics",
    customize:"Customize", back:"Back", acceptAll:"Accept all", onlyNec:"Only necessary", save:"Save preferences",
    confirmTitle:"Preferences saved", confirmText:"You can change them anytime from the site footer.", reopen:"Show the banner again",
    chosen:"Your settings" },
  es:{ title:"Bienvenido a BulkStrike", sub:"Configura tu idioma y moneda",
    lang:"Idioma", cur:"Moneda", example:"Precio de ejemplo",
    cookieTitle:"Privacidad y cookies", cookieText:"Usamos cookies técnicas necesarias y, con tu consentimiento, cookies funcionales y analíticas.",
    necessary:"Necesarias", always:"Siempre activas", functional:"Funcionales", functionalD:"Preferencias y funciones avanzadas", analytics:"Analíticas", analyticsD:"Estadísticas de uso anónimas",
    customize:"Personalizar", back:"Atrás", acceptAll:"Aceptar todas", onlyNec:"Solo necesarias", save:"Guardar preferencias",
    confirmTitle:"Preferencias guardadas", confirmText:"Puedes cambiarlas cuando quieras desde el pie de página.", reopen:"Ver el aviso otra vez",
    chosen:"Tus ajustes" },
  fr:{ title:"Bienvenue sur BulkStrike", sub:"Choisissez votre langue et devise",
    lang:"Langue", cur:"Devise", example:"Prix d'exemple",
    cookieTitle:"Confidentialité et cookies", cookieText:"Nous utilisons des cookies techniques nécessaires et, avec votre consentement, des cookies fonctionnels et analytiques.",
    necessary:"Nécessaires", always:"Toujours actifs", functional:"Fonctionnels", functionalD:"Préférences et fonctions avancées", analytics:"Analytiques", analyticsD:"Statistiques d'usage anonymes",
    customize:"Personnaliser", back:"Retour", acceptAll:"Tout accepter", onlyNec:"Seulement nécessaires", save:"Enregistrer",
    confirmTitle:"Préférences enregistrées", confirmText:"Vous pouvez les modifier à tout moment dans le pied de page.", reopen:"Revoir la bannière",
    chosen:"Vos préférences" },
  de:{ title:"Willkommen bei BulkStrike", sub:"Sprache und Währung festlegen",
    lang:"Sprache", cur:"Währung", example:"Beispielpreis",
    cookieTitle:"Datenschutz & Cookies", cookieText:"Wir verwenden technisch notwendige Cookies und, mit Ihrer Zustimmung, funktionale und analytische Cookies.",
    necessary:"Notwendig", always:"Immer aktiv", functional:"Funktional", functionalD:"Einstellungen und erweiterte Funktionen", analytics:"Analytik", analyticsD:"Anonyme Nutzungsstatistiken",
    customize:"Anpassen", back:"Zurück", acceptAll:"Alle akzeptieren", onlyNec:"Nur notwendige", save:"Speichern",
    confirmTitle:"Einstellungen gespeichert", confirmText:"Sie können sie jederzeit in der Fußzeile ändern.", reopen:"Banner erneut anzeigen",
    chosen:"Ihre Einstellungen" },
  zh:{ title:"欢迎来到 BulkStrike", sub:"设置您的语言和货币",
    lang:"语言", cur:"货币", example:"示例价格",
    cookieTitle:"隐私与 Cookie", cookieText:"我们使用网站运行所需的技术 Cookie，并在您同意后使用功能和分析 Cookie。",
    necessary:"必要", always:"始终启用", functional:"功能", functionalD:"偏好和高级功能", analytics:"分析", analyticsD:"匿名使用统计",
    customize:"自定义", back:"返回", acceptAll:"全部接受", onlyNec:"仅必要", save:"保存偏好",
    confirmTitle:"偏好已保存", confirmText:"您可以随时在页脚更改。", reopen:"再次显示横幅",
    chosen:"您的设置" },
};

function BSIcon({ size = 36, uid = "a" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none">
      <defs>
        <linearGradient id={`bg${uid}`} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#0D2137"/><stop offset="100%" stopColor="#0C4A6E"/></linearGradient>
        <linearGradient id={`ar${uid}`} x1="42" y1="12" x2="42" y2="40" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#38BDF8"/><stop offset="100%" stopColor="#22D3EE"/></linearGradient>
      </defs>
      <rect width="56" height="56" rx="13" fill={`url(#bg${uid})`}/>
      <rect x="10" y="14" width="22" height="5.5" rx="2.75" fill="white"/>
      <rect x="10" y="23" width="16" height="5.5" rx="2.75" fill="white" fillOpacity="0.65"/>
      <rect x="10" y="32" width="10" height="5.5" rx="2.75" fill="white" fillOpacity="0.35"/>
      <rect x="36" y="12" width="1" height="32" fill="white" fillOpacity="0.07"/>
      <path d="M42 12 L42 34" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M35.5 28.5 L42 38 L48.5 28.5" stroke={`url(#ar${uid})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

function Toggle({ on, disabled, onClick }) {
  return (
    <button onClick={disabled?undefined:onClick} disabled={disabled}
      style={{ width:42, height:24, borderRadius:100, border:"none", cursor:disabled?"default":"pointer", padding:2,
        background: on ? (disabled?C.muted:C.blue) : "#CBD5E1", transition:"background 0.2s", flexShrink:0, opacity:disabled?0.7:1 }}>
      <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", transform:on?"translateX(18px)":"translateX(0)", transition:"transform 0.2s", boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }}/>
    </button>
  );
}

export default function WelcomeOverlay() {
  const [lang, setLang] = useState("it");
  const [curr, setCurr] = useState("EUR");
  const [customize, setCustomize] = useState(false);
  const [functional, setFunctional] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState(null);

  const t = T[lang];
  const cur = CURR.find(c => c.code === curr);
  const examplePrice = (() => {
    const v = 2.30 * cur.rate;
    try { return new Intl.NumberFormat(cur.locale, { style:"currency", currency:cur.code, minimumFractionDigits:2, maximumFractionDigits:2 }).format(v); }
    catch { return cur.symbol + v.toFixed(2); }
  })();

  function finish(mode) {
    const prefs = mode==="all" ? { functional:true, analytics:true }
              : mode==="nec" ? { functional:false, analytics:false }
              : { functional, analytics };
    setSummary({ lang, curr, ...prefs });
    setDone(true);
  }

  const langObj = LANGS.find(l => l.code===lang);
  const curObj = CURR.find(c => c.code===curr);

  return (
    <div style={{ fontFamily:"'Inter',system-ui,sans-serif", minHeight:"100vh", position:"relative", overflow:"hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
        * { box-sizing:border-box; }
        .bs-num { font-family:'JetBrains Mono',monospace; }
        @keyframes pop { from{opacity:0; transform:translateY(12px) scale(0.98)} to{opacity:1; transform:none} }
        .bs-modal { animation:pop 0.3s ease both; }
        .bs-opt { border:1.5px solid #E2E8F0; border-radius:10px; cursor:pointer; transition:all 0.15s; background:#fff; font-family:'Inter',system-ui; }
        .bs-opt:hover { border-color:#0EA5E9; }
        .bs-opt.sel { border-color:#0EA5E9; background:#EFF6FF; }
        .bs-btn { border:none; border-radius:10px; padding:13px 20px; font-size:15px; font-weight:700; cursor:pointer; font-family:'Inter',system-ui; transition:all 0.2s; display:inline-flex; align-items:center; justify-content:center; gap:8px; }
        .bs-primary { background:#0EA5E9; color:#fff; }
        .bs-primary:hover { background:#0284C7; }
        .bs-outline { background:#fff; color:#0F172A; border:1.5px solid #E2E8F0; }
        .bs-outline:hover { border-color:#0EA5E9; color:#0EA5E9; }
      `}</style>

      {/* faux site background, dimmed */}
      <div style={{ position:"absolute", inset:0, background:`linear-gradient(135deg,#0A1929,#0C2A45)`, zIndex:0 }}/>
      <div style={{ position:"absolute", inset:0, zIndex:1, opacity:0.10, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <div style={{ fontSize:120, fontWeight:900, color:"#fff", letterSpacing:"-0.05em" }}>BulkStrike</div>
      </div>
      <div style={{ position:"absolute", inset:0, background:"rgba(5,13,24,0.55)", backdropFilter:"blur(3px)", zIndex:2 }}/>

      {/* center container */}
      <div style={{ position:"relative", zIndex:3, minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>

        {!done ? (
          <div className="bs-modal" style={{ width:"100%", maxWidth:480, background:"#fff", borderRadius:20, boxShadow:"0 30px 80px rgba(0,0,0,0.35)", overflow:"hidden" }}>
            {/* header */}
            <div style={{ padding:"22px 24px 0", display:"flex", alignItems:"center", gap:12 }}>
              <BSIcon size={40} uid="w"/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:18, fontWeight:800, letterSpacing:"-0.02em", lineHeight:1.2 }}>{t.title}</div>
                <div style={{ fontSize:13, color:C.muted }}>{t.sub}</div>
              </div>
              <button onClick={() => finish("nec")} title={t.onlyNec} style={{ width:32, height:32, borderRadius:8, border:`1px solid ${C.border}`, background:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                <X size={16} color={C.muted}/>
              </button>
            </div>

            <div style={{ padding:"20px 24px 24px" }}>
              {/* LANGUAGE */}
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                <Globe size={15} color={C.blue}/><span style={{ fontSize:13, fontWeight:700 }}>{t.lang}</span>
              </div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:8, marginBottom:20 }}>
                {LANGS.map(l => (
                  <button key={l.code} className={`bs-opt${lang===l.code?" sel":""}`} onClick={() => setLang(l.code)}
                    style={{ padding:"10px 8px", display:"flex", alignItems:"center", gap:7, justifyContent:"center" }}>
                    <span style={{ fontSize:16 }}>{l.flag}</span>
                    <span style={{ fontSize:13, fontWeight:600, color:lang===l.code?C.blue:C.text }}>{l.name}</span>
                    {lang===l.code && <Check size={13} color={C.blue}/>}
                  </button>
                ))}
              </div>

              {/* CURRENCY */}
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                <span style={{ fontSize:13, fontWeight:700 }}>{t.cur}</span>
                <span style={{ fontSize:12, color:C.muted }}>{t.example}: <b className="bs-num" style={{ color:C.blue }}>{examplePrice}</b>/kg</span>
              </div>
              <div style={{ display:"flex", gap:8, marginBottom:22, flexWrap:"wrap" }}>
                {CURR.map(c => (
                  <button key={c.code} className={`bs-opt${curr===c.code?" sel":""}`} onClick={() => setCurr(c.code)}
                    style={{ flex:1, minWidth:64, padding:"10px 6px", textAlign:"center" }}>
                    <div style={{ fontSize:15, fontWeight:800, color:curr===c.code?C.blue:C.text }}>{c.symbol}</div>
                    <div style={{ fontSize:11, color:C.muted, fontWeight:600 }}>{c.code}</div>
                  </button>
                ))}
              </div>

              {/* divider */}
              <div style={{ height:1, background:C.border, margin:"0 -24px 18px" }}/>

              {/* COOKIES */}
              <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:8 }}>
                <Cookie size={15} color={C.amber}/><span style={{ fontSize:13, fontWeight:700 }}>{t.cookieTitle}</span>
              </div>
              <p style={{ fontSize:12.5, color:C.muted, lineHeight:1.55, marginBottom:16 }}>{t.cookieText}</p>

              {!customize ? (
                <>
                  <div style={{ display:"flex", gap:10, marginBottom:12 }}>
                    <button className="bs-btn bs-outline" style={{ flex:1 }} onClick={() => finish("nec")}>{t.onlyNec}</button>
                    <button className="bs-btn bs-primary" style={{ flex:1 }} onClick={() => finish("all")}>{t.acceptAll}</button>
                  </div>
                  <button onClick={() => setCustomize(true)} style={{ width:"100%", background:"none", border:"none", cursor:"pointer", fontSize:13, color:C.muted, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center", gap:5, fontFamily:"Inter,system-ui" }}>
                    <SlidersHorizontal size={13}/> {t.customize}
                  </button>
                </>
              ) : (
                <>
                  <div style={{ display:"flex", flexDirection:"column", gap:2, marginBottom:16 }}>
                    {/* necessary - always on */}
                    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:`1px solid #F1F5F9` }}>
                      <Shield size={17} color={C.green} style={{ flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13.5, fontWeight:600 }}>{t.necessary}</div>
                        <div style={{ fontSize:11.5, color:C.muted }}>{t.always}</div>
                      </div>
                      <Toggle on={true} disabled={true}/>
                    </div>
                    {/* functional */}
                    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0", borderBottom:`1px solid #F1F5F9` }}>
                      <SlidersHorizontal size={17} color={C.blue} style={{ flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13.5, fontWeight:600 }}>{t.functional}</div>
                        <div style={{ fontSize:11.5, color:C.muted }}>{t.functionalD}</div>
                      </div>
                      <Toggle on={functional} onClick={() => setFunctional(!functional)}/>
                    </div>
                    {/* analytics */}
                    <div style={{ display:"flex", alignItems:"center", gap:12, padding:"11px 0" }}>
                      <Globe size={17} color={C.purple} style={{ flexShrink:0 }}/>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13.5, fontWeight:600 }}>{t.analytics}</div>
                        <div style={{ fontSize:11.5, color:C.muted }}>{t.analyticsD}</div>
                      </div>
                      <Toggle on={analytics} onClick={() => setAnalytics(!analytics)}/>
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:10 }}>
                    <button className="bs-btn bs-outline" style={{ flex:1 }} onClick={() => setCustomize(false)}>{t.back}</button>
                    <button className="bs-btn bs-primary" style={{ flex:1 }} onClick={() => finish("custom")}>{t.save}</button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          /* CONFIRMATION */
          <div className="bs-modal" style={{ width:"100%", maxWidth:420, background:"#fff", borderRadius:20, boxShadow:"0 30px 80px rgba(0,0,0,0.35)", padding:28, textAlign:"center" }}>
            <div style={{ width:56, height:56, borderRadius:"50%", background:"#ECFDF5", display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>
              <Check size={28} color={C.green}/>
            </div>
            <div style={{ fontSize:19, fontWeight:800, marginBottom:6 }}>{t.confirmTitle}</div>
            <div style={{ fontSize:13.5, color:C.muted, marginBottom:20, lineHeight:1.5 }}>{t.confirmText}</div>

            <div style={{ background:C.bg, borderRadius:12, padding:16, textAlign:"left", marginBottom:20 }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.08em", color:C.muted, marginBottom:10 }}>{t.chosen}</div>
              <Line label={t.lang} value={`${langObj.flag} ${langObj.name}`}/>
              <Line label={t.cur} value={`${curObj.symbol} ${curObj.code}`}/>
              <Line label={t.functional} value={summary.functional?"✓":"—"} color={summary.functional?C.green:C.muted}/>
              <Line label={t.analytics} value={summary.analytics?"✓":"—"} color={summary.analytics?C.green:C.muted}/>
            </div>

            <button className="bs-btn bs-outline" style={{ width:"100%" }} onClick={() => { setDone(false); setCustomize(false); }}>
              {t.reopen} <ChevronRight size={15}/>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Line({ label, value, color }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0" }}>
      <span style={{ fontSize:13, color:"#64748B" }}>{label}</span>
      <span style={{ fontSize:13, fontWeight:700, color:color||"#0F172A" }}>{value}</span>
    </div>
  );
}
