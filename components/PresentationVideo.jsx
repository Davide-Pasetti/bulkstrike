"use client";
// ============================================================
// BulkStrike — player del video di presentazione (muto, verticale 4:5).
// Comportamento (video MUTO, 22s, senza parlato):
//  - autoplay muted + loop quando la sezione entra a schermo (IntersectionObserver),
//    NON al load della pagina (lazy: preload="none");
//  - poster di anteprima mentre carica (niente schermo nero);
//  - prefers-reduced-motion: niente autoplay, solo poster + bottone play esplicito;
//  - nessun controllo audio (il video non ha traccia audio).
// Il testo dei 3 passaggi resta come alternativa accessibile/indicizzabile.
// ============================================================
import { useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";

export default function PresentationVideo({ src, poster, ariaLabel = "Video di presentazione BulkStrike", style }) {
  const wrapRef = useRef(null);
  const videoRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Preferenza di sistema "riduci movimento".
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // Lazy autoplay: parte solo quando entra a schermo (e solo se non "riduci movimento").
  // Fuori schermo si mette in pausa per non consumare risorse/dati.
  useEffect(() => {
    const wrap = wrapRef.current, v = videoRef.current;
    if (!wrap || !v) return;
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting && !reduced) {
          v.play().then(() => setPlaying(true)).catch(() => {});
        } else if (!e.isIntersecting) {
          v.pause();
        }
      }
    }, { threshold: 0.25 });
    io.observe(wrap);
    return () => io.disconnect();
  }, [reduced]);

  const manualPlay = () => {
    const v = videoRef.current;
    if (v) v.play().then(() => setPlaying(true)).catch(() => {});
  };

  return (
    <div ref={wrapRef} style={{ position: "relative", borderRadius: 16, overflow: "hidden", background: "#0B1220", ...style }}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted
        loop
        playsInline
        preload="none"
        aria-label={ariaLabel}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }}
      />
      {/* Overlay bottone play: visibile quando non è in riproduzione (stato iniziale
          e caso "riduci movimento") — dà anche un affordance manuale. */}
      {!playing && (
        <button
          onClick={manualPlay}
          aria-label="Riproduci il video di presentazione"
          style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(11,18,32,0.28)", border: "none", cursor: "pointer", padding: 0,
          }}
        >
          <span style={{
            width: 62, height: 62, borderRadius: "50%", background: "rgba(255,255,255,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 22px rgba(0,0,0,0.28)",
          }}>
            <Play size={26} color="#0EA5E9" fill="#0EA5E9" style={{ marginLeft: 3 }} />
          </span>
        </button>
      )}
    </div>
  );
}
