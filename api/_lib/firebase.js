// Singleton firebase-admin pra reuso entre invocations (cold starts no Vercel
// mantém o processo vivo por alguns minutos, e initializeApp 2x lança erro).
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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
export const auth = getAuth();

const SUPER_ADMIN = 'assessoria@fogoelucro.com.br';

// Verifica Firebase ID token e checa se o usuário é admin (super-admin
// hardcoded ou role==='admin' em app_members). Lança se token inválido
// ou usuário não-admin.
export async function verifyAdminFromIdToken(idToken) {
  if (!idToken) throw new Error('ID token ausente');
  const decoded = await auth.verifyIdToken(idToken);
  const email = (decoded.email || '').toLowerCase();
  if (!email) throw new Error('Email não encontrado no token');
  if (email === SUPER_ADMIN) return { uid: decoded.uid, email, super: true };

  // Procura no app_members por email + role admin
  const snap = await db.collection('app_members').where('email', '==', email).limit(1).get();
  if (snap.empty) throw new Error('Usuário não está em app_members');
  const member = snap.docs[0].data();
  if (member.role !== 'admin') throw new Error('Usuário não é admin');
  return { uid: decoded.uid, email, super: false };
}
