// Port server-side do pjGenerateDailyReport do app (index.html linhas
// 14094-14187). Tem que ficar idêntico em formato pra mensagem do grupo
// chegar do mesmo jeito que o preview no app — essa é a coisa que
// "estava chegando faltando tráfego" e queremos consertar.

const PJ_DEFAULT_STATUSES = [
  { id: 'todo',   name: 'A Fazer',      bucket: 'pending' },
  { id: 'inprog', name: 'Em Andamento', bucket: 'active'  },
  { id: 'review', name: 'Revisão',      bucket: 'active'  },
  { id: 'done',   name: 'Concluído',    bucket: 'closed'  },
];
const PJ_ARCHIVE_DAYS = 30;
const SEP = '━━━━━━━━━━━━━━━━━━';
const DOWS   = ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const MONTHS = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
const PRIO_ORDER = { urgent: 0, high: 1, normal: 2, low: 3 };

// Vercel roda em UTC. Pra "hoje" do ponto de vista do BRT, derive a data
// local de São Paulo. Importante: nao usar new Date().toISOString() —
// no UTC daria dia seguinte depois das 21h BRT.
export function pjDateStrBRT(d = new Date()) {
  // Usa Intl.DateTimeFormat com pt-BR + fuso para extrair y/m/d em BRT
  const fmt = new Intl.DateTimeFormat('en-CA', { // en-CA dá ISO YYYY-MM-DD
    timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(d);
}

// Parts BRT pra cabeçalho do relatório (dia da semana + mês em português)
export function brtDateParts(d = new Date()) {
  const tz = 'America/Sao_Paulo';
  const dow   = parseInt(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'narrow' }).formatToParts(d)
    .find(p => p.type === 'weekday')?.value ? -1 : -1, 10); // fallback
  // Mais robusto: pega day-of-week via getUTCDay aplicando o offset do TZ
  const utcMs = d.getTime();
  // Trick: cria string formatada e parseia
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(d);
  const map = Object.fromEntries(formatted.map(p => [p.type, p.value]));
  // weekday vem como "Mon", "Tue", etc — converte pra index
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayIdx = weekdayMap[map.weekday] ?? 0;
  const day    = parseInt(map.day, 10);
  const month  = parseInt(map.month, 10) - 1;
  return { dayIdx, day, month };
}

function pjStatusBucket(status) {
  if (!status) return 'active';
  if (status.bucket) return status.bucket;
  const id = (status.id || '').toLowerCase();
  const nm = (status.name || '').toLowerCase();
  if (id === 'todo' || nm.includes('fazer') || nm.includes('iniciar') || nm.includes('planeja')) return 'pending';
  if (id === 'done' || nm.includes('conclu') || nm.includes('aprovad') || nm.includes('agendad')
      || nm.includes('fechad') || nm.includes('respondid')) return 'closed';
  return 'active';
}

function listOf(lists, listId) {
  return lists.find(l => l.id === listId);
}

function pjIsDone(task, lists) {
  if (!task) return false;
  const list = listOf(lists, task.listId);
  const statuses = list?.statuses || PJ_DEFAULT_STATUSES;
  const st = statuses.find(s => s.id === task.statusId);
  return st ? pjStatusBucket(st) === 'closed' : false;
}

function toMillis(v) {
  if (!v) return null;
  if (typeof v === 'number') return v;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.seconds === 'number') return v.seconds * 1000;
  return null;
}

function pjIsArchived(task, lists) {
  if (!task || !pjIsDone(task, lists)) return false;
  if (task.archived) return true;
  const ms = toMillis(task.completedAt);
  if (!ms) return false;
  return (Date.now() - ms) > PJ_ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
}

function pjResolveTaskClient(task, lists) {
  if (task.client) return task.client;
  const list = listOf(lists, task.listId);
  if (!list) return '';
  const cf = (list.customFields || []).find(f => f.type === 'client' || /client/i.test(f.name || ''));
  if (!cf) return '';
  return (task.customFieldValues || {})[cf.id] || '';
}

function pjGetAssigneeNames(task, members) {
  const uids = task.assignees || [];
  if (!uids.length) return '— sem responsável';
  return uids.map(uid => {
    const m = members.find(mm => mm.uid === uid);
    return m?.name || (m?.email ? m.email.split('@')[0] : '?');
  }).join(', ');
}

function pjPriorityEmoji(p) {
  if (p === 'urgent') return '🔴';
  if (p === 'high')   return '🟠';
  if (p === 'low')    return '🔵';
  return '🟢';
}

function pjDaysLateLabel(dueDate, now = new Date()) {
  // dueDate é string 'YYYY-MM-DD' (local BRT)
  const due = new Date(dueDate + 'T00:00:00-03:00');
  const today = new Date(pjDateStrBRT(now) + 'T00:00:00-03:00');
  const diff = Math.round((today.getTime() - due.getTime()) / 86400000);
  if (diff <= 0) return 'hoje';
  if (diff === 1) return 'há 1 dia';
  return `há ${diff} dias`;
}

export function buildDailyReportText({ tasks, lists, members, now = new Date() }) {
  const todayStr = pjDateStrBRT(now);

  const all = tasks
    .filter(t => !pjIsArchived(t, lists))
    .filter(t => !pjIsDone(t, lists));

  const overdue = all.filter(t => t.dueDate && t.dueDate < todayStr);
  const todayT  = all.filter(t => t.dueDate === todayStr);

  const sortFn = (a, b) => {
    const dp = (PRIO_ORDER[a.priority || 'normal']) - (PRIO_ORDER[b.priority || 'normal']);
    if (dp) return dp;
    return (a.dueTime || '99:99').localeCompare(b.dueTime || '99:99');
  };
  overdue.sort(sortFn);
  todayT.sort(sortFn);

  const { dayIdx, day, month } = brtDateParts(now);
  const dateLabel = `${DOWS[dayIdx]}, ${day} de ${MONTHS[month]}`;

  let m = '';
  m += `🔥 *FOGO & GESTÃO*\n`;
  m += `📋 _Relatório Diário_\n`;
  m += `📅 ${dateLabel}\n`;
  m += `\n${SEP}\n\n`;

  if (overdue.length) {
    m += `🚨 *ATRASADAS* — ${overdue.length} ${overdue.length === 1 ? 'tarefa' : 'tarefas'}\n\n`;
    overdue.forEach((t, i) => {
      const cli = pjResolveTaskClient(t, lists);
      m += `🔴 *${t.title || 'Sem título'}*\n`;
      m += `   👤 ${pjGetAssigneeNames(t, members)}\n`;
      if (cli) m += `   🏢 ${cli}\n`;
      m += `   ⏰ Venceu *${pjDaysLateLabel(t.dueDate, now)}*\n`;
      if (i < overdue.length - 1) m += `\n`;
    });
    m += `\n${SEP}\n\n`;
  }

  if (todayT.length) {
    m += `📋 *HOJE* — ${todayT.length} ${todayT.length === 1 ? 'tarefa' : 'tarefas'}\n\n`;
    todayT.forEach((t, i) => {
      const cli = pjResolveTaskClient(t, lists);
      m += `${pjPriorityEmoji(t.priority)} *${t.title || 'Sem título'}*\n`;
      m += `   👤 ${pjGetAssigneeNames(t, members)}\n`;
      if (cli) m += `   🏢 ${cli}\n`;
      if (t.dueTime) m += `   🕐 ${t.dueTime}\n`;
      if (i < todayT.length - 1) m += `\n`;
    });
    m += `\n${SEP}\n\n`;
  }

  if (!overdue.length && !todayT.length) {
    m += `🎉 *Tudo em dia!*\n\n`;
    m += `Sem tarefas atrasadas nem agendadas para hoje.\nAproveita o dia! ✨\n\n`;
    m += `${SEP}\n\n`;
  }

  m += `_Sistema Fogo & Gestão_`;

  return {
    text: m,
    counts: { overdue: overdue.length, today: todayT.length, totalActive: all.length },
  };
}
