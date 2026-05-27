/* ══════════════════════════════════════════════════════════
   BANDAQUIZ — multiplayer.js  v2.0
   Correcções: estrelas users/uid/stats.stars, modos de jogo,
   tipos de pergunta, campos editáveis, categorias, nível "Todos"
   ══════════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO MULTIPLAYER ────────────────────────────────────
const MP = {
  config: {
    modoJogo:   'aprendizado', // aprendizado | concurso | prova | imagem
    modoPerg:   'realtime',    // realtime | async
    nivel:      'todos',
    tipo:       'todos',       // depende do modoJogo
    tempo:      30,
    qtd:        10,
    maxplayers: 2,
    disciplina: '',
    categoria:  '',
    targetUid:  null,
    targetName: '',
  },
  sala:        null,
  salaId:      null,
  listeners:   [],
  myUid:       null,
  myProfile:   null,
  myStars:     0,
  questionTimer: null,
  currentQ:    null,
  answered:    false,
};

// ─── HELPERS ───────────────────────────────────────────────
function mpEl(id)  { return document.getElementById(id); }

function mpShowScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function mpAvatarLetter(name) {
  return (name || '?').charAt(0).toUpperCase();
}

function mpStarIcon() {
  return `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:var(--gold,#F59E0B);vertical-align:middle"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
}

function mpAddListener(ref, event, fn) {
  ref.on(event, fn);
  MP.listeners.push({ ref, event, fn });
}

function mpClearListeners() {
  MP.listeners.forEach(({ ref, event, fn }) => ref.off(event, fn));
  MP.listeners = [];
}

function mpShuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function mpAutoRoomNumber() {
  return Math.floor(1000 + Math.random() * 9000);
}

function mpShowToast(msg) {
  if (typeof showToast === 'function') showToast(msg);
}

// ─── LER ESTRELAS (users/uid/stats.stars + localStorage) ──
async function mpGetStars(uid) {
  if (!uid) return 0;
  // 1. Tentar Firebase
  try {
    const snap = await db.ref(`users/${uid}/stats`).once('value');
    const stats = snap.val();
    if (stats && typeof stats.stars === 'number') return stats.stars;
  } catch(e) {}
  // 2. Fallback localStorage
  const ls = (typeof LS !== 'undefined' && LS.get) ? LS.get(`eq_stats_${uid}`) : null;
  return (ls && ls.stars) || 0;
}

// ─── GUARDAR ESTRELAS GANHAS NO DESAFIO ───────────────────
async function mpAddStars(uid, amount) {
  if (!uid || amount <= 0) return;
  // Firebase
  const statsRef = db.ref(`users/${uid}/stats`);
  statsRef.transaction(stats => {
    if (!stats) stats = { games: 0, best: 0, stars: 0 };
    stats.stars = (stats.stars || 0) + amount;
    return stats;
  }).catch(() => {});
  // localStorage
  if (typeof LS !== 'undefined' && LS.get) {
    const k  = `eq_stats_${uid}`;
    const ls = LS.get(k) || { games: 0, best: 0, stars: 0 };
    ls.stars = (ls.stars || 0) + amount;
    LS.set(k, ls);
  }
}

// ─── OBTER INFO DO UTILIZADOR ACTUAL ──────────────────────
async function mpGetMyInfoAsync() {
  // Se já temos cache válido, usar
  if (MP.myProfile && MP.myProfile.uid) return MP.myProfile;

  const user = firebase.auth().currentUser;
  if (!user) return null;

  const uid   = user.uid;
  const email = user.email || '';
  const phone = user.phoneNumber || '';
  let name    = user.displayName || '';

  // Tentar nome do State.profile (app.js carrega isto)
  if (!name && typeof State !== 'undefined' && State.profile) {
    name = ((State.profile.firstName || '') + ' ' + (State.profile.lastName || '')).trim();
  }

  // Ir sempre ao Firebase buscar o perfil completo (inclui utilizadores de telefone/anónimos)
  if (!name) {
    try {
      const snap = await db.ref(`users/${uid}`).once('value');
      const data = snap.val();
      if (data) {
        name = ((data.firstName || '') + ' ' + (data.lastName || '')).trim()
               || data.nome || data.displayName || '';
      }
    } catch(e) {}
  }
  name = name || email || phone || 'Jogador';

  const stars = await mpGetStars(uid);
  MP.myStars = stars;

  // Guardar em cache — mpGetMyInfoSync vai usar este
  const profile = { uid, name, email, phone, stars };
  MP.myProfile = profile;
  MP.myUid     = uid;
  return profile;
}

// Versão síncrona rápida — usa o cache de MP.myProfile carregado em mpInit
function mpGetMyInfoSync() {
  // 1. Usar cache definido por mpInit (sempre preferir este)
  if (MP.myProfile && MP.myProfile.uid) return MP.myProfile;

  // 2. Fallback: tentar construir a partir do firebase.auth()
  const user = firebase.auth().currentUser;
  let uid, name, email, phone;
  if (user) {
    uid   = user.uid;
    email = user.email || '';
    phone = user.phoneNumber || '';
    name  = user.displayName || '';
  } else {
    return null;
  }
  // Tentar nome do State.profile
  if (!name && typeof State !== 'undefined' && State.profile) {
    name = ((State.profile.firstName || '') + ' ' + (State.profile.lastName || '')).trim();
  }
  name = name || email || phone || 'Jogador';
  const ls = (typeof LS !== 'undefined' && LS.get) ? LS.get(`eq_stats_${uid}`) : null;
  const stars = (ls && ls.stars) || MP.myStars || 0;
  return { uid, name, email, phone, stars };
}

// ─── INICIALIZAÇÃO DO HUB ─────────────────────────────────
async function mpInit() {
  // Forçar re-fetch do perfil (limpar cache para obter nome/estrelas actualizados)
  MP.myProfile = null;
  const me = await mpGetMyInfoAsync();
  if (!me) {
    mpShowToast('Inicia sessão para aceder ao Multiplayer.');
    return;
  }
  MP.myUid     = me.uid;
  MP.myProfile = me;
  MP.myStars   = me.stars;

  // Mostrar estrelas no header
  const starsEl = mpEl('mpUserStars');
  if (starsEl) starsEl.textContent = me.stars;

  mpLoadSalas();
  mpLoadDesafiosRecebidos();
  mpLoadRanking();
  mpPreencherDisciplinas();
  mpUpdateTiposUI();

  mpShowScreen('screen-multiplayer');
}

// ─── TABS ─────────────────────────────────────────────────
document.querySelectorAll('.mp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.mp-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    const key = 'mpTab' + target.charAt(0).toUpperCase() + target.slice(1);
    const el = mpEl(key);
    if (el) el.classList.add('active');
    if (target === 'ranking') mpLoadRanking();
    if (target === 'salas')   mpLoadSalas();
  });
});

// ─── OPÇÕES DATA-MPOPT (botões) ───────────────────────────
document.querySelectorAll('[data-mpopt]').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.mpopt;
    document.querySelectorAll(`[data-mpopt="${key}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const val = btn.dataset.v;
    MP.config[key] = (key === 'maxplayers') ? parseInt(val) : val;
    // Actualizar tipos quando modoJogo muda
    if (key === 'modoJogo') mpUpdateTiposUI();
  });
});

// ─── ATUALIZAR TIPOS DE PERGUNTAS CONFORME MODO DO JOGO ──
function mpUpdateTiposUI() {
  const container = mpEl('mpTiposContainer');
  if (!container) return;
  const modo = MP.config.modoJogo;

  let opcoes = [];
  if (modo === 'aprendizado') {
    opcoes = [
      { v: 'todos',    label: 'Todos' },
      { v: 'multipla', label: 'Múltipla Escolha' },
      { v: 'vf',       label: 'Verdadeiro/Falso' },
      { v: 'lacunas',  label: 'Preencher Lacunas' },
    ];
  } else if (modo === 'concurso' || modo === 'prova') {
    opcoes = [
      { v: 'todos',    label: 'Todos' },
      { v: 'multipla', label: 'Múltipla Escolha' },
      { v: 'vf',       label: 'Verdadeiro/Falso' },
      { v: 'lacunas',  label: 'Preencher Lacunas' },
    ];
  } else if (modo === 'imagem') {
    opcoes = [
      { v: 'multipla_img1', label: 'Múltipla — Opção 1' },
      { v: 'multipla_img2', label: 'Múltipla — Opção 2' },
    ];
  }

  // Repor tipo ao primeiro
  MP.config.tipo = opcoes[0].v;

  container.innerHTML = opcoes.map((o, i) =>
    `<button class="mp-opt${i === 0 ? ' active' : ''}" data-mpopt="tipo" data-v="${o.v}">${o.label}</button>`
  ).join('');

  // Re-registar eventos
  container.querySelectorAll('[data-mpopt]').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('[data-mpopt]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      MP.config.tipo = btn.dataset.v;
    });
  });
}

// ─── CAMPOS DE TEXTO: TEMPO E NÚMERO DE PERGUNTAS ─────────
(function setupInputFields() {
  // Estes campos são <input type="number"> no HTML
  const tempoInput = mpEl('mpTempoInput');
  const qtdInput   = mpEl('mpQtdInput');

  if (tempoInput) {
    tempoInput.value = MP.config.tempo;
    tempoInput.addEventListener('input', () => {
      const v = parseInt(tempoInput.value);
      if (!isNaN(v) && v >= 0) MP.config.tempo = v;
    });
  }
  if (qtdInput) {
    qtdInput.value = MP.config.qtd;
    qtdInput.addEventListener('input', () => {
      const v = parseInt(qtdInput.value);
      if (!isNaN(v) && v > 0) MP.config.qtd = v;
    });
  }
})();

// ─── SALAS ACTIVAS ────────────────────────────────────────
function mpLoadSalas() {
  const salasRef = db.ref('mp_salas').orderByChild('status').equalTo('waiting');
  salasRef.once('value', snap => {
    const list = mpEl('mpSalasList');
    if (!list) return;
    const me = mpGetMyInfoSync();
    const myUid = me?.uid || MP.myUid;

    const salas = [];
    snap.forEach(child => {
      const s = child.val(); s._key = child.key; salas.push(s);
    });

    // Filtrar: mostrar apenas salas onde o utilizador é host ou convidado
    const minhasSalas = salas.filter(s =>
      s.host === myUid || s.invitedUid === myUid
    );

    if (minhasSalas.length === 0) {
      list.innerHTML = `
        <div class="mp-empty-state">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          <p>Nenhuma sala activa de momento</p>
          <button class="btn-mp-action" id="btnCriarSala">Criar Sala</button>
        </div>`;
      const b = mpEl('btnCriarSala');
      if (b) b.addEventListener('click', mpAbrirCriarSala);
      return;
    }

    list.innerHTML = minhasSalas.map(s => {
      const players   = s.players ? Object.values(s.players) : [];
      const isHost    = s.host === myUid;
      const modoIcons = {
        aprendizado: `<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>`,
        concurso:    `<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.86 10.4 5 9.3 5 8zm14 0c0 1.3-.86 2.4-2 2.82V7h2v1z"/></svg>`,
        prova:       `<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`,
        imagem:      `<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>`,
      };
      const modoLabel = s.modoJogo ? ((modoIcons[s.modoJogo] || '') + ({ aprendizado:'Aprendizado', concurso:'Concurso', prova:'Prova', imagem:'Imagem' }[s.modoJogo] || s.modoJogo)) : '';
      const dots = Array.from({length: s.maxplayers || 2}, (_, i) =>
        `<span class="mp-sala-player-dot ${players[i] ? 'active' : ''}"></span>`
      ).join('');

      const hostBadge = isHost
        ? `<span style="font-size:0.65rem;background:var(--primary,#6366F1);color:#fff;border-radius:6px;padding:2px 7px;margin-left:6px">Host</span>`
        : `<span style="font-size:0.65rem;background:#22C55E;color:#fff;border-radius:6px;padding:2px 7px;margin-left:6px">Convidado</span>`;

      const actionBtn = isHost
        ? `<div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end">
             <button class="mp-sala-join" data-salaid="${s._key}">▶ Entrar</button>
             <button class="mp-sala-delete" data-salaid="${s._key}"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>Eliminar</button>
           </div>`
        : `<button class="mp-sala-join" data-salaid="${s._key}">▶ Entrar</button>`;

      return `
        <div class="mp-sala-card">
          <div class="mp-sala-badge"><span>SALA</span><strong>#${s.roomNum || '?'}</strong></div>
          <div class="mp-sala-info">
            <div class="mp-sala-name">${s.disciplina || 'Geral'} — ${s.nivel || 'Todos'} ${hostBadge}</div>
            <div class="mp-sala-meta">${modoLabel} · ${players.length}/${s.maxplayers || 2} jogadores · ${s.modoPerg === 'realtime' ? '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg> Tempo Real' : '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg> Assíncrono'}</div>
            <div class="mp-sala-players" style="margin-top:4px">${dots}</div>
          </div>
          ${actionBtn}
        </div>`;
    }).join('') + `<div style="text-align:center;margin-top:10px"><button class="btn-mp-action" id="btnCriarSala">+ Criar Nova Sala</button></div>`;

    const b = mpEl('btnCriarSala');
    if (b) b.addEventListener('click', mpAbrirCriarSala);

    list.querySelectorAll('.mp-sala-join').forEach(btn =>
      btn.addEventListener('click', () => mpEntrarSala(btn.dataset.salaid))
    );
    list.querySelectorAll('.mp-sala-delete').forEach(btn =>
      btn.addEventListener('click', () => mpEliminarSala(btn.dataset.salaid))
    );
  });
}


// ─── MODAL DE CONFIRMAÇÃO PERSONALIZADO ──────────────────
function mpConfirm(mensagem, onConfirm) {
  const existing = document.getElementById('mp-confirm-modal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'mp-confirm-modal';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.55);
    z-index:99999; display:flex; align-items:flex-end;
    justify-content:center; padding-bottom:24px;
    animation: mpFadeIn 0.2s ease;
  `;
  overlay.innerHTML = `
    <style>
      @keyframes mpFadeIn { from{opacity:0} to{opacity:1} }
      @keyframes mpSlideUp2 { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
    </style>
    <div style="
      background:var(--card,#fff); border-radius:20px;
      padding:24px 20px 12px; width:calc(100% - 32px); max-width:400px;
      box-shadow:0 -4px 40px rgba(0,0,0,0.18);
      animation: mpSlideUp2 0.25s ease;
    ">
      <div style="text-align:center; margin-bottom:18px">
        <div style="width:48px;height:48px;border-radius:50%;background:rgba(239,68,68,0.12);display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px">
          <svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#EF4444"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </div>
        <div style="font-weight:700;font-size:1rem;color:var(--text,#111);margin-bottom:6px">Eliminar Sala</div>
        <div style="font-size:0.85rem;color:var(--text2,#666);line-height:1.5">${mensagem}</div>
      </div>
      <button id="mpConfirmOk" style="
        width:100%;padding:14px;border-radius:12px;
        background:linear-gradient(135deg,#EF4444,#DC2626);
        color:#fff;border:none;font-weight:700;font-size:0.95rem;
        cursor:pointer;margin-bottom:8px;
      ">Eliminar</button>
      <button id="mpConfirmCancel" style="
        width:100%;padding:12px;border-radius:12px;
        background:transparent;color:var(--text2,#888);
        border:none;font-size:0.9rem;cursor:pointer;font-weight:600;
      ">Cancelar</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('mpConfirmOk').onclick = () => {
    overlay.remove();
    onConfirm();
  };
  document.getElementById('mpConfirmCancel').onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

// ─── ELIMINAR SALA (apenas host) ─────────────────────────
async function mpEliminarSala(salaId) {
  const me = mpGetMyInfoSync();
  if (!me) return;

  mpConfirm('Tens a certeza que queres eliminar esta sala? O desafio será cancelado.', async () => {
    const snap = await db.ref(`mp_salas/${salaId}`).once('value');
    const sala  = snap.val();
    if (!sala) return;
    if (sala.host !== me.uid) {
      mpShowToast('Só o criador da sala pode eliminá-la.');
      return;
    }
    const desafiosSnap = await db.ref('mp_desafios')
      .orderByChild('salaId').equalTo(salaId).once('value');
    const updates = {};
    desafiosSnap.forEach(c => { updates[`mp_desafios/${c.key}/status`] = 'cancelled'; });
    if (Object.keys(updates).length) await db.ref().update(updates);
    await db.ref(`mp_salas/${salaId}`).remove();
    mpShowToast('Sala eliminada.');
    mpLoadSalas();
  });
}

function mpAbrirCriarSala() { mpCriarSala(null); }

// ─── ELIMINAR SALA A PARTIR DE DENTRO DA SALA ────────────
async function mpEliminarSalaFromRoom(salaId) {
  const me = mpGetMyInfoSync();
  if (!me) return;

  mpConfirm('Tens a certeza que queres eliminar esta sala? O desafio será cancelado.', async () => {
    const snap = await db.ref(`mp_salas/${salaId}`).once('value');
    const sala  = snap.val();
    if (!sala || sala.host !== me.uid) {
      mpShowToast('Só o criador da sala pode eliminá-la.');
      return;
    }
    const desafiosSnap = await db.ref('mp_desafios')
      .orderByChild('salaId').equalTo(salaId).once('value');
    const updates = {};
    desafiosSnap.forEach(c => { updates[`mp_desafios/${c.key}/status`] = 'cancelled'; });
    if (Object.keys(updates).length) await db.ref().update(updates);
    await db.ref(`mp_salas/${salaId}`).remove();
    mpClearListeners();
    mpShowToast('Sala eliminada.');
    mpShowScreen('screen-multiplayer');
    mpLoadSalas();
  });
}

async function mpCriarSala(targetUid) {
  const me = mpGetMyInfoSync();
  if (!me) { mpShowToast('Sessão necessária'); return; }

  // Ler tempo e qtd dos inputs se existirem
  const tempoInput = mpEl('mpTempoInput');
  const qtdInput   = mpEl('mpQtdInput');
  if (tempoInput) MP.config.tempo = parseInt(tempoInput.value) || 30;
  if (qtdInput)   MP.config.qtd   = parseInt(qtdInput.value) || 10;

  const salaData = {
    roomNum: mpAutoRoomNumber(),
    status: 'waiting',
    modoJogo:   MP.config.modoJogo,
    modoPerg:   MP.config.modoPerg,
    nivel:      MP.config.nivel,
    tipo:       MP.config.tipo,
    tempo:      MP.config.tempo,
    qtd:        MP.config.qtd,
    maxplayers: MP.config.maxplayers,
    disciplina: MP.config.disciplina,
    categoria:  MP.config.categoria,
    host: me.uid,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    players: { [me.uid]: { uid: me.uid, name: me.name, email: me.email || me.phone, stars: me.stars, score: 0, joined: true } },
    scores: {}, history: {}, liveAnswers: {},
    invitedUid: targetUid || null,
  };

  const ref = await db.ref('mp_salas').push(salaData);
  await mpEntrarSala(ref.key);
}


async function mpEntrarSala(salaId) {
  // Use async version to ensure name/stars are fully loaded before registering
  const me = await mpGetMyInfoAsync();
  if (!me) return;

  const salaRef = db.ref(`mp_salas/${salaId}`);

  // Await the player registration so the players node is updated
  // before we start listening to it in mpShowSalaScreen
  await salaRef.child('players').child(me.uid).set({
    uid: me.uid, name: me.name, email: me.email || me.phone,
    stars: me.stars, score: 0, joined: true,
  });

  MP.salaId    = salaId;
  MP.sala      = salaRef;
  MP.myUid     = me.uid;
  MP.myProfile = me;
  mpShowSalaScreen(salaRef);
}

// ─── SALA DE JOGO ─────────────────────────────────────────
async function mpShowSalaScreen(salaRef) {
  mpShowScreen('screen-mp-sala');
  mpEl('mpSalaWaiting').style.display = 'block';
  mpEl('mpSalaGame').style.display    = 'none';
  mpEl('mpSalaResult').style.display  = 'none';

  const deleteBtn = mpEl('mpSalaDeleteBtn');

  // Variáveis locais da sala — carregadas UMA vez antes de qualquer listener
  let _salaHost   = null;
  let _salaMaxP   = 2;
  let _salaStatus = 'waiting';

  // Carregar dados da sala com await (Promise) para garantir que
  // _salaHost está preenchido ANTES de os listeners de players dispararem
  await new Promise(resolve => {
    salaRef.once('value', snap => {
      const s = snap.val();
      if (!s) { resolve(); return; }

      _salaHost   = s.host;
      _salaMaxP   = s.maxplayers || 2;
      _salaStatus = s.status || 'waiting';

      mpEl('mpSalaNumDisplay').textContent = `Sala #${s.roomNum || '?'}`;
      mpEl('mpSalaModeDisplay').innerHTML  = s.modoPerg === 'realtime'
        ? '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg> Tempo Real'
        : '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg> Assíncrono';

      if (deleteBtn) {
        deleteBtn.style.display = (s.host === MP.myUid && s.status === 'waiting') ? 'flex' : 'none';
        deleteBtn.onclick = () => mpEliminarSalaFromRoom(salaRef.key);
      }
      resolve();
    });
  });

  // Agora _salaHost está garantidamente preenchido — registar listeners
  mpAddListener(salaRef.child('players'), 'value', snap => {
    const players = [];
    snap.forEach(c => players.push(c.val()));

    const btn    = mpEl('btnIniciarDesafio');
    const myUid  = MP.myUid;

    mpRenderPlayersGrid(players, _salaMaxP);
    mpRenderScoreboard(players);

    if (!btn) return;
    const isHost   = _salaHost === myUid;
    const canStart = isHost && players.length >= 2 && _salaStatus === 'waiting';
    btn.style.display = canStart ? 'inline-flex' : 'none';
  });

  // Detectar se a sala foi eliminada (value = null) para expulsar o convidado
  mpAddListener(salaRef, 'value', snap => {
    if (snap.val() === null) {
      mpClearListeners();
      mpShowToast('A sala foi eliminada pelo criador.');
      mpShowScreen('screen-multiplayer');
      mpLoadSalas();
    }
  });

  mpAddListener(salaRef.child('status'), 'value', snap => {
    const status = snap.val();
    if (!status) return;
    _salaStatus = status; // manter variável local sincronizada
    if (status === 'playing')  mpStartGame();
    if (status === 'finished') mpShowResults();
    if (deleteBtn && (status === 'playing' || status === 'finished')) {
      deleteBtn.style.display = 'none';
    }
  });

  mpAddListener(salaRef.child('currentRound'), 'value', snap => {
    const round = snap.val();
    if (round !== null && mpEl('mpSalaGame').style.display !== 'none') {
      mpRenderQuestion(round);
    }
  });

  mpAddListener(salaRef.child('liveAnswers'), 'value', snap => {
    if (!snap.val()) return;
    mpRenderLiveFeed(snap.val());
    mpUpdateScoreChips(snap.val());
  });

  mpAddListener(salaRef.child('scores'), 'value', snap => {
    if (!snap.val()) return;
    const scores = snap.val();
    salaRef.child('players').once('value', ps => {
      const players = [];
      ps.forEach(c => { const p = c.val(); p.score = (scores[p.uid] || {}).total || 0; players.push(p); });
      mpRenderScoreboard(players);
    });
  });

  const initBtn = mpEl('btnIniciarDesafio');
  if (initBtn) initBtn.onclick = mpIniciarJogo;
}

function mpStartGame() {
  mpEl('mpSalaWaiting').style.display = 'none';
  mpEl('mpSalaGame').style.display    = 'block';
}

function mpRenderPlayersGrid(players, maxPlayers) {
  const grid = mpEl('mpPlayersGrid');
  const me   = mpGetMyInfoSync();
  if (!grid) return;

  // maxPlayers can be passed directly from the sala snapshot to avoid extra DB call
  const maxP = maxPlayers || players.length || 2;
  const slots = Array.from({length: maxP}, (_, i) => {
    const p = players[i];
    if (p) {
      const isMe = p.uid === (me?.uid || MP.myUid);
      return `<div class="mp-player-slot filled ${isMe ? 'me' : ''}">
        <div class="mp-player-slot-avatar">${mpAvatarLetter(p.name)}</div>
        <div class="mp-player-slot-name">${p.name}${isMe ? ' (tu)' : ''}</div>
        <div style="font-size:0.65rem;opacity:0.7">${mpStarIcon()} ${p.stars || 0}</div>
      </div>`;
    }
    return `<div class="mp-player-slot">
      <div class="mp-player-slot-avatar" style="background:rgba(99,102,241,0.15);font-size:1.2rem"><svg viewBox="0 0 24 24" style="width:1.2rem;height:1.2rem;fill:var(--primary,#6366F1);vertical-align:middle"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>
      <div class="mp-player-slot-empty">Aguardando...</div>
    </div>`;
  });
  grid.innerHTML = slots.join('');
}

function mpRenderScoreboard(players) {
  const sb = mpEl('mpScoreboard');
  if (!sb) return;
  sb.innerHTML = players.map(p => `
    <div class="mp-score-chip" data-uid="${p.uid}">
      <div class="mp-score-name">${p.name.split(' ')[0]}</div>
      <div class="mp-score-pts">${p.score || 0}</div>
      <div class="mp-score-indicator"></div>
    </div>`).join('');
}

function mpUpdateScoreChips(answers) {
  document.querySelectorAll('.mp-score-chip').forEach(chip => {
    chip.classList.remove('answered-right', 'answered-wrong', 'is-turn');
  });
  if (!answers) return;
  Object.entries(answers).forEach(([uid, data]) => {
    const chip = document.querySelector(`.mp-score-chip[data-uid="${uid}"]`);
    if (chip) {
      chip.classList.add(data.correct ? 'answered-right' : 'answered-wrong');
      const ind = chip.querySelector('.mp-score-indicator');
      if (ind) ind.innerHTML = data.correct ? '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>' : '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>';
    }
  });
}

// ─── INICIAR JOGO (host) ──────────────────────────────────
async function mpIniciarJogo() {
  const salaRef = MP.sala;
  if (!salaRef) return;

  const snap     = await salaRef.once('value');
  const salaData = snap.val();
  let perguntas  = [];

  try {
    perguntas = await mpCarregarPerguntas(salaData);
  } catch(e) {
    mpShowToast('Erro ao carregar perguntas.');
    return;
  }

  const qtd = salaData.qtd || 10;
  if (perguntas.length < 1) {
    mpShowToast('Sem perguntas disponíveis para esta configuração.');
    return;
  }

  const selected = mpShuffleArray(perguntas).slice(0, Math.min(qtd, perguntas.length));
  const players  = Object.values(salaData.players || {});
  const turnOrder = mpShuffleArray(players.map(p => p.uid));

  await salaRef.update({
    status: 'playing',
    questions: selected,
    turnOrder,
    currentQIndex: 0,
    scores: Object.fromEntries(players.map(p => [p.uid, { total: 0, answers: {} }])),
    liveAnswers: {},
    startedAt: firebase.database.ServerValue.TIMESTAMP,
  });

  mpEmitirPergunta(0, selected, turnOrder, salaData.modoPerg);
}

async function mpEmitirPergunta(index, questions, turnOrder, modoPerg) {
  const salaRef = MP.sala;
  if (!salaRef || !questions[index]) return;

  const q = questions[index];
  const playerTurn = turnOrder[index % turnOrder.length];

  // Preparar respostas conforme tipo
  let answers = [];
  const correta = q.correta || q.resposta_certa || q.answer || '';
  const erradas = q.erradas || q.respostas_erradas || q.wrongAnswers || [];

  if (q.tipo === 'vf') {
    answers = mpShuffleArray(['Verdadeiro', 'Falso']);
  } else {
    answers = mpShuffleArray([correta, ...erradas.slice(0, 3)].filter(Boolean));
  }

  const roundData = {
    index,
    question: q.pergunta || q.question || q.enunciado || '',
    answers,
    correct: correta,
    tipo: q.tipo || 'multipla',
    imageURL: q.imageURL || q.imagem || '',
    total: questions.length,
    playerTurn: modoPerg === 'realtime' ? null : playerTurn,
    startedAt: firebase.database.ServerValue.TIMESTAMP,
  };

  await salaRef.child('currentRound').set(roundData);
  await salaRef.child('liveAnswers').remove();
}

// ─── RENDERIZAR PERGUNTA ──────────────────────────────────
function mpRenderQuestion(round) {
  if (!round) return;

  mpEl('mpSalaWaiting').style.display = 'none';
  mpEl('mpSalaGame').style.display    = 'block';

  const me       = mpGetMyInfoSync();
  const isMyTurn = !round.playerTurn || round.playerTurn === me?.uid;

  mpEl('mpQNum').textContent  = `${round.index + 1}/${round.total}`;
  const turnEl = mpEl('mpQTurn');
  if (turnEl) {
    turnEl.innerHTML   = isMyTurn ? '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-8.5l-5.5 5.5-2.5-2.5-1 1 3.5 3.5 6.5-6.5-1-1z"/></svg>A tua vez!' : '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg> Aguarda...';
    turnEl.className   = 'mp-q-turn' + (isMyTurn ? ' my-turn' : '');
    turnEl.style.display = 'inline-block';
  }

  MP.currentQ = round;
  MP.answered = false;

  const qText = mpEl('mpQText');
  if (qText) qText.textContent = round.question;

  // Imagem (modo imagem)
  const imgWrap = mpEl('mpQImage');
  if (imgWrap) {
    if (round.imageURL) {
      imgWrap.innerHTML = `<img src="${round.imageURL}" alt="Imagem da pergunta" style="max-width:100%;border-radius:10px;margin-bottom:8px">`;
      imgWrap.style.display = 'block';
    } else {
      imgWrap.style.display = 'none';
    }
  }

  const answersEl = mpEl('mpQAnswers');
  if (!answersEl) return;

  if (isMyTurn) {
    if (round.tipo === 'lacunas') {
      // Campo de texto para lacunas
      answersEl.innerHTML = `
        <div class="mp-lacuna-wrap">
          <input type="text" id="mpLacunaInput" class="mp-lacuna-input" placeholder="Escreve a tua resposta..." autocomplete="off"/>
          <button class="mp-lacuna-btn" id="mpLacunaBtn">Confirmar</button>
        </div>`;
      const lBtn = mpEl('mpLacunaBtn');
      if (lBtn) lBtn.addEventListener('click', () => {
        const val = (mpEl('mpLacunaInput').value || '').trim();
        if (val) mpResponder(encodeURIComponent(val), round, lBtn);
      });
      const lInput = mpEl('mpLacunaInput');
      if (lInput) lInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') mpEl('mpLacunaBtn').click();
      });
    } else {
      answersEl.innerHTML = round.answers.map((a, i) => `
        <button class="mp-q-answer" data-idx="${i}" data-val="${encodeURIComponent(a)}">${a}</button>
      `).join('');
      answersEl.querySelectorAll('.mp-q-answer').forEach(btn =>
        btn.addEventListener('click', () => mpResponder(btn.dataset.val, round, btn))
      );
    }
  } else {
    answersEl.innerHTML = `<div class="mp-q-blocked"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM12 17c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>Aguarda a tua vez de responder</div>`;
  }

  // Timer
  mpClearTimer();
  if (MP.sala) {
    MP.sala.once('value', s => {
      const t = (s.val() && s.val().tempo) || 0;
      if (t > 0 && isMyTurn) mpStartTimer(t, round);
      else { const el = mpEl('mpSalaTimer'); if (el) el.textContent = '∞'; }
    });
  }
}

function mpStartTimer(seconds, round) {
  let left = seconds;
  const el = mpEl('mpSalaTimer');
  if (el) { el.textContent = left; el.classList.remove('urgent'); }

  MP.questionTimer = setInterval(() => {
    left--;
    if (el) {
      el.textContent = left;
      if (left <= 5) el.classList.add('urgent');
      else           el.classList.remove('urgent');
    }
    if (left <= 0) {
      mpClearTimer();
      if (!MP.answered) mpResponder(encodeURIComponent('__timeout__'), round, null);
    }
  }, 1000);
}

function mpClearTimer() {
  clearInterval(MP.questionTimer);
  MP.questionTimer = null;
  const el = mpEl('mpSalaTimer');
  if (el) { el.textContent = '--'; el.classList.remove('urgent'); }
}

// ─── RESPONDER PERGUNTA ───────────────────────────────────
async function mpResponder(encodedVal, round, btnEl) {
  if (MP.answered) return;
  MP.answered = true;

  const me      = mpGetMyInfoSync();
  const val     = decodeURIComponent(encodedVal);
  const correct = val.toLowerCase().trim() === (round.correct || '').toLowerCase().trim();
  const points  = correct ? 10 : 0;

  mpClearTimer();

  // Feedback visual
  if (btnEl) {
    btnEl.classList.add(correct ? 'correct' : 'wrong');
    const allBtns = mpEl('mpQAnswers').querySelectorAll('.mp-q-answer');
    allBtns.forEach(b => {
      if (decodeURIComponent(b.dataset.val).toLowerCase().trim() === (round.correct || '').toLowerCase().trim())
        b.classList.add('correct');
      b.disabled = true;
    });
  }

  const salaRef = MP.sala;
  if (!salaRef) return;

  await salaRef.child(`liveAnswers/${me.uid}`).set({
    uid: me.uid, name: me.name, correct, points, answer: val,
    answeredAt: firebase.database.ServerValue.TIMESTAMP,
  });

  const scoreSnap = await salaRef.child(`scores/${me.uid}`).once('value');
  const cur = scoreSnap.val() || { total: 0, answers: {} };
  cur.total = (cur.total || 0) + points;
  cur.answers[round.index] = { correct, points };
  await salaRef.child(`scores/${me.uid}`).set(cur);

  // Host verifica avanço
  const snap = await salaRef.once('value');
  const data = snap.val();
  if (data && data.host === me.uid) mpCheckAdvance(data, round);
}

async function mpCheckAdvance(data, round) {
  const salaRef = MP.sala;
  if (!salaRef) return;

  const players     = Object.values(data.players || {});
  const liveAnswers = data.liveAnswers || {};
  const expectedN   = data.modoPerg === 'realtime' ? players.length : 1;

  if (Object.keys(liveAnswers).length < expectedN) return;

  const histEntry = { ...liveAnswers, question: round.question, correct: round.correct };
  await salaRef.child(`history/${round.index}`).set(histEntry);

  const nextIndex = round.index + 1;
  const questions = data.questions || [];

  if (nextIndex >= questions.length) {
    await salaRef.update({ status: 'finished' });
  } else {
    await salaRef.child('currentQIndex').set(nextIndex);
    setTimeout(() => mpEmitirPergunta(nextIndex, questions, data.turnOrder, data.modoPerg), 1500);
  }
}

// ─── LIVE FEED ────────────────────────────────────────────
function mpRenderLiveFeed(answers) {
  const feed = mpEl('mpLiveFeed');
  if (!feed || !answers) return;
  const items = Object.values(answers);
  if (!items.length) return;

  feed.innerHTML = `<div class="mp-section-title" style="font-size:0.75rem;margin:0 0 8px"><svg viewBox="0 0 24 24" style="width:10px;height:10px;fill:#EF4444;vertical-align:middle;margin-right:3px"><circle cx="12" cy="12" r="8"/></svg>Actividade em tempo real</div>` +
    items.map(a => `
      <div class="mp-feed-item">
        <span class="mp-feed-dot ${a.correct ? 'ok' : 'err'}"></span>
        <span class="mp-feed-msg"><strong>${a.name}</strong> ${a.correct ? '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>acertou' : '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>errou'} <span style="opacity:.6">(${a.points || 0} pts)</span></span>
      </div>`).join('');
}

// ─── MOSTRAR RESULTADOS ───────────────────────────────────
async function mpShowResults() {
  const salaRef = MP.sala;
  if (!salaRef) return;

  mpClearTimer();
  mpEl('mpSalaGame').style.display   = 'none';
  mpEl('mpSalaResult').style.display = 'block';

  const snap    = await salaRef.once('value');
  const data    = snap.val();
  const players = Object.values(data.players || {});
  const scores  = data.scores || {};

  const ranked = players.map(p => ({
    ...p,
    total:   (scores[p.uid] && scores[p.uid].total) || 0,
    answers: (scores[p.uid] && scores[p.uid].answers) || {},
  })).sort((a, b) => b.total - a.total);

  const qtd    = data.qtd || ranked.reduce((acc, p) => acc + Object.keys(p.answers).length, 0) / players.length || 10;
  const perQ   = 20 / qtd;
  const medals = ['1º', '2º', '3º'];
  const me     = mpGetMyInfoSync();

  // Dar estrelas com base na posição
  ranked.forEach((p, i) => {
    const starsGanhas = i === 0 ? 5 : i === 1 ? 3 : i === 2 ? 2 : 1;
    if (p.uid === me?.uid) {
      mpAddStars(p.uid, starsGanhas);
      MP.myStars += starsGanhas;
      const starsEl = mpEl('mpUserStars');
      if (starsEl) starsEl.textContent = MP.myStars;
      mpShowToast(`+${starsGanhas} estrelas ganhas!`);
    }
  });

  // Pódio
  const podiumEl = mpEl('mpResultPodium');
  if (podiumEl) {
    podiumEl.innerHTML = ranked.slice(0, 3).map((p, i) => `
      <div class="mp-podium-place p${i+1}">
        <div class="mp-podium-medal">${medals[i] || (i + 1) + 'º'}</div>
        <div class="mp-podium-name">${p.name}</div>
        <div class="mp-podium-pts">${(p.total * perQ / 10).toFixed(1)} val.</div>
      </div>`).join('');
  }

  // Tabela completa
  const tableEl = mpEl('mpResultTable');
  if (tableEl) {
    tableEl.innerHTML = `
      <table class="mp-history-table">
        <thead><tr><th>#</th><th>Jogador</th><th>Pts</th><th>Nota (0-20)</th><th>Estrelas</th></tr></thead>
        <tbody>
          ${ranked.map((p, i) => `<tr class="${p.uid === me?.uid ? 'mp-my-row' : ''}">
            <td>${i+1}</td>
            <td>${p.name}</td>
            <td>${p.total}</td>
            <td class="mp-hist-score">${(p.total * perQ / 10).toFixed(1)}</td>
            <td>${mpStarIcon()} ${[5,3,2,1][i] || 1}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  }

  const voltarBtn = mpEl('btnMpSalaVoltar');
  if (voltarBtn) voltarBtn.onclick = () => {
    mpClearListeners();
    mpShowScreen('screen-multiplayer');
    mpLoadSalas();
  };
}

// ─── LISTENER GLOBAL DE DESAFIOS (funciona em qualquer ecrã) ─────
// Guardamos referência para poder cancelar quando necessário
let _mpDesafiosGlobalRef   = null;
let _mpDesafiosGlobalFn    = null;
let _mpDesafiosGlobalUid   = null;
let _mpDesafiosVistos      = new Set(); // evita re-notificar o mesmo desafio

function mpIniciarListenerGlobalDesafios(uid) {
  if (!uid) return;
  // Não duplicar listener para o mesmo uid
  if (_mpDesafiosGlobalUid === uid) return;

  // Cancelar listener anterior se existir
  if (_mpDesafiosGlobalRef && _mpDesafiosGlobalFn) {
    _mpDesafiosGlobalRef.off('child_added', _mpDesafiosGlobalFn);
  }

  _mpDesafiosGlobalUid = uid;
  _mpDesafiosGlobalRef = db.ref('mp_desafios').orderByChild('targetUid').equalTo(uid);

  _mpDesafiosGlobalFn = snap => {
    const d = snap.val();
    if (!d || d.status !== 'pending') return;
    if (_mpDesafiosVistos.has(snap.key)) return;
    _mpDesafiosVistos.add(snap.key);

    // Se o ecrã multiplayer já estiver activo, o listener normal trata disso
    // Caso contrário mostrar popup de notificação
    mpMostrarPopupDesafio(snap.key, d);
  };

  _mpDesafiosGlobalRef.on('child_added', _mpDesafiosGlobalFn);
}

function mpMostrarPopupDesafio(key, d) {
  // Remover popup anterior se existir
  const antigo = document.getElementById('mp-desafio-popup');
  if (antigo) antigo.remove();

  const modoLabels = { aprendizado:'<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>Aprendizado', concurso:'<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/></svg>Concurso', prova:'<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>Prova', imagem:'<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Imagem' };
  const popup = document.createElement('div');
  popup.id = 'mp-desafio-popup';
  popup.style.cssText = `
    position:fixed; bottom:20px; left:50%; transform:translateX(-50%);
    background:var(--card,#fff); border-radius:16px;
    box-shadow:0 8px 32px rgba(0,0,0,0.22); padding:18px 20px;
    z-index:9999; min-width:300px; max-width:90vw;
    border:2px solid var(--primary,#6366F1);
    animation: mpSlideUp 0.3s ease;
  `;
  popup.innerHTML = `
    <style>
      @keyframes mpSlideUp { from { opacity:0; transform:translateX(-50%) translateY(30px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }
    </style>
    <div style="font-weight:700;font-size:1rem;margin-bottom:4px"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M6.92 5H5L3 3l1-1 2 2v-.08l7 7-.71.71L6.92 5zM19.71 2.29l-2 2 .01.01-1.42 1.42-.01-.01-2.12 2.12.01.01-1.42 1.42-.01-.01-1.06 1.06 3.54 3.54 1.06-1.06-.01-.01 1.42-1.42.01.01 2.12-2.12-.01-.01 1.42-1.42.01.01 2-2L21 3l-1.29-.71zM3 17c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>Novo Desafio!</div>
    <div style="font-size:0.85rem;margin-bottom:2px"><strong>${d.fromName || 'Jogador'}</strong> desafia-te!</div>
    <div style="font-size:0.75rem;color:var(--text2,#888);margin-bottom:12px">
      ${d.disciplina || 'Geral'} · ${modoLabels[d.modoJogo] || d.modoJogo || ''} · ${d.qtd || 10} perguntas
    </div>
    <div style="display:flex;gap:10px">
      <button id="mpPopupAceitar" style="flex:1;padding:9px;border-radius:10px;background:var(--primary,#6366F1);color:#fff;border:none;font-weight:600;cursor:pointer;font-size:0.85rem"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>Aceitar</button>
      <button id="mpPopupRecusar" style="flex:1;padding:9px;border-radius:10px;background:transparent;color:var(--text2,#888);border:1.5px solid var(--border,#ddd);font-weight:600;cursor:pointer;font-size:0.85rem"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>Recusar</button>
    </div>
  `;
  document.body.appendChild(popup);

  document.getElementById('mpPopupAceitar').onclick = async () => {
    popup.remove();
    // Se o multiplayer não estiver inicializado, inicializar primeiro
    if (!MP.myUid) await mpInit();
    await mpAceitarDesafio(key, d.salaId);
  };
  document.getElementById('mpPopupRecusar').onclick = async () => {
    popup.remove();
    await mpRecusarDesafio(key);
  };

  // Auto-fechar após 30 segundos
  setTimeout(() => { if (popup.parentNode) popup.remove(); }, 30000);
}


function mpLoadDesafiosRecebidos() {
  // Use MP.myUid set by mpInit — mpGetMyInfoSync() can return null at this point
  const uid = MP.myUid;
  if (!uid) return;

  const ref = db.ref('mp_desafios').orderByChild('targetUid').equalTo(uid);
  mpAddListener(ref, 'value', snap => {
    const el = mpEl('mpDesafiosRecebidos');
    if (!el) return;
    const desafios = [];
    snap.forEach(c => { const d = c.val(); if (d.status === 'pending') { d._key = c.key; desafios.push(d); } });

    if (desafios.length === 0) {
      el.innerHTML = `<p class="mp-sub-empty">Sem desafios pendentes</p>`;
      return;
    }

    const modoLabels = { aprendizado:'<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M12 3L1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>Aprendizado', concurso:'<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/></svg>Concurso', prova:'<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>Prova', imagem:'<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:2px"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>Imagem' };

    el.innerHTML = desafios.map(d => `
      <div class="mp-desafio-card">
        <div class="mp-desafio-header">
          <div class="mp-desafio-avatar">${mpAvatarLetter(d.fromName)}</div>
          <div class="mp-desafio-info">
            <div class="mp-desafio-name">${d.fromName || 'Jogador'}</div>
            <div class="mp-desafio-meta">
              ${d.disciplina || 'Geral'} · ${modoLabels[d.modoJogo] || d.modoJogo || ''} · Nível: ${d.nivel || 'Todos'}<br>
              ${d.qtd} perguntas · ${d.modoPerg === 'realtime' ? '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle"><path d="M7 2v11h3v9l7-12h-4l4-8z"/></svg> Tempo Real' : '<svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg> Assíncrono'}
            </div>
          </div>
        </div>
        <div class="mp-desafio-actions">
          <button class="mp-btn-aceitar" data-key="${d._key}" data-sala="${d.salaId}"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/></svg>Aceitar</button>
          <button class="mp-btn-recusar" data-key="${d._key}"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z"/></svg>Recusar</button>
        </div>
      </div>`).join('');

    el.querySelectorAll('.mp-btn-aceitar').forEach(btn =>
      btn.addEventListener('click', () => mpAceitarDesafio(btn.dataset.key, btn.dataset.sala))
    );
    el.querySelectorAll('.mp-btn-recusar').forEach(btn =>
      btn.addEventListener('click', () => mpRecusarDesafio(btn.dataset.key))
    );
  });
}

async function mpAceitarDesafio(key, salaId) {
  // Marcar desafio como aceite E registar na sala que foi aceite
  // (o host a ouvir a sala vai detectar o novo player)
  await db.ref(`mp_desafios/${key}`).update({ status: 'accepted' });

  // Verificar se a sala ainda existe e está à espera
  const salaSnap = await db.ref(`mp_salas/${salaId}`).once('value');
  const sala = salaSnap.val();
  if (!sala) {
    mpShowToast('Esta sala já não existe.');
    return;
  }
  if (sala.status !== 'waiting') {
    mpShowToast('O jogo já começou ou a sala foi encerrada.');
    return;
  }

  await mpEntrarSala(salaId);
}

async function mpRecusarDesafio(key) {
  await db.ref(`mp_desafios/${key}`).update({ status: 'declined' });
  mpShowToast('Desafio recusado.');
}

// ─── ENVIAR DESAFIO ───────────────────────────────────────
const enviarBtn = mpEl('btnEnviarDesafio');
if (enviarBtn) enviarBtn.addEventListener('click', async () => {
  const me = mpGetMyInfoSync();
  if (!me) { mpShowToast('Sessão necessária'); return; }
  if (!MP.config.targetUid) { mpShowToast('Selecciona um jogador para desafiar.'); return; }
  if (!MP.config.disciplina) { mpShowToast('Selecciona uma disciplina.'); return; }

  // Ler tempo e qtd dos inputs
  const tempoInput = mpEl('mpTempoInput');
  const qtdInput   = mpEl('mpQtdInput');
  if (tempoInput) MP.config.tempo = parseInt(tempoInput.value) || 30;
  if (qtdInput)   MP.config.qtd   = parseInt(qtdInput.value) || 10;

  // ── VERIFICAR SE JÁ EXISTE UMA SALA 'waiting' deste host ──
  // Se sim, reutilizá-la em vez de criar uma nova (evita salas órfãs
  // e garante que o host está na mesma sala que o desafiado)
  let salaKey = null;
  const salasExistentes = await db.ref('mp_salas')
    .orderByChild('host').equalTo(me.uid).once('value');

  salasExistentes.forEach(child => {
    const s = child.val();
    if (s.status === 'waiting' && !salaKey) {
      salaKey = child.key;
      // Actualizar a sala existente com o novo convidado e config
      db.ref(`mp_salas/${salaKey}`).update({
        invitedUid: MP.config.targetUid,
        modoJogo:   MP.config.modoJogo,
        modoPerg:   MP.config.modoPerg,
        nivel:      MP.config.nivel,
        tipo:       MP.config.tipo,
        tempo:      MP.config.tempo,
        qtd:        MP.config.qtd,
        maxplayers: MP.config.maxplayers,
        disciplina: MP.config.disciplina,
        categoria:  MP.config.categoria,
      });
    }
  });

  if (!salaKey) {
    // Criar sala nova apenas se não existir nenhuma
    const salaData = {
      roomNum: mpAutoRoomNumber(), status: 'waiting',
      modoJogo:   MP.config.modoJogo,
      modoPerg:   MP.config.modoPerg,
      nivel:      MP.config.nivel,
      tipo:       MP.config.tipo,
      tempo:      MP.config.tempo,
      qtd:        MP.config.qtd,
      maxplayers: MP.config.maxplayers,
      disciplina: MP.config.disciplina,
      categoria:  MP.config.categoria,
      host: me.uid, invitedUid: MP.config.targetUid,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      players: { [me.uid]: { uid: me.uid, name: me.name, email: me.email || me.phone, stars: me.stars, score: 0, joined: true } },
      scores: {}, history: {}, liveAnswers: {},
    };
    const salaRef = await db.ref('mp_salas').push(salaData);
    salaKey = salaRef.key;
  }

  await db.ref('mp_desafios').push({
    fromUid: me.uid, fromName: me.name,
    targetUid: MP.config.targetUid, targetName: MP.config.targetName,
    salaId: salaKey,
    modoJogo:   MP.config.modoJogo,
    modoPerg:   MP.config.modoPerg,
    nivel:      MP.config.nivel,
    disciplina: MP.config.disciplina,
    categoria:  MP.config.categoria,
    qtd:        MP.config.qtd,
    tempo:      MP.config.tempo,
    status: 'pending',
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  });

  mpShowToast(`Desafio enviado para ${MP.config.targetName}!`);
  await mpEntrarSala(salaKey);
});

// ─── PESQUISA DE JOGADORES ────────────────────────────────
function mpBuscarJogador(query, onResults) {
  if (!query || query.length < 2) { mpShowToast('Escreve pelo menos 2 caracteres.'); return; }
  const q = query.trim().toLowerCase();

  db.ref('users').once('value', snap => {
    const results = [];
    const me = mpGetMyInfoSync();
    snap.forEach(child => {
      const u = child.val();
      if (child.key === me?.uid) return;
      const nome  = (u.firstName || u.nome || '').toLowerCase() + ' ' + (u.lastName || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const phone = (u.phone || u.telefone || '').toLowerCase();
      if (nome.includes(q) || email.includes(q) || phone.includes(q)) {
        results.push({ uid: child.key, ...u });
      }
    });
    onResults(results.slice(0, 10));
  });
}

function mpRenderSearchResults(results, container, onSelect) {
  if (!container) return;
  if (!results.length) {
    container.innerHTML = `<div style="padding:10px;text-align:center;color:var(--text2);font-size:0.8rem">Nenhum jogador encontrado</div>`;
    return;
  }
  container.innerHTML = results.map(u => {
    const nome = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.nome || u.email || 'Jogador';
    const stars = (u.stats && u.stats.stars) || u.moedas || 0;
    return `
    <div class="mp-search-result-item" data-uid="${u.uid}" data-name="${nome}">
      <div class="mp-result-avatar">${mpAvatarLetter(nome)}</div>
      <div>
        <div class="mp-result-name">${nome}</div>
        <div style="font-size:0.68rem;color:var(--text2)">${u.email || u.phone || ''}</div>
      </div>
      <div class="mp-result-stars">${mpStarIcon()} ${stars}</div>
    </div>`;
  }).join('');

  container.querySelectorAll('.mp-search-result-item').forEach(item =>
    item.addEventListener('click', () => onSelect(item.dataset.uid, item.dataset.name))
  );
}

// Busca no formulário de desafio
const buscaInlineBtn = mpEl('mpBuscarJogador');
if (buscaInlineBtn) buscaInlineBtn.addEventListener('click', () => {
  const q = (mpEl('mpDesafioTarget').value || '').trim();
  mpBuscarJogador(q, results => {
    mpRenderSearchResults(results, mpEl('mpSearchResults'), (uid, name) => {
      MP.config.targetUid  = uid;
      MP.config.targetName = name;
      mpEl('mpDesafioTarget').value = name;
      mpEl('mpSearchResults').innerHTML = '';
      mpShowToast(`Jogador selecionado: ${name}`);
    });
  });
});
const desafioTargetInput = mpEl('mpDesafioTarget');
if (desafioTargetInput) desafioTargetInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && buscaInlineBtn) buscaInlineBtn.click();
});

// Busca na tab Buscar — player cards com botão desafiar
function mpRenderPlayerCards(results, container) {
  if (!container) return;
  if (!results.length) {
    container.innerHTML = `<p style="color:var(--text2);font-size:0.8rem;text-align:center;padding:20px">Nenhum jogador encontrado</p>`;
    return;
  }
  container.innerHTML = results.map(u => {
    const nome   = ((u.firstName || '') + ' ' + (u.lastName || '')).trim() || u.nome || u.email || 'Jogador';
    const stars  = (u.stats && u.stats.stars) || u.moedas || 0;
    const photo  = u.photoURL || u.foto || '';
    const avatar = photo ? `<img src="${photo}" alt="${nome}" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : mpAvatarLetter(nome);
    return `
    <div class="mp-player-card">
      <div class="mp-player-card-avatar">${avatar}</div>
      <div class="mp-player-card-info">
        <div class="mp-player-card-name">${nome}</div>
        <div class="mp-player-card-meta">${u.email || u.phone || ''} &nbsp;·&nbsp; ${mpStarIcon()} ${stars} estrelas</div>
      </div>
      <button class="mp-player-challenge-btn" data-uid="${u.uid}" data-name="${nome}"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:3px"><path d="M6.92 5H5L3 3l1-1 2 2v-.08l7 7-.71.71L6.92 5zM19.71 2.29l-2 2 .01.01-1.42 1.42-.01-.01-2.12 2.12.01.01-1.42 1.42-.01-.01-1.06 1.06 3.54 3.54 1.06-1.06-.01-.01 1.42-1.42.01.01 2.12-2.12-.01-.01 1.42-1.42.01.01 2-2L21 3l-1.29-.71zM3 17c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>Desafiar</button>
    </div>`;
  }).join('');

  container.querySelectorAll('.mp-player-challenge-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      MP.config.targetUid  = btn.dataset.uid;
      MP.config.targetName = btn.dataset.name;
      document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mp-tab-content').forEach(c => c.classList.remove('active'));
      const desTab = document.querySelector('[data-tab="desafios"]');
      if (desTab) desTab.classList.add('active');
      const desContent = mpEl('mpTabDesafios');
      if (desContent) desContent.classList.add('active');
      const targetInput = mpEl('mpDesafioTarget');
      if (targetInput) targetInput.value = btn.dataset.name;
      mpShowToast(`${btn.dataset.name} selecionado para desafiar!`);
    });
  });
}

const buscarBtn = mpEl('mpBuscarBtn');
if (buscarBtn) buscarBtn.addEventListener('click', () => {
  const q = (mpEl('mpBuscarInput').value || '').trim();
  mpBuscarJogador(q, results => mpRenderPlayerCards(results, mpEl('mpBuscarResultados')));
});
const buscarInput = mpEl('mpBuscarInput');
if (buscarInput) buscarInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && buscarBtn) buscarBtn.click();
});

// ─── RANKING GLOBAL ───────────────────────────────────────
function mpLoadRanking() {
  const el = mpEl('mpRankingList');
  if (!el) return;
  el.innerHTML = `<div class="mp-loading-rank">A carregar ranking...</div>`;

  // Buscar users com stats.stars — usar orderByChild em campo aninhado não é directo,
  // então busca todos e ordena no cliente
  db.ref('users').once('value', snap => {
    const players = [];
    snap.forEach(c => {
      const u = c.val();
      const stars = (u.stats && u.stats.stars) || u.moedas || 0;
      // Excluir do ranking global quem não tem nenhuma estrela
      if (stars <= 0) return;
      players.push({ uid: c.key, ...u, _stars: stars });
    });
    players.sort((a, b) => b._stars - a._stars);
    const top = players.slice(0, 50);

    if (top.length === 0) {
      el.innerHTML = `<p class="mp-sub-empty">Ranking sem dados ainda.</p>`;
      return;
    }

    el.innerHTML = top.map((p, i) => {
      const rank    = i + 1;
      const pos     = rank + 'º';
      const topCls  = rank <= 3 ? `top${rank}` : '';
      const nome    = ((p.firstName || '') + ' ' + (p.lastName || '')).trim() || p.nome || p.email || 'Jogador';
      const contact = p.email || p.phone || p.telefone || '';
      const photo   = p.photoURL || p.foto || '';
      return `
        <div class="mp-rank-item ${topCls}">
          <div class="mp-rank-pos">${pos}</div>
          <div class="mp-rank-avatar">${photo ? `<img src="${photo}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover">` : mpAvatarLetter(nome)}</div>
          <div class="mp-rank-info">
            <div class="mp-rank-name">${nome}</div>
            <div class="mp-rank-contact">${contact}</div>
          </div>
          <div class="mp-rank-stars">${mpStarIcon()} ${p._stars}</div>
        </div>`;
    }).join('');
  });
}

// ─── DISCIPLINAS E CATEGORIAS ─────────────────────────────
async function mpPreencherDisciplinas() {
  const sel = mpEl('mpDesafioDisciplina');
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Selecciona Disciplina --</option>`;

  try {
    const snap = await db.ref('questions').once('value');
    const discs = new Set();
    if (snap.val()) {
      Object.values(snap.val()).forEach(q => {
        // Suporta campo 'disciplina' (Firebase) e 'disc' (local)
        if (q.disciplina) discs.add(q.disciplina);
        else if (q.disc)  discs.add(q.disc);
      });
    }
    // Também incluir disciplinas da BD local do app
    if (typeof State !== 'undefined' && State.localDB) {
      State.localDB.forEach(q => {
        if (q.disc)        discs.add(q.disc);
        if (q.disciplina)  discs.add(q.disciplina);
      });
    }
    if (discs.size === 0) {
      ['Matemática','Português','História','Biologia','Física','Química','Geografia','Inglês']
        .forEach(d => discs.add(d));
    }
    [...discs].sort().forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d; sel.appendChild(opt);
    });
  } catch(e) {
    ['Matemática','Português','História','Biologia','Física','Química']
      .forEach(d => sel.insertAdjacentHTML('beforeend', `<option value="${d}">${d}</option>`));
  }

  sel.addEventListener('change', () => {
    MP.config.disciplina = sel.value;
    mpPreencherCategorias(sel.value);
  });
}

async function mpPreencherCategorias(disciplina) {
  const sel = mpEl('mpDesafioCategoria');
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Todas as Categorias --</option>`;
  MP.config.categoria = '';
  if (!disciplina) return;

  try {
    const cats = new Set();
    // Firebase: campo 'disciplina'
    const snap = await db.ref('questions').orderByChild('disciplina').equalTo(disciplina).once('value');
    snap.forEach(c => { const q = c.val(); if (q.categoria) cats.add(q.categoria); else if (q.cat) cats.add(q.cat); });
    // Fallback: campo 'disc' na BD local
    if (typeof State !== 'undefined' && State.localDB) {
      State.localDB.forEach(q => {
        if ((q.disc === disciplina || q.disciplina === disciplina) && (q.cat || q.categoria))
          cats.add(q.cat || q.categoria);
      });
    }
    if (cats.size > 0) {
      [...cats].sort().forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat; opt.textContent = cat; sel.appendChild(opt);
      });
    }
  } catch(e) {}

  sel.onchange = () => { MP.config.categoria = sel.value; };
}

// ─── CARREGAR PERGUNTAS ───────────────────────────────────
async function mpCarregarPerguntas(salaData) {
  const { disciplina, categoria, nivel, tipo } = salaData;
  const snap = await db.ref('questions').once('value');
  let perguntas = [];

  if (snap.val()) {
    Object.values(snap.val()).forEach(q => {
      const matchDisc = !disciplina || q.disciplina === disciplina;
      const matchCat  = !categoria  || q.categoria  === categoria;
      const matchNiv  = !nivel || nivel === 'todos' || nivel === 'all' || q.nivel === nivel || q.dificuldade === nivel;
      const matchTipo = !tipo || tipo === 'todos' || tipo === 'all'
        || q.tipo === tipo
        || (tipo.startsWith('multipla_img') && q.tipo === 'multipla' && q.imageURL);
      if (matchDisc && matchCat && matchNiv && matchTipo) perguntas.push(q);
    });
  }

  // Fallback local DB do app
  if (perguntas.length < 3 && typeof State !== 'undefined' && State.localDB) {
    State.localDB.forEach(q => {
      const matchDisc = !disciplina || q.disciplina === disciplina;
      const matchNiv  = !nivel || nivel === 'todos' || q.nivel === nivel || q.dificuldade === nivel;
      if (matchDisc && matchNiv) perguntas.push(q);
    });
  }

  return perguntas;
}

// ─── BOTÃO PRINCIPAL + BOTÕES VOLTAR ─────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnMultiplayer');
  if (btn) btn.addEventListener('click', mpInit);

  const backBtn = document.getElementById('mpBackBtn');
  if (backBtn) backBtn.addEventListener('click', () => {
    mpClearListeners();
    if (typeof showScreen === 'function') showScreen('screen-mainmenu');
    else {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
      const m = document.getElementById('screen-mainmenu');
      if (m) m.classList.add('active');
    }
  });

  const salaBack = document.getElementById('mpSalaBackBtn');
  if (salaBack) salaBack.addEventListener('click', () => {
    mpClearListeners();
    mpShowScreen('screen-multiplayer');
    mpLoadSalas();
  });

  // Iniciar listener global de desafios assim que o utilizador estiver autenticado
  // Também faz o pre-load do perfil para que mpGetMyInfoSync funcione em qualquer altura
  firebase.auth().onAuthStateChanged(async user => {
    if (user) {
      // Pré-carregar o perfil em cache (nome, estrelas) — necessário para utilizadores anónimos/telefone
      await mpGetMyInfoAsync();
      // Arrancar listener global de desafios com o uid real
      const uid = MP.myUid || user.uid;
      mpIniciarListenerGlobalDesafios(uid);
    } else {
      // Limpar cache ao fazer logout
      MP.myProfile = null;
      MP.myUid     = null;
    }
  });
});
