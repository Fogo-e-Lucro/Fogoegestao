/* ─────────────────────────────────────────────────────────────
   Fogo & Gestão — Mobile UX
   Drawer (sidebar off-canvas), pull-to-refresh, swipe gestures, haptic.
   Carregado via <script src="mobile.js"> em index.html.
   Funções expostas globalmente: pjToggleDrawer, pjCloseDrawer,
   pjInitDrawerAutoClose, pjInitPullToRefresh, pjInitSwipeComplete,
   pjHaptic, pjShowTaskQuickActions.
   ───────────────────────────────────────────────────────────── */

// ── Haptic feedback ──────────────────────────────────────────
// Patterns curtos pra confirmar ações em iOS/Android (Web Vibration API).
// iOS Safari não suporta navigator.vibrate; chama silencioso (no-op).
function pjHaptic(kind) {
  if (typeof navigator === 'undefined' || !navigator.vibrate) return;
  // Respeita prefer-reduced-motion como sinal de "menos feedback"
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  } catch(_) {}
  const patterns = {
    light:   10,
    medium:  20,
    heavy:   35,
    success: [12, 40, 18],
    error:   [40, 30, 40],
    warn:    [25, 25, 25],
  };
  const p = patterns[kind] || 10;
  try { navigator.vibrate(p); } catch(_) {}
}
window.pjHaptic = pjHaptic;

// ── Drawer (sidebar mobile) ──
function pjToggleDrawer() {
  const sb = document.getElementById('pjSidebar');
  const bd = document.getElementById('pjDrawerBackdrop');
  const tg = document.getElementById('pjDrawerToggle');
  if (!sb || !bd) return;
  const open = !sb.classList.contains('open');
  sb.classList.toggle('open', open);
  bd.classList.toggle('open', open);
  if (tg) tg.setAttribute('aria-expanded', open ? 'true' : 'false');
  document.body.style.overflow = open ? 'hidden' : '';
}
function pjCloseDrawer() {
  const sb = document.getElementById('pjSidebar');
  const bd = document.getElementById('pjDrawerBackdrop');
  const tg = document.getElementById('pjDrawerToggle');
  if (sb) sb.classList.remove('open');
  if (bd) bd.classList.remove('open');
  if (tg) tg.setAttribute('aria-expanded', 'false');
  document.body.style.overflow = '';
}
// Auto-fecha drawer ao clicar em itens de navegação (mobile)
function pjInitDrawerAutoClose() {
  if (window._pjDrawerInit) return;
  window._pjDrawerInit = true;
  const sb = document.getElementById('pjSidebar');
  if (!sb) return;
  // Move toggle e backdrop pra body (escapar do transform do .tab-panel que captura position:fixed)
  const tg = document.getElementById('pjDrawerToggle');
  const bd = document.getElementById('pjDrawerBackdrop');
  if (tg && tg.parentElement !== document.body) document.body.appendChild(tg);
  if (bd && bd.parentElement !== document.body) document.body.appendChild(bd);
  // Esconde toggle quando não está na aba projetos
  function syncDrawerVisibility() {
    const onProjetos = document.getElementById('tab-projetos')?.classList.contains('active');
    if (tg) tg.style.visibility = onProjetos ? '' : 'hidden';
    if (!onProjetos) pjCloseDrawer();
  }
  syncDrawerVisibility();
  // Observa mudanças de classe nas tab-panels
  document.querySelectorAll('.tab-panel').forEach(p => {
    new MutationObserver(syncDrawerVisibility).observe(p, { attributes:true, attributeFilter:['class'] });
  });
  sb.addEventListener('click', (e) => {
    if (!matchMedia('(max-width:900px)').matches) return;
    const t = e.target.closest('.pj-nav-btn, .pj-list-row, .pj-add-space-btn');
    if (t) setTimeout(pjCloseDrawer, 80);
  });
  // Edge swipe pra abrir (touch da borda esquerda)
  let sx = 0, sy = 0, edge = false;
  document.addEventListener('touchstart', (e) => {
    if (!matchMedia('(max-width:900px)').matches) return;
    if (sb.classList.contains('open')) return;
    const t = e.touches[0];
    if (t.clientX < 18) { sx = t.clientX; sy = t.clientY; edge = true; }
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!edge) return;
    const t = e.touches[0];
    const dx = t.clientX - sx, dy = Math.abs(t.clientY - sy);
    if (dx > 40 && dy < 30) { edge = false; pjToggleDrawer(); }
  }, { passive: true });
  document.addEventListener('touchend', () => { edge = false; }, { passive: true });
}

// ── Swipe gestures em tarefas (mobile) ──
// Direita > THRESHOLD = concluir.   Esquerda > THRESHOLD = abrir ações rápidas.
function pjInitSwipeComplete() {
  if (window._pjSwipeInit) return;
  window._pjSwipeInit = true;
  const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  if (!isTouch) return;

  const THRESHOLD = 90;          // px pra disparar ação
  const MAX_SWIPE = 160;         // teto visual
  let hapticBuzzed = false;      // já vibrou ao cruzar threshold?
  let row = null, taskId = null, sx = 0, sy = 0, dx = 0, locked = false, axis = null;

  function reset(snap) {
    if (!row) return;
    if (snap) {
      row.classList.add('snap-back');
      row.style.transform = '';
      setTimeout(() => row?.classList.remove('snap-back', 'swiping', 'swiping-left', 'swiping-right'), 250);
    }
    row = null; taskId = null; sx = sy = dx = 0; locked = false; axis = null;
    hapticBuzzed = false;
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target.closest('[data-task-id]');
    if (!target) return;
    // Não interceptar swipe sobre elementos interativos
    if (e.target.closest('.pj-task-check, .pj-row-check, .pj-sel-circle, button, input, textarea, a')) return;
    row = target; taskId = target.getAttribute('data-task-id');
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; axis = null;
    hapticBuzzed = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!row) return;
    const t = e.touches[0];
    const ddx = t.clientX - sx, ddy = t.clientY - sy;
    if (axis === null) {
      if (Math.abs(ddx) < 8 && Math.abs(ddy) < 8) return;
      axis = Math.abs(ddx) > Math.abs(ddy) ? 'x' : 'y';
      if (axis === 'y') { row = null; return; }
      row.classList.add('swiping');
    }
    if (axis !== 'x') return;
    // Aceita os dois sentidos: dx pode ser positivo (→ concluir) ou negativo (← ações)
    dx = Math.max(-MAX_SWIPE, Math.min(MAX_SWIPE, ddx));
    row.classList.toggle('swiping-right', dx > 0);
    row.classList.toggle('swiping-left',  dx < 0);
    row.style.transform = `translateX(${dx}px)`;
    // Buzz curto ao cruzar threshold
    if (!hapticBuzzed && Math.abs(dx) >= THRESHOLD) {
      hapticBuzzed = true;
      pjHaptic('light');
    } else if (hapticBuzzed && Math.abs(dx) < THRESHOLD) {
      hapticBuzzed = false;
    }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!row) return;
    if (dx >= THRESHOLD && taskId) {
      // → concluir
      pjHaptic('success');
      const r = row, id = taskId;
      r.style.transform = `translateX(110%)`;
      r.style.opacity = '0';
      r.classList.add('fly-out');
      setTimeout(() => {
        if (typeof pjToggleTaskDone === 'function') pjToggleTaskDone(id);
      }, 280);
      row = null; taskId = null; dx = 0; axis = null; hapticBuzzed = false;
    } else if (dx <= -THRESHOLD && taskId) {
      // ← ações rápidas
      pjHaptic('medium');
      const id = taskId;
      reset(true);
      setTimeout(() => pjShowTaskQuickActions(id), 200);
    } else {
      reset(true);
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => reset(true), { passive: true });
}

// ── Quick actions bottom sheet (chamado por swipe esquerdo) ──
function pjShowTaskQuickActions(taskId) {
  if (!taskId) return;
  // Fecha sheet anterior
  document.querySelectorAll('.pj-quick-actions-backdrop').forEach(el => el.remove());
  const allTasks = (typeof pjAllTasks !== 'undefined') ? pjAllTasks : [];
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  const bd = document.createElement('div');
  bd.className = 'pj-quick-actions-backdrop';
  bd.onclick = (e) => { if (e.target === bd) close(); };

  const sheet = document.createElement('div');
  sheet.className = 'pj-quick-actions-sheet';
  const safeTitle = (task.title || '(sem título)').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  sheet.innerHTML = `
    <div class="pj-quick-actions-grip"></div>
    <div class="pj-quick-actions-title">${safeTitle}</div>
    <button class="pj-quick-action" data-act="open">
      <span class="pj-quick-ic">📂</span>
      <span class="pj-quick-label">Abrir tarefa</span>
    </button>
    <button class="pj-quick-action" data-act="assign">
      <span class="pj-quick-ic">👤</span>
      <span class="pj-quick-label">Atribuir / Reatribuir</span>
    </button>
    <button class="pj-quick-action" data-act="snooze1">
      <span class="pj-quick-ic">💤</span>
      <span class="pj-quick-label">Adiar pra amanhã</span>
    </button>
    <button class="pj-quick-action" data-act="snooze7">
      <span class="pj-quick-ic">📅</span>
      <span class="pj-quick-label">Adiar uma semana</span>
    </button>
    <button class="pj-quick-action" data-act="priority">
      <span class="pj-quick-ic">🚩</span>
      <span class="pj-quick-label">Mudar prioridade</span>
    </button>
    <button class="pj-quick-action danger" data-act="delete">
      <span class="pj-quick-ic">🗑️</span>
      <span class="pj-quick-label">Excluir</span>
    </button>
    <button class="pj-quick-action cancel" data-act="cancel">Cancelar</button>
  `;
  bd.appendChild(sheet);
  document.body.appendChild(bd);
  // anim in
  requestAnimationFrame(() => bd.classList.add('open'));

  function close() {
    bd.classList.remove('open');
    setTimeout(() => bd.remove(), 200);
  }
  function snoozeDays(d) {
    const date = new Date();
    date.setDate(date.getDate() + d);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth()+1).padStart(2,'0');
    const dd = String(date.getDate()).padStart(2,'0');
    const iso = `${yyyy}-${mm}-${dd}`;
    if (typeof pjUpdateTask === 'function') pjUpdateTask(taskId, { dueDate: iso });
    if (typeof showToast === 'function') showToast('ok','💤', `Adiado pra ${dd}/${mm}`);
  }
  sheet.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const act = btn.getAttribute('data-act');
    pjHaptic('light');
    if (act === 'open')      { close(); if (typeof pjOpenTask === 'function') pjOpenTask(taskId); }
    else if (act === 'assign')  { close(); if (typeof pjOpenAssignModal === 'function') pjOpenAssignModal(taskId); }
    else if (act === 'snooze1') { close(); snoozeDays(1); }
    else if (act === 'snooze7') { close(); snoozeDays(7); }
    else if (act === 'priority'){ close(); if (typeof pjOpenPriorityMenu === 'function') pjOpenPriorityMenu(e, taskId); }
    else if (act === 'delete')  { close(); if (typeof pjDeleteTask === 'function') pjDeleteTask(taskId); }
    else if (act === 'cancel')  { close(); }
  });
}
window.pjShowTaskQuickActions = pjShowTaskQuickActions;

// ── Pull-to-refresh (mobile) ──
function pjInitPullToRefresh() {
  if (window._pjPtrInit) return;
  window._pjPtrInit = true;
  // Detectar dispositivo touch (mobile/tablet)
  const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  if (!isTouch) return;
  // Indicador
  const ind = document.createElement('div');
  ind.className = 'pj-ptr-indicator';
  ind.innerHTML = `
    <svg class="arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14"/><path d="M6 11l6 6 6-6"/></svg>
    <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 1 1-9 9" stroke-dasharray="0 50 30 100" stroke-dashoffset="0"/></svg>
  `;
  document.body.appendChild(ind);

  const THRESHOLD = 70;
  const MAX_PULL = 130;
  let startY = 0, currentPull = 0, pulling = false, refreshing = false;
  let scroller = null;

  function findScroller(target) {
    // Procura container com scroll. Em mobile, normalmente é window ou pj-main.
    let el = target;
    while (el && el !== document.body) {
      const oy = getComputedStyle(el).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
      el = el.parentElement;
    }
    return null;
  }

  function onTouchStart(e) {
    if (refreshing) return;
    const t = e.touches[0];
    scroller = findScroller(e.target);
    const top = scroller ? scroller.scrollTop : window.scrollY;
    if (top > 2) { pulling = false; return; }
    startY = t.clientY;
    pulling = true;
    currentPull = 0;
  }

  let _ptrHaptic = false;
  function onTouchMove(e) {
    if (!pulling || refreshing) return;
    const t = e.touches[0];
    const dy = t.clientY - startY;
    if (dy <= 0) { ind.classList.remove('active','ready'); ind.style.transform = ''; _ptrHaptic = false; return; }
    // Resistance
    currentPull = Math.min(MAX_PULL, dy * 0.5);
    ind.classList.add('active');
    const ready = currentPull >= THRESHOLD;
    if (ready) ind.classList.add('ready');
    else ind.classList.remove('ready');
    if (ready && !_ptrHaptic) { pjHaptic('light'); _ptrHaptic = true; }
    if (!ready) _ptrHaptic = false;
    const y = currentPull;
    ind.style.transform = `translateX(-50%) translateY(${y}px)`;
    // Prevent default browser pull (Chrome iOS rubber band)
    if (e.cancelable && currentPull > 5) e.preventDefault();
  }

  async function onTouchEnd() {
    if (!pulling || refreshing) { pulling = false; return; }
    pulling = false;
    if (currentPull >= THRESHOLD) {
      refreshing = true;
      ind.classList.add('refreshing');
      ind.style.transform = `translateX(-50%) translateY(70px)`;
      try {
        if (typeof pjLoadAllTasks === 'function') await pjLoadAllTasks();
        else if (typeof loadFromCloud === 'function') await loadFromCloud();
        if (typeof pjRenderMain === 'function') pjRenderMain();
        if (typeof pjRenderSidebar === 'function') pjRenderSidebar();
        if (typeof showToast === 'function') showToast('✓ Atualizado', 'ok');
      } catch(e) {
        if (typeof showToast === 'function') showToast('Erro ao atualizar', 'warn');
      }
      // Mantém o spinner um instante pra dar feedback
      setTimeout(() => {
        ind.classList.remove('refreshing','active','ready');
        ind.style.transform = '';
        refreshing = false;
      }, 500);
    } else {
      ind.classList.remove('active','ready');
      ind.style.transform = '';
    }
    currentPull = 0;
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });
}
