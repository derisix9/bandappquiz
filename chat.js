/* ══════════════════════════════════════════════════════════
   BANDAPP CHAT SYSTEM — chat.js  (v3 — diagnóstico + corrigido)
   ══════════════════════════════════════════════════════════ */
'use strict';

const ChatSystem = (() => {

  /* ── State ─────────────────────────────────────────── */
  let _tab        = 'community';
  let _privUid    = null;
  let _privName   = '';
  let _replyTo    = { community: null, private: null };
  let _editState  = { community: null, private: null };
  let _ctxTarget  = null;
  let _listeners  = {};
  let _unreadComm = 0;
  let _unreadPriv = 0;
  let _unreadMap  = {};
  let _attachCtx  = null;
  let _isOpen     = false;
  let _pressTimer = null;
  let _allMsgs    = { community: [], private: [] }; // cache local para render imediato

  /* ── Firebase helpers ──────────────────────────────── */
  const db      = () => firebase.database();
  const commRef = () => db().ref('chat/community');
  const privRef = () => db().ref(`chat/private/${_convKey(_myUid(), _privUid)}`);

  function _convKey(a, b) { return [a, b].sort().join('_'); }
  function _myUid()    { return (firebase.auth().currentUser || {}).uid || null; }
  function _myName()   { return (typeof State !== 'undefined' && State.profile?.name) || firebase.auth().currentUser?.displayName || 'Utilizador'; }
  function _myAvatar() { return (typeof State !== 'undefined' && State.profile?.avatar) || firebase.auth().currentUser?.photoURL || ''; }

  const $ = id => document.getElementById(id);

  /* ── Toast helper (local fallback) ────────────────── */
  function _toast(msg) {
    if (typeof showToast === 'function') { showToast(msg); return; }
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, { position:'fixed', bottom:'80px', left:'50%', transform:'translateX(-50%)',
      background:'#1e2235', color:'#e8eaf6', padding:'10px 18px', borderRadius:'10px',
      zIndex:'99999', fontSize:'0.85rem', boxShadow:'0 4px 20px rgba(0,0,0,0.4)' });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  /* ═══════════════════════════════════════════════════
     OPEN / CLOSE
  ═══════════════════════════════════════════════════ */
  function open() {
    $('chatOverlay').classList.add('open');
    _isOpen = true;
    const np = $('notifPanel');
    if (np) np.classList.remove('open');

    /* Sempre reiniciar o listener da comunidade ao abrir */
    _detachListener('community');
    _startCommunityListener();
    _startConvosListener();

    if (_tab === 'community') {
      _clearUnreadComm();
      setTimeout(() => _scrollBottom('communityMessages'), 150);
    } else if (_tab === 'private' && _privUid) {
      _clearUnreadPriv(_privUid);
      setTimeout(() => _scrollBottom('privateMessages'), 150);
    }
  }

  function close() {
    $('chatOverlay').classList.remove('open');
    _isOpen = false;
    _closeCtxMenu();
    document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
  }

  /* ═══════════════════════════════════════════════════
     TABS
  ═══════════════════════════════════════════════════ */
  function switchTab(tab) {
    _tab = tab;
    $('chatTabCommunity').classList.toggle('active', tab === 'community');
    $('chatTabPrivate').classList.toggle('active', tab === 'private');
    $('chatViewCommunity').classList.toggle('active', tab === 'community');
    $('chatViewPrivateList').classList.toggle('active', tab === 'private' && !_privUid);
    $('chatViewPrivateChat').classList.toggle('active', tab === 'private' && !!_privUid);
    document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
    _closeCtxMenu();
    if (tab === 'community') {
      _clearUnreadComm();
      setTimeout(() => _scrollBottom('communityMessages'), 100);
    }
    if (tab === 'private') _startConvosListener();
  }

  /* ═══════════════════════════════════════════════════
     SEND TEXT
  ═══════════════════════════════════════════════════ */
  function sendText(ctx) {
    const uid = _myUid();
    if (!uid) { _toast('Precisas de estar autenticado para enviar mensagens.'); return; }

    const inputId = ctx === 'community' ? 'communityInput' : 'privateInput';
    const inp = $(inputId);
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;

    if (_editState[ctx]) { _confirmEdit(ctx, text); return; }

    inp.value = '';
    autoResize(inp);

    const msg = {
      uid:     uid,
      name:    _myName(),
      avatar:  _myAvatar(),
      type:    'text',
      text:    text,
      ts:      firebase.database.ServerValue.TIMESTAMP,
      deleted: false,
      edited:  false
    };

    if (_replyTo[ctx]) {
      msg.replyTo = { uid: _replyTo[ctx].uid, name: _replyTo[ctx].name, text: _replyTo[ctx].text };
      cancelReply(ctx);
    }

    /* Render optimistically (local preview com ts aproximado) */
    const preview = { ...msg, key: '__pending__' + Date.now(), ts: Date.now() };
    if (ctx === 'community') {
      _allMsgs.community = [..._allMsgs.community, preview];
      _renderMessages('community', _allMsgs.community, $('communityMessages'));
      _scrollBottom('communityMessages');
    } else {
      _allMsgs.private = [..._allMsgs.private, preview];
      _renderMessages('private', _allMsgs.private, $('privateMessages'));
      _scrollBottom('privateMessages');
    }

    _pushMsg(ctx, msg);
  }

  /* ═══════════════════════════════════════════════════
     PUSH MESSAGE
  ═══════════════════════════════════════════════════ */
  function _pushMsg(ctx, msg) {
    if (ctx === 'community') {
      commRef().push(msg)
        .catch(err => {
          console.error('[Chat] Erro comunidade:', err);
          _toast('Erro ao enviar: ' + (err.message || err.code || 'desconhecido'));
        });
    } else {
      if (!_privUid) return;
      privRef().push(msg)
        .then(() => _updateConvoMeta(msg))
        .catch(err => {
          console.error('[Chat] Erro privado:', err);
          _toast('Erro ao enviar: ' + (err.message || err.code || 'desconhecido'));
        });
    }
  }

  function _updateConvoMeta(msg) {
    const uid = _myUid();
    if (!uid || !_privUid) return;
    let preview = msg.type === 'text' ? msg.text
      : msg.type === 'image' ? 'Foto'
      : msg.type === 'audio' ? 'Áudio'
      : msg.type === 'video' ? 'Vídeo'
      : (msg.fileName || 'Ficheiro');
    const meta = { lastMsg: preview, lastTs: firebase.database.ServerValue.TIMESTAMP, lastSenderUid: uid };
    db().ref(`chat/convos/${uid}/${_privUid}`).update({ ...meta, otherName: _privName, otherUid: _privUid });
    db().ref(`chat/convos/${_privUid}/${uid}`).update({ ...meta, otherName: _myName(), otherUid: uid });
  }

  /* ═══════════════════════════════════════════════════
     ATTACHMENTS
  ═══════════════════════════════════════════════════ */
  function toggleAttach(ctx) {
    const menu = $(ctx === 'community' ? 'communityAttachMenu' : 'privateAttachMenu');
    if (!menu) return;
    menu.classList.toggle('open');
    _attachCtx = ctx;
    document.querySelectorAll('.attach-menu').forEach(m => { if (m !== menu) m.classList.remove('open'); });
  }

  function pickImage(ctx) {
    _attachCtx = ctx;
    document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
    $('chatImgInput').click();
  }

  function pickFile(ctx) {
    _attachCtx = ctx;
    document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
    $('chatFileInput').click();
  }

  function _onImgChange() {
    const file = $('chatImgInput').files[0];
    $('chatImgInput').value = '';
    if (!file) return;
    _sendFile(file, 'image', _attachCtx || _tab);
  }

  function _onFileChange() {
    const file = $('chatFileInput').files[0];
    $('chatFileInput').value = '';
    if (!file) return;
    let t = 'file';
    if (file.type.startsWith('image/')) t = 'image';
    else if (file.type.startsWith('audio/')) t = 'audio';
    else if (file.type.startsWith('video/')) t = 'video';
    _sendFile(file, t, _attachCtx || _tab);
  }

  function _sendFile(file, msgType, ctx) {
    const uid = _myUid();
    if (!uid) { _toast('Precisas de estar autenticado.'); return; }
    const MAX = 100 * 1024 * 1024;
    if (file.size > MAX) { _toast('Ficheiro demasiado grande (máx 100 MB)'); return; }

    const base = {
      uid: uid, name: _myName(), avatar: _myAvatar(),
      type: msgType, fileName: file.name,
      fileSize: _fmtSize(file.size), fileType: file.type,
      ts: firebase.database.ServerValue.TIMESTAMP,
      deleted: false, edited: false
    };
    if (_replyTo[ctx]) {
      base.replyTo = { uid: _replyTo[ctx].uid, name: _replyTo[ctx].name, text: _replyTo[ctx].text };
      cancelReply(ctx);
    }

    _toast('A enviar...');

    if (file.size > 2 * 1024 * 1024) {
      base.url = ''; base.noPreview = true;
      _pushMsg(ctx, base);
      _toast('Ficheiro enviado (sem pré-visualização — use Firebase Storage para ficheiros grandes).');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => { base.url = e.target.result; _pushMsg(ctx, base); };
    reader.onerror = () => _toast('Erro ao ler o ficheiro');
    reader.readAsDataURL(file);
  }

  function _fmtSize(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1024 / 1024).toFixed(1) + ' MB';
  }

  /* ═══════════════════════════════════════════════════
     REPLY
  ═══════════════════════════════════════════════════ */
  function setReply(ctx, uid, name, text) {
    _replyTo[ctx] = { uid, name, text };
    const p = ctx === 'community' ? 'community' : 'private';
    const bar = $(p + 'ReplyBar'); if (bar) bar.classList.add('show');
    const rn  = $(p + 'ReplyName'); if (rn) rn.textContent = name;
    const rt  = $(p + 'ReplyText'); if (rt) rt.textContent = String(text || '').substring(0, 70);
    const inp = $(p + 'Input'); if (inp) inp.focus();
  }

  function cancelReply(ctx) {
    _replyTo[ctx] = null;
    const bar = $((ctx === 'community' ? 'community' : 'private') + 'ReplyBar');
    if (bar) bar.classList.remove('show');
  }

  /* ═══════════════════════════════════════════════════
     EDIT
  ═══════════════════════════════════════════════════ */
  function startEdit(ctx, key, origText) {
    _editState[ctx] = { key, origText };
    const p = ctx === 'community' ? 'community' : 'private';
    const inp = $(p + 'Input'), label = $(p + 'EditLabel');
    if (inp)   { inp.value = origText; inp.classList.add('editing'); autoResize(inp); inp.focus(); }
    if (label) label.classList.add('show');
    cancelReply(ctx);
  }

  function cancelEdit(ctx) {
    if (!_editState[ctx]) return;
    _editState[ctx] = null;
    const p = ctx === 'community' ? 'community' : 'private';
    const inp = $(p + 'Input'), label = $(p + 'EditLabel');
    if (inp)   { inp.value = ''; inp.classList.remove('editing'); autoResize(inp); }
    if (label) label.classList.remove('show');
  }

  function _confirmEdit(ctx, newText) {
    const es = _editState[ctx]; if (!es) return;
    if (newText === es.origText) { cancelEdit(ctx); return; }
    const ref = ctx === 'community' ? commRef().child(es.key) : privRef().child(es.key);
    ref.update({ text: newText, edited: true, editedTs: firebase.database.ServerValue.TIMESTAMP })
      .then(() => cancelEdit(ctx))
      .catch(() => _toast('Erro ao editar mensagem'));
  }

  /* ═══════════════════════════════════════════════════
     DELETE
  ═══════════════════════════════════════════════════ */
  function deleteForMe(ctx, key) {
    localStorage.setItem(`chat_deleted_${_myUid()}_${key}`, '1');
    _closeCtxMenu();
    _toast('Mensagem apagada para ti');
    /* remove da cache local e re-renderiza */
    if (ctx === 'community') {
      _allMsgs.community = _allMsgs.community.filter(m => m.key !== key);
      _renderMessages('community', _allMsgs.community, $('communityMessages'));
    } else {
      _allMsgs.private = _allMsgs.private.filter(m => m.key !== key);
      _renderMessages('private', _allMsgs.private, $('privateMessages'));
    }
  }

  function deleteForAll(ctx, key) {
    const ref = ctx === 'community' ? commRef().child(key) : privRef().child(key);
    ref.update({ deleted: true, text: '', url: '', fileName: '', deletedTs: firebase.database.ServerValue.TIMESTAMP })
      .then(() => _toast('Mensagem apagada para todos'))
      .catch(() => _toast('Erro ao apagar mensagem'));
    _closeCtxMenu();
  }

  function _detachListener(name) {
    if (_listeners[name]) { _listeners[name](); _listeners[name] = null; }
  }

  /* ═══════════════════════════════════════════════════
     CONTEXT MENU
  ═══════════════════════════════════════════════════ */
  function _openCtxMenu(e, ctx, msgData) {
    e.preventDefault();
    _ctxTarget = { ctx, ...msgData };
    const menu = $('msgCtxMenu');
    const isMine = msgData.uid === _myUid();
    $('ctxEdit').style.display      = (isMine && msgData.type === 'text' && !msgData.deleted) ? '' : 'none';
    $('ctxDeleteAll').style.display = (isMine && !msgData.deleted) ? '' : 'none';
    $('ctxDeleteMe').style.display  = !msgData.deleted ? '' : 'none';
    $('ctxDivider1').style.display  = !msgData.deleted ? '' : 'none';
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = (e.touches ? e.touches[0].clientX : e.clientX) || vw / 2;
    let y = (e.touches ? e.touches[0].clientY : e.clientY) || vh / 2;
    menu.classList.add('open');
    const mw = menu.offsetWidth || 210, mh = menu.offsetHeight || 160;
    if (x + mw > vw - 8) x = vw - mw - 8;
    if (y + mh > vh - 8) y = vh - mh - 8;
    if (x < 8) x = 8; if (y < 8) y = 8;
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
  }

  function _closeCtxMenu() {
    const m = $('msgCtxMenu'); if (m) m.classList.remove('open'); _ctxTarget = null;
  }

  function _bindCtxActions() {
    $('ctxReply').onclick = () => { if (!_ctxTarget) return; setReply(_ctxTarget.ctx, _ctxTarget.uid, _ctxTarget.name, _ctxTarget.text || ''); _closeCtxMenu(); };
    $('ctxEdit').onclick  = () => { if (!_ctxTarget) return; startEdit(_ctxTarget.ctx, _ctxTarget.key, _ctxTarget.text || ''); _closeCtxMenu(); };
    $('ctxDeleteMe').onclick  = () => { if (!_ctxTarget) return; deleteForMe(_ctxTarget.ctx, _ctxTarget.key); };
    $('ctxDeleteAll').onclick = () => { if (!_ctxTarget) return; deleteForAll(_ctxTarget.ctx, _ctxTarget.key); };
    document.addEventListener('click',      e => { const m=$('msgCtxMenu'); if(m&&!m.contains(e.target)) _closeCtxMenu(); });
    document.addEventListener('touchstart', e => { const m=$('msgCtxMenu'); if(m&&!m.contains(e.target)) _closeCtxMenu(); }, { passive: true });
  }

  /* ═══════════════════════════════════════════════════
     PRIVATE CHAT
  ═══════════════════════════════════════════════════ */
  function startPrivateWith(uid, name) {
    _privUid = uid; _privName = name;
    $('privateChatName').textContent   = name;
    $('privateChatStatus').textContent = 'online';
    $('privateChatAvatar').textContent = (name || '?')[0].toUpperCase();
    $('chatViewPrivateList').classList.remove('active');
    $('chatViewPrivateChat').classList.add('active');
    _allMsgs.private = [];
    _detachListener('privChat');
    _startPrivateChatListener();
    _clearUnreadPriv(uid);
    if (_tab !== 'private') switchTab('private');
    const uid2 = _myUid();
    if (uid2) db().ref(`chat/convos/${uid2}/${uid}`).update({ otherName: name, otherUid: uid, lastTs: firebase.database.ServerValue.TIMESTAMP });
  }

  function backToConvoList() {
    _privUid = null; _allMsgs.private = [];
    _detachListener('privChat');
    $('chatViewPrivateChat').classList.remove('active');
    $('chatViewPrivateList').classList.add('active');
    cancelReply('private'); cancelEdit('private');
  }

  function _onMentionTap(uid, name, text) {
    if (confirm(`Iniciar conversa privada com ${name}?`)) {
      startPrivateWith(uid, name); if (!_isOpen) open();
    } else { setReply('community', uid, name, text); }
  }

  /* ═══════════════════════════════════════════════════
     FIREBASE LISTENERS
  ═══════════════════════════════════════════════════ */
  function _startCommunityListener() {
    if (_listeners.community) return;
    const area = $('communityMessages');
    const q    = commRef().orderByChild('ts').limitToLast(100);
    const handler = snap => {
      const msgs = [];
      snap.forEach(c => {
        const v = c.val();
        if (v) msgs.push({ key: c.key, ...v });
      });
      _allMsgs.community = msgs;
      _renderMessages('community', msgs, area);
      if (_isOpen && _tab === 'community') {
        _clearUnreadComm();
        setTimeout(() => _scrollBottom('communityMessages'), 80);
      }
    };
    q.on('value', handler, err => {
      console.error('[Chat] Listener comunidade erro:', err);
      _toast('Erro ao carregar chat: ' + (err.message || err.code));
    });
    _listeners.community = () => q.off('value', handler);
  }

  function _startConvosListener() {
    const uid = _myUid();
    if (!uid || _listeners.convos) return;
    const ref = db().ref(`chat/convos/${uid}`);
    const handler = snap => {
      const list = [];
      snap.forEach(c => { const v = c.val(); if(v) list.push({ uid: c.key, ...v }); });
      _renderConvosList(list);
    };
    ref.on('value', handler);
    _listeners.convos = () => ref.off('value', handler);
  }

  function _startPrivateChatListener() {
    if (!_privUid) return;
    const area = $('privateMessages');
    const ref  = privRef().orderByChild('ts').limitToLast(100);
    const handler = snap => {
      const msgs = [];
      snap.forEach(c => {
        const v = c.val();
        if (v) msgs.push({ key: c.key, ...v });
      });
      _allMsgs.private = msgs;
      _renderMessages('private', msgs, area);
      if (_isOpen && _tab === 'private' && _privUid) {
        _clearUnreadPriv(_privUid);
        setTimeout(() => _scrollBottom('privateMessages'), 80);
      }
    };
    ref.on('value', handler, err => {
      console.error('[Chat] Listener privado erro:', err);
      _toast('Erro ao carregar mensagens: ' + (err.message || err.code));
    });
    _listeners.privChat = () => ref.off('value', handler);
  }

  function _startBadgeListeners() {
    const myUid = _myUid(); if (!myUid) return;
    let commReady = false;
    commRef().limitToLast(1).once('value', () => { commReady = true; });
    commRef().on('child_added', snap => {
      if (!commReady) return;
      const m = snap.val();
      if (m && m.uid !== myUid && !m.deleted) _incUnreadComm();
    });
    db().ref(`chat/convos/${myUid}`).on('child_changed', snap => {
      const c = snap.val();
      if (c && c.lastSenderUid && c.lastSenderUid !== myUid) _incUnreadPriv(snap.key);
    });
  }

  /* ═══════════════════════════════════════════════════
     RENDER MESSAGES
  ═══════════════════════════════════════════════════ */
  function _renderMessages(ctx, msgs, container) {
    if (!container) return;
    const myUid = _myUid();

    /* Filter out locally-deleted messages */
    const visible = msgs.filter(msg => {
      if (!msg || !msg.key) return false;
      if (msg.key.startsWith('__pending__')) return true; // optimistic
      return !localStorage.getItem(`chat_deleted_${myUid}_${msg.key}`);
    });

    if (!visible.length) {
      container.innerHTML = `<div class="chat-empty">
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        <strong>${ctx === 'community' ? 'Chat da Comunidade' : 'Conversa Privada'}</strong>
        <p>${ctx === 'community' ? 'Sê o primeiro a escrever!' : 'Envia a primeira mensagem!'}</p>
      </div>`;
      return;
    }

    let lastDate = '', html = '';

    visible.forEach(msg => {
      const mine    = msg.uid === myUid;
      const ts      = msg.ts ? new Date(msg.ts) : new Date();
      const dateStr = ts.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: '2-digit' });
      if (dateStr !== lastDate) { html += `<div class="msg-date-sep">${dateStr}</div>`; lastDate = dateStr; }
      const timeStr   = ts.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' });
      const editedTag = msg.edited ? '<span class="msg-edited-tag">(editado)</span>' : '';

      /* Avatar */
      const avatarHtml = mine ? '' : `<div class="msg-avatar-sm">${
        msg.avatar ? `<img src="${_esc(msg.avatar)}" onerror="this.style.display='none';this.parentNode.textContent='${_esc((msg.name||'?')[0].toUpperCase())}'">`
        : _esc((msg.name || '?')[0].toUpperCase())
      }</div>`;

      /* Reply quote */
      let replyHtml = '';
      if (msg.replyTo && !msg.deleted) {
        replyHtml = `<div class="msg-reply-quote"><strong>${_esc(msg.replyTo.name)}</strong> ${_esc((msg.replyTo.text||'').substring(0,60))}</div>`;
      }

      /* Pending indicator */
      const isPending = String(msg.key).startsWith('__pending__');
      const pendingStyle = isPending ? 'opacity:0.6' : '';

      /* Content */
      let content = '';
      if (msg.deleted) {
        content = `<div class="msg-bubble deleted"><svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;vertical-align:middle;margin-right:4px"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>Mensagem apagada</div>`;
      } else if (msg.type === 'text' || !msg.type) {
        content = `<div class="msg-bubble" style="${pendingStyle}">${replyHtml}${_linkify(_esc(msg.text||''))}${editedTag}</div>`;
      } else if (msg.type === 'image') {
        if (msg.url && !msg.noPreview) {
          content = `<div class="msg-bubble msg-bubble-media" style="${pendingStyle}">${replyHtml}<img class="msg-img" src="${msg.url}" onclick="ChatSystem._previewImgEl(this)" alt="${_esc(msg.fileName||'foto')}">${editedTag}</div>`;
        } else {
          content = `<div class="msg-bubble" style="${pendingStyle}"><div class="msg-file"><svg viewBox="0 0 24 24" class="msg-file-icon" style="fill:#22C55E"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg><div class="msg-file-info"><div class="msg-file-name">${_esc(msg.fileName||'imagem')}</div><div class="msg-file-size">${msg.fileSize||''}</div></div></div></div>`;
        }
      } else if (msg.type === 'audio') {
        content = msg.url && !msg.noPreview
          ? `<div class="msg-bubble msg-bubble-media" style="${pendingStyle}">${replyHtml}<div class="msg-audio"><svg viewBox="0 0 24 24" class="msg-audio-icon"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg><audio controls src="${msg.url}" style="max-width:190px;height:36px"></audio></div>${editedTag}</div>`
          : `<div class="msg-bubble" style="${pendingStyle}"><div class="msg-file"><svg viewBox="0 0 24 24" class="msg-file-icon" style="fill:#8B5CF6"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg><div class="msg-file-info"><div class="msg-file-name">${_esc(msg.fileName||'áudio')}</div><div class="msg-file-size">${msg.fileSize||''}</div></div></div></div>`;
      } else if (msg.type === 'video') {
        content = msg.url && !msg.noPreview
          ? `<div class="msg-bubble msg-bubble-media" style="${pendingStyle}">${replyHtml}<video controls class="msg-video" src="${msg.url}"></video>${editedTag}</div>`
          : `<div class="msg-bubble" style="${pendingStyle}"><div class="msg-file"><svg viewBox="0 0 24 24" class="msg-file-icon" style="fill:#EF4444"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg><div class="msg-file-info"><div class="msg-file-name">${_esc(msg.fileName||'vídeo')}</div><div class="msg-file-size">${msg.fileSize||''}</div></div></div></div>`;
      } else {
        const dl = msg.url ? `onclick="window.open('${msg.url}')" style="cursor:pointer"` : '';
        content = `<div class="msg-bubble" style="${pendingStyle}"><div class="msg-file" ${dl}><svg viewBox="0 0 24 24" class="msg-file-icon" style="fill:#3B82F6"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg><div class="msg-file-info"><div class="msg-file-name">${_esc(msg.fileName||'ficheiro')}</div><div class="msg-file-size">${msg.fileSize||''}</div></div></div></div>`;
      }

      /* Mention btn */
      let mentionBtn = '';
      if (ctx === 'community' && !mine && !msg.deleted) {
        const sn = _esc(msg.name||'?'), st = _esc((msg.text||'').substring(0,60));
        mentionBtn = `<button class="msg-mention-btn" onclick="event.stopPropagation();ChatSystem._onMentionTap('${_esc(msg.uid||'')}','${sn}','${st}')"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg> Privado</button>`;
      }

      /* Serialize via base64 */
      const msgObj = { key: msg.key, ctx, uid: msg.uid||'', name: msg.name||'', type: msg.type||'text',
        text: (msg.type==='text'||!msg.type) ? (msg.text||'') : '['+msg.type+']', deleted: !!msg.deleted };
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(msgObj))));

      html += `<div class="msg-row ${mine?'mine':'theirs'}" data-key="${_esc(msg.key)}" data-msgb64="${b64}" data-ctx="${ctx}">
        ${avatarHtml}
        <div class="msg-bubble-wrap">
          ${!mine ? `<span class="msg-sender-name">${_esc(msg.name||'?')} ${mentionBtn}</span>` : ''}
          ${content}
          <span class="msg-time">${timeStr}${isPending ? ' <svg viewBox="0 0 24 24" style="width:10px;height:10px;fill:currentColor;opacity:0.5;vertical-align:middle"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>' : ''}</span>
        </div>
      </div>`;
    });

    container.innerHTML = html;
    _bindMsgInteractions(container, ctx);
  }

  function _linkify(text) {
    return text.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" style="color:inherit;text-decoration:underline;word-break:break-all">$1</a>');
  }

  function _bindMsgInteractions(container, ctx) {
    container.querySelectorAll('.msg-row').forEach(row => {
      if (row.dataset.key && row.dataset.key.startsWith('__pending__')) return; // não abrir menu em msgs pendentes
      const getMsgData = () => {
        try { return JSON.parse(decodeURIComponent(escape(atob(row.dataset.msgb64)))); }
        catch(e) { return null; }
      };
      row.addEventListener('touchstart', e => {
        if (e.target.closest('.msg-mention-btn,.msg-img,audio,video,.msg-file')) return;
        _pressTimer = setTimeout(() => { const d=getMsgData(); if(d) _openCtxMenu(e, ctx, d); }, 500);
      }, { passive: true });
      row.addEventListener('touchend',  () => clearTimeout(_pressTimer));
      row.addEventListener('touchmove', () => clearTimeout(_pressTimer), { passive: true });
      row.addEventListener('contextmenu', e => {
        if (e.target.closest('.msg-mention-btn')) return;
        const d = getMsgData(); if(d) _openCtxMenu(e, ctx, d);
      });
    });
  }

  /* ═══════════════════════════════════════════════════
     RENDER CONVOS LIST
  ═══════════════════════════════════════════════════ */
  function _renderConvosList(convos) {
    const c = $('convosList'); if (!c) return;
    if (!convos.length) {
      c.innerHTML = `<div class="chat-empty"><svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg><strong>Sem conversas privadas</strong><p>No chat da comunidade, toca em "Privado" ao lado do nome de alguém.</p></div>`;
      return;
    }
    convos.sort((a, b) => (b.lastTs||0) - (a.lastTs||0));
    c.innerHTML = convos.map(cv => {
      const init = (cv.otherName||'?')[0].toUpperCase();
      const unr  = _unreadMap[cv.uid] || 0;
      const ts   = cv.lastTs ? new Date(cv.lastTs).toLocaleTimeString('pt-AO',{hour:'2-digit',minute:'2-digit'}) : '';
      return `<div class="convo-item" onclick="ChatSystem.startPrivateWith('${_esc(cv.otherUid||cv.uid)}','${_esc(cv.otherName||'?')}')">
        <div class="convo-avatar">${init}</div>
        <div class="convo-info"><div class="convo-name">${_esc(cv.otherName||'?')}</div><div class="convo-preview">${_esc(cv.lastMsg||'')}</div></div>
        <div class="convo-meta"><span class="convo-time">${ts}</span><span class="convo-unread ${unr>0?'show':''}">${unr>99?'99+':(unr||'')}</span></div>
      </div>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════════════
     BADGES
  ═══════════════════════════════════════════════════ */
  function _clearUnreadComm() { _unreadComm = 0; _updateBadges(); }
  function _clearUnreadPriv(uid) { delete _unreadMap[uid]; _unreadPriv = Object.values(_unreadMap).reduce((a,b)=>a+b,0); _updateBadges(); }
  function _incUnreadComm()  { if (_isOpen && _tab==='community') return; _unreadComm++; _updateBadges(); }
  function _incUnreadPriv(uid) { if (_isOpen && _tab==='private' && _privUid===uid) return; _unreadMap[uid]=(_unreadMap[uid]||0)+1; _unreadPriv=Object.values(_unreadMap).reduce((a,b)=>a+b,0); _updateBadges(); }

  function _updateBadges() {
    const total = _unreadComm + _unreadPriv;
    const cb = $('headerChatBadge'); if(cb){ cb.textContent=total>99?'99+':(total||''); cb.classList.toggle('show',total>0); }
    const commB=$('communityTabBadge'); if(commB){ commB.textContent=_unreadComm>99?'99+':(_unreadComm||''); commB.classList.toggle('show',_unreadComm>0); }
    const privB=$('privateTabBadge');  if(privB){ privB.textContent=_unreadPriv>99?'99+':(_unreadPriv||''); privB.classList.toggle('show',_unreadPriv>0); }
  }

  function _patchNotifBadge() {
    setInterval(() => {
      const count = (window._notifItems||[]).length;
      const badge = $('headerNotifBadge'), dot = $('headerNotifDot');
      if (!badge) return;
      if (count > 0) { badge.textContent = count>99?'99+':count; badge.classList.add('show'); if(dot) dot.classList.remove('show'); }
      else badge.classList.remove('show');
    }, 2000);
  }

  /* ═══════════════════════════════════════════════════
     IMAGE PREVIEW
  ═══════════════════════════════════════════════════ */
  function _previewImgEl(imgEl) {
    const url = imgEl.dataset.full || imgEl.src;
    $('imgPreviewImg').src = url;
    $('imgPreviewOverlay').classList.add('open');
  }

  /* ═══════════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════════ */
  function _scrollBottom(id) { const e=$(id); if(e) setTimeout(()=>{ e.scrollTop=e.scrollHeight; },80); }
  function autoResize(inp) { inp.style.height='auto'; inp.style.height=Math.min(inp.scrollHeight,100)+'px'; }
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  /* ═══════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════ */
  function init() {
    const btn = $('headerChatBtn');
    if (btn) btn.onclick = e => { e.stopPropagation(); open(); };

    const ov = $('chatOverlay');
    if (ov) ov.addEventListener('click', function(e) { if(e.target===this) close(); });

    const ip = $('imgPreviewOverlay');
    if (ip) ip.addEventListener('click', function() { this.classList.remove('open'); });

    const ii = $('chatImgInput');  if(ii) ii.addEventListener('change', _onImgChange);
    const fi = $('chatFileInput'); if(fi) fi.addEventListener('change', _onFileChange);

    ['communityInput','privateInput'].forEach(id => {
      const inp = $(id); if (!inp) return;
      const ctx = id==='communityInput' ? 'community' : 'private';
      inp.addEventListener('keydown', e => {
        if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendText(ctx); }
        if (e.key==='Escape') { cancelEdit(ctx); cancelReply(ctx); }
      });
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('.attach-menu') && !e.target.closest('.chat-attach-btn'))
        document.querySelectorAll('.attach-menu').forEach(m=>m.classList.remove('open'));
    });

    _bindCtxActions();

    firebase.auth().onAuthStateChanged(user => {
      if (user) {
        console.log('[Chat] Auth OK, uid:', user.uid);
        setTimeout(_startBadgeListeners, 1000);
      } else {
        console.warn('[Chat] Utilizador não autenticado');
      }
    });

    setTimeout(_patchNotifBadge, 800);
  }

  return {
    open, close, switchTab,
    sendText, toggleAttach, pickImage, pickFile,
    setReply, cancelReply,
    startEdit, cancelEdit,
    startPrivateWith, backToConvoList,
    _onMentionTap, _previewImgEl,
    autoResize, init
  };
})();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ChatSystem.init());
} else {
  ChatSystem.init();
}
