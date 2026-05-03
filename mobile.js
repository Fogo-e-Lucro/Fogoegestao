/* ─────────────────────────────────────────────────────────────
   Fogo & Gestão — Mobile UX
   Drawer (sidebar off-canvas), pull-to-refresh, swipe-to-complete.
   Carregado via <script src="mobile.js"> em index.html.
   Funções expostas globalmente: pjToggleDrawer, pjCloseDrawer,
   pjInitDrawerAutoClose, pjInitPullToRefresh, pjInitSwipeComplete.
   ───────────────────────────────────────────────────────────── */

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

// ── Swipe-to-complete em tarefas (mobile) ──
function pjInitSwipeComplete() {
  if (window._pjSwipeInit) return;
  window._pjSwipeInit = true;
  const isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
  if (!isTouch) return;

  const THRESHOLD = 90;          // px pra disparar conclusão
  const MAX_SWIPE = 160;         // teto visual
  let row = null, taskId = null, sx = 0, sy = 0, dx = 0, locked = false, axis = null;

  function reset(snap) {
    if (!row) return;
    if (snap) {
      row.classList.add('snap-back');
      row.style.transform = '';
      setTimeout(() => row?.classList.remove('snap-back', 'swiping'), 250);
    }
    row = null; taskId = null; sx = sy = dx = 0; locked = false; axis = null;
  }

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target.closest('[data-task-id]');
    if (!target) return;
    // Não interceptar swipe sobre elementos interativos
    if (e.target.closest('.pj-task-check, .pj-row-check, .pj-sel-circle, button, input, textarea, a')) return;
    row = target; taskId = target.getAttribute('data-task-id');
    const t = e.touches[0]; sx = t.clientX; sy = t.clientY; dx = 0; axis = null;
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
    if (ddx < 0) { row.style.transform = ''; dx = 0; return; }
    dx = Math.min(MAX_SWIPE, ddx);
    row.style.transform = `translateX(${dx}px)`;
    if (e.cancelable) e.preventDefault();
  }, { passive: false });

  document.addEventListener('touchend', () => {
    if (!row) return;
    if (dx >= THRESHOLD && taskId) {
      // Anima saída e marca como concluída
      const r = row, id = taskId;
      r.style.transform = `translateX(110%)`;
      r.style.opacity = '0';
      r.classList.add('fly-out');
      setTimeout(() => {
        if (typeof pjToggleTaskDone === 'function') pjToggleTaskDone(id);
      }, 280);
      row = null; taskId = null; dx = 0; axis = null;
    } else {
      reset(true);
    }
  }, { passive: true });

  document.addEventListener('touchcancel', () => reset(true), { passive: true });
}

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

  function onTouchMove(e) {
    if (!pulling || refreshing) return;
    const t = e.touches[0];
    const dy = t.clientY - startY;
    if (dy <= 0) { ind.classList.remove('active','ready'); ind.style.transform = ''; return; }
    // Resistance
    currentPull = Math.min(MAX_PULL, dy * 0.5);
    ind.classList.add('active');
    if (currentPull >= THRESHOLD) ind.classList.add('ready');
    else ind.classList.remove('ready');
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
