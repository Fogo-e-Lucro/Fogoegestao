// Wrapper do POST /send/text da uazapi.
// Cuidado: o app NÃO faz strip de "@g.us" — passamos o number cru.
// Header esperado: `token: <uazapi_instance>` (sim, header chama "token"
// mas leva o valor do instance — convenção da uazapi, confirmada no
// app linha 2514).
export async function sendWhatsAppText({ url, instance, number, text }) {
  if (!url || !instance) {
    throw new Error('uazapi_url ou uazapi_instance ausente em app_config/secrets');
  }
  const base = url.replace(/\/+$/, '');
  const endpoint = `${base}/send/text`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'token': instance,
    },
    body: JSON.stringify({ number, text }),
  });
  const bodyTxt = await res.text();
  let bodyJson = null;
  try { bodyJson = JSON.parse(bodyTxt); } catch { /* keep null */ }
  return {
    ok: res.ok,
    status: res.status,
    endpoint,
    body: bodyJson || bodyTxt,
  };
}
