/* ═══════════════════════════════════════════════════════════════
   BANDAQUIZ — multiplayer.js  v3.0
   Arquitectura completamente nova — simples, directa e funcional
   Sem emojis. Apenas SVG. Sem lógica redundante.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO GLOBAL ────────────────────────────────────────────
const MP = {
  me:        null,   // { uid, name, email, phone, stars }
  sala:      null,   // referência Firebase da sala activa
  salaId:    null,
  salaData:  null,   // snapshot da sala lido no momento de entrar
  isHost:    false,
  listeners: [],
  gameTimer: null,
  answered:  false,
};

// ─── HELPERS BÁSICOS ──────────────────────────────────────────
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
  else console.log('[MP Toast]', msg);
}

function mpShuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mpAvatar(name) {
  return (name || '?')[0].toUpperCase();
}

const SVG = {
  star:     `<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:var(--gold,#F59E0B);vertical-align:middle"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  play:     `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:5px"><path d="M8 5v14l11-7z"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>`,
  close:    `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>`,
  trophy:   `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.86 10.4 5 9.3 5 8zm14 0c0 1.3-.86 2.4-2 2.82V7h2v1z"/></svg>`,
  people:   `<svg viewBox="0 0 24 24" style="width:16px;height:16px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`,
  bolt:     `<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg>`,
  clock:    `<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M19.14,12.94c0.04-0.3,0.06-0.61,0.06-0.94c0-0.32-0.02-0.64-0.07-0.94l2.03-1.58c0.18-0.14,0.23-0.41,0.12-0.61 l-1.92-3.32c-0.12-0.22-0.37-0.29-0.59-0.22l-2.39,0.96c-0.5-0.38-1.03-0.7-1.62-0.94L14.4,2.81c-0.04-0.24-0.24-0.41-0.48-0.41 h-3.84c-0.24,0-0.43,0.17-0.47,0.41L9.25,5.35C8.66,5.59,8.12,5.92,7.63,6.29L5.24,5.33c-0.22-0.08-0.47,0-0.59,0.22L2.74,8.87 C2.62,9.08,2.66,9.34,2.86,9.48l2.03,1.58C4.84,11.36,4.8,11.69,4.8,12s0.02,0.64,0.07,0.94l-2.03,1.58 c-0.18,0.14-0.23,0.41-0.12,0.61l1.92,3.32c0.12,0.22,0.37,0.29,0.59,0.22l2.39-0.96c0.5,0.38,1.03,0.7,1.62,0.94l0.36,2.54 c0.05,0.24,0.24,0.41,0.48,0.41h3.84c0.24,0,0.44-0.17,0.47-0.41l0.36-2.54c0.59-0.24,1.13-0.56,1.62-0.94l2.39,0.96 c0.22,0.08,0.47,0,0.59-0.22l1.92-3.32c0.12-0.22,0.07-0.47-0.12-0.61L19.14,12.94z M12,15.6c-1.98,0-3.6-1.62-3.6-3.6 s1.62-3.6,3.6-3.6s3.6,1.62,3.6,3.6S13.98,15.6,12,15.6z"/></svg>`,
  back:     `<svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:currentColor;vertical-align:middle"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>`,
  lock:     `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>`,
  delete:   `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
};

// ─── LISTENERS FIREBASE ───────────────────────────────────────
function mpListen(ref, ev, fn) {
  ref.on(ev, fn);
  MP.listeners.push({ ref, ev, fn });
}
function mpUnlisten() {
  MP.listeners.forEach(({ ref, ev, fn }) => ref.off(ev, fn));
  MP.listeners = [];
}

// ─── OBTER PERFIL DO UTILIZADOR ───────────────────────────────
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

// ─── GUARDAR ESTRELAS ─────────────────────────────────────────
async function mpAddStars(uid, n) {
  if (!uid || n <= 0) return;
  db.ref(`users/${uid}/stats`).transaction(s => {
    if (!s) s = { stars: 0, games: 0 };
    s.stars = (s.stars || 0) + n;
    s.games = (s.games || 0) + 1;
    return s;
  }).catch(() => {});
}

// ─── PREENCHER DISCIPLINAS E CATEGORIAS ──────────────────────
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

// ─── CARREGAR PERGUNTAS ───────────────────────────────────────
async function mpCarregarPerguntas(cfg) {
  const disc  = cfg.disc  || cfg.disciplina || '';
  const cat   = cfg.cat   || cfg.categoria  || '';
  const nivel = cfg.nivel || 'todos';
  const tipo  = cfg.tipo  || 'todos';
  const qtd   = cfg.qtd   || 10;

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

  // Fallback: se filtros deixam menos perguntas que o qtd pedido, usar pool completo da disc
  if (filtered.length < qtd && pool.length >= qtd) filtered = pool;
  if (filtered.length === 0) filtered = pool;

  return mpShuffle(filtered).slice(0, qtd);
}

// ═══════════════════════════════════════════════════════════════
// FLUXO PRINCIPAL
// ═══════════════════════════════════════════════════════════════

// ─── 1. ENTRAR NO HUB MULTIPLAYER ─────────────────────────────
async function mpInit() {
  const me = await mpGetMe();
  if (!me) { mpToast('Inicia sessão para aceder ao Multiplayer.'); return; }

  mpScreen('screen-multiplayer');
  mpUnlisten();

  // Actualizar estrelas no header
  const starsEl = mpEl('mpUserStars');
  if (starsEl) starsEl.textContent = me.stars;

  mpHubLoad();
}

// ─── 2. CARREGAR HUB (desafios + histórico + ranking) ─────────
function mpHubLoad() {
  mpLoadDesafios();
  mpLoadHistorico();
  mpLoadRanking();
  mpFillDisciplinas('mpCfgDisc');

  // Montar eventos dos botões de pesquisa do painel "Novo Desafio"
  mpMontarEventosPainelDesafio();

  // Tabs — o HTML usa class="mp-tab" data-tab="X"
  // e os painéis têm id="mp-panel-X"
  const hubScreen = mpEl('screen-multiplayer');
  if (!hubScreen) return;
  hubScreen.querySelectorAll('.mp-tab').forEach(tab => {
    tab.onclick = () => {
      hubScreen.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
      hubScreen.querySelectorAll('.mp-tab-content').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      const panel = mpEl('mp-panel-' + tab.dataset.tab);
      if (panel) panel.classList.add('active');
    };
  });
}

// ─── MONTAR EVENTOS DO PAINEL DE NOVO DESAFIO ────────────────
function mpMontarEventosPainelDesafio() {
  // Só montar uma vez
  const btnSearch = mpEl('mpCfgSearchBtn');
  const btnEnviar = mpEl('mpCfgEnviar');
  const selDisc   = mpEl('mpCfgDisc');
  const inputSearch = mpEl('mpCfgSearch');

  if (btnSearch && !btnSearch.dataset.mpBound) {
    btnSearch.dataset.mpBound = '1';
    btnSearch.addEventListener('click', () => {
      const q = (mpEl('mpCfgSearch')?.value || '').trim();
      mpBuscarJogador(q, results => {
        const res = mpEl('mpCfgSearchRes');
        if (!res) return;
        if (!results.length) { res.innerHTML = `<div class="mp-empty" style="padding:8px">Nenhum jogador encontrado</div>`; return; }
        res.innerHTML = results.slice(0, 6).map(u => `
          <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;cursor:pointer;border:1px solid var(--border,rgba(255,255,255,0.06));margin-bottom:6px">
            <div class="mp-rank-av">${u.photo ? `<img src="${u.photo}" style="width:32px;height:32px;border-radius:50%;object-fit:cover">` : mpAvatar(u.name)}</div>
            <div style="flex:1">
              <div style="font-weight:600;color:var(--text,#F1F5F9);font-size:0.88rem">${u.name}</div>
              <div style="color:var(--text2,#94A3B8);font-size:0.75rem">${u.email}</div>
            </div>
            <button class="mp-btn-select" data-uid="${u.uid}" data-name="${u.name}" style="font-size:0.78rem;padding:6px 12px;border-radius:8px;background:var(--primary,#6366F1);color:#fff;border:none;cursor:pointer">Selec.</button>
          </div>`).join('');
        res.querySelectorAll('.mp-btn-select').forEach(b => {
          b.addEventListener('click', () => {
            mpEl('mpCfgTargetUid').value  = b.dataset.uid;
            mpEl('mpCfgTargetName').value = b.dataset.name;
            mpEl('mpCfgSearch').value     = b.dataset.name;
            res.innerHTML = `<div style="color:#22C55E;font-size:0.82rem;padding:4px 2px">${SVG.check}${b.dataset.name} seleccionado</div>`;
          });
        });
      });
    });
  }

  if (inputSearch && !inputSearch.dataset.mpBound) {
    inputSearch.dataset.mpBound = '1';
    inputSearch.addEventListener('keydown', e => { if (e.key === 'Enter') mpEl('mpCfgSearchBtn')?.click(); });
  }

  if (selDisc && !selDisc.dataset.mpBound) {
    selDisc.dataset.mpBound = '1';
    selDisc.addEventListener('change', e => mpFillCategorias(e.target.value, 'mpCfgCat'));
  }

  if (btnEnviar && !btnEnviar.dataset.mpBound) {
    btnEnviar.dataset.mpBound = '1';
    btnEnviar.addEventListener('click', mpEnviarDesafio);
  }
}

// ─── DESAFIOS RECEBIDOS ───────────────────────────────────────
function mpLoadDesafios() {
  const me = MP.me;
  if (!me) return;
  const el = mpEl('mp-desafios-lista');
  if (!el) return;

  el.innerHTML = `<div class="mp-loading">A carregar...</div>`;

  db.ref('mp_desafios')
    .orderByChild('targetUid').equalTo(me.uid)
    .once('value', snap => {
      const lista = [];
      snap.forEach(c => {
        const d = c.val();
        if (d.status === 'pending') lista.push({ ...d, _key: c.key });
      });

      if (!lista.length) {
        el.innerHTML = `<div class="mp-empty">Sem desafios pendentes</div>`;
        return;
      }

      el.innerHTML = lista.map(d => `
        <div class="mp-desafio-card" data-key="${d._key}">
          <div class="mp-dc-avatar">${mpAvatar(d.fromName)}</div>
          <div class="mp-dc-info">
            <div class="mp-dc-nome">${d.fromName || 'Jogador'} desafia-te</div>
            <div class="mp-dc-meta">
              ${d.disciplina || 'Geral'} &middot; ${d.nivel || 'Todos'} &middot; ${d.qtd || 10} perguntas
            </div>
          </div>
          <div class="mp-dc-acoes">
            <button class="mp-btn-aceitar" data-key="${d._key}" data-sala="${d.salaId}">${SVG.check}Aceitar</button>
            <button class="mp-btn-recusar" data-key="${d._key}">${SVG.close}Recusar</button>
          </div>
        </div>`).join('');

      el.querySelectorAll('.mp-btn-aceitar').forEach(b =>
        b.addEventListener('click', () => mpAceitarDesafio(b.dataset.key, b.dataset.sala)));
      el.querySelectorAll('.mp-btn-recusar').forEach(b =>
        b.addEventListener('click', () => mpRecusarDesafio(b.dataset.key)));
    });
}

// ─── HISTÓRICO DE JOGOS ───────────────────────────────────────
function mpLoadHistorico() {
  const el = mpEl('mp-historico-lista');
  if (!el) return;
  el.innerHTML = `<div class="mp-loading">A carregar...</div>`;

  db.ref('mp_salas')
    .orderByChild('status').equalTo('finished')
    .limitToLast(30)
    .once('value', snap => {
      const jogos = [];
      snap.forEach(c => {
        const s = c.val();
        const players = Object.values(s.players || {});
        const myUid = MP.me?.uid;
        if (!players.find(p => p.uid === myUid)) return; // só jogos em que participei ou qualquer (mostrar todos)
        jogos.push({ ...s, _key: c.key });
      });

      // Mostrar todos os jogos terminados (historico global)
      const todos = [];
      snap.forEach(c => todos.push({ ...c.val(), _key: c.key }));

      if (!todos.length) {
        el.innerHTML = `<div class="mp-empty">Sem jogos no histórico</div>`;
        return;
      }

      el.innerHTML = todos.reverse().map(s => {
        const players = Object.values(s.players || {});
        const scores  = s.scores || {};
        const ranked  = players.map(p => ({
          name: p.name,
          pts: (scores[p.uid] && scores[p.uid].total) || 0,
        })).sort((a, b) => b.pts - a.pts);

        return `
          <div class="mp-hist-card">
            <div class="mp-hist-sala">Sala #${s.roomNum || '?'} &middot; ${s.disc || s.disciplina || 'Geral'}</div>
            <div class="mp-hist-players">
              ${ranked.map((p, i) => `
                <span class="mp-hist-player ${i === 0 ? 'winner' : ''}">
                  ${i === 0 ? SVG.trophy : ''}${p.name}: ${p.pts} pts
                </span>`).join('')}
            </div>
          </div>`;
      }).join('');
    });
}

// ─── RANKING GLOBAL ───────────────────────────────────────────
function mpLoadRanking() {
  const el = mpEl('mp-ranking-lista');
  if (!el) return;
  el.innerHTML = `<div class="mp-loading">A carregar ranking...</div>`;

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
      el.innerHTML = `<div class="mp-empty">Ranking sem dados ainda</div>`;
      return;
    }

    const me = MP.me;
    el.innerHTML = lista.slice(0, 50).map((p, i) => `
      <div class="mp-rank-row ${p.uid === me?.uid ? 'mp-rank-me' : ''} ${i < 3 ? 'mp-rank-top' + i : ''}">
        <span class="mp-rank-pos">${i + 1}.</span>
        <span class="mp-rank-av">${p.photo ? `<img src="${p.photo}" style="width:28px;height:28px;border-radius:50%;object-fit:cover">` : mpAvatar(p.name)}</span>
        <span class="mp-rank-name">${p.name}</span>
        <span class="mp-rank-pts">${SVG.star} ${p.stars}</span>
      </div>`).join('');
  });
}

// ═══════════════════════════════════════════════════════════════
// ENVIAR DESAFIO
// ═══════════════════════════════════════════════════════════════

// ─── PESQUISA DE JOGADORES ────────────────────────────────────
function mpBuscarJogador(query, onResults) {
  if (!query || query.length < 2) { mpToast('Escreve pelo menos 2 letras.'); return; }
  const q = query.trim().toLowerCase();
  db.ref('users').once('value', snap => {
    const results = [];
    const me = MP.me;
    snap.forEach(c => {
      const u = c.val();
      if (c.key === me?.uid) return;
      const name  = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.nome || '';
      const email = (u.email || '').toLowerCase();
      if (name.toLowerCase().includes(q) || email.includes(q)) {
        results.push({ uid: c.key, name: name || email, email: u.email || '', photo: u.photoURL || '' });
      }
    });
    onResults(results);
  });
}

// ─── ABRIR TAB DE NOVO DESAFIO (substituiu o painel flutuante) ─
function mpAbrirEnviarDesafio() {
  // Activar a tab "novoDesafio" no hub
  const hub = mpEl('screen-multiplayer');
  if (!hub) return;
  hub.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
  hub.querySelectorAll('.mp-tab-content').forEach(p => p.classList.remove('active'));
  const tabBtn = hub.querySelector('.mp-tab[data-tab="novoDesafio"]');
  if (tabBtn) tabBtn.classList.add('active');
  const panel = mpEl('mp-panel-novoDesafio');
  if (panel) panel.classList.add('active');
  mpFillDisciplinas('mpCfgDisc');
}

// ─── ENVIAR DESAFIO ───────────────────────────────────────────
async function mpEnviarDesafio() {
  const me = MP.me;
  if (!me) { mpToast('Sessão necessária'); return; }

  const targetUid  = mpEl('mpCfgTargetUid')?.value?.trim();
  const targetName = mpEl('mpCfgTargetName')?.value?.trim() || 'Adversário';
  if (!targetUid)  { mpToast('Selecciona um jogador para desafiar.'); return; }

  const disc   = mpEl('mpCfgDisc')?.value  || '';
  const cat    = mpEl('mpCfgCat')?.value   || '';
  const nivel  = mpEl('mpCfgNivel')?.value || 'todos';
  const tempo  = parseInt(mpEl('mpCfgTempo')?.value) || 30;
  const qtd    = parseInt(mpEl('mpCfgQtd')?.value)   || 10;
  const maxP   = parseInt(mpEl('mpCfgMaxP')?.value)   || 2;

  // Criar sala com configurações base (o host configura o resto na sala)
  const salaData = {
    roomNum:    Math.floor(1000 + Math.random() * 9000),
    status:     'waiting',
    host:       me.uid,
    invitedUid: targetUid,
    disc, cat, nivel,
    tipo:       'todos',
    modoJogo:   'aprendizado',
    modoPerg:   'realtime',
    tempo, qtd,
    maxplayers: maxP,
    players:    { [me.uid]: { uid: me.uid, name: me.name, stars: me.stars, score: 0 } },
    scores:     {},
    liveAnswers:{},
    createdAt:  firebase.database.ServerValue.TIMESTAMP,
  };

  const salaRef = await db.ref('mp_salas').push(salaData);

  await db.ref('mp_desafios').push({
    fromUid: me.uid, fromName: me.name,
    targetUid, targetName,
    salaId:     salaRef.key,
    disciplina: disc, categoria: cat,
    nivel, qtd, tempo, maxplayers: maxP,
    status:     'pending',
    createdAt:  firebase.database.ServerValue.TIMESTAMP,
  });

  mpToast(`Desafio enviado para ${targetName}!`);

  // Entrar na sala imediatamente
  await mpEntrarSala(salaRef.key, salaData);
}

// ─── ACEITAR / RECUSAR ────────────────────────────────────────
async function mpAceitarDesafio(key, salaId) {
  await db.ref(`mp_desafios/${key}`).update({ status: 'accepted' });
  await mpEntrarSala(salaId, null);
}

async function mpRecusarDesafio(key) {
  await db.ref(`mp_desafios/${key}`).update({ status: 'declined' });
  mpToast('Desafio recusado.');
  mpLoadDesafios();
}

// ═══════════════════════════════════════════════════════════════
// SALA DE ESPERA
// ═══════════════════════════════════════════════════════════════

async function mpEntrarSala(salaId, salaDataOuNull) {
  const me = await mpGetMe();
  if (!me) return;

  mpUnlisten();
  MP.salaId  = salaId;
  MP.sala    = db.ref(`mp_salas/${salaId}`);

  // PASSO 1: escrever o jogador no Firebase PRIMEIRO
  await MP.sala.child('players').child(me.uid).set({
    uid: me.uid, name: me.name, stars: me.stars, score: 0,
  });

  // PASSO 2: ler snapshot actual (já tem ambos os jogadores)
  const snap = await MP.sala.once('value');
  const sala = snap.val();
  if (!sala) { mpToast('Sala não encontrada.'); return; }

  MP.salaData = sala;
  MP.isHost   = sala.host === me.uid;

  // PASSO 3: mostrar ecrã de sala
  mpMostrarSalaEspera(sala);
}

function mpMostrarSalaEspera(sala) {
  // Construir ecrã de espera inline no screen-mp-sala
  const screen = mpEl('screen-mp-sala');
  if (!screen) return;

  mpQA('.screen').forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
  window.scrollTo(0, 0);

  const players      = Object.values(sala.players || {});
  const me           = MP.me;
  const isHost       = MP.isHost;
  const maxP         = sala.maxplayers || 2;

  screen.innerHTML = `
    <div class="page-header mp-header">
      <button id="mpSalaBackBtn" class="btn-icon">${SVG.back}</button>
      <div>
        <div class="mp-header-title">Sala #${sala.roomNum || '?'}</div>
        <div class="mp-header-sub" id="mpSalaModeLabel">
          ${sala.modoPerg === 'realtime' ? SVG.bolt + 'Tempo Real' : SVG.clock + 'Assíncrono'}
        </div>
      </div>
      <div class="mp-header-actions">
        ${isHost ? `<button id="mpSalaDeleteBtn" class="btn-icon btn-danger-soft">${SVG.delete}</button>` : ''}
        <div id="mpSalaTimer" class="mp-timer-chip">--</div>
      </div>
    </div>

    <div id="mpScoreboard" class="mp-scoreboard"></div>

    <!-- ZONA DE ESPERA -->
    <div id="mpZonaEspera">
      <div class="mp-espera-icon">${SVG.people}</div>
      <div class="mp-espera-txt">Aguardando jogadores...</div>
      <div id="mpPlayersGrid" class="mp-players-grid"></div>
      <button id="mpBtnIniciar" class="mp-btn-iniciar" style="display:none" disabled>
        ${SVG.settings}Configurar e Iniciar
      </button>
    </div>

    <!-- ZONA DE CONFIGURAÇÃO (aparece após todos na sala, antes do jogo) -->
    <div id="mpZonaCfg" style="display:none">
      <div class="mp-cfg-titulo">${SVG.settings}Configurar o Jogo</div>

      <label class="mp-cfg-label">Modo de Resposta</label>
      <div class="mp-cfg-row">
        <select id="mpGameModoPerg" class="mp-select">
          <option value="realtime">Tempo Real (simultâneo)</option>
          <option value="async">Assíncrono (por turnos)</option>
        </select>
      </div>

      <label class="mp-cfg-label">Modo de Jogo</label>
      <div class="mp-cfg-row">
        <select id="mpGameModo" class="mp-select">
          <option value="aprendizado">Aprendizado</option>
          <option value="prova">Prova</option>
          <option value="concurso">Concurso</option>
          <option value="imagem">Imagem</option>
        </select>
      </div>

      <label class="mp-cfg-label">Tipo de Perguntas</label>
      <div class="mp-cfg-row">
        <select id="mpGameTipo" class="mp-select">
          <option value="todos">Todos os Tipos</option>
          <option value="multipla">Múltipla Escolha</option>
          <option value="vf">Verdadeiro / Falso</option>
          <option value="lacunas">Preencher Lacunas</option>
          <option value="multipla_img">Com Imagem</option>
        </select>
      </div>

      <label class="mp-cfg-label">Disciplina</label>
      <div class="mp-cfg-row">
        <select id="mpGameDisc" class="mp-select">
          <option value="">Todas as Disciplinas</option>
        </select>
      </div>

      <label class="mp-cfg-label">Categoria</label>
      <div class="mp-cfg-row">
        <select id="mpGameCat" class="mp-select">
          <option value="">Todas as Categorias</option>
        </select>
      </div>

      <label class="mp-cfg-label">Nível</label>
      <div class="mp-cfg-row">
        <select id="mpGameNivel" class="mp-select">
          <option value="todos">Todos</option>
          <option value="facil">Fácil</option>
          <option value="medio">Médio</option>
          <option value="dificil">Difícil</option>
        </select>
      </div>

      <label class="mp-cfg-label">Número de Perguntas</label>
      <div class="mp-cfg-row">
        <input id="mpGameQtd" type="number" class="mp-input" min="1" max="50" value="${sala.qtd || 10}">
      </div>

      <label class="mp-cfg-label">Tempo por Pergunta (seg, 0 = ilimitado)</label>
      <div class="mp-cfg-row">
        <input id="mpGameTempo" type="number" class="mp-input" min="0" max="300" value="${sala.tempo || 30}">
      </div>

      <button id="mpBtnLancar" class="mp-btn-primary">${SVG.play}Lançar Jogo</button>
      <button id="mpBtnCfgCancel" class="mp-btn-secondary" style="margin-top:8px">Voltar à Espera</button>
    </div>

    <!-- ZONA DE JOGO -->
    <div id="mpZonaJogo" style="display:none">
      <div id="mpQHeader" class="mp-q-header"></div>
      <div id="mpQCard" class="question-card"></div>
      <div id="mpQAnswers" class="answers-grid"></div>
      <div id="mpLiveFeed" class="mp-live-feed"></div>
    </div>

    <!-- ZONA DE RESULTADOS -->
    <div id="mpZonaResultados" style="display:none">
      <div id="mpResultContent"></div>
      <button id="mpBtnVoltarHub" class="mp-btn-primary" style="margin-top:16px">${SVG.back}Voltar ao Menu</button>
    </div>
  `;

  // Preencher disciplinas no form de configuração
  mpFillDisciplinas('mpGameDisc');
  mpEl('mpGameDisc').addEventListener('change', e => mpFillCategorias(e.target.value, 'mpGameCat'));

  // Pre-seleccionar valores da sala
  if (sala.modoPerg) mpEl('mpGameModoPerg').value = sala.modoPerg;
  if (sala.modoJogo) mpEl('mpGameModo').value     = sala.modoJogo;
  if (sala.tipo)     mpEl('mpGameTipo').value      = sala.tipo;
  if (sala.nivel)    mpEl('mpGameNivel').value     = sala.nivel;

  // Renderizar grid de jogadores imediatamente
  mpRenderGrid(players, maxP);
  mpRenderScoreboard(players);

  // Botão voltar
  mpEl('mpSalaBackBtn').addEventListener('click', () => {
    mpUnlisten();
    mpInit();
  });

  // Botão eliminar sala (só host)
  const delBtn = mpEl('mpSalaDeleteBtn');
  if (delBtn) delBtn.addEventListener('click', () => mpEliminarSalaAtual());

  // Botão iniciar (só host — abre configuração)
  const btnIniciar = mpEl('mpBtnIniciar');
  btnIniciar.addEventListener('click', () => {
    mpEl('mpZonaEspera').style.display = 'none';
    mpEl('mpZonaCfg').style.display    = 'block';
  });

  // Botão cancelar configuração
  mpEl('mpBtnCfgCancel').addEventListener('click', () => {
    mpEl('mpZonaCfg').style.display    = 'none';
    mpEl('mpZonaEspera').style.display = 'block';
  });

  // Botão lançar jogo
  mpEl('mpBtnLancar').addEventListener('click', () => mpLancarJogo());

  // Activar botão se já há jogadores suficientes
  mpAtualizarBtnIniciar(players, maxP);

  // Montar listeners Firebase
  mpMontarListeners();
}

// ─── RENDER GRID DE JOGADORES ────────────────────────────────
function mpRenderGrid(players, maxP) {
  const grid = mpEl('mpPlayersGrid');
  if (!grid) return;
  const me = MP.me;
  const sorted = [
    ...players.filter(p => p.uid === me?.uid),
    ...players.filter(p => p.uid !== me?.uid),
  ];
  grid.innerHTML = Array.from({ length: maxP }, (_, i) => {
    const p = sorted[i];
    if (p) {
      const isMe = p.uid === me?.uid;
      return `<div class="mp-slot filled ${isMe ? 'me' : ''}">
        <div class="mp-slot-av">${mpAvatar(p.name)}</div>
        <div class="mp-slot-name">${p.name}${isMe ? ' (tu)' : ''}</div>
        <div class="mp-slot-stars">${SVG.star} ${p.stars || 0}</div>
      </div>`;
    }
    return `<div class="mp-slot empty">
      <div class="mp-slot-av" style="opacity:.3">
        <svg viewBox="0 0 24 24" style="width:1.3rem;height:1.3rem;fill:currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
      </div>
      <div class="mp-slot-name" style="opacity:.4">Aguardando...</div>
    </div>`;
  }).join('');
}

// ─── SCOREBOARD ───────────────────────────────────────────────
function mpRenderScoreboard(players) {
  const sb = mpEl('mpScoreboard');
  if (!sb) return;
  sb.innerHTML = players.map(p =>
    `<div class="mp-score-chip" data-uid="${p.uid}">
      <div class="mp-sc-name">${p.name.split(' ')[0]}</div>
      <div class="mp-sc-pts">${p.score || 0}</div>
      <div class="mp-sc-ind"></div>
    </div>`
  ).join('');
}

function mpAtualizarBtnIniciar(players, maxP) {
  const btn = mpEl('mpBtnIniciar');
  if (!btn || !MP.isHost) return;
  const sala = MP.salaData || {};
  if (players.length >= maxP || players.length >= 2) {
    btn.style.display = 'inline-flex';
    btn.disabled      = false;
    const adv = players.find(p => p.uid !== MP.me?.uid);
    const nome = adv ? adv.name.split(' ')[0] : 'Adversário';
    btn.innerHTML = `${SVG.settings}${nome} entrou! Configurar e Iniciar`;
    // Toast apenas uma vez
    if (!btn.dataset.toasted) {
      btn.dataset.toasted = '1';
      mpToast(`${nome} aceitou o desafio!`);
    }
  }
}

// ─── LISTENERS DA SALA ────────────────────────────────────────
function mpMontarListeners() {
  const sala   = MP.sala;
  const salaId = MP.salaId;

  // Players: actualizar grid sempre
  mpListen(sala.child('players'), 'value', snap => {
    const players = [];
    snap.forEach(c => players.push(c.val()));
    const maxP = MP.salaData?.maxplayers || 2;
    mpRenderGrid(players, maxP);
    mpRenderScoreboard(players);
    mpAtualizarBtnIniciar(players, maxP);
  });

  // Status: controlar transições de ecrã
  mpListen(sala.child('status'), 'value', snap => {
    const status = snap.val();
    if (!status) return;
    if (status === 'countdown') mpMostrarContagem();
    if (status === 'playing')   mpMostrarJogo();
    if (status === 'finished')  mpMostrarResultados();
  });

  // Pergunta actual
  mpListen(sala.child('currentRound'), 'value', snap => {
    const round = snap.val();
    if (!round) return;
    const zonaJogo = mpEl('mpZonaJogo');
    if (zonaJogo && zonaJogo.style.display !== 'none') mpRenderPergunta(round);
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
// LANÇAR JOGO
// ═══════════════════════════════════════════════════════════════

async function mpLancarJogo() {
  if (!MP.isHost) return;
  const btn = mpEl('mpBtnLancar');
  if (btn) { btn.disabled = true; btn.textContent = 'A preparar...'; }

  // Ler configuração do formulário
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
    mpToast('Sem perguntas disponíveis com estes filtros.');
    if (btn) { btn.disabled = false; btn.innerHTML = SVG.play + 'Lançar Jogo'; }
    return;
  }

  const snap    = await MP.sala.once('value');
  const sala    = snap.val();
  const players = Object.values(sala.players || {});
  const turnOrder = mpShuffle(players.map(p => p.uid));

  // Guardar configuração final e lista de perguntas na sala
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
  // O listener de status vai receber 'countdown' e iniciar a contagem em todos os dispositivos
}

// ─── CONTAGEM REGRESSIVA ──────────────────────────────────────
let _mpCountdown = null;
function mpMostrarContagem() {
  const old = mpEl('mp-countdown-overlay');
  if (old) old.remove();
  if (_mpCountdown) { clearInterval(_mpCountdown); _mpCountdown = null; }

  const ov = document.createElement('div');
  ov.id = 'mp-countdown-overlay';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.88);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  ov.innerHTML = `
    <div style="color:rgba(255,255,255,0.7);font-size:1rem;font-weight:600;margin-bottom:16px">O jogo começa em</div>
    <div id="mpCountNum" style="font-size:7rem;font-weight:900;color:#fff;line-height:1;transition:transform 0.15s;text-shadow:0 0 50px rgba(99,102,241,0.9)">10</div>
    <div style="color:rgba(255,255,255,0.4);font-size:0.9rem;margin-top:20px">Prepara-te!</div>
  `;
  document.body.appendChild(ov);

  let n = 10;
  _mpCountdown = setInterval(async () => {
    n--;
    const el = mpEl('mpCountNum');
    if (el) {
      el.textContent = n;
      el.style.transform = 'scale(1.35)';
      setTimeout(() => { if (el) el.style.transform = 'scale(1)'; }, 140);
    }
    if (n <= 0) {
      clearInterval(_mpCountdown); _mpCountdown = null;
      ov.remove();
      // Só o host escreve 'playing' e emite a 1ª pergunta
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
function mpMostrarJogo() {
  const ze = mpEl('mpZonaEspera');
  const zc = mpEl('mpZonaCfg');
  const zj = mpEl('mpZonaJogo');
  const zr = mpEl('mpZonaResultados');
  if (ze) ze.style.display = 'none';
  if (zc) zc.style.display = 'none';
  if (zj) zj.style.display = 'block';
  if (zr) zr.style.display = 'none';
}

// ─── EMITIR PERGUNTA (HOST) ───────────────────────────────────
async function mpEmitirPergunta(index, salaData) {
  if (!MP.isHost) return;
  const questions  = salaData.questions || [];
  const turnOrder  = salaData.turnOrder  || [];
  const modoPerg   = salaData.modoPerg   || 'realtime';
  const q          = questions[index];
  if (!q) return;

  const playerTurn = turnOrder[index % turnOrder.length];
  const tipo       = q.answerType || q.tipo || q.type || 'multipla';

  // Construir resposta correcta
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
    // múltipla escolha
    const letter = String(q.answer || '').trim().toLowerCase();
    if (letter.length === 1 && q[letter]) {
      correct = q[letter];
    } else {
      correct = q.correta || q.resposta_certa || q.a || '';
    }
    answers = [q.a, q.b, q.c, q.d].filter(Boolean);
    if (!answers.length) answers = [q.answer1, q.answer2, q.answer3, q.answer4].filter(Boolean);
  }

  const round = {
    index,
    total:       questions.length,
    question:    questionText,
    tipo,
    answers:     tipo === 'vf' ? answers : mpShuffle(answers),
    correct,
    imageURL:    q.imageURL || q.questionImg || '',
    playerTurn,
    modoPerg,
    tempo:       salaData.tempo || 0,
  };

  await MP.sala.child('liveAnswers').remove();
  await MP.sala.child('currentRound').set(round);
  await MP.sala.child('currentQIndex').set(index);
}

// ─── RENDERIZAR PERGUNTA ──────────────────────────────────────
function mpRenderPergunta(round) {
  const qCard    = mpEl('mpQCard');
  const qAnswers = mpEl('mpQAnswers');
  const qHeader  = mpEl('mpQHeader');
  if (!qCard || !qAnswers) return;

  MP.answered = false;
  const me       = MP.me;
  const isMyTurn = round.modoPerg === 'realtime' || round.playerTurn === me?.uid;

  if (qHeader) {
    qHeader.innerHTML = `
      <span class="mp-q-count">${round.index + 1}/${round.total}</span>
      <span class="mp-q-turn ${isMyTurn ? 'my-turn' : 'wait-turn'}">
        ${isMyTurn
          ? `${SVG.play}A tua vez!`
          : `${SVG.lock}Aguarda...`}
      </span>
    `;
  }

  // Imagem
  let imgHtml = '';
  if (round.imageURL) {
    imgHtml = `<img src="${round.imageURL}" alt="" style="max-width:100%;border-radius:10px;margin-bottom:10px;display:block">`;
  }

  qCard.innerHTML = `${imgHtml}<div class="question-text">${round.question}</div>`;

  // Respostas
  if (!isMyTurn) {
    qAnswers.innerHTML = `<div class="mp-blocked">${SVG.lock}Aguarda a tua vez de responder</div>`;
  } else if (round.tipo === 'lacunas' || round.tipo === 'flashcard') {
    qAnswers.innerHTML = `
      <div class="mp-lacuna-wrap">
        <input type="text" id="mpLacunaIn" class="mp-input" placeholder="A tua resposta..." autocomplete="off">
        <button class="mp-btn-primary" id="mpLacunaBtn">${SVG.check}Confirmar</button>
      </div>`;
    mpEl('mpLacunaBtn').addEventListener('click', () => {
      const v = (mpEl('mpLacunaIn').value || '').trim();
      if (v) mpResponder(v, round);
    });
    mpEl('mpLacunaIn').addEventListener('keydown', e => {
      if (e.key === 'Enter') mpEl('mpLacunaBtn').click();
    });
    setTimeout(() => mpEl('mpLacunaIn')?.focus(), 80);
  } else {
    qAnswers.innerHTML = round.answers.map((a, i) =>
      `<button class="answer-btn" data-val="${encodeURIComponent(a)}" data-idx="${i}">${a}</button>`
    ).join('');
    qAnswers.querySelectorAll('.answer-btn').forEach(b =>
      b.addEventListener('click', () => mpResponder(decodeURIComponent(b.dataset.val), round))
    );
  }

  // Timer
  mpClearTimer();
  if (round.tempo > 0 && isMyTurn) mpStartTimer(round.tempo, round);
  else { const t = mpEl('mpSalaTimer'); if (t) t.textContent = round.tempo > 0 ? `${round.tempo}s` : '\u221e'; }
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

  // Feedback visual nas opções
  mpEl('mpQAnswers')?.querySelectorAll('.answer-btn').forEach(b => {
    b.disabled = true;
    if (norm(decodeURIComponent(b.dataset.val)) === norm(round.correct)) b.classList.add('correct');
    else if (norm(decodeURIComponent(b.dataset.val)) === norm(val))      b.classList.add('wrong');
  });

  await MP.sala.child(`liveAnswers/${me.uid}`).set({
    uid: me.uid, name: me.name, correct: ok, points: pts, answer: val,
    answeredAt: firebase.database.ServerValue.TIMESTAMP,
  });

  // Actualizar score
  const sc = (await MP.sala.child(`scores/${me.uid}`).once('value')).val() || { total: 0, answers: {} };
  sc.total = (sc.total || 0) + pts;
  sc.answers[round.index] = { correct: ok, points: pts };
  await MP.sala.child(`scores/${me.uid}`).set(sc);

  // Host verifica se todos responderam
  if (MP.isHost) {
    const snapSala = await MP.sala.once('value');
    mpVerificarAvanco(snapSala.val(), round);
  }
}

async function mpVerificarAvanco(salaData, round) {
  const players    = Object.values(salaData.players || {});
  const liveAns    = salaData.liveAnswers || {};
  const expected   = salaData.modoPerg === 'realtime' ? players.length : 1;
  if (Object.keys(liveAns).length < expected) return;

  const next = round.index + 1;
  const qs   = salaData.questions || [];

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
      if (!MP.answered) mpResponder('', round); // tempo esgotado = errou
    }
  }, 1000);
}

// ─── LIVE FEED ────────────────────────────────────────────────
function mpRenderLiveFeed(answers) {
  const el = mpEl('mpLiveFeed');
  if (!el) return;
  const items = Object.values(answers || {});
  if (!items.length) return;
  el.innerHTML = `
    <div class="mp-feed-title">
      <span style="width:8px;height:8px;border-radius:50%;background:#EF4444;display:inline-block;margin-right:6px"></span>
      Actividade em tempo real
    </div>` +
    items.map(a => `
      <div class="mp-feed-item">
        <span class="mp-feed-dot ${a.correct ? 'ok' : 'err'}"></span>
        <span class="mp-feed-msg">
          <strong>${a.name}</strong>
          ${a.correct ? SVG.check + 'acertou' : SVG.close + 'errou'}
          <span style="opacity:.6">(${a.points || 0} pts)</span>
        </span>
      </div>`).join('');
}

function mpAtualizarChips(answers) {
  mpQA('.mp-score-chip').forEach(chip => {
    chip.classList.remove('answered-right', 'answered-wrong');
    const uid = chip.dataset.uid;
    if (answers[uid]) chip.classList.add(answers[uid].correct ? 'answered-right' : 'answered-wrong');
  });
}

// ─── RESULTADOS ───────────────────────────────────────────────
async function mpMostrarResultados() {
  mpClearTimer();
  const ze = mpEl('mpZonaEspera');
  const zj = mpEl('mpZonaJogo');
  const zr = mpEl('mpZonaResultados');
  if (ze) ze.style.display = 'none';
  if (zj) zj.style.display = 'none';
  if (zr) zr.style.display = 'block';

  const snap    = await MP.sala.once('value');
  const data    = snap.val();
  const players = Object.values(data.players || {});
  const scores  = data.scores || {};
  const me      = MP.me;

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

  const medals   = ['1.', '2.', '3.'];
  const qtd      = data.qtd || 10;
  const perQ     = qtd > 0 ? 20 / qtd : 1;

  const rc = mpEl('mpResultContent');
  if (rc) rc.innerHTML = `
    <div class="mp-result-titulo">${SVG.trophy}Resultados Finais</div>
    <div class="mp-result-sala">Sala #${data.roomNum || '?'} &middot; ${data.disc || 'Geral'}</div>
    <div class="mp-podium">
      ${ranked.slice(0, 3).map((p, i) => `
        <div class="mp-podium-item p${i + 1} ${p.uid === me?.uid ? 'me' : ''}">
          <div class="mp-pod-medal">${medals[i] || (i + 1) + '.'}</div>
          <div class="mp-pod-av">${mpAvatar(p.name)}</div>
          <div class="mp-pod-name">${p.name}</div>
          <div class="mp-pod-pts">${p.total} pts</div>
          <div class="mp-pod-nota">${(p.total * perQ / 10).toFixed(1)} val.</div>
        </div>`).join('')}
    </div>
    <table class="mp-result-table">
      <thead><tr><th>#</th><th>Jogador</th><th>Pts</th><th>Nota</th></tr></thead>
      <tbody>
        ${ranked.map((p, i) => `
          <tr class="${p.uid === me?.uid ? 'mp-my-row' : ''}">
            <td>${i + 1}</td>
            <td>${p.name}</td>
            <td>${p.total}</td>
            <td>${(p.total * perQ / 10).toFixed(1)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  mpEl('mpBtnVoltarHub')?.addEventListener('click', () => {
    mpUnlisten();
    mpInit();
  });
}

// ─── ELIMINAR SALA ────────────────────────────────────────────
async function mpEliminarSalaAtual() {
  if (!MP.isHost || !MP.salaId) return;
  mpConfirmDialog('Eliminar a sala? O desafio será cancelado.', async () => {
    const dSnap = await db.ref('mp_desafios')
      .orderByChild('salaId').equalTo(MP.salaId).once('value');
    const upd = {};
    dSnap.forEach(c => { upd[`mp_desafios/${c.key}/status`] = 'cancelled'; });
    if (Object.keys(upd).length) await db.ref().update(upd);
    await MP.sala.remove();
    mpUnlisten();
    mpToast('Sala eliminada.');
    mpInit();
  });
}

// ─── MODAL DE CONFIRMAÇÃO ────────────────────────────────────
function mpConfirmDialog(msg, onOk) {
  const old = mpEl('mp-confirm-modal');
  if (old) old.remove();
  const ov = document.createElement('div');
  ov.id = 'mp-confirm-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding-bottom:24px;';
  ov.innerHTML = `
    <div style="background:var(--card,#161D30);border-radius:20px;padding:24px 20px 12px;width:calc(100% - 32px);max-width:420px;box-shadow:0 -4px 40px rgba(0,0,0,0.3);">
      <div style="text-align:center;margin-bottom:18px">
        <div style="font-weight:700;font-size:1rem;color:var(--text,#F1F5F9);margin-bottom:8px">Confirmar</div>
        <div style="font-size:0.875rem;color:var(--text2,#94A3B8)">${msg}</div>
      </div>
      <button id="mpConfOk" style="width:100%;padding:14px;border-radius:12px;background:linear-gradient(135deg,#EF4444,#DC2626);color:#fff;border:none;font-weight:700;font-size:0.95rem;cursor:pointer;margin-bottom:8px;">Confirmar</button>
      <button id="mpConfCancel" style="width:100%;padding:12px;border-radius:12px;background:transparent;color:var(--text2,#94A3B8);border:none;font-size:0.9rem;cursor:pointer;font-weight:600;">Cancelar</button>
    </div>`;
  document.body.appendChild(ov);
  mpEl('mpConfOk').onclick     = () => { ov.remove(); onOk(); };
  mpEl('mpConfCancel').onclick  = () => ov.remove();
  ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
}

// ═══════════════════════════════════════════════════════════════
// LISTENER GLOBAL DE DESAFIOS (funciona em qualquer ecrã)
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
  const old = mpEl('mp-desafio-popup');
  if (old) old.remove();

  const popup = document.createElement('div');
  popup.id = 'mp-desafio-popup';
  popup.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--card,#161D30);border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.4);padding:16px 18px;z-index:9999;min-width:300px;max-width:90vw;border:1.5px solid var(--primary,#6366F1);';
  popup.innerHTML = `
    <div style="font-weight:700;font-size:0.95rem;color:var(--text,#F1F5F9);margin-bottom:4px">
      ${SVG.trophy}Novo Desafio!
    </div>
    <div style="font-size:0.85rem;color:var(--text2,#94A3B8);margin-bottom:12px">
      <strong style="color:var(--text,#F1F5F9)">${d.fromName || 'Jogador'}</strong>
      desafia-te em ${d.disciplina || 'Geral'} &middot; ${d.qtd || 10} perguntas
    </div>
    <div style="display:flex;gap:10px">
      <button id="mpPopupOk" style="flex:1;padding:10px;border-radius:10px;background:var(--primary,#6366F1);color:#fff;border:none;font-weight:600;cursor:pointer;font-size:0.85rem">${SVG.check}Aceitar</button>
      <button id="mpPopupNo" style="flex:1;padding:10px;border-radius:10px;background:transparent;color:var(--text2,#94A3B8);border:1px solid var(--border,rgba(255,255,255,0.08));font-weight:600;cursor:pointer;font-size:0.85rem">${SVG.close}Recusar</button>
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
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Botão principal Multiplayer
  const btnMain = mpEl('btnMultiplayer');
  if (btnMain) btnMain.addEventListener('click', mpInit);

  // Botão voltar do hub
  const backBtn = mpEl('mpBackBtn');
  if (backBtn) backBtn.addEventListener('click', () => {
    mpUnlisten();
    if (typeof showScreen === 'function') showScreen('screen-mainmenu');
  });

  // Auth listener — iniciar listener global de desafios
  firebase.auth().onAuthStateChanged(async user => {
    if (user) {
      await mpGetMe();
      const uid = MP.me?.uid || user.uid;
      mpIniciarListenerGlobalDesafios(uid);
    } else {
      MP.me    = null;
      MP.salaId = null;
      _globalDesafiosUid = null;
    }
  });
});
