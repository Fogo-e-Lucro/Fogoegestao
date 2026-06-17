// Serverless relay: navegador (HTTPS) → /api/n8n-relay → n8n (HTTP no Contabo)
// Resolve o "mixed content" sem precisar instalar SSL no n8n.
//
// Body esperado:
//   { url: "http://89.116.30.126:5678/webhook/relatorio-diario",
//     payload: { type, message, generatedAt, ... } }
//
// Aceita só hosts conhecidos pra não virar open proxy.

const ALLOWED_HOSTS = new Set([
  '89.116.30.126',                   // Contabo n8n
  'n8n.fogoegestao.com.br',          // futuro subdomínio com SSL
]);

export default async function handler(req, res) {
  // CORS pro próprio domínio (defesa em profundidade)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { url, payload } = req.body || {};
  if (!url || !payload) {
    return res.status(400).json({ error: 'Body precisa de { url, payload }' });
  }

  let target;
  try { target = new URL(url); }
  catch { return res.status(400).json({ error: 'URL inválida' }); }

  if (!ALLOWED_HOSTS.has(target.hostname)) {
    return res.status(403).json({
      error: 'Host não autorizado',
      host: target.hostname,
      allowed: [...ALLOWED_HOSTS],
    });
  }

  try {
    const upstream = await fetch(target.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await upstream.text();
    res.status(upstream.status).send(text || '{"ok":true}');
  } catch (e) {
    console.error('[n8n-relay] erro:', e);
    res.status(502).json({
      error: 'Falha ao alcançar o n8n',
      detail: e.message,
      target: target.toString(),
    });
  }
}
