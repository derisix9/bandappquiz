/* ═══════════════════════════════════════════════════════════════
   BANDAQUIZ — multiplayer.js  v4.0
   Arquitectura limpa. Mapeada para os IDs existentes no HTML.
   Sem emojis. Apenas SVG icons. Sem logica redundante.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO GLOBAL ────────────────────────────────────────────
const MP = {
  me:        null,   // { uid, name, email, phone, stars }
  sala:      null,   // referencia Firebase da sala activa
  salaId:    null,
  salaData:  null,
  isHost:    false,
  listeners: [],
  gameTimer: null,
  answered:  false,
};

// ─── SVG ICONS ────────────────────────────────────────────────
const SVG = {
  star:     `<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:var(--gold,#F59E0B);vertical-align:middle"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  play:     `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:5px"><path d="M8 5v14l11-7z"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`,
  close:    `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  trophy:   `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.86 10.4 5 9.3 5 8zm14 0c0 1.3-.86 2.4-2 2.82V7h2v1z"/></svg>`,
  people:   `<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  back:     `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;vertical-align:middle"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.22-.07.47.12.61l2.03 1.58C4.84 11.36 4.8 11.69 4.8 12s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>`,
  lock:     `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
  delete:   `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
  clock:    `<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>`,
  bolt:     `<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>`,
};

// ─── HELPERS ──────────────────────────────────────────────────
const mpEl  = id  => document.getElementById(id);
const mpQ   = sel => document.querySelector(sel);
const mpQA  = sel => document.querySelectorAll(sel);

function mpScreen(id) {
  mpQA('.screen').forEach(s => s.classList.remove('active'));
  const el = mpEl(id);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

function mpToast(msg) {
  if (typeof showToast === 'function') showToast(msg);
  else { console.log('[MP]', msg); }
}

function mpAvatar(name) {
  return (name || '?')[0].toUpperCase();
}

function mpShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── FIREBASE LISTENERS ───────────────────────────────────────
function mpListen(ref, ev, fn) {
  ref.on(ev, fn);
  MP.listeners.push({ ref, ev, fn });
}

function mpUnlisten() {
  MP.listeners.forEach(({ ref, ev, fn }) => ref.off(ev, fn));
  MP.listeners = [];
  clearInterval(MP.gameTimer);
  MP.gameTimer = null;
}

// ═══════════════════════════════════════════════════════════════
// PERFIL DO UTILIZADOR
// ═══════════════════════════════════════════════════════════════
async function mpGetMe() {
  if (MP.me?.uid) return MP.me;
  const user = firebase.auth().currentUser;
  if (!user) return null;

  let name = user.displayName || '';
  if (!name && typeof State !== 'undefined' && State.profile) {
    name = ((State.profile.firstName || '') + ' ' + (State.profile.lastName || '')).trim();
  }
  if (!name) {
    try {
      const snap = await db.ref(`users/${user.uid}`).once('value');
      const d = snap.val() || {};
      name = ((d.firstName || '') + ' ' + (d.lastName || '')).trim() || d.nome || '';
    } catch(e) {}
  }
  name = name || user.email || user.phoneNumber || 'Jogador';

  let stars = 0;
  try {
    const s = await db.ref(`users/${user.uid}/stats`).once('value');
    stars = (s.val() || {}).stars || 0;
  } catch(e) {}

  MP.me = { uid: user.uid, name, email: user.email || '', phone: user.phoneNumber || '', stars };
  return MP.me;
}

async function mpAddStars(uid, n) {
  if (!uid || n <= 0) return;
  try {
    db.ref(`users/${uid}/stats`).transaction(s => {
      if (!s) s = { stars: 0, games: 0 };
      s.stars = (s.stars || 0) + n;
      s.games = (s.games || 0) + 1;
      return s;
    });
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// DISCIPLINAS E CATEGORIAS
// ═══════════════════════════════════════════════════════════════
async function mpFillDisciplinas(selId) {
  const sel = mpEl(selId);
  if (!sel) return;
  sel.innerHTML = `<option value="">Todas as Disciplinas</option>`;
  try {
    const snap = await db.ref('questions').once('value');
    const discs = new Set();
    if (snap.val()) Object.values(snap.val()).forEach(q => { if (q.disc) discs.add(q.disc); });
    [...discs].sort().forEach(d => {
      const o = document.createElement('option');
      o.value = d; o.textContent = d; sel.appendChild(o);
    });
  } catch(e) {}
}

async function mpFillCategorias(disc, selId) {
  const sel = mpEl(selId);
  if (!sel) return;
  sel.innerHTML = `<option value="">Todas as Categorias</option>`;
  if (!disc) return;
  try {
    const snap = await db.ref('questions').orderByChild('disc').equalTo(disc).once('value');
    const cats = new Set();
    snap.forEach(c => { const q = c.val(); if (q.cat) cats.add(q.cat); });
    [...cats].sort().forEach(cat => {
      const o = document.createElement('option');
      o.value = cat; o.textContent = cat; sel.appendChild(o);
    });
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// CARREGAR PERGUNTAS
// ═══════════════════════════════════════════════════════════════
async function mpCarregarPerguntas(cfg) {
  const disc  = cfg.disc  || cfg.disciplina || '';
  const cat   = cfg.cat   || cfg.categoria  || '';
  const nivel = cfg.nivel || 'todos';
  const tipo  = cfg.tipo  || 'todos';
  const qtd   = parseInt(cfg.qtd) || 10;

  let pool = [];
  try {
    if (disc) {
      const snap = await db.ref('questions').orderByChild('disc').equalTo(disc).once('value');
      snap.forEach(c => pool.push(c.val()));
    } else {
      const snap = await db.ref('questions').once('value');
      if (snap.val()) pool = Object.values(snap.val());
    }
  } catch(e) { console.error('mpCarregarPerguntas', e); }

  let filtered = pool.filter(q => {
    const okCat  = !cat  || q.cat === cat;
    const okNiv  = nivel === 'todos' || nivel === 'all' || !nivel || q.nivel === nivel || q.dificuldade === nivel;
    const okTipo = tipo === 'todos' || tipo === 'all'  || !tipo  || q.tipo === tipo
                   || (tipo === 'multipla_img' && (q.tipo === 'multipla' || q.tipo === 'multipla_img') && (q.imageURL || q.questionImg));
    return okCat && okNiv && okTipo;
  });

  if (filtered.length < qtd && pool.length >= qtd) filtered = pool;
  if (filtered.length === 0) filtered = pool;

  return mpShuffle(filtered).slice(0, qtd);
}

// ═══════════════════════════════════════════════════════════════
// 1. ENTRAR NO HUB MULTIPLAYER
// ═══════════════════════════════════════════════════════════════
async function mpInit() {
  const me = await mpGetMe();
  if (!me) { mpToast('Inicia sessao para aceder ao Multiplayer.'); return; }

  mpScreen('screen-multiplayer');
  mpUnlisten();

  // Actualizar estrelas no header
  const starsEl = mpEl('mpUserStars');
  if (starsEl) starsEl.textContent = me.stars;

  // Iniciar tabs
  mpInitTabs();

  // Carregar conteudo da aba activa
  mpLoadSalas();
  mpLoadDesafiosRecebidos();
  mpLoadRankingGlobal();

  // Preencher disciplinas no formulario de desafio
  mpFillDisciplinas('mpDesafioDisciplina');

  // Ligar disciplina -> categorias no formulario
  const selDisc = mpEl('mpDesafioDisciplina');
  if (selDisc && !selDisc._mpBound) {
    selDisc._mpBound = true;
    selDisc.addEventListener('change', e => mpFillCategorias(e.target.value, 'mpDesafioCategoria'));
  }

  // Botoes do formulario de desafio
  mpInitDesafioForm();

  // Buscar jogadores
  mpInitBuscarTab();
}

// ─── TABS ─────────────────────────────────────────────────────
function mpInitTabs() {
  const tabMap = {
    salas:    'mpTabSalas',
    desafios: 'mpTabDesafios',
    ranking:  'mpTabRanking',
    buscar:   'mpTabBuscar',
  };

  mpQA('.mp-tab').forEach(tab => {
    tab.onclick = () => {
      mpQA('.mp-tab').forEach(t => t.classList.remove('active'));
      mpQA('.mp-tab-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panelId = tabMap[tab.dataset.tab];
      if (panelId) mpEl(panelId)?.classList.add('active');

      // Recarregar conteudo ao mudar de aba
      if (tab.dataset.tab === 'ranking') mpLoadRankingGlobal();
      if (tab.dataset.tab === 'desafios') mpLoadDesafiosRecebidos();
      if (tab.dataset.tab === 'salas') mpLoadSalas();
    };
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. SALAS ACTIVAS
// ═══════════════════════════════════════════════════════════════
function mpLoadSalas() {
  const el = mpEl('mpSalasList');
  if (!el) return;
  el.innerHTML = `<div class="mp-loading-rank">A carregar salas...</div>`;

  db.ref('mp_salas').orderByChild('status').equalTo('waiting').limitToLast(20)
    .once('value', snap => {
      const salas = [];
      snap.forEach(c => salas.push({ ...c.val(), _key: c.key }));

      if (!salas.length) {
        el.innerHTML = `
          <div class="mp-empty-state">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
            <p>Nenhuma sala activa de momento</p>
            <button class="btn-mp-action" id="btnCriarSala">
              ${SVG.play}Criar Sala
            </button>
          </div>`;
        mpEl('btnCriarSala')?.addEventListener('click', mpAbrirAbaDesafios);
        return;
      }

      el.innerHTML = salas.map(s => {
        const players  = Object.values(s.players || {});
        const nomes    = players.map(p => p.name.split(' ')[0]).join(', ');
        const modo     = s.modoPerg === 'realtime' ? SVG.bolt + 'Tempo Real' : SVG.clock + 'Assincrono';
        return `
          <div class="mp-sala-card" style="background:var(--card,#161D30);border:1px solid var(--border,rgba(255,255,255,0.07));border-radius:14px;padding:14px 16px;margin-bottom:10px">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <span style="font-weight:700;color:var(--text,#F1F5F9);font-size:0.9rem">Sala #${s.roomNum || '?'}</span>
              <span style="font-size:0.72rem;color:var(--text2,#94A3B8)">${modo}</span>
            </div>
            <div style="font-size:0.78rem;color:var(--text2,#94A3B8);margin-bottom:10px">
              ${SVG.people}${players.length}/${s.maxplayers || 2} &middot; ${s.disc || 'Geral'} &middot; ${s.qtd || 10} perguntas
            </div>
            <div style="font-size:0.75rem;color:var(--text2,#94A3B8);margin-bottom:10px">${nomes}</div>
          </div>`;
      }).join('');
    });
}

function mpAbrirAbaDesafios() {
  const tab = mpQ('.mp-tab[data-tab="desafios"]');
  if (tab) tab.click();
}

// ═══════════════════════════════════════════════════════════════
// 3. DESAFIOS RECEBIDOS
// ═══════════════════════════════════════════════════════════════
function mpLoadDesafiosRecebidos() {
  const me = MP.me;
  if (!me) return;
  const el = mpEl('mpDesafiosRecebidos');
  if (!el) return;

  el.innerHTML = `<div class="mp-loading-rank">A carregar...</div>`;

  db.ref('mp_desafios')
    .orderByChild('targetUid').equalTo(me.uid)
    .once('value', snap => {
      const lista = [];
      snap.forEach(c => {
        const d = c.val();
        if (d.status === 'pending') lista.push({ ...d, _key: c.key });
      });

      if (!lista.length) {
        el.innerHTML = `<p class="mp-sub-empty">Sem desafios pendentes</p>`;
        return;
      }

      el.innerHTML = lista.map(d => `
        <div class="mp-desafio-card" style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:14px 16px;margin-bottom:10px">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="mp-rank-av" style="width:38px;height:38px;border-radius:50%;background:linear-gradient(135deg,#6366F1,#4F46E5);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;color:#fff;flex-shrink:0">${mpAvatar(d.fromName)}</div>
            <div>
              <div style="font-weight:700;font-size:0.88rem;color:var(--text,#F1F5F9)">${d.fromName || 'Jogador'} desafia-te!</div>
              <div style="font-size:0.75rem;color:var(--text2,#94A3B8)">${d.disciplina || 'Geral'} &middot; ${d.nivel || 'Todos'} &middot; ${d.qtd || 10} perguntas</div>
            </div>
          </div>
          <div style="display:flex;gap:8px">
            <button class="mp-btn-aceitar btn-mp-action" data-key="${d._key}" data-sala="${d.salaId}" style="flex:1;padding:9px;font-size:0.82rem">${SVG.check}Aceitar</button>
            <button class="mp-btn-recusar" data-key="${d._key}" style="flex:1;padding:9px;border-radius:10px;background:transparent;border:1px solid rgba(239,68,68,0.3);color:#EF4444;font-weight:700;cursor:pointer;font-size:0.82rem">${SVG.close}Recusar</button>
          </div>
        </div>`).join('');

      el.querySelectorAll('.mp-btn-aceitar').forEach(b =>
        b.addEventListener('click', () => mpAceitarDesafio(b.dataset.key, b.dataset.sala)));
      el.querySelectorAll('.mp-btn-recusar').forEach(b =>
        b.addEventListener('click', () => mpRecusarDesafio(b.dataset.key)));
    });
}

// ═══════════════════════════════════════════════════════════════
// 4. RANKING GLOBAL
// ═══════════════════════════════════════════════════════════════
function mpLoadRankingGlobal() {
  const el = mpEl('mpRankingList');
  if (!el) return;
  el.innerHTML = `<div class="mp-loading-rank">A carregar ranking...</div>`;

  // Tambem carregar historico global (todos os jogos terminados) dentro do tab ranking
  mpInjectHistoricoSection();

  db.ref('users').once('value', snap => {
    const lista = [];
    snap.forEach(c => {
      const u = c.val();
      const stars = (u.stats && u.stats.stars) || 0;
      if (stars <= 0) return;
      const name = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.nome || u.email || 'Jogador';
      lista.push({ uid: c.key, name, stars, photo: u.photoURL || '' });
    });
    lista.sort((a, b) => b.stars - a.stars);

    if (!lista.length) {
      el.innerHTML = `<div class="mp-empty-state"><p>Ranking sem dados ainda</p></div>`;
      return;
    }

    const me = MP.me;
    el.innerHTML = lista.slice(0, 50).map((p, i) => {
      const medals = ['', '#FFD700', '#C0C0C0', '#CD7F32'];
      const cor    = medals[i + 1] || 'transparent';
      return `
        <div class="mp-rank-row ${p.uid === me?.uid ? 'mp-rank-me' : ''}" style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;margin-bottom:6px;background:${p.uid === me?.uid ? 'rgba(99,102,241,0.12)' : 'var(--card,#161D30)'};border:1px solid ${p.uid === me?.uid ? 'rgba(99,102,241,0.3)' : 'var(--border,rgba(255,255,255,0.06))'}">
          <span style="font-weight:800;font-size:0.85rem;color:${cor || 'var(--text2,#94A3B8)'};min-width:24px">${i + 1}.</span>
          <span style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366F1,#4F46E5);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;font-size:0.9rem;flex-shrink:0">
            ${p.photo ? `<img src="${p.photo}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : mpAvatar(p.name)}
          </span>
          <span style="flex:1;font-weight:600;font-size:0.88rem;color:var(--text,#F1F5F9)">${p.name}${p.uid === me?.uid ? ' (tu)' : ''}</span>
          <span style="font-weight:700;font-size:0.88rem;color:var(--gold,#F59E0B)">${SVG.star} ${p.stars}</span>
        </div>`;
    }).join('');
  });
}

// ─── HISTORICO GLOBAL (injectado no fim do tab ranking) ───────
function mpInjectHistoricoSection() {
  const container = mpEl('mpTabRanking');
  if (!container) return;
  let histEl = mpEl('mpHistoricoGlobal');
  if (!histEl) {
    histEl = document.createElement('div');
    histEl.id = 'mpHistoricoGlobal';
    container.appendChild(histEl);
  }
  histEl.innerHTML = `
    <div class="mp-section-title" style="margin-top:20px">
      <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
      Historico de Jogos
    </div>
    <div id="mpHistoricoLista"><div class="mp-loading-rank">A carregar...</div></div>`;

  db.ref('mp_salas').orderByChild('status').equalTo('finished').limitToLast(20)
    .once('value', snap => {
      const lista = mpEl('mpHistoricoLista');
      if (!lista) return;
      const jogos = [];
      snap.forEach(c => jogos.push({ ...c.val(), _key: c.key }));

      if (!jogos.length) {
        lista.innerHTML = `<p class="mp-sub-empty">Sem jogos no historico ainda</p>`;
        return;
      }

      const me = MP.me;
      lista.innerHTML = jogos.reverse().map(s => {
        const players = Object.values(s.players || {});
        const scores  = s.scores || {};
        const ranked  = players.map(p => ({
          name:  p.name,
          pts:   (scores[p.uid] && scores[p.uid].total) || 0,
          isMe:  p.uid === me?.uid,
        })).sort((a, b) => b.pts - a.pts);
        return `
          <div style="background:var(--card,#161D30);border:1px solid var(--border,rgba(255,255,255,0.06));border-radius:12px;padding:12px 14px;margin-bottom:8px">
            <div style="font-weight:700;font-size:0.82rem;color:var(--text2,#94A3B8);margin-bottom:6px">
              Sala #${s.roomNum || '?'} &middot; ${s.disc || s.disciplina || 'Geral'} &middot; ${s.qtd || '?'} perguntas
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:6px">
              ${ranked.map((p, i) => `
                <span style="font-size:0.78rem;padding:3px 8px;border-radius:20px;background:${i === 0 ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.04)'};color:${i === 0 ? 'var(--gold,#F59E0B)' : 'var(--text2,#94A3B8)'};border:1px solid ${i === 0 ? 'rgba(245,158,11,0.25)' : 'transparent'};font-weight:${p.isMe ? 700 : 500}">
                  ${i === 0 ? SVG.trophy : ''}${p.name}: ${p.pts} pts
                </span>`).join('')}
            </div>
          </div>`;
      }).join('');
    });
}

// ═══════════════════════════════════════════════════════════════
// 5. BUSCAR JOGADORES (tab buscar)
// ═══════════════════════════════════════════════════════════════
function mpInitBuscarTab() {
  const btn   = mpEl('mpBuscarBtn');
  const input = mpEl('mpBuscarInput');
  if (!btn || !input || btn._mpBound) return;
  btn._mpBound = true;

  const doSearch = () => mpBuscarJogadorGlobal(input.value.trim());
  btn.addEventListener('click', doSearch);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
}

function mpBuscarJogadorGlobal(query) {
  const res = mpEl('mpBuscarResultados');
  if (!res) return;
  if (!query || query.length < 2) { mpToast('Escreve pelo menos 2 letras.'); return; }
  res.innerHTML = `<div class="mp-loading-rank">A pesquisar...</div>`;

  const q = query.toLowerCase();
  db.ref('users').once('value', snap => {
    const encontrados = [];
    const me = MP.me;
    snap.forEach(c => {
      const u = c.val();
      if (c.key === me?.uid) return;
      const name  = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.nome || '';
      const email = (u.email || '').toLowerCase();
      if (name.toLowerCase().includes(q) || email.includes(q)) {
        const stars = (u.stats && u.stats.stars) || 0;
        encontrados.push({ uid: c.key, name: name || email, email: u.email || '', stars, photo: u.photoURL || '' });
      }
    });

    if (!encontrados.length) {
      res.innerHTML = `<p class="mp-sub-empty">Nenhum jogador encontrado</p>`;
      return;
    }

    res.innerHTML = encontrados.slice(0, 12).map(u => `
      <div style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;background:var(--card,#161D30);border:1px solid var(--border,rgba(255,255,255,0.06));margin-bottom:8px">
        <div style="width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6366F1,#4F46E5);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.9rem;color:#fff;flex-shrink:0">${mpAvatar(u.name)}</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:0.88rem;color:var(--text,#F1F5F9)">${u.name}</div>
          <div style="font-size:0.72rem;color:var(--text2,#94A3B8)">${u.email} &middot; ${SVG.star}${u.stars} estrelas</div>
        </div>
        <button class="mp-btn-desafiar btn-mp-action" data-uid="${u.uid}" data-name="${u.name}" style="font-size:0.78rem;padding:7px 12px">${SVG.play}Desafiar</button>
      </div>`).join('');

    res.querySelectorAll('.mp-btn-desafiar').forEach(b => {
      b.addEventListener('click', () => {
        // Preencher campo de busca no form de desafios e ir para essa aba
        const tab = mpQ('.mp-tab[data-tab="desafios"]');
        if (tab) tab.click();
        const targetInput = mpEl('mpDesafioTarget');
        if (targetInput) targetInput.value = b.dataset.name;
        // Preencher campos hidden via data
        targetInput.dataset.uid  = b.dataset.uid;
        targetInput.dataset.name = b.dataset.name;
        mpToast(`${b.dataset.name} seleccionado. Configure e envie o desafio.`);
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// 6. FORMULARIO DE DESAFIO (ja existente no HTML)
// ═══════════════════════════════════════════════════════════════
function mpInitDesafioForm() {
  // Buscar jogador no form de desafio
  const btnBuscar = mpEl('mpBuscarJogador');
  if (btnBuscar && !btnBuscar._mpBound) {
    btnBuscar._mpBound = true;
    btnBuscar.addEventListener('click', () => {
      const q = (mpEl('mpDesafioTarget')?.value || '').trim();
      mpBuscarParaDesafio(q);
    });
    const inp = mpEl('mpDesafioTarget');
    if (inp) inp.addEventListener('keydown', e => { if (e.key === 'Enter') btnBuscar.click(); });
  }

  // Opcoes de seleccao (mp-opt buttons)
  mpQA('.mp-opt').forEach(btn => {
    if (!btn._mpBound) {
      btn._mpBound = true;
      btn.addEventListener('click', () => {
        const group = btn.dataset.mpopt;
        mpQA(`.mp-opt[data-mpopt="${group}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Actualizar tipos de pergunta se mudou o modo do jogo
        if (group === 'modoJogo') mpUpdateTiposUI(btn.dataset.v);
      });
    }
  });

  // Enviar desafio
  const btnEnviar = mpEl('btnEnviarDesafio');
  if (btnEnviar && !btnEnviar._mpBound) {
    btnEnviar._mpBound = true;
    btnEnviar.addEventListener('click', mpSubmitDesafio);
  }
}

function mpBuscarParaDesafio(query) {
  const res = mpEl('mpSearchResults');
  if (!res) return;
  if (!query || query.length < 2) { mpToast('Escreve pelo menos 2 letras.'); return; }
  res.innerHTML = `<div style="font-size:0.78rem;color:var(--text2)">A pesquisar...</div>`;

  const q = query.toLowerCase();
  db.ref('users').once('value', snap => {
    const encontrados = [];
    const me = MP.me;
    snap.forEach(c => {
      const u = c.val();
      if (c.key === me?.uid) return;
      const name  = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.nome || '';
      const email = (u.email || '').toLowerCase();
      if (name.toLowerCase().includes(q) || email.includes(q)) {
        encontrados.push({ uid: c.key, name: name || email, email: u.email || '' });
      }
    });

    if (!encontrados.length) {
      res.innerHTML = `<div class="mp-search-result-item" style="font-size:0.8rem;padding:8px;color:var(--text2)">Nenhum jogador encontrado</div>`;
      return;
    }

    res.innerHTML = encontrados.slice(0, 8).map(u => `
      <div class="mp-search-result-item" data-uid="${u.uid}" data-name="${u.name}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:10px;cursor:pointer;border-bottom:1px solid var(--border,rgba(255,255,255,0.05))">
        <div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#6366F1,#4F46E5);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.8rem;color:#fff">${mpAvatar(u.name)}</div>
        <div style="flex:1">
          <div style="font-size:0.82rem;font-weight:600;color:var(--text,#F1F5F9)">${u.name}</div>
          <div style="font-size:0.7rem;color:var(--text2)">${u.email}</div>
        </div>
        <button class="mp-sel-btn" data-uid="${u.uid}" data-name="${u.name}" style="font-size:0.75rem;padding:5px 10px;border-radius:8px;background:var(--primary,#6366F1);color:#fff;border:none;cursor:pointer;font-weight:600">Sel.</button>
      </div>`).join('');

    res.querySelectorAll('.mp-sel-btn').forEach(b => {
      b.addEventListener('click', () => {
        const input = mpEl('mpDesafioTarget');
        if (input) {
          input.value         = b.dataset.name;
          input.dataset.uid   = b.dataset.uid;
          input.dataset.name  = b.dataset.name;
        }
        res.innerHTML = `<div style="font-size:0.78rem;color:#22C55E;padding:6px 2px">${SVG.check}${b.dataset.name} seleccionado</div>`;
      });
    });
  });
}

function mpUpdateTiposUI(modoJogo) {
  const container = mpEl('mpTiposContainer');
  if (!container) return;

  const todosBtn  = `<button class="mp-opt active" data-mpopt="tipo" data-v="todos">Todos</button>`;
  const multiBtn  = `<button class="mp-opt" data-mpopt="tipo" data-v="multipla">Multipla</button>`;
  const vfBtn     = `<button class="mp-opt" data-mpopt="tipo" data-v="vf">V/F</button>`;
  const lacunasBtn= `<button class="mp-opt" data-mpopt="tipo" data-v="lacunas">Lacunas</button>`;
  const imgBtn    = `<button class="mp-opt" data-mpopt="tipo" data-v="multipla_img">Com Imagem</button>`;

  if (modoJogo === 'imagem') {
    container.innerHTML = `${todosBtn}${imgBtn}`;
  } else {
    container.innerHTML = `${todosBtn}${multiBtn}${vfBtn}${lacunasBtn}`;
  }

  // Re-bind click
  container.querySelectorAll('.mp-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.mp-opt').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ─── SUBMETER DESAFIO ─────────────────────────────────────────
async function mpSubmitDesafio() {
  const me = MP.me;
  if (!me) { mpToast('Sessao necessaria'); return; }

  const targetInput = mpEl('mpDesafioTarget');
  const targetUid   = targetInput?.dataset?.uid || '';
  const targetName  = targetInput?.dataset?.name || targetInput?.value || 'Adversario';

  if (!targetUid) { mpToast('Selecciona um jogador para desafiar.'); return; }

  const activeOpt = grp => mpQ(`.mp-opt.active[data-mpopt="${grp}"]`)?.dataset?.v || '';

  const disc      = mpEl('mpDesafioDisciplina')?.value || '';
  const cat       = mpEl('mpDesafioCategoria')?.value  || '';
  const nivel     = activeOpt('nivel')      || 'todos';
  const tipo      = activeOpt('tipo')       || 'todos';
  const modoJogo  = activeOpt('modoJogo')   || 'aprendizado';
  const modoPerg  = activeOpt('modoPerg')   || 'realtime';
  const maxP      = parseInt(activeOpt('maxplayers')) || 2;
  const tempo     = parseInt(mpEl('mpTempoInput')?.value) || 30;
  const qtd       = parseInt(mpEl('mpQtdInput')?.value)   || 10;

  const btn = mpEl('btnEnviarDesafio');
  if (btn) { btn.disabled = true; btn.textContent = 'A enviar...'; }

  const salaData = {
    roomNum:    Math.floor(1000 + Math.random() * 9000),
    status:     'waiting',
    host:       me.uid,
    invitedUid: targetUid,
    disc, cat, nivel, tipo,
    modoJogo, modoPerg,
    tempo, qtd,
    maxplayers: maxP,
    players:    { [me.uid]: { uid: me.uid, name: me.name, stars: me.stars, score: 0 } },
    scores:     {},
    liveAnswers:{},
    createdAt:  firebase.database.ServerValue.TIMESTAMP,
  };

  try {
    const salaRef = await db.ref('mp_salas').push(salaData);
    await db.ref('mp_desafios').push({
      fromUid: me.uid, fromName: me.name,
      targetUid, targetName,
      salaId:     salaRef.key,
      disciplina: disc, categoria: cat,
      nivel, tipo, modoJogo, modoPerg,
      tempo, qtd, maxplayers: maxP,
      status: 'pending',
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    });
    mpToast(`Desafio enviado para ${targetName}!`);
    // Entrar na sala
    await mpEntrarSala(salaRef.key, salaData);
  } catch(e) {
    console.error('mpSubmitDesafio', e);
    mpToast('Erro ao enviar desafio. Tenta de novo.');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> ENVIAR DESAFIO`;
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 7. ACEITAR / RECUSAR DESAFIO
// ═══════════════════════════════════════════════════════════════
async function mpAceitarDesafio(key, salaId) {
  try { await db.ref(`mp_desafios/${key}`).update({ status: 'accepted' }); } catch(e) {}
  await mpEntrarSala(salaId, null);
}

async function mpRecusarDesafio(key) {
  try { await db.ref(`mp_desafios/${key}`).update({ status: 'declined' }); } catch(e) {}
  mpToast('Desafio recusado.');
  mpLoadDesafiosRecebidos();
}

// ═══════════════════════════════════════════════════════════════
// 8. SALA DE ESPERA
// ═══════════════════════════════════════════════════════════════
async function mpEntrarSala(salaId, salaDataOuNull) {
  const me = await mpGetMe();
  if (!me) return;

  mpUnlisten();
  MP.salaId = salaId;
  MP.sala   = db.ref(`mp_salas/${salaId}`);

  // Passo 1: registar-me na sala
  await MP.sala.child('players').child(me.uid).set({
    uid: me.uid, name: me.name, stars: me.stars, score: 0,
  });

  // Passo 2: ler snapshot completo (ja tem todos os jogadores)
  const snap = await MP.sala.once('value');
  const sala = snap.val();
  if (!sala) { mpToast('Sala nao encontrada.'); return; }

  MP.salaData = sala;
  MP.isHost   = sala.host === me.uid;

  // Passo 3: renderizar ecrã de sala
  mpRenderSala(sala);
}

// ─── RENDERIZAR SALA ──────────────────────────────────────────
function mpRenderSala(sala) {
  // Activar screen
  mpQA('.screen').forEach(s => s.classList.remove('active'));
  const screen = mpEl('screen-mp-sala');
  if (!screen) return;
  screen.classList.add('active');
  window.scrollTo(0, 0);

  const players = Object.values(sala.players || {});
  const maxP    = sala.maxplayers || 2;
  const me      = MP.me;

  // Header info
  const numEl  = mpEl('mpSalaNumDisplay');
  const modeEl = mpEl('mpSalaModeDisplay');
  if (numEl)  numEl.textContent  = `Sala #${sala.roomNum || '?'}`;
  if (modeEl) modeEl.textContent = sala.modoPerg === 'realtime' ? 'Tempo Real' : 'Assincrono';

  // Botao eliminar (so host)
  const delBtn = mpEl('mpSalaDeleteBtn');
  if (delBtn) delBtn.style.display = MP.isHost ? 'flex' : 'none';

  // Zona de espera visivelmente activa
  const waiting = mpEl('mpSalaWaiting');
  const game    = mpEl('mpSalaGame');
  const result  = mpEl('mpSalaResult');
  if (waiting) waiting.style.display = 'block';
  if (game)    game.style.display    = 'none';
  if (result)  result.style.display  = 'none';

  // Renderizar grid de jogadores
  mpRenderGrid(players, maxP);
  mpRenderScoreboard(players);
  mpVerificarBotaoIniciar(players, maxP);

  // Injectar zona de configuracao inline (se ainda nao existe)
  mpInjectZonaCfg(sala);

  // Listeners de sala
  mpMontarListenersSala();
}

// ─── GRID DE JOGADORES ────────────────────────────────────────
function mpRenderGrid(players, maxP) {
  const grid = mpEl('mpPlayersGrid');
  if (!grid) return;
  const me     = MP.me;
  const sorted = [
    ...players.filter(p => p.uid === me?.uid),
    ...players.filter(p => p.uid !== me?.uid),
  ];
  grid.innerHTML = Array.from({ length: maxP }, (_, i) => {
    const p = sorted[i];
    if (p) {
      const isMe = p.uid === me?.uid;
      return `<div class="mp-slot filled ${isMe ? 'me' : ''}" style="background:var(--card,#161D30);border:1px solid ${isMe ? 'rgba(99,102,241,0.4)' : 'var(--border,rgba(255,255,255,0.06))'};border-radius:12px;padding:12px;text-align:center;min-width:90px">
        <div class="mp-slot-av" style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6366F1,#4F46E5);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1.1rem;color:#fff;margin:0 auto 6px">${mpAvatar(p.name)}</div>
        <div class="mp-slot-name" style="font-size:0.75rem;font-weight:600;color:var(--text,#F1F5F9);word-break:break-all">${p.name.split(' ')[0]}${isMe ? '' : ''}</div>
        <div class="mp-slot-stars" style="font-size:0.7rem;color:var(--gold,#F59E0B);margin-top:3px">${SVG.star} ${p.stars || 0}</div>
      </div>`;
    }
    return `<div class="mp-slot empty" style="background:rgba(255,255,255,0.02);border:1px dashed rgba(255,255,255,0.1);border-radius:12px;padding:12px;text-align:center;min-width:90px;opacity:.5">
      <div style="width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;margin:0 auto 6px">
        <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--text2,#94A3B8)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      </div>
      <div style="font-size:0.72rem;color:var(--text2,#94A3B8)">Aguardando...</div>
    </div>`;
  }).join('');
}

// ─── SCOREBOARD ───────────────────────────────────────────────
function mpRenderScoreboard(players) {
  const sb = mpEl('mpScoreboard');
  if (!sb) return;
  sb.innerHTML = players.map(p =>
    `<div class="mp-score-chip" data-uid="${p.uid}" style="display:flex;flex-direction:column;align-items:center;padding:6px 12px;border-radius:10px;background:var(--card,#161D30);border:1px solid var(--border,rgba(255,255,255,0.06));min-width:60px">
      <div class="mp-sc-name" style="font-size:0.7rem;font-weight:600;color:var(--text2,#94A3B8)">${p.name.split(' ')[0]}</div>
      <div class="mp-sc-pts" style="font-size:1rem;font-weight:800;color:var(--text,#F1F5F9)">${p.score || 0}</div>
      <div class="mp-sc-ind" style="width:6px;height:6px;border-radius:50%;margin-top:3px;background:var(--border)"></div>
    </div>`
  ).join('');
}

// ─── BOTAO INICIAR ────────────────────────────────────────────
function mpVerificarBotaoIniciar(players, maxP) {
  const btn = mpEl('btnIniciarDesafio');
  if (!btn || !MP.isHost) return;
  if (players.length >= 2) {
    btn.style.display = 'inline-flex';
    btn.disabled = false;
    const adv = players.find(p => p.uid !== MP.me?.uid);
    btn.innerHTML = `${SVG.settings}${adv ? adv.name.split(' ')[0] + ' entrou! ' : ''}Configurar Jogo`;
    if (!btn._toasted && adv) {
      btn._toasted = true;
      mpToast(`${adv.name.split(' ')[0]} aceitou o desafio!`);
    }
  } else {
    btn.style.display = 'none';
  }
}

// ─── INJECTAR ZONA DE CONFIGURACAO ────────────────────────────
function mpInjectZonaCfg(sala) {
  // Remover zona antiga se existir
  mpEl('mpZonaCfg')?.remove();
  if (!MP.isHost) return;

  const waiting = mpEl('mpSalaWaiting');
  if (!waiting) return;

  const zona = document.createElement('div');
  zona.id    = 'mpZonaCfg';
  zona.style.display = 'none';
  zona.innerHTML = `
    <div style="padding:0 0 24px">
      <div style="font-weight:700;font-size:1rem;color:var(--text,#F1F5F9);margin-bottom:16px;display:flex;align-items:center;gap:6px">${SVG.settings}Configurar o Jogo</div>

      <label class="mp-cfg-label" style="font-size:0.72rem;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Modo de Resposta</label>
      <select id="mpGameModoPerg" class="mp-select" style="margin-bottom:12px">
        <option value="realtime">Tempo Real (simultaneo)</option>
        <option value="async">Assincrono (por turnos)</option>
      </select>

      <label class="mp-cfg-label" style="font-size:0.72rem;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Modo de Jogo</label>
      <select id="mpGameModo" class="mp-select" style="margin-bottom:12px">
        <option value="aprendizado">Aprendizado</option>
        <option value="prova">Prova</option>
        <option value="concurso">Concurso</option>
        <option value="imagem">Imagem</option>
      </select>

      <label class="mp-cfg-label" style="font-size:0.72rem;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Tipo de Perguntas</label>
      <select id="mpGameTipo" class="mp-select" style="margin-bottom:12px">
        <option value="todos">Todos os Tipos</option>
        <option value="multipla">Multipla Escolha</option>
        <option value="vf">Verdadeiro / Falso</option>
        <option value="lacunas">Preencher Lacunas</option>
        <option value="multipla_img">Com Imagem</option>
      </select>

      <label class="mp-cfg-label" style="font-size:0.72rem;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Disciplina</label>
      <select id="mpGameDisc" class="mp-select" style="margin-bottom:12px">
        <option value="">Todas as Disciplinas</option>
      </select>

      <label class="mp-cfg-label" style="font-size:0.72rem;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Categoria</label>
      <select id="mpGameCat" class="mp-select" style="margin-bottom:12px">
        <option value="">Todas as Categorias</option>
      </select>

      <label class="mp-cfg-label" style="font-size:0.72rem;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Nivel</label>
      <select id="mpGameNivel" class="mp-select" style="margin-bottom:12px">
        <option value="todos">Todos</option>
        <option value="facil">Facil</option>
        <option value="medio">Medio</option>
        <option value="dificil">Dificil</option>
      </select>

      <label class="mp-cfg-label" style="font-size:0.72rem;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Numero de Perguntas</label>
      <input id="mpGameQtd" type="number" class="mp-select" min="1" max="50" value="${sala.qtd || 10}" style="margin-bottom:12px">

      <label class="mp-cfg-label" style="font-size:0.72rem;font-weight:700;color:var(--text2,#94A3B8);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Tempo por Pergunta (seg, 0 = livre)</label>
      <input id="mpGameTempo" type="number" class="mp-select" min="0" max="300" value="${sala.tempo || 30}" style="margin-bottom:20px">

      <button id="mpBtnLancar" class="btn-mp-action" style="width:100%">${SVG.play}Lancar Jogo</button>
      <button id="mpBtnCfgCancel" style="width:100%;margin-top:10px;padding:10px;border-radius:10px;background:transparent;border:1px solid var(--border);color:var(--text2);font-family:inherit;cursor:pointer;font-weight:600">${SVG.back}Voltar</button>
    </div>`;

  // Inserir apos o bloco de espera
  waiting.after(zona);

  // Preencher disciplinas
  mpFillDisciplinas('mpGameDisc');
  mpEl('mpGameDisc').addEventListener('change', e => mpFillCategorias(e.target.value, 'mpGameCat'));

  // Pre-seleccionar config da sala
  const set = (id, val) => { const el = mpEl(id); if (el && val) el.value = val; };
  set('mpGameModoPerg', sala.modoPerg);
  set('mpGameModo',     sala.modoJogo);
  set('mpGameTipo',     sala.tipo);
  set('mpGameNivel',    sala.nivel);

  // Botao lancar
  mpEl('mpBtnLancar').addEventListener('click', mpLancarJogo);

  // Botao cancelar cfg
  mpEl('mpBtnCfgCancel').addEventListener('click', () => {
    zona.style.display    = 'none';
    waiting.style.display = 'block';
  });

  // Botao iniciar desafio -> mostrar cfg
  const btnIniciar = mpEl('btnIniciarDesafio');
  if (btnIniciar) {
    btnIniciar.onclick = () => {
      waiting.style.display = 'none';
      zona.style.display    = 'block';
    };
  }
}

// ─── LISTENERS DA SALA ────────────────────────────────────────
function mpMontarListenersSala() {
  const sala = MP.sala;

  // Players
  mpListen(sala.child('players'), 'value', snap => {
    const players = [];
    snap.forEach(c => players.push(c.val()));
    const maxP = MP.salaData?.maxplayers || 2;
    mpRenderGrid(players, maxP);
    mpRenderScoreboard(players);
    mpVerificarBotaoIniciar(players, maxP);
  });

  // Status
  mpListen(sala.child('status'), 'value', snap => {
    const status = snap.val();
    if (status === 'countdown') mpMostrarContagem();
    if (status === 'playing')   mpMostrarZonaJogo();
    if (status === 'finished')  mpMostrarResultados();
  });

  // Pergunta actual
  mpListen(sala.child('currentRound'), 'value', snap => {
    const round = snap.val();
    if (!round) return;
    if (mpEl('mpSalaGame')?.style.display !== 'none') {
      mpRenderPergunta(round);
    }
  });

  // Live answers
  mpListen(sala.child('liveAnswers'), 'value', snap => {
    if (!snap.val()) return;
    mpRenderLiveFeed(snap.val());
    mpAtualizarChips(snap.val());
  });

  // Scores
  mpListen(sala.child('scores'), 'value', snap => {
    if (!snap.val()) return;
    const scores = snap.val();
    sala.child('players').once('value', ps => {
      const players = [];
      ps.forEach(c => {
        const p = c.val();
        p.score = (scores[p.uid] || {}).total || 0;
        players.push(p);
      });
      mpRenderScoreboard(players);
    });
  });

  // Sala eliminada
  mpListen(sala, 'value', snap => {
    if (snap.val() === null) {
      mpUnlisten();
      mpToast('A sala foi eliminada.');
      mpInit();
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 9. LANCAR JOGO
// ═══════════════════════════════════════════════════════════════
async function mpLancarJogo() {
  if (!MP.isHost) return;
  const btn = mpEl('mpBtnLancar');
  if (btn) { btn.disabled = true; btn.textContent = 'A preparar...'; }

  const cfg = {
    disc:     mpEl('mpGameDisc')?.value    || '',
    cat:      mpEl('mpGameCat')?.value     || '',
    nivel:    mpEl('mpGameNivel')?.value   || 'todos',
    tipo:     mpEl('mpGameTipo')?.value    || 'todos',
    modoJogo: mpEl('mpGameModo')?.value    || 'aprendizado',
    modoPerg: mpEl('mpGameModoPerg')?.value || 'realtime',
    tempo:    parseInt(mpEl('mpGameTempo')?.value) || 30,
    qtd:      parseInt(mpEl('mpGameQtd')?.value)   || 10,
  };

  const perguntas = await mpCarregarPerguntas(cfg);
  if (!perguntas.length) {
    mpToast('Sem perguntas disponiveis com estes filtros.');
    if (btn) { btn.disabled = false; btn.innerHTML = SVG.play + 'Lancar Jogo'; }
    return;
  }

  try {
    const snap      = await MP.sala.once('value');
    const salaData  = snap.val();
    const players   = Object.values(salaData.players || {});
    const turnOrder = mpShuffle(players.map(p => p.uid));

    await MP.sala.update({
      ...cfg,
      status:        'countdown',
      questions:     perguntas,
      turnOrder,
      currentQIndex: 0,
      scores:        Object.fromEntries(players.map(p => [p.uid, { total: 0, answers: {} }])),
      liveAnswers:   {},
      startedAt:     firebase.database.ServerValue.TIMESTAMP,
    });
  } catch(e) {
    console.error('mpLancarJogo', e);
    mpToast('Erro ao iniciar jogo. Tenta de novo.');
    if (btn) { btn.disabled = false; btn.innerHTML = SVG.play + 'Lancar Jogo'; }
  }
}

// ─── CONTAGEM REGRESSIVA ──────────────────────────────────────
let _mpCountdown = null;

function mpMostrarContagem() {
  const old = mpEl('mp-countdown-overlay');
  if (old) old.remove();
  clearInterval(_mpCountdown);

  const ov = document.createElement('div');
  ov.id = 'mp-countdown-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(11,15,26,0.95);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  ov.innerHTML = `
    <div style="color:rgba(255,255,255,0.6);font-size:1rem;font-weight:600;margin-bottom:16px;letter-spacing:.05em">O JOGO COMECA EM</div>
    <div id="mpCountNum" style="font-size:7rem;font-weight:900;color:#fff;line-height:1;transition:transform .15s;text-shadow:0 0 60px rgba(99,102,241,0.9)">3</div>
    <div style="color:rgba(255,255,255,0.35);font-size:0.9rem;margin-top:20px">Prepara-te!</div>`;
  document.body.appendChild(ov);

  let n = 3;
  const el = () => mpEl('mpCountNum');

  _mpCountdown = setInterval(async () => {
    n--;
    if (el()) {
      el().textContent = n <= 0 ? 'JA!' : n;
      el().style.transform = 'scale(1.4)';
      setTimeout(() => { if (el()) el().style.transform = 'scale(1)'; }, 140);
    }
    if (n <= 0) {
      clearInterval(_mpCountdown);
      _mpCountdown = null;
      setTimeout(() => ov.remove(), 700);

      if (MP.isHost) {
        await MP.sala.child('status').set('playing');
        const snap = await MP.sala.once('value');
        const d    = snap.val();
        if (d && d.questions) {
          setTimeout(() => mpEmitirPergunta(0, d), 300);
        }
      }
    }
  }, 1000);
}

// ─── MOSTRAR ZONA DE JOGO ─────────────────────────────────────
function mpMostrarZonaJogo() {
  mpEl('mpSalaWaiting')?.style && (mpEl('mpSalaWaiting').style.display = 'none');
  mpEl('mpZonaCfg')?.style      && (mpEl('mpZonaCfg').style.display    = 'none');
  mpEl('mpSalaGame')?.style     && (mpEl('mpSalaGame').style.display    = 'block');
  mpEl('mpSalaResult')?.style   && (mpEl('mpSalaResult').style.display  = 'none');
}

// ═══════════════════════════════════════════════════════════════
// 10. PERGUNTA EM JOGO
// ═══════════════════════════════════════════════════════════════
async function mpEmitirPergunta(index, salaData) {
  if (!MP.isHost) return;
  const questions = salaData.questions || [];
  const turnOrder = salaData.turnOrder  || [];
  const modoPerg  = salaData.modoPerg   || 'realtime';
  const q         = questions[index];
  if (!q) return;

  const playerTurn = turnOrder[index % turnOrder.length];
  const tipo       = q.answerType || q.tipo || q.type || 'multipla';

  let correct = '';
  let questionText = q.pergunta || q.question || q.enunciado || '';
  let answers = [];

  if (tipo === 'lacunas') {
    correct      = q.lacunaResposta || q.lacunaAnswer || q.correta || q.a || '';
    questionText = q.lacunaFrase || questionText;
  } else if (tipo === 'flashcard') {
    correct      = q.flashBack || q.a || q.correta || '';
    questionText = q.flashFront || questionText;
  } else if (tipo === 'vf') {
    correct  = String(q.answer || q.correta || '').trim();
    answers  = ['Verdadeiro', 'Falso'];
    if (correct === 'V' || correct === 'Verdadeiro' || correct === 'true') correct = 'Verdadeiro';
    else correct = 'Falso';
  } else {
    const letter = String(q.answer || '').trim().toLowerCase();
    if (letter.length === 1 && q[letter]) correct = q[letter];
    else correct = q.correta || q.resposta_certa || q.a || '';
    answers = [q.a, q.b, q.c, q.d].filter(Boolean);
    if (!answers.length) answers = [q.answer1, q.answer2, q.answer3, q.answer4].filter(Boolean);
  }

  const round = {
    index,
    total:      questions.length,
    question:   questionText,
    tipo,
    answers:    tipo === 'vf' ? answers : mpShuffle(answers),
    correct,
    imageURL:   q.imageURL || q.questionImg || '',
    playerTurn,
    modoPerg,
    tempo:      salaData.tempo || 0,
  };

  try {
    await MP.sala.child('liveAnswers').remove();
    await MP.sala.child('currentRound').set(round);
    await MP.sala.child('currentQIndex').set(index);
  } catch(e) { console.error('mpEmitirPergunta', e); }
}

// ─── RENDERIZAR PERGUNTA (usa os mesmos IDs/classes do jogo normal) ───
function mpRenderPergunta(round) {
  // Usar o card de pergunta da sala (mpQuestionCard / mpQText / mpQAnswers / mpQNum)
  const qText    = mpEl('mpQText');
  const qAnswers = mpEl('mpQAnswers');
  const qNum     = mpEl('mpQNum');
  const qTurn    = mpEl('mpQTurn');
  if (!qText || !qAnswers) return;

  MP.answered   = false;
  const me      = MP.me;
  const isMyTurn = round.modoPerg === 'realtime' || round.playerTurn === me?.uid;

  if (qNum)  qNum.textContent  = `${round.index + 1}/${round.total}`;
  if (qTurn) qTurn.innerHTML   = isMyTurn
    ? `<span style="color:#22C55E;font-weight:700;font-size:0.78rem">${SVG.play}A tua vez!</span>`
    : `<span style="color:var(--text2);font-size:0.78rem">${SVG.lock}Aguarda...</span>`;

  // Imagem
  let imgHtml = '';
  if (round.imageURL) imgHtml = `<img src="${round.imageURL}" alt="" style="max-width:100%;border-radius:10px;margin-bottom:10px;display:block">`;

  qText.innerHTML = `${imgHtml}${round.question}`;

  // Respostas
  if (!isMyTurn) {
    qAnswers.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text2);font-size:0.85rem">${SVG.lock}Aguarda a tua vez de responder</div>`;
  } else if (round.tipo === 'lacunas' || round.tipo === 'flashcard') {
    qAnswers.innerHTML = `
      <div style="display:flex;gap:8px;padding:4px 0">
        <input type="text" id="mpLacunaIn" style="flex:1;padding:12px;border-radius:10px;border:1.5px solid var(--border);background:var(--input-bg,#1A2035);color:var(--text);font-family:inherit;font-size:0.9rem" placeholder="A tua resposta..." autocomplete="off">
        <button class="answer-btn" id="mpLacunaBtn" style="padding:12px 16px;flex-shrink:0">${SVG.check}OK</button>
      </div>`;
    mpEl('mpLacunaBtn').addEventListener('click', () => {
      const v = (mpEl('mpLacunaIn')?.value || '').trim();
      if (v) mpResponder(v, round);
    });
    mpEl('mpLacunaIn').addEventListener('keydown', e => { if (e.key === 'Enter') mpEl('mpLacunaBtn').click(); });
    setTimeout(() => mpEl('mpLacunaIn')?.focus(), 80);
  } else {
    // Usar as mesmas classes CSS do jogo normal: answers-grid + answer-btn
    qAnswers.className = 'mp-q-answers answers-grid';
    qAnswers.innerHTML = round.answers.map((a, i) =>
      `<button class="answer-btn" data-val="${encodeURIComponent(a)}" data-idx="${i}">${a}</button>`
    ).join('');
    qAnswers.querySelectorAll('.answer-btn').forEach(b =>
      b.addEventListener('click', () => mpResponder(decodeURIComponent(b.dataset.val), round))
    );
  }

  // Timer
  mpClearTimer();
  if (round.tempo > 0 && isMyTurn) {
    mpStartTimer(round.tempo, round);
  } else {
    const t = mpEl('mpSalaTimer');
    if (t) t.textContent = round.tempo > 0 ? `${round.tempo}s` : '\u221e';
  }
}

// ─── RESPONDER ────────────────────────────────────────────────
async function mpResponder(val, round) {
  if (MP.answered) return;
  MP.answered = true;
  mpClearTimer();

  const me   = MP.me;
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const ok   = norm(val) === norm(round.correct || '');
  const pts  = ok ? 10 : 0;

  // Feedback visual
  mpEl('mpQAnswers')?.querySelectorAll('.answer-btn').forEach(b => {
    b.disabled = true;
    const bVal = norm(decodeURIComponent(b.dataset.val || b.textContent));
    if (bVal === norm(round.correct)) b.classList.add('correct');
    else if (bVal === norm(val))      b.classList.add('wrong');
  });

  try {
    await MP.sala.child(`liveAnswers/${me.uid}`).set({
      uid: me.uid, name: me.name, correct: ok, points: pts, answer: val,
      answeredAt: firebase.database.ServerValue.TIMESTAMP,
    });

    const sc = (await MP.sala.child(`scores/${me.uid}`).once('value')).val() || { total: 0, answers: {} };
    sc.total = (sc.total || 0) + pts;
    sc.answers[round.index] = { correct: ok, points: pts };
    await MP.sala.child(`scores/${me.uid}`).set(sc);

    if (MP.isHost) {
      const snap = await MP.sala.once('value');
      mpVerificarAvanco(snap.val(), round);
    }
  } catch(e) { console.error('mpResponder', e); }
}

async function mpVerificarAvanco(salaData, round) {
  const players  = Object.values(salaData.players || {});
  const liveAns  = salaData.liveAnswers || {};
  const expected = salaData.modoPerg === 'realtime' ? players.length : 1;
  if (Object.keys(liveAns).length < expected) return;

  const next = round.index + 1;
  const qs   = salaData.questions || [];

  try {
    if (next >= qs.length) {
      await MP.sala.update({ status: 'finished' });
    } else {
      await MP.sala.child('liveAnswers').remove();
      await MP.sala.child('currentQIndex').set(next);
      setTimeout(async () => {
        const snap = await MP.sala.once('value');
        mpEmitirPergunta(next, snap.val());
      }, 1500);
    }
  } catch(e) { console.error('mpVerificarAvanco', e); }
}

// ─── TIMER ────────────────────────────────────────────────────
function mpClearTimer() {
  clearInterval(MP.gameTimer);
  MP.gameTimer = null;
  const el = mpEl('mpSalaTimer');
  if (el) { el.textContent = '--'; el.classList.remove('urgent'); }
}

function mpStartTimer(seconds, round) {
  let left = seconds;
  const el = mpEl('mpSalaTimer');
  if (el) el.textContent = left + 's';

  MP.gameTimer = setInterval(() => {
    left--;
    if (el) {
      el.textContent = left + 's';
      if (left <= 5) el.classList.add('urgent');
    }
    if (left <= 0) {
      clearInterval(MP.gameTimer);
      if (!MP.answered) mpResponder('', round);
    }
  }, 1000);
}

// ─── LIVE FEED ────────────────────────────────────────────────
function mpRenderLiveFeed(answers) {
  const el = mpEl('mpLiveFeed');
  if (!el) return;
  const items = Object.values(answers || {});
  if (!items.length) return;

  el.innerHTML = `<div class="mp-section-title" style="font-size:0.72rem;margin:0 0 8px">
    <span style="width:8px;height:8px;border-radius:50%;background:#EF4444;display:inline-block;margin-right:6px;animation:pulse 1s infinite"></span>
    Actividade em tempo real
  </div>` + items.map(a => `
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
      <span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${a.correct ? '#22C55E' : '#EF4444'}"></span>
      <span style="font-size:0.8rem;color:var(--text)">
        <strong>${a.name}</strong>
        ${a.correct ? SVG.check + 'acertou' : SVG.close + 'errou'}
        <span style="opacity:.6;font-size:0.72rem">(${a.points || 0} pts)</span>
      </span>
    </div>`).join('');
}

function mpAtualizarChips(answers) {
  mpQA('.mp-score-chip').forEach(chip => {
    chip.classList.remove('answered-right', 'answered-wrong');
    const ind = chip.querySelector('.mp-sc-ind');
    const uid = chip.dataset.uid;
    if (answers[uid]) {
      const ok = answers[uid].correct;
      if (ind) ind.style.background = ok ? '#22C55E' : '#EF4444';
      chip.classList.add(ok ? 'answered-right' : 'answered-wrong');
    } else {
      if (ind) ind.style.background = 'var(--border)';
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 11. RESULTADOS FINAIS
// ═══════════════════════════════════════════════════════════════
async function mpMostrarResultados() {
  mpClearTimer();
  mpEl('mpSalaWaiting')?.style && (mpEl('mpSalaWaiting').style.display = 'none');
  mpEl('mpSalaGame')?.style     && (mpEl('mpSalaGame').style.display    = 'none');
  mpEl('mpSalaResult')?.style   && (mpEl('mpSalaResult').style.display  = 'block');

  try {
    const snap    = await MP.sala.once('value');
    const data    = snap.val();
    const players = Object.values(data.players || {});
    const scores  = data.scores || {};
    const me      = MP.me;
    const qtd     = data.qtd || 10;
    const perQ    = qtd > 0 ? 20 / qtd : 1;

    const ranked = players.map(p => ({
      ...p,
      total: (scores[p.uid] || {}).total || 0,
    })).sort((a, b) => b.total - a.total);

    // Dar estrelas
    ranked.forEach((p, i) => {
      const st = [5, 3, 2, 1][i] || 1;
      if (p.uid === me?.uid) {
        mpAddStars(p.uid, st);
        mpToast(`+${st} estrelas ganhas!`);
      }
    });

    // Podium
    const podium = mpEl('mpResultPodium');
    if (podium) {
      const medals = ['1.', '2.', '3.'];
      podium.innerHTML = ranked.slice(0, 3).map((p, i) => `
        <div style="text-align:center;padding:12px 8px;border-radius:14px;background:${p.uid === me?.uid ? 'rgba(99,102,241,0.12)' : 'var(--card)'};border:1px solid ${p.uid === me?.uid ? 'rgba(99,102,241,0.3)' : 'var(--border)'};flex:1">
          <div style="font-size:1.4rem;font-weight:900;color:${i === 0 ? '#FFD700' : i === 1 ? '#C0C0C0' : '#CD7F32'};margin-bottom:6px">${medals[i]}</div>
          <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6366F1,#4F46E5);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:1rem;color:#fff;margin:0 auto 6px">${mpAvatar(p.name)}</div>
          <div style="font-size:0.78rem;font-weight:700;color:var(--text)">${p.name.split(' ')[0]}</div>
          <div style="font-size:1rem;font-weight:800;color:var(--text)">${p.total} pts</div>
          <div style="font-size:0.72rem;color:var(--text2)">${(p.total * perQ / 10).toFixed(1)} val.</div>
        </div>`).join('');
      podium.style.cssText = 'display:flex;gap:8px;margin-bottom:16px';
    }

    // Tabela
    const table = mpEl('mpResultTable');
    if (table) {
      table.innerHTML = `
        <table style="width:100%;border-collapse:collapse;font-size:0.82rem">
          <thead>
            <tr style="color:var(--text2);border-bottom:1px solid var(--border)">
              <th style="padding:8px 6px;text-align:left">#</th>
              <th style="padding:8px 6px;text-align:left">Jogador</th>
              <th style="padding:8px 6px;text-align:right">Pts</th>
              <th style="padding:8px 6px;text-align:right">Nota</th>
            </tr>
          </thead>
          <tbody>
            ${ranked.map((p, i) => `
              <tr style="border-bottom:1px solid var(--border);${p.uid === me?.uid ? 'background:rgba(99,102,241,0.08)' : ''}">
                <td style="padding:8px 6px;font-weight:700;color:${i < 3 ? 'var(--gold)' : 'var(--text2)'}">${i + 1}</td>
                <td style="padding:8px 6px;font-weight:600;color:var(--text)">${p.name}${p.uid === me?.uid ? ' (tu)' : ''}</td>
                <td style="padding:8px 6px;text-align:right;font-weight:700;color:var(--text)">${p.total}</td>
                <td style="padding:8px 6px;text-align:right;color:var(--text2)">${(p.total * perQ / 10).toFixed(1)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    }

    // Guardar no historico
    await MP.sala.child('status').set('finished');

  } catch(e) { console.error('mpMostrarResultados', e); }

  // Botao voltar
  mpEl('btnMpSalaVoltar')?.addEventListener('click', () => {
    mpUnlisten();
    mpInit();
  });
}

// ═══════════════════════════════════════════════════════════════
// 12. ELIMINAR SALA
// ═══════════════════════════════════════════════════════════════
async function mpEliminarSala() {
  if (!MP.isHost || !MP.salaId) return;
  mpConfirmDialog('Eliminar a sala? O desafio sera cancelado.', async () => {
    try {
      const dSnap = await db.ref('mp_desafios')
        .orderByChild('salaId').equalTo(MP.salaId).once('value');
      const upd = {};
      dSnap.forEach(c => { upd[`mp_desafios/${c.key}/status`] = 'cancelled'; });
      if (Object.keys(upd).length) await db.ref().update(upd);
      await MP.sala.remove();
    } catch(e) {}
    mpUnlisten();
    mpToast('Sala eliminada.');
    mpInit();
  });
}

// ─── MODAL DE CONFIRMACAO ─────────────────────────────────────
function mpConfirmDialog(msg, onOk) {
  mpEl('mp-confirm-modal')?.remove();
  const ov = document.createElement('div');
  ov.id = 'mp-confirm-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding-bottom:24px';
  ov.innerHTML = `
    <div style="background:var(--card,#161D30);border-radius:20px;padding:24px 20px 12px;width:calc(100% - 32px);max-width:420px;box-shadow:0 -4px 40px rgba(0,0,0,0.3)">
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-weight:700;font-size:1rem;color:var(--text,#F1F5F9);margin-bottom:8px">Confirmar</div>
        <div style="font-size:0.875rem;color:var(--text2,#94A3B8)">${msg}</div>
      </div>
      <button id="mpConfOk" style="width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;border:none;font-weight:700;font-size:0.95rem;cursor:pointer;margin-bottom:8px">Confirmar</button>
      <button id="mpConfCancel" style="width:100%;padding:12px;border-radius:12px;background:transparent;color:var(--text2);border:none;font-size:0.9rem;cursor:pointer;font-weight:600">Cancelar</button>
    </div>`;
  document.body.appendChild(ov);
  mpEl('mpConfOk').onclick    = () => { ov.remove(); onOk(); };
  mpEl('mpConfCancel').onclick = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

// ═══════════════════════════════════════════════════════════════
// 13. LISTENER GLOBAL DE DESAFIOS (funciona em qualquer ecra)
// ═══════════════════════════════════════════════════════════════
let _globalDesafiosRef = null;
let _globalDesafiosFn  = null;
let _globalDesafiosUid = null;
let _desafiosVistos    = new Set();

function mpIniciarListenerGlobalDesafios(uid) {
  if (!uid || _globalDesafiosUid === uid) return;
  if (_globalDesafiosRef && _globalDesafiosFn)
    _globalDesafiosRef.off('child_added', _globalDesafiosFn);

  _globalDesafiosUid = uid;
  _globalDesafiosRef = db.ref('mp_desafios').orderByChild('targetUid').equalTo(uid);
  _globalDesafiosFn  = snap => {
    const d = snap.val();
    if (!d || d.status !== 'pending') return;
    if (_desafiosVistos.has(snap.key)) return;
    _desafiosVistos.add(snap.key);
    mpPopupDesafio(snap.key, d);
  };
  _globalDesafiosRef.on('child_added', _globalDesafiosFn);
}

function mpPopupDesafio(key, d) {
  mpEl('mp-desafio-popup')?.remove();

  const popup = document.createElement('div');
  popup.id = 'mp-desafio-popup';
  popup.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--card,#161D30);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.4);padding:16px 18px;z-index:9999;min-width:300px;max-width:90vw;border:1.5px solid var(--primary,#6366F1)';
  popup.innerHTML = `
    <div style="font-weight:700;font-size:0.92rem;color:var(--text,#F1F5F9);margin-bottom:4px">
      ${SVG.trophy}Novo Desafio!
    </div>
    <div style="font-size:0.82rem;color:var(--text2,#94A3B8);margin-bottom:12px">
      <strong style="color:var(--text,#F1F5F9)">${d.fromName || 'Jogador'}</strong>
      desafia-te em ${d.disciplina || 'Geral'} &middot; ${d.qtd || 10} perguntas
    </div>
    <div style="display:flex;gap:10px">
      <button id="mpPopupOk" style="flex:1;padding:10px;border-radius:10px;background:var(--primary,#6366F1);color:#fff;border:none;font-weight:600;cursor:pointer;font-size:0.82rem">${SVG.check}Aceitar</button>
      <button id="mpPopupNo" style="flex:1;padding:10px;border-radius:10px;background:transparent;color:var(--text2,#94A3B8);border:1px solid var(--border,rgba(255,255,255,0.08));font-weight:600;cursor:pointer;font-size:0.82rem">${SVG.close}Recusar</button>
    </div>`;
  document.body.appendChild(popup);

  mpEl('mpPopupOk').onclick = async () => {
    popup.remove();
    if (!MP.me) await mpGetMe();
    await mpAceitarDesafio(key, d.salaId);
  };
  mpEl('mpPopupNo').onclick = async () => {
    popup.remove();
    await mpRecusarDesafio(key);
  };

  setTimeout(() => { if (popup.parentNode) popup.remove(); }, 30000);
}

// ═══════════════════════════════════════════════════════════════
// 14. INICIALIZACAO
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {

  // Botao principal Multiplayer (no menu)
  const btnMain = mpEl('btnMultiplayer');
  if (btnMain) btnMain.addEventListener('click', mpInit);

  // Botao voltar do hub
  const btnBack = mpEl('mpBackBtn');
  if (btnBack) btnBack.addEventListener('click', () => {
    mpUnlisten();
    if (typeof showScreen === 'function') showScreen('screen-mainmenu');
  });

  // Botao voltar da sala
  const btnSalaBack = mpEl('mpSalaBackBtn');
  if (btnSalaBack) btnSalaBack.addEventListener('click', () => {
    mpUnlisten();
    mpInit();
  });

  // Botao eliminar sala
  const btnDel = mpEl('mpSalaDeleteBtn');
  if (btnDel) btnDel.addEventListener('click', mpEliminarSala);

  // Auth listener
  firebase.auth().onAuthStateChanged(async user => {
    if (user) {
      await mpGetMe();
      const uid = MP.me?.uid || user.uid;
      mpIniciarListenerGlobalDesafios(uid);
    } else {
      MP.me             = null;
      MP.salaId         = null;
      _globalDesafiosUid = null;
    }
  });
});
