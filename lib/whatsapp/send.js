const WHATSAPP_API_VERSION = 'v22.0' // controlla su developers.facebook.com se Meta ha aggiornato la versione

function endpoint() {
  return `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`
}

async function callWhatsAppApi(payload) {
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('Errore invio messaggio WhatsApp:', res.status, errText)
    throw new Error(`WhatsApp send failed: ${res.status}`)
  }

  return res.json()
}

// Messaggio di testo libero. Gratuito quando è una risposta entro 24h
// da un messaggio ricevuto dal cliente (finestra di servizio).
export async function sendWhatsAppText(to, body) {
  return callWhatsAppApi({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body },
  })
}

// Messaggio da template pre-approvato. Necessario solo se un giorno vorrai
// scrivere tu per primo (es. notifica proattiva fuori dalla finestra 24h).
export async function sendWhatsAppTemplate(to, templateName, languageCode = 'it', components = []) {
  return callWhatsAppApi({
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, components },
  })
}
