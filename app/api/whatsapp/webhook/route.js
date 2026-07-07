import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/whatsapp/supabaseAdmin'
import { sendWhatsAppText } from '@/lib/whatsapp/send'
import { toolDefinitions, executeTool } from '@/lib/whatsapp/tools'

const ANTHROPIC_MODEL = 'claude-sonnet-5' // cambia qui se vuoi provare un altro modello
const MAX_TOOL_ITERATIONS = 5
const HISTORY_LIMIT = 20

const SYSTEM_PROMPT = `Sei l'assistente ordini di BulkStrike su WhatsApp, in italiano.
Il tuo unico scopo è aiutare il cliente a fare un "quick order" dal catalogo:
cercare un prodotto, scegliere un fornitore, aggiungerlo al carrello, o riordinare
qualcosa già comprato in passato. Non gestisci la partecipazione ai pool ad asta.

Regole:
- Usa sempre "asta a ribasso", mai "pool", se devi spiegare cos'è un'asta.
- I prezzi che mostri sono "IVA esclusa" e non includono il trasporto: dillo sempre
  la prima volta che mostri un prezzo in una conversazione.
- Quando il cliente sceglie un fornitore e conferma la quantità, aggiungi al carrello
  e poi chiedi se vuole aggiungere altro o procedere al checkout.
- Quando il cliente vuole concludere, chiama link_checkout e manda quel link:
  il pagamento e la scelta di indirizzo/corriere avvengono sul sito, non qui.
- Sii breve e concreto, come un messaggio WhatsApp vero, non un'email.`

// --- Verifica webhook (richiesta una tantum da Meta in fase di configurazione) ---
export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 })
  }
  return new Response('Forbidden', { status: 403 })
}

// --- Firma webhook (sicurezza) ---
// Meta firma ogni POST con HMAC-SHA256 del body grezzo usando l'App Secret
// (header x-hub-signature-256). Senza questa verifica chiunque conosca l'URL
// può forgiare messaggi, far girare il modello con i tool e far inviare
// risposte WhatsApp. Fail-open SOLO se WHATSAPP_APP_SECRET non è configurato,
// per non rompere il webhook prima che il secret sia aggiunto alle env.
function verifySignature(request, rawBody) {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  if (!appSecret) {
    console.warn('[whatsapp] WHATSAPP_APP_SECRET non configurato: firma webhook NON verificata')
    return true
  }
  const header = request.headers.get('x-hub-signature-256') ?? ''
  const expected =
    'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// --- Messaggi in arrivo ---
export async function POST(request) {
  const rawBody = await request.text()
  if (!verifySignature(request, rawBody)) {
    return new Response('Invalid signature', { status: 403 })
  }
  let payload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'BAD_JSON' }, { status: 400 })
  }
  const supabase = getSupabaseAdmin()

  const message = extractTextMessage(payload)
  if (!message) {
    // evento non testuale (status di consegna, reazione, ecc.) - ignoralo
    return NextResponse.json({ ok: true })
  }

  const { from, body, waMessageId } = message

  await logMessage(supabase, from, 'in', body, waMessageId)

  const link = await getVerifiedLink(supabase, from)

  const replyText = link
    ? await handleOrderingMessage(supabase, link, from)
    : await handleLinkingMessage(supabase, from, body)

  await sendWhatsAppText(from, replyText)
  await logMessage(supabase, from, 'out', replyText, null)

  return NextResponse.json({ ok: true })
}

function extractTextMessage(payload) {
  const entry = payload?.entry?.[0]
  const change = entry?.changes?.[0]
  const msg = change?.value?.messages?.[0]
  if (!msg || msg.type !== 'text') return null
  return { from: msg.from, body: msg.text.body.trim(), waMessageId: msg.id }
}

async function logMessage(supabase, phoneNumber, direction, body, waMessageId) {
  await supabase.from('whatsapp_messages').insert({
    phone_number: phoneNumber,
    direction,
    body,
    wa_message_id: waMessageId,
  })
}

async function getVerifiedLink(supabase, phoneNumber) {
  const { data } = await supabase
    .from('whatsapp_links')
    .select('profile_id, company_id, verified_at')
    .eq('phone_number', phoneNumber)
    .not('verified_at', 'is', null)
    .maybeSingle()
  return data
}

// --- Flusso di collegamento account (OTP via email) ---
async function handleLinkingMessage(supabase, phoneNumber, body) {
  const { data: pending } = await supabase
    .from('whatsapp_links')
    .select('id, otp_code, otp_expires_at')
    .eq('phone_number', phoneNumber)
    .is('verified_at', null)
    .maybeSingle()

  const otpAttempt = body.replace(/\D/g, '')

  if (pending && otpAttempt.length === 6) {
    if (pending.otp_code !== otpAttempt) {
      return 'Codice non corretto. Riprova, o scrivi di nuovo la tua email per farti rimandare un codice.'
    }
    if (new Date(pending.otp_expires_at) < new Date()) {
      return 'Il codice è scaduto. Scrivi di nuovo la tua email per farti rimandare un codice.'
    }
    await supabase.from('whatsapp_links').update({ verified_at: new Date().toISOString() }).eq('id', pending.id)
    return "Numero collegato! Da qui puoi cercare un prodotto o dirmi \"riordina l'ultimo\" per un riordino veloce. Cosa ti serve?"
  }

  const email = body.trim().toLowerCase()
  const { data: profile } = await supabase.from('profiles').select('id, company_id, email').eq('email', email).maybeSingle()

  if (!profile) {
    return 'Non trovo un account BulkStrike con questa email. Controlla di averla scritta giusta, oppure registrati su bulkstrike.com.'
  }

  const otpCode = String(Math.floor(100000 + Math.random() * 900000))
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

  await supabase.from('whatsapp_links').upsert(
    {
      profile_id: profile.id,
      company_id: profile.company_id,
      phone_number: phoneNumber,
      otp_code: otpCode,
      otp_expires_at: otpExpiresAt,
      verified_at: null,
    },
    { onConflict: 'phone_number' }
  )

  return `Ti ho trovato! Il codice per collegare questo numero è ${otpCode}. Scrivimelo qui (scade in 10 minuti).`
}

// --- Conversazione con Claude una volta collegato l'account ---
async function handleOrderingMessage(supabase, link, phoneNumber) {
  const { data: history } = await supabase
    .from('whatsapp_messages')
    .select('direction, body')
    .eq('phone_number', phoneNumber)
    .order('created_at', { ascending: false })
    .limit(HISTORY_LIMIT)

  const raw = (history || []).reverse().map((m) => ({ role: m.direction === 'in' ? 'user' : 'assistant', content: m.body }))
  const messages = mergeConsecutiveRoles(raw)

  const ctx = { supabase, companyId: link.company_id }
  let finalText = null

  for (let i = 0; i < MAX_TOOL_ITERATIONS && finalText === null; i++) {
    const response = await callClaude(messages)
    const toolUses = response.content.filter((b) => b.type === 'tool_use')

    if (toolUses.length === 0) {
      finalText = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')
      break
    }

    messages.push({ role: 'assistant', content: response.content })

    const toolResults = []
    for (const toolUse of toolUses) {
      let result
      try {
        result = await executeTool(toolUse.name, toolUse.input, ctx)
      } catch (err) {
        result = { error: err.message }
      }
      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: toolResults })
  }

  return finalText || 'Scusa, non sono riuscito a completare la richiesta. Puoi riprovare?'
}

// Garantisce l'alternanza user/assistant richiesta dall'API Claude, anche se
// il cliente ha mandato più messaggi di fila prima di una risposta del bot.
function mergeConsecutiveRoles(messages) {
  const merged = []
  for (const m of messages) {
    const last = merged[merged.length - 1]
    if (last && last.role === m.role && typeof last.content === 'string' && typeof m.content === 'string') {
      last.content += '\n' + m.content
    } else {
      merged.push({ ...m })
    }
  }
  return merged
}

async function callClaude(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages,
      tools: toolDefinitions,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('Errore Claude API:', res.status, errText)
    throw new Error(`Claude API failed: ${res.status}`)
  }

  return res.json()
}
