// ─── SHARED BULKSTRIKE LOGO — single source of truth ─────────────────────────
// Official logo: stacked bars (bulk lots) + cyan reverse-auction arrow (price
// striking down) on a navy gradient. Background gradient #0D2137→#0C4A6E,
// arrow gradient #38BDF8→#22D3EE. `uid` keeps the two <linearGradient> ids
// unique when several instances render on the same page — pass a distinct uid
// per instance (e.g. "nav", "foot", "load").

export function BSIcon({ size = 36, uid = "a" }) {
  const bg = `bsbg${uid}`;
  const arr = `bsar${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={bg} x1="0" y1="0" x2="56" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D2137"/>
          <stop offset="100%" stopColor="#0C4A6E"/>
        </linearGradient>
        <linearGradient id={arr} x1="42" y1="12" x2="42" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8"/>
          <stop offset="100%" stopColor="#22D3EE"/>
        </linearGradient>
      </defs>
      {/* Background */}
      <rect width="56" height="56" rx="13" fill={`url(#${bg})`}/>
      {/* Stacked bars — decreasing width = bulk lots at different price tiers */}
      <rect x="10" y="14" width="22" height="5.5" rx="2.75" fill="white"/>
      <rect x="10" y="23" width="16" height="5.5" rx="2.75" fill="white" fillOpacity="0.65"/>
      <rect x="10" y="32" width="10" height="5.5" rx="2.75" fill="white" fillOpacity="0.35"/>
      {/* Hairline separator */}
      <rect x="36" y="12" width="1" height="32" fill="white" fillOpacity="0.07"/>
      {/* Arrow — price striking down (reverse auction) */}
      <path d="M42 12 L42 34" stroke={`url(#${arr})`} strokeWidth="3.5" strokeLinecap="round"/>
      <path d="M35.5 28.5 L42 38 L48.5 28.5" stroke={`url(#${arr})`} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  );
}

// Wordmark "BulkStrike" — "Bulk" solid, "Strike" cyan gradient.
export function BSWordmark({ fontSize = 20, color = "#0F172A" }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontFamily: "Inter,system-ui,sans-serif" }}>
      <span style={{ fontSize, fontWeight: 900, color, letterSpacing: "-0.03em" }}>Bulk</span>
      <span style={{ fontSize, fontWeight: 900, letterSpacing: "-0.03em", background: "linear-gradient(90deg,#0EA5E9,#22D3EE)", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent" }}>Strike</span>
    </div>
  );
}

// Full logo (icon + wordmark) as a horizontal row.
export default function BSLogo({ iconSize = 36, fontSize = 20, uid = "x", color = "#0F172A", onClick, style }) {
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, cursor: onClick ? "pointer" : "default", ...style }}>
      <BSIcon size={iconSize} uid={uid} />
      <BSWordmark fontSize={fontSize} color={color} />
    </div>
  );
}
