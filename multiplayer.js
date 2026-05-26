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
  const user  = firebase.auth().currentUser;
  let uid, name, email, phone;

  if (user) {
    uid   = user.uid;
    email = user.email || '';
    phone = user.phoneNumber || '';
    name  = user.displayName || '';
  } else if (typeof State !== 'undefined' && State.phoneUser) {
    uid   = State.phoneUser.uid;
    email = State.phoneUser.email || '';
    phone = State.phoneUser.phone || '';
    name  = State.phoneUser.nome || '';
  } else {
    return null;
  }

  // Nome a partir do profile do app
  if (!name && typeof State !== 'undefined' && State.profile) {
    name = ((State.profile.firstName || '') + ' ' + (State.profile.lastName || '')).trim();
  }
  // Tentar buscar nome do Firebase
  if (!name) {
    try {
      const snap = await db.ref(`users/${uid}`).once('value');
      const data = snap.val();
      if (data) {
        name = ((data.firstName || '') + ' ' + (data.lastName || '')).trim() || data.nome || '';
        email = email || data.email || '';
        phone = phone || data.phone || '';
      }
    } catch(e) {}
  }
  name = name || email || phone || 'Jogador';

  const stars = await mpGetStars(uid);
  MP.myStars = stars;
  return { uid, name, email, phone, stars };
}

// Versão síncrona rápida para uso imediato (sem await)
function mpGetMyInfoSync() {
  const user = firebase.auth().currentUser;
  let uid, name, email, phone;
  if (user) {
    uid   = user.uid;
    email = user.email || '';
    phone = user.phoneNumber || '';
    name  = user.displayName || '';
  } else if (typeof State !== 'undefined' && State.phoneUser) {
    uid   = State.phoneUser.uid;
    email = '';
    phone = State.phoneUser.phone || '';
    name  = State.phoneUser.nome || '';
  } else {
    return null;
  }
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
    const salas = [];
    snap.forEach(child => {
      const s = child.val(); s._key = child.key; salas.push(s);
    });

    if (salas.length === 0) {
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

    list.innerHTML = salas.map(s => {
      const players = s.players ? Object.values(s.players) : [];
      const modoLabel = s.modoJogo ? ({ aprendizado:'📚 Aprendizado', concurso:'🏆 Concurso', prova:'📝 Prova', imagem:'🖼️ Imagem' }[s.modoJogo] || s.modoJogo) : '';
      const dots = Array.from({length: s.maxplayers || 2}, (_, i) =>
        `<span class="mp-sala-player-dot ${players[i] ? 'active' : ''}"></span>`
      ).join('');
      return `
        <div class="mp-sala-card">
          <div class="mp-sala-badge"><span>SALA</span><strong>#${s.roomNum || '?'}</strong></div>
          <div class="mp-sala-info">
            <div class="mp-sala-name">${s.disciplina || 'Geral'} — ${s.nivel || 'Todos'}</div>
            <div class="mp-sala-meta">${modoLabel} · ${players.length}/${s.maxplayers || 2} jogadores · ${s.modoPerg === 'realtime' ? '⚡ Tempo Real' : '⏳ Assíncrono'}</div>
            <div class="mp-sala-players" style="margin-top:4px">${dots}</div>
          </div>
          <button class="mp-sala-join" data-salaid="${s._key}">Entrar</button>
        </div>`;
    }).join('') + `<div style="text-align:center;margin-top:10px"><button class="btn-mp-action" id="btnCriarSala">+ Criar Nova Sala</button></div>`;

    const b = mpEl('btnCriarSala');
    if (b) b.addEventListener('click', mpAbrirCriarSala);
    list.querySelectorAll('.mp-sala-join').forEach(btn =>
      btn.addEventListener('click', () => mpEntrarSala(btn.dataset.salaid))
    );
  });
}

function mpAbrirCriarSala() { mpCriarSala(null); }

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
function mpShowSalaScreen(salaRef) {
  mpShowScreen('screen-mp-sala');
  mpEl('mpSalaWaiting').style.display = 'block';
  mpEl('mpSalaGame').style.display    = 'none';
  mpEl('mpSalaResult').style.display  = 'none';

  salaRef.once('value', snap => {
    const s = snap.val();
    if (!s) return;
    mpEl('mpSalaNumDisplay').textContent  = `Sala #${s.roomNum || '?'}`;
    mpEl('mpSalaModeDisplay').textContent = s.modoPerg === 'realtime' ? '⚡ Tempo Real' : '⏳ Assíncrono';
  });

  mpAddListener(salaRef.child('players'), 'value', snap => {
    const players = [];
    snap.forEach(c => players.push(c.val()));

    salaRef.once('value', s => {
      const data    = s.val();
      const maxP    = (data && data.maxplayers) || 2;
      const me      = mpGetMyInfoSync();
      const btn     = mpEl('btnIniciarDesafio');

      mpRenderPlayersGrid(players, maxP);
      mpRenderScoreboard(players);

      if (!btn) return;
      btn.style.display = (data && data.host === (me?.uid || MP.myUid) && players.length >= 2 && data.status === 'waiting')
        ? 'inline-flex' : 'none';
    });
  });

  mpAddListener(salaRef.child('status'), 'value', snap => {
    const status = snap.val();
    if (status === 'playing')  mpStartGame();
    if (status === 'finished') mpShowResults();
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
      <div class="mp-player-slot-avatar" style="background:rgba(99,102,241,0.15);font-size:1.2rem">👤</div>
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
      if (ind) ind.textContent = data.correct ? '✅' : '❌';
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
    turnEl.textContent = isMyTurn ? '🎯 A tua vez!' : '⏳ Aguarda...';
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
    answersEl.innerHTML = `<div class="mp-q-blocked">🔒 Aguarda a tua vez de responder</div>`;
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

  feed.innerHTML = `<div class="mp-section-title" style="font-size:0.75rem;margin:0 0 8px">🔴 Actividade em tempo real</div>` +
    items.map(a => `
      <div class="mp-feed-item">
        <span class="mp-feed-dot ${a.correct ? 'ok' : 'err'}"></span>
        <span class="mp-feed-msg"><strong>${a.name}</strong> ${a.correct ? '✅ acertou' : '❌ errou'} <span style="opacity:.6">(${a.points || 0} pts)</span></span>
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
  const medals = ['🥇','🥈','🥉'];
  const me     = mpGetMyInfoSync();

  // Dar estrelas com base na posição
  ranked.forEach((p, i) => {
    const starsGanhas = i === 0 ? 5 : i === 1 ? 3 : i === 2 ? 2 : 1;
    if (p.uid === me?.uid) {
      mpAddStars(p.uid, starsGanhas);
      MP.myStars += starsGanhas;
      const starsEl = mpEl('mpUserStars');
      if (starsEl) starsEl.textContent = MP.myStars;
      mpShowToast(`+${starsGanhas} estrelas ganhas! 🌟`);
    }
  });

  // Pódio
  const podiumEl = mpEl('mpResultPodium');
  if (podiumEl) {
    podiumEl.innerHTML = ranked.slice(0, 3).map((p, i) => `
      <div class="mp-podium-place p${i+1}">
        <div class="mp-podium-medal">${medals[i] || '🎖'}</div>
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

// ─── DESAFIOS RECEBIDOS ───────────────────────────────────
function mpLoadDesafiosRecebidos() {
  const me = mpGetMyInfoSync();
  if (!me) return;

  const ref = db.ref('mp_desafios').orderByChild('targetUid').equalTo(me.uid);
  mpAddListener(ref, 'value', snap => {
    const el = mpEl('mpDesafiosRecebidos');
    if (!el) return;
    const desafios = [];
    snap.forEach(c => { const d = c.val(); if (d.status === 'pending') { d._key = c.key; desafios.push(d); } });

    if (desafios.length === 0) {
      el.innerHTML = `<p class="mp-sub-empty">Sem desafios pendentes</p>`;
      return;
    }

    const modoLabels = { aprendizado:'📚 Aprendizado', concurso:'🏆 Concurso', prova:'📝 Prova', imagem:'🖼️ Imagem' };

    el.innerHTML = desafios.map(d => `
      <div class="mp-desafio-card">
        <div class="mp-desafio-header">
          <div class="mp-desafio-avatar">${mpAvatarLetter(d.fromName)}</div>
          <div class="mp-desafio-info">
            <div class="mp-desafio-name">${d.fromName || 'Jogador'}</div>
            <div class="mp-desafio-meta">
              ${d.disciplina || 'Geral'} · ${modoLabels[d.modoJogo] || d.modoJogo || ''} · Nível: ${d.nivel || 'Todos'}<br>
              ${d.qtd} perguntas · ${d.modoPerg === 'realtime' ? '⚡ Tempo Real' : '⏳ Assíncrono'}
            </div>
          </div>
        </div>
        <div class="mp-desafio-actions">
          <button class="mp-btn-aceitar" data-key="${d._key}" data-sala="${d.salaId}">✅ Aceitar</button>
          <button class="mp-btn-recusar" data-key="${d._key}">❌ Recusar</button>
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
  await db.ref(`mp_desafios/${key}`).update({ status: 'accepted' });
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

  await db.ref('mp_desafios').push({
    fromUid: me.uid, fromName: me.name,
    targetUid: MP.config.targetUid, targetName: MP.config.targetName,
    salaId: salaRef.key,
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

  mpShowToast(`Desafio enviado para ${MP.config.targetName}! 🎯`);
  await mpEntrarSala(salaRef.key);
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
      <button class="mp-player-challenge-btn" data-uid="${u.uid}" data-name="${nome}">⚔️ Desafiar</button>
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

    const medals = ['🥇','🥈','🥉'];
    el.innerHTML = top.map((p, i) => {
      const rank    = i + 1;
      const pos     = rank <= 3 ? medals[rank-1] : rank;
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
});
