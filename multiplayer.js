/* ══════════════════════════════════════════════════════════
   BANDAQUIZ — multiplayer.js
   Sistema Multiplayer: Firebase RTDB, Desafios, Ranking, Salas
   ══════════════════════════════════════════════════════════ */

'use strict';

// ─── ESTADO MULTIPLAYER ────────────────────────────────────
const MP = {
  config: {
    modo: 'realtime',
    nivel: 'fácil',
    tipo: 'todos',
    tempo: 30,
    qtd: 10,
    maxplayers: 2,
    disciplina: '',
    categoria: '',
    targetUid: null,
    targetName: '',
  },
  sala: null,         // referência Firebase da sala
  salaId: null,
  gameRef: null,
  listeners: [],      // listeners para cleanup
  myUid: null,
  myProfile: null,
  questionTimer: null,
  currentQ: null,
  answered: false,
  liveCount: 0,
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
  return `<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
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

function mpGetMyInfo() {
  const auth = firebase.auth();
  const user  = auth.currentUser;
  if (!user) return null;
  const uid  = user.uid || (State.phoneUser && State.phoneUser.uid);
  const name = (State.profile && State.profile.nome) ||
               (State.phoneUser && State.phoneUser.nome) ||
               user.displayName || user.email || 'Jogador';
  const email = user.email || (State.phoneUser && State.phoneUser.phone) || '';
  const stars = (State.profile && State.profile.moedas) ||
                (State.phoneUser && State.phoneUser.moedas) || 0;
  return { uid: uid || email, name, email, stars };
}

function mpShowToast(msg) {
  if (typeof showToast === 'function') showToast(msg);
}

// ─── INICIALIZAÇÃO DO HUB ─────────────────────────────────
function mpInit() {
  const me = mpGetMyInfo();
  if (!me) {
    mpShowToast('Inicia sessão para aceder ao Multiplayer.');
    return;
  }
  MP.myUid     = me.uid;
  MP.myProfile = me;

  // Actualizar estrelas no header
  mpEl('mpUserStars').textContent = me.stars || 0;

  // Carregar salas, desafios, ranking
  mpLoadSalas();
  mpLoadDesafiosRecebidos();
  mpLoadRanking();
  mpPreencherDisciplinas();

  mpShowScreen('screen-multiplayer');
}

// ─── TABS ─────────────────────────────────────────────────
document.querySelectorAll('.mp-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.mp-tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    const el = mpEl('mpTab' + target.charAt(0).toUpperCase() + target.slice(1));
    if (el) el.classList.add('active');
    if (target === 'ranking') mpLoadRanking();
    if (target === 'salas')   mpLoadSalas();
  });
});

// ─── OPÇÕES DE CONFIGURAÇÃO (desafio) ────────────────────
document.querySelectorAll('[data-mpopt]').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.mpopt;
    document.querySelectorAll(`[data-mpopt="${key}"]`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const val = btn.dataset.v;
    if (key === 'tempo' || key === 'qtd' || key === 'maxplayers') {
      MP.config[key] = parseInt(val);
    } else {
      MP.config[key] = val;
    }
  });
});

// ─── SALAS ACTIVAS ────────────────────────────────────────
function mpLoadSalas() {
  const salasRef = db.ref('mp_salas').orderByChild('status').equalTo('waiting');
  salasRef.once('value', snap => {
    const list = mpEl('mpSalasList');
    const salas = [];
    snap.forEach(child => {
      const s = child.val();
      s._key = child.key;
      salas.push(s);
    });

    if (salas.length === 0) {
      list.innerHTML = `
        <div class="mp-empty-state">
          <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
          <p>Nenhuma sala activa de momento</p>
          <button class="btn-mp-action" id="btnCriarSala">Criar Sala</button>
        </div>`;
      mpEl('btnCriarSala').addEventListener('click', mpAbrirCriarSala);
      return;
    }

    list.innerHTML = salas.map(s => {
      const players = s.players ? Object.values(s.players) : [];
      const dots = Array.from({length: s.maxplayers}, (_, i) =>
        `<span class="mp-sala-player-dot ${players[i] ? 'active' : ''}"></span>`
      ).join('');
      return `
        <div class="mp-sala-card">
          <div class="mp-sala-badge">
            <span>SALA</span>
            <strong>#${s.roomNum || '?'}</strong>
          </div>
          <div class="mp-sala-info">
            <div class="mp-sala-name">${s.disciplina || 'Geral'} — ${s.nivel || 'Médio'}</div>
            <div class="mp-sala-meta">${players.length}/${s.maxplayers} jogadores · ${s.modo === 'realtime' ? '⚡ Tempo Real' : '⏳ Assíncrono'}</div>
            <div class="mp-sala-players" style="margin-top:4px">${dots}</div>
          </div>
          <button class="mp-sala-join" data-salaid="${s._key}">Entrar</button>
        </div>`;
    }).join('') + `<div style="text-align:center;margin-top:10px">
      <button class="btn-mp-action" id="btnCriarSala">+ Criar Nova Sala</button></div>`;

    mpEl('btnCriarSala').addEventListener('click', mpAbrirCriarSala);
    list.querySelectorAll('.mp-sala-join').forEach(btn => {
      btn.addEventListener('click', () => mpEntrarSala(btn.dataset.salaid));
    });
  });
}

function mpAbrirCriarSala() {
  // Usa as configs do formulário de desafio
  mpCriarSala(null);
}

async function mpCriarSala(targetUid) {
  const me = mpGetMyInfo();
  if (!me) { mpShowToast('Sessão necessária'); return; }

  const roomNum = mpAutoRoomNumber();
  const salaData = {
    roomNum,
    status: 'waiting',
    modo: MP.config.modo,
    nivel: MP.config.nivel,
    tipo: MP.config.tipo,
    tempo: MP.config.tempo,
    qtd:   MP.config.qtd,
    maxplayers: MP.config.maxplayers,
    disciplina: MP.config.disciplina,
    categoria:  MP.config.categoria,
    host: me.uid,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    players: { [me.uid]: { uid: me.uid, name: me.name, email: me.email, stars: me.stars, score: 0, joined: true } },
    scores: {},
    history: {},
    invitedUid: targetUid || null,
  };

  const ref = await db.ref('mp_salas').push(salaData);
  mpEntrarSala(ref.key);
}

function mpEntrarSala(salaId) {
  const me = mpGetMyInfo();
  if (!me) return;

  const salaRef = db.ref(`mp_salas/${salaId}`);

  // Adicionar jogador
  salaRef.child('players').child(me.uid).set({
    uid: me.uid, name: me.name, email: me.email,
    stars: me.stars, score: 0, joined: true,
  });

  MP.salaId  = salaId;
  MP.sala    = salaRef;

  mpShowSalaScreen(salaRef);
}

// ─── SALA DE JOGO ─────────────────────────────────────────
function mpShowSalaScreen(salaRef) {
  mpShowScreen('screen-mp-sala');
  mpEl('mpSalaWaiting').style.display  = 'block';
  mpEl('mpSalaGame').style.display     = 'none';
  mpEl('mpSalaResult').style.display   = 'none';

  // Carregar info da sala
  salaRef.once('value', snap => {
    const s = snap.val();
    mpEl('mpSalaNumDisplay').textContent  = `Sala #${s.roomNum}`;
    mpEl('mpSalaModeDisplay').textContent = s.modo === 'realtime' ? '⚡ Tempo Real' : '⏳ Assíncrono';
  });

  // Listener de jogadores
  mpAddListener(salaRef.child('players'), 'value', snap => {
    const players = [];
    snap.forEach(c => players.push(c.val()));
    mpRenderPlayersGrid(players);
    mpRenderScoreboard(players);

    // Mostrar botão iniciar se sou host e há pelo menos 2 jogadores
    salaRef.once('value', s => {
      const data = s.val();
      const me   = mpGetMyInfo();
      const btn  = mpEl('btnIniciarDesafio');
      if (data.host === me.uid && players.length >= 2 && data.status === 'waiting') {
        btn.style.display = 'inline-flex';
      } else {
        btn.style.display = 'none';
      }
    });
  });

  // Listener de status do jogo
  mpAddListener(salaRef.child('status'), 'value', snap => {
    const status = snap.val();
    if (status === 'playing') mpStartGame();
    if (status === 'finished') mpShowResults();
  });

  // Listener de round em tempo real
  mpAddListener(salaRef.child('currentRound'), 'value', snap => {
    const round = snap.val();
    if (round !== null && mpEl('mpSalaGame').style.display !== 'none') {
      mpRenderQuestion(round);
    }
  });

  // Listener de respostas ao vivo
  mpAddListener(salaRef.child('liveAnswers'), 'value', snap => {
    if (!snap.val()) return;
    const answers = snap.val();
    mpRenderLiveFeed(answers);
    mpUpdateScoreChips(answers);
  });

  // Listener de scores
  mpAddListener(salaRef.child('scores'), 'value', snap => {
    if (!snap.val()) return;
    const scores = snap.val();
    salaRef.child('players').once('value', ps => {
      const players = [];
      ps.forEach(c => {
        const p = c.val();
        p.score = (scores[p.uid] || {}).total || 0;
        players.push(p);
      });
      mpRenderScoreboard(players);
    });
  });

  mpEl('btnIniciarDesafio').onclick = mpIniciarJogo;
}

function mpRenderPlayersGrid(players) {
  const grid   = mpEl('mpPlayersGrid');
  const salaRef = MP.sala;
  const me     = mpGetMyInfo();
  let maxP = 2;
  if (salaRef) {
    salaRef.once('value', s => {
      maxP = (s.val() && s.val().maxplayers) || players.length;
      const slots = Array.from({length: maxP}, (_, i) => {
        const p = players[i];
        if (p) {
          const isMe = p.uid === (me && me.uid);
          return `<div class="mp-player-slot filled ${isMe ? 'me' : ''}">
            <div class="mp-player-slot-avatar">${mpAvatarLetter(p.name)}</div>
            <div class="mp-player-slot-name">${p.name}${isMe ? ' (tu)' : ''}</div>
          </div>`;
        }
        return `<div class="mp-player-slot">
          <div class="mp-player-slot-avatar" style="background:rgba(99,102,241,0.15);font-size:1.2rem">👤</div>
          <div class="mp-player-slot-empty">Aguardando...</div>
        </div>`;
      });
      grid.innerHTML = slots.join('');
    });
  }
}

function mpRenderScoreboard(players) {
  const sb = mpEl('mpScoreboard');
  sb.innerHTML = players.map(p => `
    <div class="mp-score-chip" data-uid="${p.uid}">
      <div class="mp-score-name">${p.name.split(' ')[0]}</div>
      <div class="mp-score-pts">${p.score || 0}</div>
      <div class="mp-score-indicator"></div>
    </div>`).join('');
}

function mpUpdateScoreChips(answers) {
  // Highlight the current answerer
  document.querySelectorAll('.mp-score-chip').forEach(chip => {
    chip.classList.remove('answered-right', 'answered-wrong', 'is-turn');
  });
  if (!answers) return;
  Object.entries(answers).forEach(([uid, data]) => {
    const chip = document.querySelector(`.mp-score-chip[data-uid="${uid}"]`);
    if (chip) {
      if (data.correct === true)  chip.classList.add('answered-right');
      if (data.correct === false) chip.classList.add('answered-wrong');
      chip.querySelector('.mp-score-indicator').textContent = data.correct ? '✅' : (data.correct === false ? '❌' : '');
    }
  });
}

// ─── INICIAR JOGO (host) ──────────────────────────────────
async function mpIniciarJogo() {
  const salaRef = MP.sala;
  if (!salaRef) return;

  const snap     = await salaRef.once('value');
  const salaData = snap.val();

  // Carregar perguntas
  let perguntas = [];
  try {
    perguntas = await mpCarregarPerguntas(salaData);
  } catch(e) {
    mpShowToast('Erro ao carregar perguntas. Verifique a conexão.');
    return;
  }

  if (perguntas.length < (salaData.qtd || 10)) {
    mpShowToast('Perguntas insuficientes para o desafio.');
    return;
  }

  const selected = mpShuffleArray(perguntas).slice(0, salaData.qtd || 10);

  // Determinar ordem dos jogadores para turnos
  const players = Object.values(salaData.players || {});
  const turnOrder = mpShuffleArray(players.map(p => p.uid));

  // Guardar perguntas e estado no Firebase
  await salaRef.update({
    status: 'playing',
    questions: selected,
    turnOrder,
    currentQIndex: 0,
    scores: Object.fromEntries(players.map(p => [p.uid, { total: 0, answers: {} }])),
    liveAnswers: {},
    startedAt: firebase.database.ServerValue.TIMESTAMP,
  });

  // Emitir primeira pergunta
  mpEmitirPergunta(0, selected, turnOrder, salaData.modo);
}

async function mpEmitirPergunta(index, questions, turnOrder, modo) {
  const salaRef = MP.sala;
  if (!salaRef || !questions[index]) return;

  const q = questions[index];
  const playerTurn = turnOrder[index % turnOrder.length];

  const roundData = {
    index,
    question: q.pergunta || q.question || '',
    answers: mpShuffleArray([
      q.correta || q.resposta_certa || '',
      ...(q.erradas || q.respostas_erradas || []).slice(0, 3)
    ].filter(Boolean)),
    correct: q.correta || q.resposta_certa || '',
    tipo: q.tipo || 'multipla',
    total: questions.length,
    playerTurn: modo === 'realtime' ? null : playerTurn, // null = todos respondem
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

  const me      = mpGetMyInfo();
  const isMyTurn = !round.playerTurn || round.playerTurn === me.uid;

  mpEl('mpQNum').textContent  = `${round.index + 1}/${round.total}`;
  mpEl('mpQTurn').textContent  = isMyTurn ? '🎯 A tua vez!' : '⏳ Aguarda...';
  mpEl('mpQTurn').style.display = 'inline-block';

  MP.currentQ   = round;
  MP.answered   = false;

  mpEl('mpQText').textContent = round.question;

  // Respostas
  const answersEl = mpEl('mpQAnswers');
  if (isMyTurn) {
    answersEl.innerHTML = round.answers.map((a, i) => `
      <button class="mp-q-answer" data-idx="${i}" data-val="${encodeURIComponent(a)}">${a}</button>
    `).join('');
    answersEl.querySelectorAll('.mp-q-answer').forEach(btn => {
      btn.addEventListener('click', () => mpResponder(btn.dataset.val, round, btn));
    });
  } else {
    answersEl.innerHTML = `<div class="mp-q-blocked">🔒 Aguarda a tua vez de responder</div>`;
  }

  // Timer
  mpClearTimer();
  if (MP.sala) {
    const tempo = 0; // Vai buscar da sala
    MP.sala.once('value', s => {
      const t = (s.val() && s.val().tempo) || 0;
      if (t > 0 && isMyTurn) mpStartTimer(t, round);
      else mpEl('mpSalaTimer').textContent = '--';
    });
  }
}

function mpStartTimer(seconds, round) {
  let left = seconds;
  mpEl('mpSalaTimer').textContent = left;
  MP.questionTimer = setInterval(() => {
    left--;
    const el = mpEl('mpSalaTimer');
    el.textContent = left;
    if (left <= 5) el.classList.add('urgent');
    else           el.classList.remove('urgent');
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

  const me      = mpGetMyInfo();
  const val     = decodeURIComponent(encodedVal);
  const correct = val === round.correct;
  const points  = correct ? 10 : 0;

  mpClearTimer();

  // Visual feedback
  if (btnEl) {
    btnEl.classList.add(correct ? 'correct' : 'wrong');
    // Mostrar resposta certa
    mpEl('mpQAnswers').querySelectorAll('.mp-q-answer').forEach(b => {
      if (decodeURIComponent(b.dataset.val) === round.correct) b.classList.add('correct');
      b.disabled = true;
    });
  }

  // Registar no Firebase
  const salaRef = MP.sala;
  if (!salaRef) return;

  await salaRef.child(`liveAnswers/${me.uid}`).set({
    uid: me.uid, name: me.name,
    correct, points,
    answer: val,
    answeredAt: firebase.database.ServerValue.TIMESTAMP,
  });

  // Atualizar score
  const scoreSnap = await salaRef.child(`scores/${me.uid}`).once('value');
  const cur       = scoreSnap.val() || { total: 0, answers: {} };
  cur.total = (cur.total || 0) + points;
  cur.answers[round.index] = { correct, points };
  await salaRef.child(`scores/${me.uid}`).set(cur);

  // Host verifica se todos responderam → avança pergunta
  const snap = await salaRef.once('value');
  const data = snap.val();
  if (data.host === me.uid) {
    mpCheckAdvance(data, round);
  }
}

async function mpCheckAdvance(data, round) {
  const salaRef = MP.sala;
  if (!salaRef) return;

  const players     = Object.values(data.players || {});
  const liveAnswers = data.liveAnswers || {};
  const expectedN   = data.modo === 'realtime' ? players.length : 1;
  const answered    = Object.keys(liveAnswers).length;

  if (answered < expectedN) return; // Aguardar mais respostas

  // Guardar no histórico
  const histEntry = { ...liveAnswers, question: round.question, correct: round.correct };
  await salaRef.child(`history/${round.index}`).set(histEntry);

  // Avançar para próxima pergunta
  const nextIndex = round.index + 1;
  const questions = data.questions || [];

  if (nextIndex >= questions.length) {
    await salaRef.update({ status: 'finished' });
  } else {
    await salaRef.child('currentQIndex').set(nextIndex);
    setTimeout(() => {
      mpEmitirPergunta(nextIndex, questions, data.turnOrder, data.modo);
    }, 1500);
  }
}

// ─── LIVE FEED ────────────────────────────────────────────
function mpRenderLiveFeed(answers) {
  if (!answers) return;
  const feed = mpEl('mpLiveFeed');
  const items = Object.values(answers);
  if (!items.length) return;

  const html = items.map(a => `
    <div class="mp-feed-item">
      <span class="mp-feed-dot ${a.correct ? 'ok' : 'err'}"></span>
      <span class="mp-feed-msg"><strong>${a.name}</strong> ${a.correct ? 'acertou' : 'errou'} (${a.points || 0} pts)</span>
    </div>`).join('');

  feed.innerHTML = `<div class="mp-section-title" style="font-size:0.75rem;margin:0 0 8px">Actividade em tempo real</div>${html}`;
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
  const history = data.history || {};

  // Calcular pontuação final
  const ranked = players.map(p => ({
    ...p,
    total: (scores[p.uid] && scores[p.uid].total) || 0,
    answers: (scores[p.uid] && scores[p.uid].answers) || {},
  })).sort((a, b) => b.total - a.total);

  // Converter 0-20 (escala de valores angolana)
  const qtd   = data.qtd || 10;
  const perQ  = 20 / qtd;
  const medals = ['🥇','🥈','🥉'];

  // Pódio (top 3)
  mpEl('mpResultPodium').innerHTML = ranked.slice(0, 3).map((p, i) => `
    <div class="mp-podium-place p${i+1}">
      <div class="mp-podium-medal">${medals[i] || '🎖'}</div>
      <div class="mp-podium-name">${p.name}</div>
      <div class="mp-podium-pts">${(p.total * perQ / 10).toFixed(1)}v</div>
    </div>`).join('');

  // Tabela completa com histórico
  mpEl('mpResultTable').innerHTML = `
    <table class="mp-history-table">
      <thead><tr>
        <th>#</th><th>Jogador</th><th>Pts</th><th>Nota (0-20)</th>
      </tr></thead>
      <tbody>
        ${ranked.map((p, i) => `<tr>
          <td>${i+1}</td>
          <td>${p.name}</td>
          <td>${p.total}</td>
          <td class="mp-hist-score">${(p.total * perQ / 10).toFixed(1)}</td>
        </tr>`).join('')}
      </tbody>
    </table>`;

  mpEl('btnMpSalaVoltar').onclick = () => {
    mpClearListeners();
    mpShowScreen('screen-multiplayer');
    mpLoadSalas();
  };
}

// ─── DESAFIOS RECEBIDOS ───────────────────────────────────
function mpLoadDesafiosRecebidos() {
  const me = mpGetMyInfo();
  if (!me) return;

  const ref = db.ref('mp_desafios').orderByChild('targetUid').equalTo(me.uid);
  mpAddListener(ref, 'value', snap => {
    const el = mpEl('mpDesafiosRecebidos');
    const desafios = [];
    snap.forEach(c => {
      const d = c.val();
      if (d.status === 'pending') { d._key = c.key; desafios.push(d); }
    });

    if (desafios.length === 0) {
      el.innerHTML = `<p class="mp-sub-empty">Sem desafios pendentes</p>`;
      return;
    }

    el.innerHTML = desafios.map(d => `
      <div class="mp-desafio-card">
        <div class="mp-desafio-header">
          <div class="mp-desafio-avatar">${mpAvatarLetter(d.fromName)}</div>
          <div class="mp-desafio-info">
            <div class="mp-desafio-name">${d.fromName || 'Jogador'}</div>
            <div class="mp-desafio-meta">
              ${d.disciplina || 'Geral'} · ${d.nivel} · ${d.qtd} perguntas · ${d.modo === 'realtime' ? '⚡ Tempo Real' : '⏳ Assíncrono'}
            </div>
          </div>
        </div>
        <div class="mp-desafio-actions">
          <button class="mp-btn-aceitar" data-key="${d._key}" data-sala="${d.salaId}">✅ Aceitar</button>
          <button class="mp-btn-recusar" data-key="${d._key}">❌ Recusar</button>
        </div>
      </div>`).join('');

    el.querySelectorAll('.mp-btn-aceitar').forEach(btn => {
      btn.addEventListener('click', () => mpAceitarDesafio(btn.dataset.key, btn.dataset.sala));
    });
    el.querySelectorAll('.mp-btn-recusar').forEach(btn => {
      btn.addEventListener('click', () => mpRecusarDesafio(btn.dataset.key));
    });
  });
}

async function mpAceitarDesafio(desafioKey, salaId) {
  await db.ref(`mp_desafios/${desafioKey}`).update({ status: 'accepted' });
  mpEntrarSala(salaId);
}

async function mpRecusarDesafio(desafioKey) {
  await db.ref(`mp_desafios/${desafioKey}`).update({ status: 'declined' });
  mpShowToast('Desafio recusado.');
}

// ─── ENVIAR DESAFIO ───────────────────────────────────────
mpEl('btnEnviarDesafio').addEventListener('click', async () => {
  const me = mpGetMyInfo();
  if (!me) { mpShowToast('Sessão necessária'); return; }
  if (!MP.config.targetUid) { mpShowToast('Selecciona um jogador para desafiar.'); return; }
  if (!MP.config.disciplina) { mpShowToast('Selecciona uma disciplina.'); return; }

  // Criar sala e desafio
  const roomNum  = mpAutoRoomNumber();
  const salaData = {
    roomNum, status: 'waiting',
    modo: MP.config.modo, nivel: MP.config.nivel, tipo: MP.config.tipo,
    tempo: MP.config.tempo, qtd: MP.config.qtd, maxplayers: MP.config.maxplayers,
    disciplina: MP.config.disciplina, categoria: MP.config.categoria,
    host: me.uid, invitedUid: MP.config.targetUid,
    createdAt: firebase.database.ServerValue.TIMESTAMP,
    players: { [me.uid]: { uid: me.uid, name: me.name, email: me.email, stars: me.stars, score: 0, joined: true } },
    scores: {}, history: {}, liveAnswers: {},
  };
  const salaRef = await db.ref('mp_salas').push(salaData);

  // Criar notificação de desafio
  await db.ref('mp_desafios').push({
    fromUid: me.uid, fromName: me.name,
    targetUid: MP.config.targetUid, targetName: MP.config.targetName,
    salaId: salaRef.key,
    modo: MP.config.modo, nivel: MP.config.nivel,
    disciplina: MP.config.disciplina, categoria: MP.config.categoria,
    qtd: MP.config.qtd, tempo: MP.config.tempo,
    status: 'pending',
    createdAt: firebase.database.ServerValue.TIMESTAMP,
  });

  mpShowToast(`Desafio enviado para ${MP.config.targetName}! 🎯`);
  mpEntrarSala(salaRef.key);
});

// ─── PESQUISA DE JOGADORES ────────────────────────────────
function mpBuscarJogador(query, onResults) {
  if (!query || query.length < 3) return;
  const q = query.trim().toLowerCase();

  // Pesquisar no RTDB (profiles de utilizadores)
  db.ref('users').once('value', snap => {
    const results = [];
    snap.forEach(child => {
      const u = child.val();
      const me = mpGetMyInfo();
      if (u.uid === (me && me.uid)) return;
      const nome  = (u.nome  || '').toLowerCase();
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
  if (results.length === 0) {
    container.innerHTML = `<div style="padding:10px;text-align:center;color:var(--text2);font-size:0.8rem">Nenhum jogador encontrado</div>`;
    return;
  }
  container.innerHTML = results.map(u => `
    <div class="mp-search-result-item" data-uid="${u.uid}" data-name="${u.nome || u.email || '?'}">
      <div class="mp-result-avatar">${mpAvatarLetter(u.nome || u.email)}</div>
      <div>
        <div class="mp-result-name">${u.nome || u.email || u.phone || 'Jogador'}</div>
        <div style="font-size:0.68rem;color:var(--text2)">${u.email || u.phone || ''}</div>
      </div>
      <div class="mp-result-stars">${mpStarIcon()} ${u.moedas || 0}</div>
    </div>`).join('');

  container.querySelectorAll('.mp-search-result-item').forEach(item => {
    item.addEventListener('click', () => onSelect(item.dataset.uid, item.dataset.name));
  });
}

// Busca inline no formulário de desafio
mpEl('mpBuscarJogador').addEventListener('click', () => {
  const q = mpEl('mpDesafioTarget').value.trim();
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
mpEl('mpDesafioTarget').addEventListener('keydown', e => {
  if (e.key === 'Enter') mpEl('mpBuscarJogador').click();
});

// Busca na tab Buscar
mpEl('mpBuscarBtn').addEventListener('click', () => {
  const q = mpEl('mpBuscarInput').value.trim();
  mpBuscarJogador(q, results => {
    mpRenderSearchResults(results, mpEl('mpBuscarResultados'), (uid, name) => {
      // Seleccionar e pré-preencher desafio
      MP.config.targetUid  = uid;
      MP.config.targetName = name;
      mpShowToast(`${name} seleccionado. Vai ao tab Desafios para configurar!`);
    });
  });
});

// Mostrar cards na tab buscar com botão de desafiar
function mpRenderPlayerCards(results, container) {
  if (results.length === 0) {
    container.innerHTML = `<p style="color:var(--text2);font-size:0.8rem;text-align:center;padding:20px">Nenhum jogador encontrado</p>`;
    return;
  }
  container.innerHTML = results.map(u => `
    <div class="mp-player-card">
      <div class="mp-player-card-avatar">${mpAvatarLetter(u.nome || u.email)}</div>
      <div class="mp-player-card-info">
        <div class="mp-player-card-name">${u.nome || u.email || 'Jogador'}</div>
        <div class="mp-player-card-meta">
          ${u.email || u.phone || ''} &nbsp;·&nbsp;
          ${mpStarIcon()} ${u.moedas || 0} estrelas
        </div>
      </div>
      <button class="mp-player-challenge-btn" data-uid="${u.uid}" data-name="${u.nome || u.email}">⚔️ Desafiar</button>
    </div>`).join('');

  container.querySelectorAll('.mp-player-challenge-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      MP.config.targetUid  = btn.dataset.uid;
      MP.config.targetName = btn.dataset.name;
      // Mudar para tab de desafios
      document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.mp-tab-content').forEach(c => c.classList.remove('active'));
      document.querySelector('[data-tab="desafios"]').classList.add('active');
      mpEl('mpTabDesafios').classList.add('active');
      mpEl('mpDesafioTarget').value = btn.dataset.name;
      mpShowToast(`${btn.dataset.name} selecionado para desafiar!`);
    });
  });
}

mpEl('mpBuscarBtn').addEventListener('click', () => {
  const q = mpEl('mpBuscarInput').value.trim();
  mpBuscarJogador(q, results => {
    mpRenderPlayerCards(results, mpEl('mpBuscarResultados'));
  });
}, { once: false });

// ─── RANKING GLOBAL ───────────────────────────────────────
function mpLoadRanking() {
  const el = mpEl('mpRankingList');
  el.innerHTML = `<div class="mp-loading-rank">A carregar ranking...</div>`;

  db.ref('users').orderByChild('moedas').limitToLast(50).once('value', snap => {
    const players = [];
    snap.forEach(c => players.push({ uid: c.key, ...c.val() }));
    players.reverse();

    if (players.length === 0) {
      el.innerHTML = `<p class="mp-sub-empty">Ranking sem dados ainda.</p>`;
      return;
    }

    el.innerHTML = players.map((p, i) => {
      const rank    = i + 1;
      const topCls  = rank <= 3 ? `top${rank}` : '';
      const pos     = rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank;
      const contact = p.email || p.phone || p.telefone || '';
      const photo   = p.photoURL || p.foto || '';
      const avatar  = photo
        ? `<img src="${photo}" alt="${p.nome}">`
        : mpAvatarLetter(p.nome || p.email);
      return `
        <div class="mp-rank-item ${topCls}">
          <div class="mp-rank-pos">${pos}</div>
          <div class="mp-rank-avatar">${photo ? `<img src="${photo}" alt="">` : mpAvatarLetter(p.nome || p.email)}</div>
          <div class="mp-rank-info">
            <div class="mp-rank-name">${p.nome || p.email || 'Jogador'}</div>
            <div class="mp-rank-contact">${contact}</div>
          </div>
          <div class="mp-rank-stars">${mpStarIcon()} ${p.moedas || 0}</div>
        </div>`;
    }).join('');
  });
}

// ─── DISCIPLINAS E CATEGORIAS ─────────────────────────────
async function mpPreencherDisciplinas() {
  const sel = mpEl('mpDesafioDisciplina');
  sel.innerHTML = `<option value="">-- Selecciona Disciplina --</option>`;

  // Tentar buscar da nuvem
  try {
    const snap = await db.ref('questions').once('value');
    const discs = new Set();
    if (snap.val()) {
      const data = snap.val();
      Object.values(data).forEach(q => {
        if (q.disciplina) discs.add(q.disciplina);
      });
    }

    // Fallback se vazio
    if (discs.size === 0) {
      ['Matemática','Português','História','Biologia','Física','Química','Geografia','Inglês']
        .forEach(d => discs.add(d));
    }

    discs.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d; opt.textContent = d;
      sel.appendChild(opt);
    });

    sel.addEventListener('change', () => {
      MP.config.disciplina = sel.value;
      mpPreencherCategorias(sel.value);
    });
  } catch(e) {
    ['Matemática','Português','História','Biologia','Física','Química']
      .forEach(d => sel.insertAdjacentHTML('beforeend', `<option value="${d}">${d}</option>`));
  }
}

async function mpPreencherCategorias(disciplina) {
  const sel = mpEl('mpDesafioCategoria');
  sel.innerHTML = `<option value="">-- Todas as Categorias --</option>`;
  if (!disciplina) return;

  try {
    const snap = await db.ref('questions').orderByChild('disciplina').equalTo(disciplina).once('value');
    const cats = new Set();
    snap.forEach(c => { const q = c.val(); if (q.categoria) cats.add(q.categoria); });
    cats.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat; opt.textContent = cat;
      sel.appendChild(opt);
    });
  } catch(e) {}

  sel.addEventListener('change', () => { MP.config.categoria = sel.value; });
}

// ─── CARREGAR PERGUNTAS PARA O DESAFIO ────────────────────
async function mpCarregarPerguntas(salaData) {
  const { disciplina, categoria, nivel, tipo, qtd } = salaData;
  let ref = db.ref('questions');

  const snap = await ref.once('value');
  let perguntas = [];
  snap.forEach(c => {
    const q = c.val();
    const matchDisc = !disciplina || q.disciplina === disciplina;
    const matchCat  = !categoria  || q.categoria  === categoria;
    const matchNiv  = nivel === 'all' || !nivel || q.nivel === nivel || q.dificuldade === nivel;
    const matchTipo = !tipo || tipo === 'todos' || q.tipo === tipo;
    if (matchDisc && matchCat && matchNiv && matchTipo) perguntas.push(q);
  });

  // Fallback: usar DB local do app
  if (perguntas.length < 5 && typeof State !== 'undefined' && State.localDB) {
    perguntas = State.localDB.filter(q => {
      const matchDisc = !disciplina || q.disciplina === disciplina;
      const matchNiv  = !nivel || nivel === 'all' || q.nivel === nivel || q.dificuldade === nivel;
      return matchDisc && matchNiv;
    });
  }

  return perguntas;
}

// ─── BOTÃO PRINCIPAL MULTIPLAYER ─────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btnMultiplayer');
  if (btn) btn.addEventListener('click', mpInit);

  // Botão voltar do hub
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

  // Botão voltar da sala
  const salaBack = document.getElementById('mpSalaBackBtn');
  if (salaBack) salaBack.addEventListener('click', () => {
    mpClearListeners();
    mpShowScreen('screen-multiplayer');
    mpLoadSalas();
  });
});
