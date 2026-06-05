/* ══════════════════════════════════════════════════════════
   BANDAQUIZ — multiplayer.js  (versão completa e corrigida)
   Lógica completa de Multiplayer Online (Firebase RTDB)
   ══════════════════════════════════════════════════════════
   Fluxo:
   1. Utilizador abre Hub (screen-multiplayer)
   2. Cria Sala → escolhe configuração (reusa screen-gamesetup)
      OU recebe desafio / junta-se a sala existente
      OU entra por código de sala
   3. Sala (screen-mp-sala): lobby de espera → jogo → resultado

   Estrutura RTDB:
   /rooms/{roomId}
     status: 'waiting'|'playing'|'finished'
     config: { mode, disc, cat, diff, answerType, timerSecs, qtdQs, maxPlayers, modoPerg }
     host: uid
     questions: [{...}]      ← copiadas no início do jogo
     players/{uid}: { name, photoURL, score, correct, wrong, ready, lastSeen }
     answers/{uid}/{qIndex}: { answer, isRight, ts }
     currentQ: number
     startedAt: timestamp

   /challenges/{targetUid}/{challengeId}
     from: uid, fromName, roomId, config, ts
   ══════════════════════════════════════════════════════════ */

'use strict';

// ─── ESPERAR DOM + FIREBASE ──────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  MultiplayerSystem.init();
});

const MultiplayerSystem = (() => {

  // ── Referências Firebase (já inicializado em app.js) ────
  let _db, _auth;

  // ── Estado local do MP ───────────────────────────────────
  const MP = {
    roomId:        null,
    roomRef:       null,
    roomListener:  null,
    isHost:        false,
    myUid:         null,
    myName:        null,
    myPhoto:       null,
    config:        {},
    questions:     [],
    qIndex:        0,
    answered:      false,
    timerInterval: null,
    timerLeft:     0,
    challengeListener: null,
    desafioTargetUid:  null,
    statsUpdated:      false,   // evita dupla actualização de stats
  };

  // ── Helpers (reutilizam funções globais de app.js) ───────
  function $i(id) { return document.getElementById(id); }
  function toast(msg) { if (typeof showToast === 'function') showToast(msg); }
  function goScreen(id) { if (typeof showScreen === 'function') showScreen(id); }
  function escHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function genRoomId() {
    return Math.floor(1000 + Math.random() * 9000).toString();
  }
  function formatScore(s) {
    return (s / 10).toFixed(1).replace('.', ',');
  }

  // ── Inicialização ────────────────────────────────────────
  function init() {
    if (typeof firebase === 'undefined') {
      setTimeout(init, 300);
      return;
    }
    _db   = firebase.database();
    _auth = firebase.auth();

    // Botão MULTIPLAYER no menu principal
    const btnMP = $i('btnMultiplayer');
    if (btnMP) btnMP.onclick = openHub;

    // Navegação do Hub
    const mpBackBtn = $i('mpBackBtn');
    if (mpBackBtn) mpBackBtn.onclick = () => goScreen('screen-mainmenu');

    // Tabs do Hub
    document.querySelectorAll('.mp-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.mp-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.mp-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        const id = 'mpTab' + tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
        const el = $i(id);
        if (el) el.classList.add('active');
        if (tab.dataset.tab === 'ranking') loadMpRanking();
      };
    });

    // Opções de configuração do desafio (mp-opt buttons)
    document.querySelectorAll('.mp-opt').forEach(btn => {
      btn.onclick = () => {
        const group = btn.dataset.mpopt;
        document.querySelectorAll(`.mp-opt[data-mpopt="${group}"]`).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (group === 'modoJogo') mpUpdateTiposUI(btn.dataset.v);
      };
    });

    // Botão Criar Sala
    const btnCriarSala = $i('btnCriarSala');
    if (btnCriarSala) btnCriarSala.onclick = iniciarCriacaoSala;

    // Botão Buscar Jogador (no form de desafio)
    const mpBuscarJogador = $i('mpBuscarJogador');
    if (mpBuscarJogador) mpBuscarJogador.onclick = buscarJogadorDesafio;

    // Buscar na tab Buscar
    const mpBuscarBtn = $i('mpBuscarBtn');
    if (mpBuscarBtn) mpBuscarBtn.onclick = buscarJogadoresTab;

    const mpBuscarInput = $i('mpBuscarInput');
    if (mpBuscarInput) mpBuscarInput.addEventListener('keypress', e => { if (e.key === 'Enter') buscarJogadoresTab(); });

    const mpDesafioInput = $i('mpDesafioTarget');
    if (mpDesafioInput) mpDesafioInput.addEventListener('keypress', e => { if (e.key === 'Enter') buscarJogadorDesafio(); });

    // Botão Enviar Desafio
    const btnEnviar = $i('btnEnviarDesafio');
    if (btnEnviar) btnEnviar.onclick = enviarDesafio;

    // Botão Iniciar Desafio (host na sala)
    const btnIniciar = $i('btnIniciarDesafio');
    if (btnIniciar) btnIniciar.onclick = hostIniciarJogo;

    // Botão Voltar na sala
    const btnSalaBack = $i('mpSalaBackBtn');
    if (btnSalaBack) btnSalaBack.onclick = sairDaSala;

    // Botão Eliminar Sala (host)
    const btnSalaDelete = $i('mpSalaDeleteBtn');
    if (btnSalaDelete) btnSalaDelete.onclick = eliminarSala;

    // Botão Voltar ao Hub no resultado
    const btnVoltar = $i('btnMpSalaVoltar');
    if (btnVoltar) btnVoltar.onclick = () => { sairDaSala(); goScreen('screen-multiplayer'); };

    // Injectar botão "Entrar por Código" no Hub (tab salas)
    _injectJoinByCodeBtn();

    // Preencher selects de disciplina/categoria
    populateMpDiscs();

    // Escutar desafios recebidos quando auth muda
    _auth.onAuthStateChanged(user => {
      if (user) {
        MP.myUid   = user.uid;
        MP.myName  = null;
        MP.myPhoto = null;
        startChallengeListener(user.uid);
      } else {
        MP.myUid = null;
        if (MP.challengeListener) {
          MP.challengeListener();
          MP.challengeListener = null;
        }
      }
    });

    // Setup do setup screen para MP
    bindMpSetupScreen();
  }

  // ── Injectar botão "Entrar por Código" ───────────────────
  function _injectJoinByCodeBtn() {
    const tabSalas = $i('mpTabSalas');
    if (!tabSalas) return;

    // Verificar se já existe
    if ($i('btnEntrarCodigo')) return;

    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;align-items:center';
    wrapper.innerHTML = `
      <input type="text" id="mpCodigoInput" maxlength="4" placeholder="Código da sala (ex: 1234)"
        style="flex:1;padding:10px 14px;border-radius:10px;border:1.5px solid rgba(99,102,241,0.3);
        background:var(--card);color:var(--text);font-size:0.9rem;outline:none;font-family:inherit">
      <button class="btn-mp-action" id="btnEntrarCodigo" style="white-space:nowrap">
        <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px">
          <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/>
        </svg>
        Entrar
      </button>`;
    tabSalas.insertBefore(wrapper, tabSalas.firstChild);

    const codeInput = $i('mpCodigoInput');
    const joinBtn   = $i('btnEntrarCodigo');

    // Aceitar apenas dígitos
    if (codeInput) {
      codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
      });
      codeInput.addEventListener('keypress', e => {
        if (e.key === 'Enter') joinBtn?.click();
      });
    }

    if (joinBtn) joinBtn.onclick = () => {
      const code = codeInput?.value?.trim();
      if (!code || code.length < 4) { toast('Introduza um código de sala válido (4 dígitos).'); return; }
      entrarNaSala(code);
    };
  }

  // ── Hub ──────────────────────────────────────────────────
  function openHub() {
    if (!_auth.currentUser) {
      toast('Inicie sessão para jogar no Multiplayer.');
      return;
    }

    const uid = _auth.currentUser.uid;
    MP.myUid = uid;

    if (typeof State !== 'undefined' && State.profile) {
      MP.myName  = ((State.profile.firstName || '') + ' ' + (State.profile.lastName || '')).trim();
      MP.myPhoto = State.profile.photoURL || '';
    } else {
      _db.ref('users/' + uid).once('value').then(snap => {
        const d = snap.val();
        if (d) {
          MP.myName  = ((d.firstName || '') + ' ' + (d.lastName || '')).trim();
          MP.myPhoto = d.photoURL || '';
        }
      });
    }

    // Actualizar estrelas
    _db.ref('users/' + uid + '/stats/stars').once('value').then(snap => {
      const el = $i('mpUserStars');
      if (el) el.textContent = snap.val() || 0;
    });

    loadSalasActivas();
    loadDesafiosRecebidos();
    populateMpDiscs();

    goScreen('screen-multiplayer');
  }

  // ── Salas Activas ────────────────────────────────────────
  function loadSalasActivas() {
    _db.ref('rooms').orderByChild('status').equalTo('waiting').once('value').then(snap => {
      const list = $i('mpSalasList');
      if (!list) return;
      const rooms = snap.val();
      if (!rooms) {
        list.innerHTML = `
          <div class="mp-empty-state">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
            <p>Nenhuma sala activa de momento</p>
            <button class="btn-mp-action" onclick="document.getElementById('btnCriarSala')?.click()">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
              </svg>
              Criar Sala
            </button>
          </div>`;
        return;
      }

      list.innerHTML = '';
      const modeNames = { aprendizado: 'Aprendizado', concurso: 'Concurso', prova: 'Prova', imagem: 'Imagem' };

      Object.entries(rooms).forEach(([roomId, room]) => {
        const players    = room.players ? Object.keys(room.players).length : 0;
        const max        = room.config?.maxPlayers || 2;
        if (players >= max) return;
        const cfg        = room.config || {};
        const modeLabel  = modeNames[cfg.mode] || cfg.mode || '—';

        const card = document.createElement('div');
        card.className = 'mp-sala-card';
        card.innerHTML = `
          <div class="mp-sala-badge">
            <svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#fff">
              <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
            </svg>
          </div>
          <div class="mp-sala-info">
            <div class="mp-sala-name">Sala #${escHtml(roomId)}</div>
            <div class="mp-sala-meta">${escHtml(modeLabel)} · ${escHtml(cfg.disc || 'Todas')} · ${players}/${max} jogadores</div>
          </div>
          <button class="btn-mp-action" style="padding:8px 14px">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px">
              <path d="M11 7L9.6 8.4l2.6 2.6H2v2h10.2l-2.6 2.6L11 17l5-5-5-5zm9 12h-8v2h8c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-8v2h8v14z"/>
            </svg>
            Entrar
          </button>`;
        card.querySelector('.btn-mp-action').onclick = () => entrarNaSala(roomId);
        list.appendChild(card);
      });

      if (list.children.length === 0) {
        list.innerHTML = `
          <div class="mp-empty-state">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
            <p>Todas as salas estão cheias ou sem salas abertas</p>
            <button class="btn-mp-action" onclick="document.getElementById('btnCriarSala')?.click()">
              <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11h-4v4h-2v-4H7v-2h4V7h2v4h4v2z"/>
              </svg>
              Criar Sala
            </button>
          </div>`;
      }
    }).catch(() => {
      const list = $i('mpSalasList');
      if (list) list.innerHTML = '<p class="mp-sub-empty">Erro ao carregar salas</p>';
    });
  }

  // ── Criar Sala (via screen-gamesetup reutilizado) ────────
  let _mpCreateMode = false;

  function bindMpSetupScreen() {
    const setupScroll = document.querySelector('#screen-gamesetup .scroll-content');
    if (!setupScroll) return;
    if ($i('mpCreateRoomBtn')) return; // já injectado

    const btnMpCreate = document.createElement('button');
    btnMpCreate.className = 'btn-primary w-full mt-md';
    btnMpCreate.id = 'mpCreateRoomBtn';
    btnMpCreate.style.cssText = 'display:none;background:linear-gradient(135deg,#6366F1,#8B5CF6)';
    btnMpCreate.innerHTML = `
      <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
      CRIAR SALA MULTIPLAYER`;
    btnMpCreate.onclick = criarSalaComSetup;
    setupScroll.appendChild(btnMpCreate);
  }

  function iniciarCriacaoSala() {
    _mpCreateMode = true;

    const startBtn = $i('startGameBtn');
    const mpBtn    = $i('mpCreateRoomBtn');
    if (startBtn) startBtn.style.display = 'none';
    if (mpBtn)    mpBtn.style.display    = '';

    const setupTitle = $i('setupTitle');
    if (setupTitle) setupTitle.textContent = 'Configurar: Sala Multiplayer';

    const badge = $i('setupModeBadge');
    if (badge) badge.textContent = 'Multiplayer';

    if (typeof State !== 'undefined') {
      State.currentMode = 'aprendizado';
      State.currentDiff = 'all';
      State.currentDisc = 'all';
      State.currentCat  = 'all';
      State.timerSecs   = 30;
      State.currentAnswerType = 'todos';
      State.dbSource = 'cloud';

      document.querySelectorAll('#dbSourceSelector .db-source-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.source === 'cloud');
      });
      document.querySelectorAll('#setupAnswerTypeSelector .answer-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.atype === 'todos');
      });
      document.querySelectorAll('.timer-opt[data-seconds]').forEach(o => {
        o.classList.toggle('active', parseInt(o.dataset.seconds) === 30);
      });
      document.querySelectorAll('#difficultyOptions .timer-opt').forEach(o => {
        o.classList.toggle('active', o.dataset.diff === 'all');
      });
      if (typeof updateSetupFlashcardVisibility === 'function') updateSetupFlashcardVisibility();
      if (typeof populateSetupDiscs === 'function') populateSetupDiscs(null);
    }

    goScreen('screen-gamesetup');
  }

  async function criarSalaComSetup() {
    const uid = _auth.currentUser?.uid;
    if (!uid) { toast('Sem sessão activa.'); return; }

    const disc       = $i('setupDisc')?.value || 'all';
    const cat        = $i('setupCat')?.value  || 'all';
    const mode       = (typeof State !== 'undefined' ? State.currentMode       : 'aprendizado') || 'aprendizado';
    const diff       = (typeof State !== 'undefined' ? State.currentDiff       : 'all')         || 'all';
    const answerType = (typeof State !== 'undefined' ? State.currentAnswerType : 'todos')        || 'todos';
    const timerSecs  = (typeof State !== 'undefined' ? State.timerSecs         : 30)             || 30;
    const dbSrc      = (typeof State !== 'undefined' ? State.dbSource          : 'cloud')        || 'cloud';

    const qtdEl = $i('qtdQuestionsInput') || $i('setupQtdInput');
    const qtdQs = qtdEl ? parseInt(qtdEl.value) || 10 : 10;

    const config = {
      mode, disc, cat, diff, answerType, timerSecs,
      qtdQs, maxPlayers: 4, modoPerg: 'realtime', dbSource: dbSrc,
    };

    await criarSala(config);
  }

  async function criarSala(config) {
    const uid = _auth.currentUser?.uid;
    if (!uid) { toast('Sem sessão activa.'); return; }
    if (!navigator.onLine) { toast('Sem conexão à internet.'); return; }

    if (typeof showLoading === 'function') showLoading('A criar sala...');

    try {
      const questions = await fetchQuestionsForMP(config);
      if (questions.length < 1) {
        if (typeof hideLoading === 'function') hideLoading();
        toast('Nenhuma pergunta disponível com esses filtros.');
        return;
      }

      const roomId  = genRoomId();
      const roomRef = _db.ref('rooms/' + roomId);

      // Verificar colisão de ID
      const existing = await roomRef.once('value');
      if (existing.exists()) {
        if (typeof hideLoading === 'function') hideLoading();
        toast('Número de sala ocupado. Tente novamente.');
        return;
      }

      const playerName = MP.myName?.trim() || _auth.currentUser.email?.split('@')[0] || 'Jogador';

      await roomRef.set({
        status:    'waiting',
        host:      uid,
        config:    config,
        questions: questions,
        currentQ:  0,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {
          [uid]: {
            name:     playerName,
            photoURL: MP.myPhoto || '',
            score:    0,
            correct:  0,
            wrong:    0,
            ready:    false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
          }
        }
      });

      // Limpeza automática da sala após 2h
      setTimeout(() => {
        roomRef.child('status').once('value').then(s => {
          if (s.val() !== 'finished') roomRef.remove();
        }).catch(() => {});
      }, 2 * 60 * 60 * 1000);

      if (typeof hideLoading === 'function') hideLoading();

      _restoreSetupButtons();

      MP.roomId    = roomId;
      MP.roomRef   = roomRef;
      MP.isHost    = true;
      MP.config    = config;
      MP.questions = questions;
      MP.statsUpdated = false;

      abrirSala(roomId, true);

    } catch (e) {
      if (typeof hideLoading === 'function') hideLoading();
      toast('Erro ao criar sala: ' + e.message);
    }
  }

  function _restoreSetupButtons() {
    _mpCreateMode = false;
    const startBtn = $i('startGameBtn');
    const mpBtn    = $i('mpCreateRoomBtn');
    if (startBtn) startBtn.style.display = '';
    if (mpBtn)    mpBtn.style.display    = 'none';
    const setupTitle = $i('setupTitle');
    if (setupTitle) setupTitle.textContent = 'Configurar Jogo';
    const badge = $i('setupModeBadge');
    if (badge) badge.textContent = 'Aprendizado';
  }

  // ── Entrar numa Sala ─────────────────────────────────────
  async function entrarNaSala(roomId) {
    const uid = _auth.currentUser?.uid;
    if (!uid) { toast('Inicie sessão.'); return; }
    if (!navigator.onLine) { toast('Sem conexão.'); return; }

    if (typeof showLoading === 'function') showLoading('A entrar na sala...');

    try {
      const roomRef = _db.ref('rooms/' + roomId);
      const snap    = await roomRef.once('value');
      const room    = snap.val();

      if (!room) {
        if (typeof hideLoading === 'function') hideLoading();
        toast('Sala não encontrada. Verifique o código.');
        return;
      }
      if (room.status !== 'waiting') {
        if (typeof hideLoading === 'function') hideLoading();
        toast('Esta sala já começou ou terminou.');
        return;
      }

      const players    = room.players || {};
      const maxPlayers = room.config?.maxPlayers || 4;
      if (Object.keys(players).length >= maxPlayers) {
        if (typeof hideLoading === 'function') hideLoading();
        toast('Sala cheia!');
        return;
      }

      // Se já estiver na sala, apenas abrir
      if (players[uid]) {
        if (typeof hideLoading === 'function') hideLoading();
        MP.roomId    = roomId;
        MP.roomRef   = roomRef;
        MP.isHost    = room.host === uid;
        MP.config    = room.config || {};
        MP.questions = room.questions || [];
        MP.statsUpdated = false;
        abrirSala(roomId, room.host === uid);
        return;
      }

      const playerName = MP.myName?.trim() || _auth.currentUser.email?.split('@')[0] || 'Jogador';

      await roomRef.child('players/' + uid).set({
        name:     playerName,
        photoURL: MP.myPhoto || '',
        score:    0,
        correct:  0,
        wrong:    0,
        ready:    false,
        lastSeen: firebase.database.ServerValue.TIMESTAMP,
      });

      if (typeof hideLoading === 'function') hideLoading();

      MP.roomId    = roomId;
      MP.roomRef   = roomRef;
      MP.isHost    = false;
      MP.config    = room.config || {};
      MP.questions = room.questions || [];
      MP.statsUpdated = false;

      abrirSala(roomId, false);

    } catch (e) {
      if (typeof hideLoading === 'function') hideLoading();
      toast('Erro ao entrar na sala: ' + e.message);
    }
  }

  // ── Abrir Sala (tela de jogo) ────────────────────────────
  function abrirSala(roomId, isHost) {
    MP.roomId   = roomId;
    MP.isHost   = isHost;
    MP.qIndex   = 0;
    MP.answered = false;

    const numEl   = $i('mpSalaNumDisplay');
    const modeEl  = $i('mpSalaModeDisplay');
    const modeNames = { aprendizado: 'Aprendizado', concurso: 'Concurso', prova: 'Prova', imagem: 'Quiz por Imagem' };
    if (numEl)  numEl.textContent  = 'Sala #' + roomId;
    if (modeEl) modeEl.textContent = modeNames[MP.config.mode] || MP.config.mode || 'Tempo Real';

    const delBtn = $i('mpSalaDeleteBtn');
    if (delBtn) delBtn.style.display = isHost ? '' : 'none';

    const iniciarBtn = $i('btnIniciarDesafio');
    if (iniciarBtn) iniciarBtn.style.display = isHost ? '' : 'none';

    _showSalaState('waiting');
    _clearScoreboard();
    _clearLiveFeed();
    _clearHistory();

    goScreen('screen-mp-sala');

    // Escutar a sala em tempo real
    if (MP.roomListener && MP.roomRef) {
      MP.roomRef.off('value', MP.roomListener);
    }
    MP.roomRef = _db.ref('rooms/' + roomId);
    MP.roomListener = MP.roomRef.on('value', snap => {
      const room = snap.val();
      if (!room) { sairDaSala(); toast('Sala foi eliminada.'); return; }
      onRoomUpdate(room);
    });

    _updatePresence();

    // Heartbeat de presença a cada 30s
    if (MP._presenceInterval) clearInterval(MP._presenceInterval);
    MP._presenceInterval = setInterval(_updatePresence, 30000);
  }

  function _updatePresence() {
    if (!MP.roomRef || !MP.myUid) return;
    MP.roomRef.child('players/' + MP.myUid + '/lastSeen')
      .set(firebase.database.ServerValue.TIMESTAMP)
      .catch(() => {});
  }

  // ── Listener da Sala ─────────────────────────────────────
  function onRoomUpdate(room) {
    const status  = room.status;
    const players = room.players || {};

    _renderScoreboard(players);
    _renderPlayersGrid(players, room.host);

    if (status === 'waiting') {
      _showSalaState('waiting');
      const iniciarBtn = $i('btnIniciarDesafio');
      if (iniciarBtn && MP.isHost) {
        // Host pode iniciar com pelo menos 1 outro jogador, ou sozinho para testar
        iniciarBtn.style.display = Object.keys(players).length >= 1 ? '' : 'none';
      }

    } else if (status === 'playing') {
      _showSalaState('game');
      MP.config    = room.config    || MP.config;
      MP.questions = room.questions || MP.questions;

      const currentQ = room.currentQ || 0;
      if (currentQ !== MP.qIndex) {
        MP.qIndex   = currentQ;
        MP.answered = false;
        renderMpQuestion(room);
      } else if (!MP.answered) {
        // Primeira vez que entra em jogo
        renderMpQuestion(room);
      }

      _renderLiveFeed(room.answers || {}, players, currentQ);

    } else if (status === 'finished') {
      _showSalaState('result');
      renderMpResult(room);
      if (!MP.statsUpdated) {
        MP.statsUpdated = true;
        updateMpStatsAfterGame(room);
      }
    }
  }

  // ── Iniciar Jogo (host) ──────────────────────────────────
  async function hostIniciarJogo() {
    if (!MP.isHost) return;
    const uid = _auth.currentUser?.uid;
    if (!uid) return;

    if (typeof showLoading === 'function') showLoading('A iniciar jogo...');

    try {
      const snap = await MP.roomRef.once('value');
      const room = snap.val();
      let questions = room?.questions;

      if (!questions || questions.length < 1) {
        questions = await fetchQuestionsForMP(MP.config);
        if (questions.length < 1) {
          if (typeof hideLoading === 'function') hideLoading();
          toast('Nenhuma pergunta disponível com esses filtros.');
          return;
        }
        await MP.roomRef.child('questions').set(questions);
      }

      MP.questions = questions;

      await MP.roomRef.update({
        status:    'playing',
        currentQ:  0,
        startedAt: firebase.database.ServerValue.TIMESTAMP,
      });

      if (typeof hideLoading === 'function') hideLoading();

    } catch (e) {
      if (typeof hideLoading === 'function') hideLoading();
      toast('Erro ao iniciar: ' + e.message);
    }
  }

  // ── Renderizar Pergunta MP ───────────────────────────────
  function renderMpQuestion(room) {
    const q = MP.questions[MP.qIndex];
    if (!q) return;

    stopMpTimer();
    MP.answered = false;

    const total     = MP.questions.length;
    const numEl     = $i('mpQNum');
    const textEl    = $i('mpQText');
    const answersEl = $i('mpQAnswers');
    const turnEl    = $i('mpQTurn');

    if (numEl)  numEl.textContent = (MP.qIndex + 1) + ' / ' + total;
    if (textEl) {
      const atype = q.answerType || 'multipla';
      if (atype === 'lacunas') {
        textEl.textContent = q.lacunaFrase || q.question || '';
      } else if (atype === 'flashcard') {
        textEl.textContent = q.flashFront || q.question || '';
      } else {
        textEl.textContent = q.question || '';
      }
    }
    if (turnEl) {
      turnEl.textContent = 'Responda!';
      turnEl.className = 'mp-q-turn my-turn';
    }
    if (answersEl) answersEl.innerHTML = '';

    // Imagem da pergunta
    const qCard      = $i('mpQuestionCard');
    const existingImg = qCard?.querySelector('.mp-q-image');
    if (existingImg) existingImg.remove();
    const qImg = q.questionImg || q.imgQuestion || (q.answerType === 'multipla2' ? q.img : null);
    if (qImg && qCard && answersEl) {
      const img = document.createElement('img');
      img.className = 'mp-q-image';
      img.src = qImg;
      img.alt = 'Imagem da pergunta';
      img.style.cssText = 'width:100%;border-radius:10px;margin-bottom:10px;max-height:200px;object-fit:contain';
      qCard.insertBefore(img, answersEl);
    }

    const atype = q.answerType || 'multipla';
    if (atype === 'lacunas') {
      _renderMpLacuna(q);
    } else if (atype === 'flashcard') {
      _renderMpFlashcard(q);
    } else {
      _renderMpMultipla(q, answersEl);
    }

    // Timer
    const timerSecs = MP.config.timerSecs || 0;
    const timerEl   = $i('mpSalaTimer');
    if (timerSecs > 0) {
      startMpTimer(timerSecs);
      if (timerEl) { timerEl.textContent = timerSecs + 's'; timerEl.style.color = ''; }
    } else {
      if (timerEl) timerEl.textContent = 'Livre';
    }
  }

  function _renderMpMultipla(q, container) {
    if (!container) return;
    const atype = q.answerType || 'multipla';
    const isVF  = atype === 'vf';

    let options;
    if (isVF) {
      options = [
        { letter: 'A', text: 'Verdadeiro' },
        { letter: 'B', text: 'Falso' },
      ];
    } else {
      options = ['A','B','C','D']
        .map(l => ({ letter: l, text: q[l.toLowerCase()] || '' }))
        .filter(o => o.text);
      options = shuffle(options);
    }

    const isImg2 = atype === 'multipla2';
    if (isImg2) container.classList.add('image-mode');
    else        container.classList.remove('image-mode');

    const displayLabels = ['A','B','C','D'];

    options.forEach((opt, idx) => {
      const btn = document.createElement('button');
      btn.className = 'mp-q-answer';
      btn.dataset.letter = opt.letter;

      if (isImg2) {
        const imgSrc = q['img' + opt.letter] || '';
        btn.innerHTML = imgSrc
          ? `<img src="${escHtml(imgSrc)}" alt="${escHtml(opt.letter)}" class="mp-ans-img" style="width:100%;max-height:100px;object-fit:cover;border-radius:6px;margin-bottom:4px"><span>${escHtml(opt.letter)}</span>`
          : `<span>${escHtml(opt.text)}</span>`;
      } else {
        btn.innerHTML = `<span class="mp-ans-letter">${displayLabels[idx]}</span><span class="mp-ans-text">${escHtml(opt.text)}</span>`;
      }

      btn.onclick = () => handleMpAnswer(opt.letter, q, btn, container);
      container.appendChild(btn);
    });
  }

  function _renderMpLacuna(q) {
    const answersEl = $i('mpQAnswers');
    if (!answersEl) return;
    const resposta = q.lacunaResposta || q.lacunaAnswer || q.a || '';
    answersEl.innerHTML = `
      <div class="mp-lacuna-wrap">
        <input type="text" class="mp-lacuna-input" id="mpLacunaInput"
          placeholder="Escreva a resposta..." autocomplete="off" autocorrect="off" spellcheck="false">
        <button class="btn-mp-action" id="mpLacunaCheck" style="margin-top:8px;width:100%">
          <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          Confirmar
        </button>
        <div id="mpLacunaFeedback" class="mp-lacuna-feedback" style="display:none"></div>
      </div>`;
    const checkBtn = $i('mpLacunaCheck');
    const input    = $i('mpLacunaInput');
    const feedback = $i('mpLacunaFeedback');

    if (checkBtn) checkBtn.onclick = () => {
      const val     = input?.value?.trim() || '';
      const isRight = val.toLowerCase() === resposta.toLowerCase();
      if (feedback) {
        feedback.style.display = '';
        feedback.textContent   = isRight ? 'Correcto!' : ('Resposta correcta: ' + resposta);
        feedback.style.color   = isRight ? '#22C55E' : '#EF4444';
      }
      if (input)    input.disabled    = true;
      if (checkBtn) checkBtn.disabled = true;
      handleMpAnswer(val, q, null, answersEl, isRight);
    };
    if (input) input.addEventListener('keypress', e => {
      if (e.key === 'Enter') checkBtn?.click();
    });
  }

  function _renderMpFlashcard(q) {
    const answersEl = $i('mpQAnswers');
    if (!answersEl) return;
    const front = q.flashFront || q.question || '';
    const back  = q.flashBack  || q.a || '';
    answersEl.innerHTML = `
      <div class="mp-flashcard-wrap">
        <div class="mp-flashcard" id="mpFlashcard">
          <div class="mp-fc-front">${escHtml(front)}</div>
          <div class="mp-fc-back">${escHtml(back)}</div>
        </div>
        <p class="mp-fc-hint">Toque para virar</p>
        <div class="mp-fc-actions" id="mpFcActions" style="display:none">
          <button class="mp-fc-btn mp-fc-wrong" data-res="wrong">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            Não sabia
          </button>
          <button class="mp-fc-btn mp-fc-hard" data-res="hard">
            <svg viewBox="0 0 24 24"><path d="M11.5 2C6.81 2 3 5.81 3 10.5S6.81 19 11.5 19h.5v3c4.86-2.34 8-7 8-11.5C20 5.81 16.19 2 11.5 2zm1 14.5h-2v-2h2v2zm0-4h-2c0-3.25 3-3 3-5 0-1.1-.9-2-2-2s-2 .9-2 2h-2c0-2.21 1.79-4 4-4s4 1.79 4 4c0 2.5-3 2.75-3 5z"/></svg>
            Difícil
          </button>
          <button class="mp-fc-btn mp-fc-good" data-res="good">
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            Sabia!
          </button>
        </div>
      </div>`;
    const fc = $i('mpFlashcard');
    if (fc) fc.onclick = () => {
      fc.classList.toggle('flipped');
      const hint = answersEl.querySelector('.mp-fc-hint');
      if (hint) hint.style.display = 'none';
      const acts = $i('mpFcActions');
      if (acts) acts.style.display = 'flex';
    };
    answersEl.querySelectorAll('.mp-fc-btn').forEach(btn => {
      btn.onclick = () => {
        const res     = btn.dataset.res;
        const isRight = res === 'good' || res === 'hard';
        handleMpAnswer(res, q, null, answersEl, isRight);
      };
    });
  }

  // ── Resposta MP ──────────────────────────────────────────
  async function handleMpAnswer(value, q, clickedBtn, container, forcedRight) {
    if (MP.answered) return;
    MP.answered = true;
    stopMpTimer();

    const uid = _auth.currentUser?.uid;
    if (!uid) return;

    const atype = q.answerType || 'multipla';
    let isRight;

    if (typeof forcedRight === 'boolean') {
      isRight = forcedRight;
    } else {
      const correctLetter = q.answer;
      const correctText   = q[correctLetter?.toLowerCase()] || '';
      isRight = value === correctLetter ||
                (value && correctText && value.trim().toLowerCase() === correctText.trim().toLowerCase());
    }

    // Marcar visual
    if (container && atype !== 'lacunas' && atype !== 'flashcard') {
      container.querySelectorAll('.mp-q-answer').forEach(b => {
        b.disabled = true;
        const bLetter = b.dataset.letter;
        if (bLetter === q.answer) b.classList.add('correct');
        else if (b === clickedBtn && !isRight) b.classList.add('wrong');
      });
    }

    // Sons
    if (isRight) { if (typeof playCorrectSound === 'function') playCorrectSound(); }
    else         { if (typeof playWrongSound   === 'function') playWrongSound();   }

    const pts = isRight ? 5 : 0;

    // Guardar no RTDB
    try {
      await _db.ref(`rooms/${MP.roomId}/answers/${uid}/${MP.qIndex}`).set({
        answer:  value,
        isRight: isRight,
        ts:      firebase.database.ServerValue.TIMESTAMP,
      });
      await _db.ref(`rooms/${MP.roomId}/players/${uid}`).transaction(p => {
        if (!p) return p;
        p.score   = (p.score   || 0) + pts;
        p.correct = (p.correct || 0) + (isRight ? 1 : 0);
        p.wrong   = (p.wrong   || 0) + (isRight ? 0 : 1);
        return p;
      });
    } catch (e) {
      console.warn('MP answer save error:', e);
    }

    // Avançar pergunta (host faz isso, não-host aguarda)
    if (MP.isHost) {
      const delay = (MP.config.timerSecs > 0) ? 1800 : 2200;
      setTimeout(() => hostAvançarPergunta(), delay);
    } else {
      _showMpNextHint();
    }
  }

  function _showMpNextHint() {
    const answersEl = $i('mpQAnswers');
    if (!answersEl || answersEl.querySelector('.mp-next-hint')) return;
    const hint = document.createElement('p');
    hint.className = 'mp-next-hint';
    hint.style.cssText = 'text-align:center;color:var(--text3);font-size:0.8rem;margin-top:12px;padding:8px;background:rgba(99,102,241,0.08);border-radius:8px';
    hint.textContent = 'A aguardar que o anfitrião avance...';
    answersEl.appendChild(hint);
  }

  async function hostAvançarPergunta() {
    if (!MP.isHost) return;
    const total = MP.questions.length;
    const next  = MP.qIndex + 1;

    try {
      if (next >= total) {
        await MP.roomRef.update({
          status:     'finished',
          finishedAt: firebase.database.ServerValue.TIMESTAMP,
        });
      } else {
        MP.qIndex   = next;
        MP.answered = false;
        await MP.roomRef.update({ currentQ: next });
      }
    } catch (e) {
      console.warn('hostAvançarPergunta error:', e);
    }
  }

  // ── Timer MP ─────────────────────────────────────────────
  function startMpTimer(secs) {
    stopMpTimer();
    MP.timerLeft = secs;
    const timerEl = $i('mpSalaTimer');

    MP.timerInterval = setInterval(() => {
      MP.timerLeft--;
      if (timerEl) {
        timerEl.textContent = MP.timerLeft + 's';
        if (MP.timerLeft <= 5) {
          timerEl.style.color = '#EF4444';
          timerEl.classList.add('urgent');
        } else {
          timerEl.style.color = '';
          timerEl.classList.remove('urgent');
        }
      }
      if (MP.timerLeft <= 0) {
        stopMpTimer();
        if (!MP.answered) {
          const q = MP.questions[MP.qIndex];
          if (q) handleMpAnswer('', q, null, $i('mpQAnswers'), false);
        }
      }
    }, 1000);
  }

  function stopMpTimer() {
    if (MP.timerInterval) {
      clearInterval(MP.timerInterval);
      MP.timerInterval = null;
    }
  }

  // ── Resultado Final ──────────────────────────────────────
  function renderMpResult(room) {
    stopMpTimer();

    const players = room.players || {};
    const sorted  = Object.entries(players)
      .map(([uid, p]) => ({ uid, ...p }))
      .sort((a, b) => b.score - a.score);

    // Pódio (top 3) — usa classes CSS existentes: mp-podium-place p1/p2/p3
    const podiumEl = $i('mpResultPodium');
    if (podiumEl) {
      const podiumSlots = [];
      if (sorted.length >= 2) podiumSlots[0] = { player: sorted[1], cls: 'p2', rank: 2 };
      if (sorted.length >= 1) podiumSlots[1] = { player: sorted[0], cls: 'p1', rank: 1 };
      if (sorted.length >= 3) podiumSlots[2] = { player: sorted[2], cls: 'p3', rank: 3 };

      const medalIcons = {
        1: '<svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:var(--gold)"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/></svg>',
        2: '<svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:#C0C0C0"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/></svg>',
        3: '<svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:#CD7F32"><path d="M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94A5.01 5.01 0 0011 15.9V18H9v2h6v-2h-2v-2.1a5.01 5.01 0 003.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2z"/></svg>',
      };

      podiumEl.innerHTML = podiumSlots.filter(Boolean).map(slot => {
        if (!slot) return '';
        const p      = slot.player;
        const isMe   = p.uid === MP.myUid;
        const avatar = p.photoURL
          ? `<img src="${escHtml(p.photoURL)}" alt="av" style="width:44px;height:44px;border-radius:50%;object-fit:cover;margin-bottom:6px">`
          : `<div style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#4F46E5,#7C3AED);display:flex;align-items:center;justify-content:center;margin-bottom:6px"><svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:#fff"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;
        return `
          <div class="mp-podium-place ${slot.cls}${isMe ? ' mp-podium-me' : ''}">
            <div class="mp-podium-medal">${medalIcons[slot.rank] || slot.rank + 'º'}</div>
            ${avatar}
            <div class="mp-podium-name">${escHtml((p.name || 'Jogador').split(' ')[0])}</div>
            <div class="mp-podium-pts">${formatScore(p.score || 0)}</div>
          </div>`;
      }).join('');
    }

    // Tabela completa
    const tableEl = $i('mpResultTable');
    if (tableEl) {
      tableEl.innerHTML = `
        <table class="mp-history-table" style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              <th style="padding:6px 8px;text-align:left;font-size:0.7rem;color:var(--text3);font-weight:600">#</th>
              <th style="padding:6px 8px;text-align:left;font-size:0.7rem;color:var(--text3);font-weight:600">Jogador</th>
              <th style="padding:6px 8px;text-align:center;font-size:0.7rem;color:var(--text3);font-weight:600">Certas</th>
              <th style="padding:6px 8px;text-align:center;font-size:0.7rem;color:var(--text3);font-weight:600">Erradas</th>
              <th style="padding:6px 8px;text-align:right;font-size:0.7rem;color:var(--text3);font-weight:600">Val.</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map((p, i) => {
              const isMe  = p.uid === MP.myUid;
              const rowCls = isMe ? 'mp-my-row' : '';
              return `<tr class="${rowCls}" style="${isMe ? 'background:rgba(99,102,241,0.1)' : ''}">
                <td style="padding:6px 8px;font-size:0.8rem;font-weight:700;color:var(--text3)">${i+1}</td>
                <td style="padding:6px 8px;font-size:0.85rem;font-weight:600;color:var(--text)">${escHtml(p.name || 'Jogador')}${isMe ? ' <span style="font-size:0.65rem;color:var(--indigo);font-weight:700">(você)</span>' : ''}</td>
                <td style="padding:6px 8px;text-align:center;color:#22C55E;font-weight:700;font-size:0.85rem">${p.correct || 0}</td>
                <td style="padding:6px 8px;text-align:center;color:#EF4444;font-weight:700;font-size:0.85rem">${p.wrong || 0}</td>
                <td style="padding:6px 8px;text-align:right"><span class="mp-hist-score">${formatScore(p.score || 0)}</span></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
    }

    // Histórico de perguntas
    _renderHistory(room);
  }

  // ── Histórico de Perguntas (pós-jogo) ────────────────────
  function _renderHistory(room) {
    const el = $i('mpSalaHistory');
    if (!el) return;

    const questions = room.questions || MP.questions;
    const answers   = room.answers   || {};
    const myUid     = MP.myUid;

    if (!questions.length) { el.innerHTML = ''; return; }

    const myAnswers = answers[myUid] || {};
    const rows = questions.map((q, idx) => {
      const myAns  = myAnswers[idx];
      const isRight = myAns?.isRight;
      const icon = myAns
        ? (isRight
            ? '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:#22C55E;flex-shrink:0"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
            : '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:#EF4444;flex-shrink:0"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>')
        : '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:var(--text3);flex-shrink:0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>';
      const correctAns = q[q.answer?.toLowerCase()] || q.lacunaResposta || q.flashBack || '—';
      return `
        <div style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04)">
          ${icon}
          <div style="flex:1;min-width:0">
            <div style="font-size:0.78rem;color:var(--text);font-weight:600;margin-bottom:2px">${idx+1}. ${escHtml((q.question || q.flashFront || '').slice(0, 80))}${(q.question || '').length > 80 ? '…' : ''}</div>
            <div style="font-size:0.7rem;color:var(--text3)">Correcto: <span style="color:var(--text2)">${escHtml(correctAns.slice(0,60))}</span></div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div style="margin-top:16px">
        <div class="mp-section-title" style="font-size:0.75rem;margin-bottom:8px">
          <svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:4px">
            <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
          </svg>
          Revisão de Perguntas
        </div>
        ${rows}
      </div>`;
  }

  function _clearHistory() {
    const el = $i('mpSalaHistory');
    if (el) el.innerHTML = '';
  }

  // ── Actualizar Estatísticas após Jogo ────────────────────
  async function updateMpStatsAfterGame(room) {
    const uid = _auth.currentUser?.uid;
    if (!uid) return;

    const players = room.players || {};
    const myData  = players[uid];
    if (!myData) return;

    const sorted    = Object.values(players).sort((a, b) => b.score - a.score);
    const myRank    = sorted.findIndex(p => p === myData) + 1;
    const isWinner  = myRank === 1;
    const starsEarned = Math.max(0, 4 - myRank); // 1º=3, 2º=2, 3º=1, restantes=0

    try {
      await _db.ref('users/' + uid + '/stats').transaction(stats => {
        if (!stats) stats = {};
        stats.games    = (stats.games    || 0) + 1;
        stats.correct  = (stats.correct  || 0) + (myData.correct || 0);
        stats.wrong    = (stats.wrong    || 0) + (myData.wrong   || 0);
        stats.stars    = (stats.stars    || 0) + starsEarned;
        stats.mpWins   = (stats.mpWins   || 0) + (isWinner ? 1 : 0);
        stats.mpGames  = (stats.mpGames  || 0) + 1;
        stats.best     = Math.max(stats.best || 0, myData.score || 0);
        return stats;
      });
    } catch (e) {
      console.warn('updateMpStatsAfterGame error:', e);
    }
  }

  // ── Sair da Sala ─────────────────────────────────────────
  async function sairDaSala() {
    stopMpTimer();
    if (MP._presenceInterval) { clearInterval(MP._presenceInterval); MP._presenceInterval = null; }

    if (MP.roomListener && MP.roomRef) {
      MP.roomRef.off('value', MP.roomListener);
      MP.roomListener = null;
    }
    // Remover jogador se sala ainda em espera e não for host
    if (MP.roomRef && MP.myUid && !MP.isHost) {
      try {
        const snap = await MP.roomRef.child('status').once('value');
        if (snap.val() === 'waiting') {
          await MP.roomRef.child('players/' + MP.myUid).remove();
        }
      } catch (e) {}
    }

    MP.roomId    = null;
    MP.roomRef   = null;
    MP.isHost    = false;
    MP.questions = [];
    MP.qIndex    = 0;
    MP.answered  = false;
    MP.statsUpdated = false;
  }

  async function eliminarSala() {
    if (!MP.isHost || !MP.roomRef) return;
    if (typeof showModal === 'function') {
      showModal({
        icon: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
        title: 'Eliminar Sala',
        msg: 'Tens a certeza? Todos os jogadores serão expulsos.',
        btns: [
          { label: 'CANCELAR', cls: 'btn-outline' },
          { label: 'ELIMINAR', cls: 'btn-danger', action: async () => {
            try { await MP.roomRef.remove(); } catch(e) {}
            sairDaSala();
            goScreen('screen-multiplayer');
          }}
        ]
      });
    } else {
      if (!confirm('Eliminar sala? Todos os jogadores serão expulsos.')) return;
      try { await MP.roomRef.remove(); } catch(e) {}
      sairDaSala();
      goScreen('screen-multiplayer');
    }
  }

  // ── UI Helpers da Sala ────────────────────────────────────
  function _showSalaState(state) {
    const waiting = $i('mpSalaWaiting');
    const game    = $i('mpSalaGame');
    const result  = $i('mpSalaResult');
    if (waiting) waiting.style.display = state === 'waiting' ? '' : 'none';
    if (game)    game.style.display    = state === 'game'    ? '' : 'none';
    if (result)  result.style.display  = state === 'result'  ? '' : 'none';
  }

  // Usa classes CSS existentes: mp-player-slot, mp-player-slot.filled, mp-player-slot.me
  function _renderPlayersGrid(players, hostUid) {
    const grid = $i('mpPlayersGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const maxPlayers = MP.config.maxPlayers || 4;

    Object.entries(players).forEach(([uid, p]) => {
      const isHost = uid === hostUid;
      const isMe   = uid === MP.myUid;
      const avatar = p.photoURL
        ? `<div class="mp-player-slot-avatar" style="background:none"><img src="${escHtml(p.photoURL)}" alt="av" style="width:100%;height:100%;border-radius:50%;object-fit:cover"></div>`
        : `<div class="mp-player-slot-avatar"><svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:rgba(255,255,255,0.8)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;
      const div = document.createElement('div');
      div.className = 'mp-player-slot filled' + (isMe ? ' me' : '');
      div.innerHTML = `
        ${avatar}
        <div class="mp-player-slot-name">${escHtml((p.name || 'Jogador').split(' ')[0])}</div>
        ${isHost ? '<div style="font-size:0.6rem;color:var(--gold);font-weight:700">Anfitrião</div>' : ''}
        ${isMe   ? '<div style="font-size:0.6rem;color:rgba(99,102,241,0.9);font-weight:700">Você</div>' : ''}`;
      grid.appendChild(div);
    });

    // Slots vazios
    const filled = Object.keys(players).length;
    for (let i = filled; i < maxPlayers; i++) {
      const div = document.createElement('div');
      div.className = 'mp-player-slot';
      div.innerHTML = `
        <div class="mp-player-slot-empty">
          <svg viewBox="0 0 24 24"><path d="M15 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm-9-2V7H4v3H1v2h3v3h2v-3h3v-2H6zm9 4c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </div>
        <div class="mp-player-slot-name" style="color:var(--text3)">Aguardar...</div>`;
      grid.appendChild(div);
    }
  }

  // Usa classes CSS existentes: mp-score-chip, mp-score-name, mp-score-pts
  function _renderScoreboard(players) {
    const sb = $i('mpScoreboard');
    if (!sb) return;
    const sorted = Object.entries(players)
      .map(([uid, p]) => ({ uid, name: p.name || 'Jogador', score: p.score || 0, photo: p.photoURL || '' }))
      .sort((a, b) => b.score - a.score);

    sb.innerHTML = sorted.map((p, i) => {
      const isMe   = p.uid === MP.myUid;
      const avatar = p.photo
        ? `<img src="${escHtml(p.photo)}" alt="av" style="width:22px;height:22px;border-radius:50%;object-fit:cover;margin-bottom:2px">`
        : `<div style="width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#4F46E5,#7C3AED);display:flex;align-items:center;justify-content:center;margin-bottom:2px;font-size:0.65rem;font-weight:800;color:#fff">${(p.name||'?')[0].toUpperCase()}</div>`;
      return `<div class="mp-score-chip${isMe ? ' is-turn' : ''}">
        ${avatar}
        <span class="mp-score-name">${escHtml(p.name.split(' ')[0])}</span>
        <span class="mp-score-pts">${formatScore(p.score)}</span>
      </div>`;
    }).join('');
  }

  function _clearScoreboard() {
    const sb = $i('mpScoreboard');
    if (sb) sb.innerHTML = '';
  }

  function _renderLiveFeed(answers, players, currentQ) {
    const feed = $i('mpLiveFeed');
    if (!feed) return;
    feed.querySelectorAll('.mp-feed-item').forEach(el => el.remove());

    Object.entries(answers).forEach(([uid, qAnswers]) => {
      if (uid === MP.myUid) return;
      const ans = qAnswers?.[currentQ];
      if (!ans) return;
      const p    = players[uid] || {};
      const name = (p.name || 'Jogador').split(' ')[0];
      const item = document.createElement('div');
      item.className = 'mp-feed-item';
      const iconPath = ans.isRight
        ? '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>'
        : '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';
      item.innerHTML = `
        <svg viewBox="0 0 24 24" class="${ans.isRight ? 'mp-feed-ok' : 'mp-feed-fail'}" style="width:16px;height:16px;fill:${ans.isRight ? '#22C55E' : '#EF4444'};flex-shrink:0">${iconPath}</svg>
        <span class="mp-feed-msg">${escHtml(name)} respondeu</span>`;
      feed.appendChild(item);
    });
  }

  function _clearLiveFeed() {
    const feed = $i('mpLiveFeed');
    if (!feed) return;
    feed.querySelectorAll('.mp-feed-item').forEach(el => el.remove());
  }

  // ── Desafios ─────────────────────────────────────────────
  function startChallengeListener(uid) {
    if (MP.challengeListener) MP.challengeListener();
    const ref     = _db.ref('challenges/' + uid);
    const handler = ref.on('child_added', snap => {
      const ch   = snap.val();
      const chId = snap.key;
      if (!ch || !ch.roomId) return;
      // Ignorar desafios com mais de 5 min (podem ser antigos)
      const age = Date.now() - (ch.ts || 0);
      if (age > 5 * 60 * 1000) {
        _db.ref('challenges/' + uid + '/' + chId).remove();
        return;
      }
      _showChallengeNotif(ch, chId, uid);
    });
    MP.challengeListener = () => ref.off('child_added', handler);
  }

  function _showChallengeNotif(ch, chId, myUid) {
    const fromName = escHtml(ch.fromName || 'Alguém');
    const modeNames = { aprendizado: 'Aprendizado', concurso: 'Concurso', prova: 'Prova', imagem: 'Imagem' };
    const modeName  = modeNames[ch.config?.mode] || 'Quiz';

    if (typeof showModal === 'function') {
      showModal({
        icon: '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
        title: 'Desafio Recebido!',
        msg: `${fromName} desafia-o para um ${modeName}! Sala #${escHtml(ch.roomId || '—')}. Aceita?`,
        btns: [
          { label: 'RECUSAR', cls: 'btn-outline', action: () => {
            _db.ref('challenges/' + myUid + '/' + chId).remove();
          }},
          { label: 'ACEITAR', cls: 'btn-primary', action: () => {
            _db.ref('challenges/' + myUid + '/' + chId).remove();
            entrarNaSala(ch.roomId);
          }},
        ]
      });
    } else {
      if (confirm(fromName + ' desafia-o para um ' + modeName + '! Aceita?')) {
        _db.ref('challenges/' + myUid + '/' + chId).remove();
        entrarNaSala(ch.roomId);
      } else {
        _db.ref('challenges/' + myUid + '/' + chId).remove();
      }
    }
  }

  async function loadDesafiosRecebidos() {
    const uid = _auth.currentUser?.uid;
    if (!uid) return;
    const el = $i('mpDesafiosRecebidos');
    if (!el) return;

    try {
      const snap = await _db.ref('challenges/' + uid).once('value');
      const chs  = snap.val();
      if (!chs) {
        el.innerHTML = '<p class="mp-sub-empty">Sem desafios pendentes</p>';
        return;
      }
      el.innerHTML = '';
      Object.entries(chs).forEach(([chId, ch]) => {
        const div = document.createElement('div');
        div.className = 'mp-desafio-card';
        div.innerHTML = `
          <div class="mp-desafio-header">
            <div class="mp-desafio-avatar">
              <svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </div>
            <div class="mp-desafio-info">
              <div class="mp-desafio-name">${escHtml(ch.fromName || 'Jogador')}</div>
              <div class="mp-desafio-meta">Sala #${escHtml(ch.roomId || '—')}</div>
            </div>
          </div>
          <div class="mp-desafio-actions">
            <button class="mp-btn-recusar">
              <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
              Recusar
            </button>
            <button class="mp-btn-aceitar">
              <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
              Aceitar
            </button>
          </div>`;
        div.querySelector('.mp-btn-recusar').onclick = () => {
          _db.ref('challenges/' + uid + '/' + chId).remove();
          div.remove();
          if (!el.children.length) el.innerHTML = '<p class="mp-sub-empty">Sem desafios pendentes</p>';
        };
        div.querySelector('.mp-btn-aceitar').onclick = () => {
          _db.ref('challenges/' + uid + '/' + chId).remove();
          div.remove();
          entrarNaSala(ch.roomId);
        };
        el.appendChild(div);
      });
    } catch (e) {
      el.innerHTML = '<p class="mp-sub-empty">Erro ao carregar desafios</p>';
    }
  }

  async function enviarDesafio() {
    if (!MP.desafioTargetUid) {
      toast('Selecione um jogador primeiro.');
      return;
    }
    const uid = _auth.currentUser?.uid;
    if (!uid) return;

    const getOpt = group => document.querySelector(`.mp-opt.active[data-mpopt="${group}"]`)?.dataset?.v || null;
    const config = {
      mode:       getOpt('modoJogo')   || 'aprendizado',
      modoPerg:   getOpt('modoPerg')   || 'realtime',
      diff:       getOpt('nivel')      || 'todos',
      maxPlayers: parseInt(getOpt('maxplayers') || '2'),
      answerType: getOpt('tipo')       || 'todos',
      timerSecs:  parseInt($i('mpTempoInput')?.value || 30),
      qtdQs:      parseInt($i('mpQtdInput')?.value   || 10),
      disc:       $i('mpDesafioDisciplina')?.value   || 'all',
      cat:        $i('mpDesafioCategoria')?.value    || 'all',
      dbSource:   'cloud',
    };

    if (typeof showLoading === 'function') showLoading('A criar sala e enviar desafio...');

    try {
      const questions = await fetchQuestionsForMP(config);
      if (questions.length < 1) {
        if (typeof hideLoading === 'function') hideLoading();
        toast('Sem perguntas disponíveis com esses filtros.');
        return;
      }

      const roomId     = genRoomId();
      const roomRef    = _db.ref('rooms/' + roomId);
      const playerName = MP.myName?.trim() || _auth.currentUser.email?.split('@')[0] || 'Jogador';

      await roomRef.set({
        status:    'waiting',
        host:      uid,
        config:    config,
        questions: questions,
        currentQ:  0,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        players: {
          [uid]: {
            name: playerName, photoURL: MP.myPhoto || '',
            score: 0, correct: 0, wrong: 0, ready: false,
            lastSeen: firebase.database.ServerValue.TIMESTAMP,
          }
        }
      });

      await _db.ref('challenges/' + MP.desafioTargetUid).push({
        from:     uid,
        fromName: playerName,
        roomId:   roomId,
        config:   config,
        ts:       firebase.database.ServerValue.TIMESTAMP,
      });

      if (typeof hideLoading === 'function') hideLoading();
      toast('Desafio enviado! A entrar na sala...');

      MP.roomId    = roomId;
      MP.roomRef   = roomRef;
      MP.isHost    = true;
      MP.config    = config;
      MP.questions = questions;
      MP.statsUpdated = false;

      abrirSala(roomId, true);

    } catch (e) {
      if (typeof hideLoading === 'function') hideLoading();
      toast('Erro ao enviar desafio: ' + e.message);
    }
  }

  // ── Buscar Jogadores ─────────────────────────────────────
  async function buscarJogadorDesafio() {
    const query = $i('mpDesafioTarget')?.value?.trim();
    if (!query) return;
    const results = await _searchUsers(query);
    const el      = $i('mpSearchResults');
    if (!el) return;

    if (results.length === 0) {
      el.innerHTML = '<p class="mp-sub-empty">Nenhum jogador encontrado</p>';
      MP.desafioTargetUid = null;
      return;
    }

    el.innerHTML = '';
    results.forEach(u => {
      const div = document.createElement('div');
      div.className = 'mp-search-result-item';
      const avatar = u.photoURL
        ? `<img src="${escHtml(u.photoURL)}" alt="av" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:36px;height:36px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--text3)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;
      div.innerHTML = `
        ${avatar}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:0.9rem;color:var(--text)">${escHtml((u.firstName || '') + ' ' + (u.lastName || ''))}</div>
          <div style="font-size:0.72rem;color:var(--text3)">${escHtml(u.email || u.phone || '')}</div>
        </div>
        <button class="btn-mp-action" style="padding:6px 12px;font-size:0.75rem">
          <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;margin-right:3px">
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
          </svg>
          Sel.
        </button>`;
      div.querySelector('.btn-mp-action').onclick = () => {
        MP.desafioTargetUid = u.uid;
        const input = $i('mpDesafioTarget');
        if (input) input.value = (u.firstName || '') + ' ' + (u.lastName || '');
        el.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;color:#22C55E;font-size:0.82rem;padding:6px 0">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:#22C55E;flex-shrink:0"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            ${escHtml((u.firstName || '') + ' ' + (u.lastName || ''))} seleccionado
          </div>`;
      };
      el.appendChild(div);
    });
  }

  async function buscarJogadoresTab() {
    const query = $i('mpBuscarInput')?.value?.trim();
    if (!query) return;
    const results = await _searchUsers(query);
    const el      = $i('mpBuscarResultados');
    if (!el) return;

    if (results.length === 0) {
      el.innerHTML = '<p class="mp-sub-empty">Nenhum jogador encontrado</p>';
      return;
    }

    el.innerHTML = '';
    results.forEach(u => {
      const div = document.createElement('div');
      div.className = 'mp-player-card';
      div.style.cssText = 'display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.05)';
      const avatar = u.photoURL
        ? `<img src="${escHtml(u.photoURL)}" alt="av" style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0">`
        : `<div style="width:40px;height:40px;border-radius:50%;background:var(--card2);display:flex;align-items:center;justify-content:center;flex-shrink:0"><svg viewBox="0 0 24 24" style="width:22px;height:22px;fill:var(--text3)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;
      div.innerHTML = `
        ${avatar}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;color:var(--text);font-size:0.88rem">${escHtml((u.firstName || '') + ' ' + (u.lastName || ''))}</div>
          <div style="font-size:0.72rem;color:var(--text3)">${escHtml(u.country || '')}${u.province ? ', ' + escHtml(u.province) : ''}</div>
        </div>
        <button class="btn-mp-action" style="padding:6px 12px;font-size:0.75rem">
          <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:currentColor;vertical-align:middle;margin-right:3px">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
          </svg>
          Desafiar
        </button>`;
      div.querySelector('.btn-mp-action').onclick = () => {
        const input = $i('mpDesafioTarget');
        if (input) input.value = (u.firstName || '') + ' ' + (u.lastName || '');
        MP.desafioTargetUid = u.uid;
        // Ir para tab Desafios e mostrar selecção
        document.querySelector('.mp-tab[data-tab="desafios"]')?.click();
        const resultEl = $i('mpSearchResults');
        if (resultEl) resultEl.innerHTML = `
          <div style="display:flex;align-items:center;gap:6px;color:#22C55E;font-size:0.82rem;padding:6px 0">
            <svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:#22C55E;flex-shrink:0"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            ${escHtml((u.firstName || '') + ' ' + (u.lastName || ''))} seleccionado
          </div>`;
      };
      el.appendChild(div);
    });
  }

  async function _searchUsers(query) {
    const q       = query.toLowerCase().trim();
    if (!q) return [];
    const results = [];
    try {
      const snap1 = await _db.ref('users')
        .orderByChild('firstName')
        .startAt(q.charAt(0).toUpperCase() + q.slice(1))
        .limitToFirst(20)
        .once('value');

      snap1.forEach(c => {
        const u = c.val();
        if (!u) return;
        const fullName = ((u.firstName || '') + ' ' + (u.lastName || '')).toLowerCase();
        const emailLow = (u.email || '').toLowerCase();
        const phoneLow = (u.phone || '').toLowerCase();
        if (fullName.includes(q) || emailLow.includes(q) || phoneLow.includes(q)) {
          if (c.key !== MP.myUid) results.push({ uid: c.key, ...u });
        }
      });

      // Busca adicional por email se query tem @
      if (q.includes('@')) {
        const snap2 = await _db.ref('users').orderByChild('email').equalTo(q).once('value');
        snap2.forEach(c => {
          if (!results.find(r => r.uid === c.key) && c.key !== MP.myUid) {
            results.push({ uid: c.key, ...c.val() });
          }
        });
      }
    } catch (e) {
      console.warn('User search error:', e);
    }
    return results.slice(0, 10);
  }

  // ── Ranking MP ───────────────────────────────────────────
  async function loadMpRanking() {
    const el = $i('mpRankingList');
    if (!el) return;
    el.innerHTML = '<div class="mp-loading-rank">A carregar ranking...</div>';

    try {
      const snap = await _db.ref('users').orderByChild('stats/stars').limitToLast(30).once('value');
      const users = [];
      snap.forEach(c => {
        const u = c.val();
        if (u?.firstName) users.push({ uid: c.key, ...u });
      });
      users.sort((a, b) => (b.stats?.stars || 0) - (a.stats?.stars || 0));

      if (users.length === 0) {
        el.innerHTML = '<p class="mp-sub-empty">Sem dados de ranking</p>';
        return;
      }

      el.innerHTML = users.slice(0, 20).map((u, i) => {
        const rank    = i + 1;
        const stars   = u.stats?.stars  || 0;
        const games   = u.stats?.mpGames || u.stats?.games || 0;
        const wins    = u.stats?.mpWins  || 0;
        const isMe    = u.uid === MP.myUid;
        const topCls  = rank === 1 ? 'top1' : rank === 2 ? 'top2' : rank === 3 ? 'top3' : '';
        const avatar  = u.photoURL
          ? `<div class="mp-rank-avatar"><img src="${escHtml(u.photoURL)}" alt="av"></div>`
          : `<div class="mp-rank-avatar"><svg viewBox="0 0 24 24" style="width:20px;height:20px;fill:var(--text3)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg></div>`;
        return `
          <div class="mp-rank-item ${topCls}${isMe ? ' mp-rank-me' : ''}" style="${isMe ? 'background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.4)' : ''}">
            <div class="mp-rank-pos">${rank}</div>
            ${avatar}
            <div class="mp-rank-info">
              <div class="mp-rank-name">${escHtml((u.firstName || '') + ' ' + (u.lastName || ''))}</div>
              <div class="mp-rank-contact">${games} jogos · ${wins} vitórias</div>
            </div>
            <div class="mp-rank-stars">
              <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              ${stars}
            </div>
          </div>`;
      }).join('');

    } catch (e) {
      el.innerHTML = '<p class="mp-sub-empty">Erro ao carregar ranking</p>';
    }
  }

  // ── Preencher Disciplinas/Categorias no form MP ──────────
  async function populateMpDiscs() {
    const discSel = $i('mpDesafioDisciplina');
    const catSel  = $i('mpDesafioCategoria');
    if (!discSel || !catSel) return;

    try {
      const snap = await _db.ref('questions').orderByKey().limitToFirst(2000).once('value');
      const data = snap.val();
      if (!data) return;
      const qs   = Object.values(data);
      const discs = [...new Set(qs.map(q => q.disc).filter(Boolean))].sort();

      discSel.innerHTML = '<option value="all">Todas as Disciplinas</option>';
      discs.forEach(d => {
        const o = document.createElement('option');
        o.value = d; o.textContent = d;
        discSel.appendChild(o);
      });

      const updateCats = () => {
        const disc = discSel.value;
        const pool = disc === 'all' ? qs : qs.filter(q => q.disc === disc);
        const cats = [...new Set(pool.map(q => q.cat).filter(Boolean))].sort();
        catSel.innerHTML = '<option value="all">Todas as Categorias</option>';
        cats.forEach(c => {
          const o = document.createElement('option');
          o.value = c; o.textContent = c;
          catSel.appendChild(o);
        });
      };
      discSel.onchange = updateCats;
      updateCats();

    } catch (e) {
      console.warn('populateMpDiscs error:', e);
    }
  }

  // ── Actualizar tipos de pergunta conforme modo do jogo ───
  function mpUpdateTiposUI(modoJogo) {
    const container = $i('mpTiposContainer');
    if (!container) return;
    const isImagem = modoJogo === 'imagem';

    const tipos = isImagem
      ? [
          { v: 'todos',     label: 'Todos',    icon: '<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>' },
          { v: 'multipla',  label: 'Múltipla', icon: '<path d="M18 7l-1.41-1.41-6.34 6.34-2.83-2.83L6 10.5l4.24 4.24L18 7z"/>' },
          { v: 'multipla2', label: 'Imagem',   icon: '<path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>' },
        ]
      : [
          { v: 'todos',    label: 'Todos',    icon: '<path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>' },
          { v: 'multipla', label: 'Múltipla', icon: '<path d="M18 7l-1.41-1.41-6.34 6.34-2.83-2.83L6 10.5l4.24 4.24L18 7z"/>' },
          { v: 'vf',       label: 'V/F',      icon: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' },
          { v: 'lacunas',  label: 'Lacunas',  icon: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>' },
        ];

    container.innerHTML = '';
    tipos.forEach((t, i) => {
      const btn = document.createElement('button');
      btn.className = 'mp-opt' + (i === 0 ? ' active' : '');
      btn.dataset.mpopt = 'tipo';
      btn.dataset.v = t.v;
      btn.innerHTML = `<svg viewBox="0 0 24 24" style="width:13px;height:13px;fill:currentColor;vertical-align:middle;margin-right:4px">${t.icon}</svg>${t.label}`;
      btn.onclick = () => {
        container.querySelectorAll('.mp-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
      container.appendChild(btn);
    });
  }

  // ── Carregar Perguntas para MP ───────────────────────────
  async function fetchQuestionsForMP(config) {
    try {
      let pool = [];

      if (navigator.onLine) {
        const snap = await _db.ref('questions').once('value');
        const data = snap.val();
        if (data) pool = Object.values(data);
      }

      // Fallback para base de dados local
      if (pool.length === 0 && typeof State !== 'undefined' && State.localDB?.length > 0) {
        pool = [...State.localDB];
      } else if (pool.length === 0 && typeof IDB !== 'undefined') {
        try { pool = await IDB.getAll(); } catch(e) {}
      }

      if (pool.length === 0) return [];

      const disc       = config.disc       || 'all';
      const cat        = config.cat        || 'all';
      const diff       = config.diff       || 'todos';
      const answerType = config.answerType || 'todos';
      const mode       = config.mode       || 'aprendizado';
      const qtdQs      = parseInt(config.qtdQs || 10);

      if (disc !== 'all') pool = pool.filter(q => q.disc === disc);
      if (cat  !== 'all') pool = pool.filter(q => q.cat  === cat);
      if (diff !== 'todos' && diff !== 'all') {
        pool = pool.filter(q => (q.diff || '').toLowerCase() === diff.toLowerCase());
      }

      const _isImgQ = q => q.mode === 'imagem' || q.answerType === 'multipla2' || q.questionImg || q.imgA;
      if (mode === 'imagem') pool = pool.filter(_isImgQ);
      else pool = pool.filter(q => !_isImgQ(q));

      if (mode !== 'aprendizado') pool = pool.filter(q => (q.answerType || 'multipla') !== 'flashcard');

      if (answerType !== 'todos') {
        pool = pool.filter(q => (q.answerType || 'multipla') === answerType);
      }

      pool = shuffle(pool).slice(0, Math.min(qtdQs, pool.length));
      return pool;

    } catch (e) {
      console.warn('fetchQuestionsForMP error:', e);
      return [];
    }
  }

  // ── API Pública ──────────────────────────────────────────
  return { init, openHub, entrarNaSala, criarSala };

})();
