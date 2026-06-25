// Singleton firebase-admin pra reuso entre invocations (cold starts no Vercel
// mantém o processo vivo por alguns minutos, e initializeApp 2x lança erro).
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function getServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON env var não está setada no Vercel');
  }
  // Suporta tanto JSON cru quanto base64 (caso o usuário escolha codificar
  // pra evitar problemas com \n no private_key)
  let txt = raw.trim();
  if (!txt.startsWith('{')) {
    try { txt = Buffer.from(txt, 'base64').toString('utf-8'); }
    catch { /* segue como está */ }
  }
  try { return JSON.parse(txt); }
  catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON não é JSON válido: ' + e.message);
  }
}

if (!getApps().length) {
  const sa = getServiceAccount();
  initializeApp({ credential: cert(sa) });
}

export const db = getFirestore();
