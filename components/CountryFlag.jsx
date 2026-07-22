// ============================================================
// BulkStrike — bandiera paese come SVG inline (una fonte unica, condivisa).
// Sostituisce le emoji bandiera Unicode (🇨🇳) che su Windows si rendono come le
// due lettere ISO ("CN") perché il font di sistema non ha i glifi bandiera. Gli
// SVG si vedono ovunque (Windows incluso), senza dipendenze/CDN esterni.
//
// Uso:  <CountryFlag country="Cina" />   oppure   <CountryFlag code="CN" />
// Accessibilità: role="img" + aria-label/title = nome paese esteso (non solo l'emoji).
// Fallback: paese sconosciuto → nessun riquadro vuoto, si mostra il codice/nome.
// ============================================================

// Nome italiano → codice ISO-3166 alpha-2
const ISO_BY_NAME = {
  "Italia": "IT", "Cina": "CN", "Argentina": "AR", "Polonia": "PL", "Francia": "FR",
  "Germania": "DE", "Spagna": "ES", "Paesi Bassi": "NL", "India": "IN",
  "Stati Uniti": "US", "Turchia": "TR", "Belgio": "BE", "Austria": "AT",
  // Aggiunti con i lead europei di luglio 2026.
  "Svizzera": "CH", "Regno Unito": "GB", "Norvegia": "NO", "Finlandia": "FI",
  "Irlanda": "IE", "Danimarca": "DK", "Slovenia": "SI", "Lussemburgo": "LU",
  "Ungheria": "HU", "Svezia": "SE",
};
// Codice ISO → nome italiano (per aria-label quando arriva già l'ISO)
const NAME_BY_ISO = Object.fromEntries(Object.entries(ISO_BY_NAME).map(([n, i]) => [i, n]));

// Croce scandinava: barra verticale spostata verso il battente, barra
// orizzontale centrata. Riutilizzata da DK/NO/FI/SE (stessa geometria, colori
// diversi); NO la usa due volte, bianca sotto e blu sopra.
const NordicCross = ({ fill, w = 6 }) => (
  <g fill={fill}>
    <rect x={21 - w / 2} y="0" width={w} height="40" />
    <rect x="0" y={20 - w / 2} width="60" height={w} />
  </g>
);

// Stella a 5 punte (raggio unitario), riutilizzata da CN/TR.
const Star = ({ cx, cy, r, rot = 0, fill = "#FFDE00" }) => (
  <path fill={fill} transform={`translate(${cx} ${cy}) scale(${r}) rotate(${rot})`}
    d="M0,-1 0.2245,-0.309 0.951,-0.309 0.363,0.118 0.588,0.809 0,0.382 -0.588,0.809 -0.363,0.118 -0.951,-0.309 -0.2245,-0.309Z" />
);

// Contenuto SVG per codice ISO (viewBox 0 0 60 40, rapporto 3:2).
const FLAGS = {
  IT: <><rect width="60" height="40" fill="#fff" /><rect width="20" height="40" fill="#009246" /><rect x="40" width="20" height="40" fill="#ce2b37" /></>,
  FR: <><rect width="60" height="40" fill="#fff" /><rect width="20" height="40" fill="#0055A4" /><rect x="40" width="20" height="40" fill="#EF4135" /></>,
  BE: <><rect width="20" height="40" fill="#000" /><rect x="20" width="20" height="40" fill="#FDDA24" /><rect x="40" width="20" height="40" fill="#EF3340" /></>,
  DE: <><rect width="60" height="40" fill="#000" /><rect y="13.34" width="60" height="13.33" fill="#DD0000" /><rect y="26.67" width="60" height="13.33" fill="#FFCE00" /></>,
  ES: <><rect width="60" height="40" fill="#AA151B" /><rect y="10" width="60" height="20" fill="#F1BF00" /></>,
  NL: <><rect width="60" height="40" fill="#AE1C28" /><rect y="13.34" width="60" height="13.33" fill="#fff" /><rect y="26.67" width="60" height="13.33" fill="#21468B" /></>,
  AT: <><rect width="60" height="40" fill="#ED2939" /><rect y="13.34" width="60" height="13.33" fill="#fff" /></>,
  PL: <><rect width="60" height="40" fill="#fff" /><rect y="20" width="60" height="20" fill="#DC143C" /></>,
  AR: <><rect width="60" height="40" fill="#fff" /><rect width="60" height="13.34" fill="#74ACDF" /><rect y="26.67" width="60" height="13.33" fill="#74ACDF" /><circle cx="30" cy="20" r="3.6" fill="#F6B40E" /></>,
  IN: <><rect width="60" height="40" fill="#FF9933" /><rect y="13.34" width="60" height="13.33" fill="#fff" /><rect y="26.67" width="60" height="13.33" fill="#138808" /><circle cx="30" cy="20" r="4.4" fill="none" stroke="#000080" strokeWidth="1" /><circle cx="30" cy="20" r="0.9" fill="#000080" /></>,
  CN: <><rect width="60" height="40" fill="#DE2910" /><Star cx="11" cy="11" r="6.5" /><Star cx="22" cy="5" r="2.1" rot={23} /><Star cx="27" cy="9.5" r="2.1" rot={46} /><Star cx="27" cy="15.5" r="2.1" rot={70} /><Star cx="22" cy="20" r="2.1" rot={23} /></>,
  US: (
    <>
      <rect width="60" height="40" fill="#B22234" />
      <g fill="#fff">
        <rect y="3.08" width="60" height="3.08" /><rect y="9.23" width="60" height="3.08" />
        <rect y="15.38" width="60" height="3.08" /><rect y="21.54" width="60" height="3.08" />
        <rect y="27.69" width="60" height="3.08" /><rect y="33.85" width="60" height="3.08" />
      </g>
      <rect width="26" height="21.54" fill="#3C3B6E" />
      <g fill="#fff">
        {[4, 9.5, 15, 20.5].map((x, i) => [3.5, 8, 12.5, 17].map((y, j) => (
          <circle key={`${i}-${j}`} cx={x + (j % 2 ? 2.7 : 0)} cy={y} r="0.9" />
        )))}
      </g>
    </>
  ),
  TR: <><rect width="60" height="40" fill="#E30A17" /><circle cx="24" cy="20" r="9" fill="#fff" /><circle cx="27.5" cy="20" r="7.2" fill="#E30A17" /><Star cx="37" cy="20" r="4.2" rot={18} fill="#fff" /></>,
  // Croci scandinave
  DK: <><rect width="60" height="40" fill="#C8102E" /><NordicCross fill="#fff" /></>,
  FI: <><rect width="60" height="40" fill="#fff" /><NordicCross fill="#003580" /></>,
  SE: <><rect width="60" height="40" fill="#006AA7" /><NordicCross fill="#FECC00" /></>,
  NO: <><rect width="60" height="40" fill="#BA0C2F" /><NordicCross fill="#fff" w={9} /><NordicCross fill="#00205B" w={3.6} /></>,
  // Croce svizzera (bandiera reale quadrata: qui adattata al riquadro 3:2)
  CH: <><rect width="60" height="40" fill="#FF0000" /><rect x="26.5" y="9" width="7" height="22" fill="#fff" /><rect x="19.5" y="16" width="21" height="8" fill="#fff" /></>,
  // Tricolori
  IE: <><rect width="60" height="40" fill="#fff" /><rect width="20" height="40" fill="#169B62" /><rect x="40" width="20" height="40" fill="#FF883E" /></>,
  HU: <><rect width="60" height="40" fill="#fff" /><rect width="60" height="13.34" fill="#CD2A3E" /><rect y="26.67" width="60" height="13.33" fill="#436F4D" /></>,
  LU: <><rect width="60" height="40" fill="#fff" /><rect width="60" height="13.34" fill="#ED2939" /><rect y="26.67" width="60" height="13.33" fill="#00A1DE" /></>,
  SI: <><rect width="60" height="40" fill="#fff" /><rect y="13.34" width="60" height="13.33" fill="#005CE6" /><rect y="26.67" width="60" height="13.33" fill="#ED1C24" /></>,
  // Union Jack semplificata: diagonali bianche e rosse + croce di San Giorgio.
  GB: (
    <>
      <rect width="60" height="40" fill="#012169" />
      <path d="M0,0 60,40 M60,0 0,40" stroke="#fff" strokeWidth="8" />
      <path d="M0,0 60,40 M60,0 0,40" stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 30,40 M0,20 60,20" stroke="#fff" strokeWidth="13" />
      <path d="M30,0 30,40 M0,20 60,20" stroke="#C8102E" strokeWidth="8" />
    </>
  ),
};

export function countryToIso(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (ISO_BY_NAME[s]) return ISO_BY_NAME[s];          // nome italiano
  const up = s.toUpperCase();
  if (FLAGS[up] || NAME_BY_ISO[up]) return up;        // già ISO
  return null;
}

export default function CountryFlag({ country, code, size = 14, style }) {
  const iso = countryToIso(code || country);
  const label = (iso && NAME_BY_ISO[iso]) || country || code || "";
  const w = Math.round(size * 1.5);
  const box = {
    display: "inline-block", width: w, height: size, borderRadius: 2,
    verticalAlign: "middle", overflow: "hidden", flexShrink: 0,
    boxShadow: "0 0 0 0.5px rgba(15,23,42,0.15)", ...style,
  };

  if (!iso || !FLAGS[iso]) {
    // Fallback sensato (niente riquadro vuoto): mostra il codice/nome breve.
    const short = (code && String(code).toUpperCase().slice(0, 3)) || (country ? String(country).slice(0, 2).toUpperCase() : "?");
    return (
      <span role="img" aria-label={label || "Paese non indicato"} title={label}
        style={{ ...box, width: "auto", padding: "0 3px", fontSize: Math.round(size * 0.72), lineHeight: `${size}px`, fontWeight: 700, color: "#64748B", background: "#F1F5F9", boxShadow: "none" }}>
        {short}
      </span>
    );
  }
  return (
    <span role="img" aria-label={label} title={label} style={box}>
      <svg viewBox="0 0 60 40" width={w} height={size} preserveAspectRatio="none" style={{ display: "block" }}>
        {FLAGS[iso]}
      </svg>
    </span>
  );
}
