import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// ============================================================================
// BulkStrike — legge la INBOX di info@bulkstrike.com e riporta le
// risposte dei fornitori nella conversazione giusta.
// (Fino al 22/08/2026 la casella era commercial@bulkstrike.com, poi eliminata.)
//
// SOLA LETTURA sul server di posta, per contratto:
//   - EXAMINE (non SELECT): la cartella si apre in modalità read-only;
//   - BODY.PEEK[] (non BODY[]): una FETCH normale metterebbe il flag \Seen e
//     cambierebbe lo stato letto/non letto delle mail di Davide.
// Niente APPEND, niente STORE, niente EXPUNGE: non si sposta e non si cancella.
//
// Ripresa: imap_state tiene last_uid E uidvalidity. Gli UID sono unici solo
// finché UIDVALIDITY non cambia; se Zoho ricostruisce la cartella ripartono da
// capo, e guardando solo l'UID si salterebbe tutta la posta nuova.
//
// Aggancio: codice [RIF-XXXXXXXX] nell'oggetto → thread_da_oggetto(). Il
// Message-ID non si usa: SES lo riscrive in uscita.
// Chi non aggancia resta in emails_inbox con processed=false e il motivo
// scritto, per la pagina admin "Mail ricevute". Mai scartato in silenzio.
//
// Autorizzazione: x-cron-secret == app_secrets.ingest_cron_secret.
// Secrets: ZOHO_IMAP_HOST, ZOHO_IMAP_USER, ZOHO_IMAP_APP_PASSWORD.
// ============================================================================
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const IMAP_HOST = Deno.env.get("ZOHO_IMAP_HOST") ?? "imappro.zoho.eu";
const IMAP_PORT = Number(Deno.env.get("ZOHO_IMAP_PORT") ?? 993);
// Questo valore fa DUE cose: e' l'utente del LOGIN IMAP ed e' la chiave della
// riga di imap_state (vedi `const mailbox = IMAP_USER` piu' sotto). Se il
// secret ZOHO_IMAP_USER e' impostato vince lui: dopo un cambio di casella va
// aggiornato o rimosso, altrimenti il default qui sotto non viene mai usato.
// La risposta del job riporta `mailbox`, quindi si vede subito quale ha vinto.
const IMAP_USER = Deno.env.get("ZOHO_IMAP_USER") ?? "info@bulkstrike.com";
const IMAP_PASS = Deno.env.get("ZOHO_IMAP_APP_PASSWORD") ?? "";
// Quante mail al massimo per giro: il cron passa ogni 20 minuti, se ne
// arrivassero centinaia insieme si recupera al giro dopo invece di andare in
// timeout a metà e perdere il punto di ripresa.
const MAX_PER_RUN = 40;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// ─── Client IMAP minimo ─────────────────────────────────────────────────────
class Imap {
  conn!: Deno.TlsConn;
  buf = new Uint8Array(0);
  tag = 0;

  async connect() {
    this.conn = await Deno.connectTls({ hostname: IMAP_HOST, port: IMAP_PORT });
    await this.readLine(); // greeting
  }
  async close() { try { this.conn.close(); } catch { /* già chiusa */ } }

  private async fill() {
    const chunk = new Uint8Array(65536);
    const n = await this.conn.read(chunk);
    if (n === null) throw new Error("IMAP: connessione chiusa dal server");
    const next = new Uint8Array(this.buf.length + n);
    next.set(this.buf); next.set(chunk.subarray(0, n), this.buf.length);
    this.buf = next;
  }
  // Una riga di protocollo (fino a CRLF), come testo.
  private async readLine(): Promise<string> {
    for (;;) {
      for (let i = 0; i < this.buf.length - 1; i++) {
        if (this.buf[i] === 13 && this.buf[i + 1] === 10) {
          const line = new TextDecoder("utf-8", { fatal: false }).decode(this.buf.subarray(0, i));
          this.buf = this.buf.subarray(i + 2);
          return line;
        }
      }
      await this.fill();
    }
  }
  // Un literal {N}: N byte grezzi, che NON vanno decodificati come testo qui
  // (il charset lo decide il MIME, non il protocollo).
  private async readBytes(n: number): Promise<Uint8Array> {
    while (this.buf.length < n) await this.fill();
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    return new Uint8Array(out);
  }

  // Esegue un comando e raccoglie la risposta fino alla riga con il tag.
  // I literal vengono restituiti a parte, in ordine di apparizione.
  async cmd(command: string): Promise<{ lines: string[]; literals: Uint8Array[]; ok: boolean; tagLine: string }> {
    const tag = "a" + (++this.tag);
    await this.conn.write(new TextEncoder().encode(tag + " " + command + "\r\n"));
    const lines: string[] = [];
    const literals: Uint8Array[] = [];
    for (;;) {
      const line = await this.readLine();
      const lit = line.match(/\{(\d+)\}$/);
      if (lit) {
        lines.push(line);
        literals.push(await this.readBytes(Number(lit[1])));
        continue;
      }
      if (line.startsWith(tag + " ")) {
        return { lines, literals, ok: /^\S+ OK/i.test(line), tagLine: line };
      }
      lines.push(line);
    }
  }
}

// ─── Decodifiche ────────────────────────────────────────────────────────────
function decodeBytes(bytes: Uint8Array, charset?: string | null): string {
  const cs = (charset || "utf-8").toLowerCase().replace(/^"|"$/g, "");
  try { return new TextDecoder(cs, { fatal: false }).decode(bytes); }
  catch { return new TextDecoder("utf-8", { fatal: false }).decode(bytes); }
}
function b64ToBytes(s: string): Uint8Array {
  const clean = s.replace(/[^A-Za-z0-9+/=]/g, "");
  try {
    const bin = atob(clean);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch { return new Uint8Array(0); }
}
function qpToBytes(s: string): Uint8Array {
  const t = s.replace(/=\r?\n/g, ""); // soft line break
  const out: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (t[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(t.substr(i + 1, 2))) {
      out.push(parseInt(t.substr(i + 1, 2), 16)); i += 2;
    } else out.push(t.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(out);
}
// RFC 2047: l'oggetto delle nostre richieste contiene "—", quindi la risposta
// arriva quasi sempre codificata (=?UTF-8?B?...?=). Senza questa decodifica il
// [RIF-XXXXXXXX] resterebbe sepolto nel base64 e NESSUNA risposta aggancerebbe.
function decodeHeaderWords(s: string): string {
  if (!s) return "";
  return s.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=(\s*)(?==\?|$|[^\s])?/g,
    (_m, cs: string, enc: string, txt: string) => {
      const bytes = enc.toUpperCase() === "B" ? b64ToBytes(txt) : qpToBytes(txt.replace(/_/g, " "));
      return decodeBytes(bytes, cs);
    }).replace(/\s+/g, " ").trim();
}

// ─── Parsing MIME ───────────────────────────────────────────────────────────
type Parte = { tipo: string; charset: string | null; enc: string | null; corpo: string };

function splitHeaderBody(raw: string): { head: string; body: string } {
  const i = raw.search(/\r?\n\r?\n/);
  if (i < 0) return { head: raw, body: "" };
  const sep = raw.slice(i).match(/^\r?\n\r?\n/)![0].length;
  return { head: raw.slice(0, i), body: raw.slice(i + sep) };
}
function headerValue(head: string, name: string): string | null {
  // unfolding: le intestazioni lunghe vanno a capo con indentazione
  const unfolded = head.replace(/\r?\n[ \t]+/g, " ");
  const re = new RegExp("^" + name + ":\\s*(.*)$", "im");
  const m = unfolded.match(re);
  return m ? m[1].trim() : null;
}
function paramOf(value: string | null, key: string): string | null {
  if (!value) return null;
  const m = value.match(new RegExp(key + '\\s*=\\s*("([^"]*)"|[^;\\s]+)', "i"));
  return m ? (m[2] ?? m[1]) : null;
}
function decodePart(head: string, body: string): Parte {
  const ct = headerValue(head, "Content-Type") || "text/plain";
  const enc = (headerValue(head, "Content-Transfer-Encoding") || "").toLowerCase() || null;
  const charset = paramOf(ct, "charset");
  const tipo = ct.split(";")[0].trim().toLowerCase();
  let testo: string;
  if (enc === "base64") testo = decodeBytes(b64ToBytes(body), charset);
  else if (enc === "quoted-printable") testo = decodeBytes(qpToBytes(body), charset);
  else testo = body;
  return { tipo, charset, enc, corpo: testo };
}
// Raccoglie ricorsivamente le parti testuali. Gli allegati si ignorano: qui
// serve il testo della risposta, non i file.
function raccogliParti(head: string, body: string, out: Parte[], livello = 0) {
  if (livello > 6) return;
  const ct = headerValue(head, "Content-Type") || "text/plain";
  const tipo = ct.split(";")[0].trim().toLowerCase();
  if (tipo.startsWith("multipart/")) {
    const b = paramOf(ct, "boundary");
    if (!b) return;
    const parti = body.split(new RegExp("--" + b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(--)?\\r?\\n"));
    for (const p of parti) {
      if (!p || !p.trim()) continue;
      const sp = splitHeaderBody(p);
      raccogliParti(sp.head, sp.body, out, livello + 1);
    }
    return;
  }
  if (tipo === "text/plain" || tipo === "text/html") out.push(decodePart(head, body));
}

// ─── Ripulitura della risposta ──────────────────────────────────────────────
// Via citazioni, intestazioni di inoltro, firme e disclaimer: nel thread deve
// finire quello che il fornitore ha scritto davvero, non l'eco della nostra mail.
const TAGLI = [
  /^\s*-{2,}\s*(messaggio originale|original message)\s*-{2,}/im,
  /^\s*il\s+(giorno\s+)?.{0,80}\s+ha\s+scritto\s*:/im,
  /^\s*on\s+.{0,80}\s+wrote\s*:/im,
  /^\s*da\s*:\s*.+\r?\n\s*(inviato|data)\s*:/im,
  /^\s*from\s*:\s*.+\r?\n\s*sent\s*:/im,
  /^\s*_{5,}\s*$/m,
];
function ripulisci(testo: string): string {
  let t = (testo || "").replace(/\r\n/g, "\n");
  for (const re of TAGLI) {
    const m = t.match(re);
    if (m && m.index !== undefined) t = t.slice(0, m.index);
  }
  t = t.split("\n").filter((r) => !/^\s*>/.test(r)).join("\n"); // citazioni
  const firma = t.search(/^--\s*$/m);                            // firma RFC 3676
  if (firma >= 0) t = t.slice(0, firma);
  return t.replace(/\n{3,}/g, "\n\n").trim();
}
function htmlAtesto(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "") // citazione della mail precedente
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}
function indirizzoDa(v: string | null): { email: string | null; nome: string | null } {
  if (!v) return { email: null, nome: null };
  const dec = decodeHeaderWords(v);
  const m = dec.match(/<([^>]+)>/);
  const email = (m ? m[1] : dec).trim().toLowerCase();
  const nome = m ? dec.slice(0, m.index).replace(/^"|"$/g, "").trim() : null;
  return { email: /@/.test(email) ? email : null, nome: nome || null };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: cfg } = await admin.from("app_secrets").select("value").eq("key", "ingest_cron_secret").single();
  if (!cfg?.value || (req.headers.get("x-cron-secret") || "") !== cfg.value) {
    return json(401, { error: "BAD_SECRET" });
  }
  if (!IMAP_PASS) return json(500, { error: "ZOHO_IMAP_APP_PASSWORD_NON_IMPOSTATA" });

  const mailbox = IMAP_USER;
  const imap = new Imap();
  const esiti: Record<string, number> = { lette: 0, agganciate: 0, senza_aggancio: 0, gia_presenti: 0, errori: 0 };

  try {
    const { data: st } = await admin.rpc("imap_state_get", { p_mailbox: mailbox });
    const lastUid = Number(st?.last_uid ?? 0);
    const lastUidValidity = st?.uidvalidity != null ? Number(st.uidvalidity) : null;

    await imap.connect();
    const login = await imap.cmd(`LOGIN "${IMAP_USER.replace(/(["\\])/g, "\\$1")}" "${IMAP_PASS.replace(/(["\\])/g, "\\$1")}"`);
    if (!login.ok) throw new Error("IMAP LOGIN rifiutato: " + login.tagLine);

    // EXAMINE, non SELECT: cartella in sola lettura.
    const ex = await imap.cmd("EXAMINE INBOX");
    if (!ex.ok) throw new Error("IMAP EXAMINE rifiutato: " + ex.tagLine);
    const uidvalidity = Number((ex.lines.join("\n").match(/UIDVALIDITY\s+(\d+)/i) || [])[1] || 0);
    if (!uidvalidity) throw new Error("IMAP: UIDVALIDITY non riportato");

    // Cartella ricostruita: gli UID sono ripartiti, si riparte da zero.
    const daUid = (lastUidValidity !== null && lastUidValidity !== uidvalidity) ? 0 : lastUid;

    const search = await imap.cmd(`UID SEARCH UID ${daUid + 1}:*`);
    // "n:*" restituisce sempre almeno l'UID più alto anche se è < n: si filtra.
    const uids = (search.lines.join(" ").match(/^\*\s+SEARCH([\d\s]*)/im)?.[1] || "")
      .trim().split(/\s+/).filter(Boolean).map(Number)
      .filter((u) => u > daUid).sort((a, b) => a - b).slice(0, MAX_PER_RUN);

    let maxUid = daUid;
    for (const uid of uids) {
      try {
        const f = await imap.cmd(`UID FETCH ${uid} (BODY.PEEK[])`);
        if (!f.literals.length) { esiti.errori++; continue; }
        const raw = decodeBytes(f.literals[0], "utf-8");
        const { head, body } = splitHeaderBody(raw);

        const parti: Parte[] = [];
        raccogliParti(head, body, parti);
        const plain = parti.find((p) => p.tipo === "text/plain")?.corpo || "";
        const html = parti.find((p) => p.tipo === "text/html")?.corpo || "";
        const grezzo = plain || (html ? htmlAtesto(html) : "");
        const pulito = ripulisci(grezzo);

        const from = indirizzoDa(headerValue(head, "From"));
        const to = indirizzoDa(headerValue(head, "To"));
        const dataStr = headerValue(head, "Date");
        let received: string | null = null;
        if (dataStr) { const d = new Date(dataStr); if (!isNaN(d.getTime())) received = d.toISOString(); }

        const { data: res, error } = await admin.rpc("ingest_inbox_email", {
          payload: {
            mailbox, imap_uid: uid, uidvalidity,
            message_id: headerValue(head, "Message-ID"),
            in_reply_to: headerValue(head, "In-Reply-To"),
            refs: headerValue(head, "References"),
            from_email: from.email, from_name: from.nome, to_email: to.email,
            subject: decodeHeaderWords(headerValue(head, "Subject") || ""),
            body_text: plain || null, body_html: html || null,
            body_clean: pulito || null,
            received_at: received,
          },
        });
        if (error) { esiti.errori++; continue; }
        esiti.lette++;
        const stato = String(res?.stato || "");
        if (stato === "agganciata") esiti.agganciate++;
        else if (stato === "gia_presente") esiti.gia_presenti++;
        else esiti.senza_aggancio++;
        if (uid > maxUid) maxUid = uid;
      } catch {
        esiti.errori++;
        // Un messaggio illeggibile non deve bloccare il giro né far arretrare
        // il punto di ripresa: si passa al successivo.
      }
    }

    await imap.cmd("LOGOUT");
    await admin.rpc("imap_state_set", {
      p_mailbox: mailbox, p_uidvalidity: uidvalidity, p_last_uid: maxUid, p_error: null,
    });
    return json(200, { ok: true, mailbox, uidvalidity, da_uid: daUid, a_uid: maxUid, ...esiti });
  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 300);
    // try/catch e non .catch(): il builder di supabase-js e' thenable ma non
    // espone .catch, e un errore qui mascherava l'errore vero.
    try {
      await admin.rpc("imap_state_set", {
        p_mailbox: mailbox, p_uidvalidity: null, p_last_uid: 0, p_error: msg,
      });
    } catch { /* registrare l'errore non deve nascondere l'errore */ }
    return json(502, { error: msg, ...esiti });
  } finally {
    await imap.close();
  }
});
