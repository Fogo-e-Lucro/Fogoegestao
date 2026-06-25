// Cron diário do relatório do TIME (substitui o cron das 6h do n8n).
// Vercel Cron chama: GET /api/daily-report-cron com header
// `Authorization: Bearer ${CRON_SECRET}` (configurado em vercel.json).
//
// Query params:
//   ?preview=1       — retorna o texto bruto, sem enviar (debug/comparação com app)
//   ?dryRun=1        — retorna o que ENVIARIA, sem chamar uazapi
//   ?overrideTo=<n>  — manda pra <n> em vez do grupo (teste pro número do David)
//
// Env vars:
//   CRON_SECRET                    — token de auth (gere com openssl rand -hex 32)
//   FIREBASE_SERVICE_ACCOUNT_JSON  — JSON inteiro do service account (ou base64)
//   WA_GROUP_TEAM_JID              — JID do grupo "TIME Fogo & Lucro" (120363...@g.us)

import { db, verifyAdminFromIdToken } from './_lib/firebase.js';
import { buildDailyReportText } from './_lib/daily-report.js';
import { sendWhatsAppText } from './_lib/uazapi.js';

function unauthorized(res, reason) {
  res.status(401).json({ ok: false, error: 'unauthorized', reason });
}

// Aceita dois caminhos de auth:
//   1. Authorization: Bearer <CRON_SECRET>      → cron do Vercel
//   2. x-firebase-id-token: <token>             → admin logado no app
async function authenticate(req) {
  const secret = process.env.CRON_SECRET;
  const bearer = req.headers.authorization || '';
  if (secret && bearer === `Bearer ${secret}`) {
    return { kind: 'cron' };
  }
  const idToken = req.headers['x-firebase-id-token'];
  if (idToken) {
    const who = await verifyAdminFromIdToken(idToken);
    return { kind: 'admin', who };
  }
  throw new Error('credenciais ausentes (use CRON_SECRET ou x-firebase-id-token)');
}

// Converte qualquer Timestamp do Firestore pra millis pra ficar igual ao
// que o front-end usa em pjAllTasks (que recebe Timestamps via SDK
// client). Compat com o helper interno do server.py também.
function normalizeDoc(doc) {
  const out = { id: doc.id };
  const data = doc.data() || {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && typeof v.toMillis === 'function') {
      out[k] = v.toMillis();
    } else {
      out[k] = v;
    }
  }
  return out;
}

export default async function handler(req, res) {
  let actor;
  try { actor = await authenticate(req); }
  catch (e) { return unauthorized(res, e.message); }

  const url = new URL(req.url, `https://${req.headers.host}`);
  const isPreview = url.searchParams.get('preview') === '1';
  const isDryRun  = url.searchParams.get('dryRun')  === '1';
  const overrideTo = url.searchParams.get('overrideTo');

  try {
    // 1. Carrega dados em paralelo
    const [tasksSnap, listsSnap, membersSnap, secretsSnap] = await Promise.all([
      db.collection('pj_tasks').limit(2000).get(),
      db.collection('pj_lists').get(),
      db.collection('pj_members').get(),
      db.collection('app_config').doc('secrets').get(),
    ]);

    const tasks   = tasksSnap.docs.map(normalizeDoc);
    const lists   = listsSnap.docs.map(normalizeDoc);
    const members = membersSnap.docs.map(normalizeDoc);
    const secrets = secretsSnap.exists ? secretsSnap.data() : {};

    // 2. Gera o texto (mesma lógica do preview no app)
    const { text, counts } = buildDailyReportText({ tasks, lists, members });

    // 3. Decide pra onde mandar
    const target = overrideTo || process.env.WA_GROUP_TEAM_JID || '';

    if (isPreview) {
      return res.status(200).json({
        ok: true, mode: 'preview', text, counts,
        targetWouldBe: target || '(WA_GROUP_TEAM_JID não setado)',
      });
    }

    if (!target) {
      return res.status(400).json({
        ok: false,
        error: 'WA_GROUP_TEAM_JID não está setado e ?overrideTo não foi passado',
        counts,
      });
    }

    if (isDryRun) {
      return res.status(200).json({
        ok: true, mode: 'dryRun', wouldSendTo: target, charCount: text.length, counts,
      });
    }

    // 4. Envia
    const result = await sendWhatsAppText({
      url:      secrets.uazapi_url,
      instance: secrets.uazapi_instance,
      number:   target,
      text,
    });

    if (!result.ok) {
      return res.status(502).json({
        ok: false, error: 'uazapi falhou', uazapiStatus: result.status,
        uazapiBody: result.body, counts, charCount: text.length, target,
      });
    }

    return res.status(200).json({
      ok: true, mode: 'sent', target, charCount: text.length, counts, uazapiStatus: result.status,
      actor: actor.kind === 'admin' ? actor.who.email : 'cron',
    });
  } catch (e) {
    console.error('[daily-report-cron] erro:', e);
    return res.status(500).json({ ok: false, error: e.message, stack: e.stack });
  }
}
