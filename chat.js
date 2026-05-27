/* ══════════════════════════════════════════════════════════
   BANDAPP CHAT SYSTEM — chat.js
   Comunidade + Privado · Firebase RTDB
   - Envio de texto, imagens e ficheiros (até 100 MB)
   - Responder mensagem (reply/quote)
   - Mencionar / puxar para privado
   - Editar mensagem (apenas o autor)
   - Apagar para mim / apagar para todos (igual WhatsApp)
   - Badges numéricos no ícone de chat e de notificação
   ══════════════════════════════════════════════════════════ */
'use strict';

const ChatSystem = (() => {

  /* ── State ─────────────────────────────────────────── */
  let _tab        = 'community';   // 'community' | 'private'
  let _privUid    = null;          // UID do outro utilizador
  let _privName   = '';
  let _replyTo    = { community: null, private: null };
  let _editState  = { community: null, private: null }; // { key, origText }
  let _ctxTarget  = null;          // { ctx, key, uid, ismine, type, text }
  let _listeners  = {};
  let _unreadComm = 0;
  let _unreadPriv = 0;
  let _unreadMap  = {};            // { uid: count }
  let _attachCtx  = null;
  let _isOpen     = false;
  let _pressTimer = null;          // long-press timer

  /* ── Firebase helpers ──────────────────────────────── */
  const db      = () => firebase.database();
  const commRef = () => db().ref('chat/community');
  const privRef = () => { const k = _convKey(_myUid(), _privUid); return db().ref(`chat/private/${k}`); };

  function _convKey(a, b) { return [a, b].sort().join('_'); }
  function _myUid()   { return (firebase.auth().currentUser || {}).uid || 'anon_guest'; }
  function _myName()  { return (typeof State !== 'undefined' && State.profile?.name) || firebase.auth().currentUser?.displayName || 'Utilizador'; }
  function _myAvatar(){ return (typeof State !== 'undefined' && State.profile?.avatar) || firebase.auth().currentUser?.photoURL || ''; }

  /* ── DOM shortcuts ─────────────────────────────────── */
  const $  = id => document.getElementById(id);
  const el = id => $(id);

  /* ═══════════════════════════════════════════════════
     OPEN / CLOSE
  ═══════════════════════════════════════════════════ */
  function open() {
    el('chatOverlay').classList.add('open');
    _isOpen = true;
    const np = el('notifPanel');
    if (np) np.classList.remove('open');
    _startCommunityListener();
    _startConvosListener();
    if (_tab === 'community') { _clearUnreadComm(); _scrollBottom('communityMessages'); }
    else if (_tab === 'private' && _privUid) { _clearUnreadPriv(_privUid); _scrollBottom('privateMessages'); }
  }

  function close() {
    el('chatOverlay').classList.remove('open');
    _isOpen = false;
    _closeCtxMenu();
    document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
  }

  /* ═══════════════════════════════════════════════════
     TABS
  ═══════════════════════════════════════════════════ */
  function switchTab(tab) {
    _tab = tab;
    el('chatTabCommunity').classList.toggle('active', tab === 'community');
    el('chatTabPrivate').classList.toggle('active', tab === 'private');
    el('chatViewCommunity').classList.toggle('active', tab === 'community');
    el('chatViewPrivateList').classList.toggle('active', tab === 'private' && !_privUid);
    el('chatViewPrivateChat').classList.toggle('active', tab === 'private' && !!_privUid);
    document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
    _closeCtxMenu();
    if (tab === 'community') { _clearUnreadComm(); _scrollBottom('communityMessages'); }
    if (tab === 'private') _startConvosListener();
  }

  /* ═══════════════════════════════════════════════════
     SEND TEXT
  ═══════════════════════════════════════════════════ */
  function sendText(ctx) {
    const inputId = ctx === 'community' ? 'communityInput' : 'privateInput';
    const inp = el(inputId);
    if (!inp) return;
    const text = inp.value.trim();
    if (!text) return;

    // ── Edit mode ──────────────────────────────────────
    if (_editState[ctx]) {
      _confirmEdit(ctx, text);
      return;
    }

    // ── Normal send ────────────────────────────────────
    inp.value = '';
    autoResize(inp);

    const msg = {
      uid:    _myUid(),
      name:   _myName(),
      avatar: _myAvatar(),
      type:   'text',
      text:   text,
      ts:     firebase.database.ServerValue.TIMESTAMP,
      deleted: false,
      edited:  false
    };

    if (_replyTo[ctx]) {
      msg.replyTo = { uid: _replyTo[ctx].uid, name: _replyTo[ctx].name, text: _replyTo[ctx].text };
      cancelReply(ctx);
    }

    _pushMsg(ctx, msg);
  }

  /* ═══════════════════════════════════════════════════
     PUSH MESSAGE to Firebase
  ═══════════════════════════════════════════════════ */
  function _pushMsg(ctx, msg) {
    if (ctx === 'community') {
      commRef().push(msg).catch(() => showToast('Erro ao enviar mensagem'));
    } else {
      if (!_privUid) return;
      privRef().push(msg).catch(() => showToast('Erro ao enviar'));
      _updateConvoMeta(msg);
    }
  }

  function _updateConvoMeta(msg) {
    const preview = msg.type === 'text' ? msg.text : (msg.type === 'image' ? '📷 Foto' : '📎 ' + (msg.fileName || 'Ficheiro'));
    const meta = {
      lastMsg:       preview,
      lastTs:        firebase.database.ServerValue.TIMESTAMP,
      lastSenderUid: _myUid()
    };
    db().ref(`chat/convos/${_myUid()}/${_privUid}`).update({ ...meta, otherName: _privName, otherUid: _privUid });
    db().ref(`chat/convos/${_privUid}/${_myUid()}`).update({ ...meta, otherName: _myName(), otherUid: _myUid() });
  }

  /* ═══════════════════════════════════════════════════
     ATTACHMENTS (Images & Files)
  ═══════════════════════════════════════════════════ */
  function toggleAttach(ctx) {
    const menuId = ctx === 'community' ? 'communityAttachMenu' : 'privateAttachMenu';
    const menu = el(menuId);
    menu.classList.toggle('open');
    _attachCtx = ctx;
    document.querySelectorAll('.attach-menu').forEach(m => { if (m !== menu) m.classList.remove('open'); });
  }

  function pickImage(ctx) {
    _attachCtx = ctx;
    document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
    el('chatImgInput').click();
  }

  function pickFile(ctx) {
    _attachCtx = ctx;
    document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
    el('chatFileInput').click();
  }

  function _onImgChange() {
    const file = el('chatImgInput').files[0];
    el('chatImgInput').value = '';
    if (!file) return;
    _sendFile(file, 'image', _attachCtx || 'community');
  }

  function _onFileChange() {
    const file = el('chatFileInput').files[0];
    el('chatFileInput').value = '';
    if (!file) return;
    _sendFile(file, 'file', _attachCtx || 'community');
  }

  function _sendFile(file, msgType, ctx) {
    const MAX = 100 * 1024 * 1024;
    if (file.size > MAX) { showToast('Ficheiro demasiado grande (máx 100 MB)'); return; }

    const base = {
      uid:      _myUid(),
      name:     _myName(),
      avatar:   _myAvatar(),
      type:     msgType,
      fileName: file.name,
      fileSize: _fmtSize(file.size),
      fileType: file.type,
      ts:       firebase.database.ServerValue.TIMESTAMP,
      deleted:  false,
      edited:   false
    };

    if (_replyTo[ctx]) {
      base.replyTo = { uid: _replyTo[ctx].uid, name: _replyTo[ctx].name, text: _replyTo[ctx].text };
      cancelReply(ctx);
    }

    // For files > 2 MB we skip base64 (RTDB limit) — show metadata only
    // In production, upload to Firebase Storage first
    if (file.size > 2 * 1024 * 1024) {
      base.url = '';
      base.noPreview = true;
      _pushMsg(ctx, base);
      showToast('Ficheiro enviado. Para pré-visualização use Firebase Storage.');
      return;
    }

    const reader = new FileReader();
    reader.onload = e => {
      base.url = e.target.result;
      _pushMsg(ctx, base);
    };
    reader.onerror = () => showToast('Erro ao ler o ficheiro');
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
    const prefix = ctx === 'community' ? 'community' : 'private';
    el(prefix + 'ReplyBar').classList.add('show');
    el(prefix + 'ReplyName').textContent = name;
    el(prefix + 'ReplyText').textContent = text.substring(0, 70);
    el(prefix + 'Input').focus();
  }

  function cancelReply(ctx) {
    _replyTo[ctx] = null;
    const prefix = ctx === 'community' ? 'community' : 'private';
    el(prefix + 'ReplyBar').classList.remove('show');
  }

  /* ═══════════════════════════════════════════════════
     EDIT MESSAGE
  ═══════════════════════════════════════════════════ */
  function startEdit(ctx, key, origText) {
    _editState[ctx] = { key, origText };
    const prefix   = ctx === 'community' ? 'community' : 'private';
    const inp      = el(prefix + 'Input');
    const label    = el(prefix + 'EditLabel');
    inp.value = origText;
    inp.classList.add('editing');
    if (label) label.classList.add('show');
    autoResize(inp);
    inp.focus();
    // Cancel reply if active
    cancelReply(ctx);
  }

  function cancelEdit(ctx) {
    if (!_editState[ctx]) return;
    _editState[ctx] = null;
    const prefix = ctx === 'community' ? 'community' : 'private';
    const inp    = el(prefix + 'Input');
    const label  = el(prefix + 'EditLabel');
    inp.value = '';
    inp.classList.remove('editing');
    if (label) label.classList.remove('show');
    autoResize(inp);
  }

  function _confirmEdit(ctx, newText) {
    const es = _editState[ctx];
    if (!es) return;
    if (newText === es.origText) { cancelEdit(ctx); return; }

    const ref = ctx === 'community'
      ? commRef().child(es.key)
      : privRef().child(es.key);

    ref.update({ text: newText, edited: true, editedTs: firebase.database.ServerValue.TIMESTAMP })
      .then(() => cancelEdit(ctx))
      .catch(() => showToast('Erro ao editar mensagem'));
  }

  /* ═══════════════════════════════════════════════════
     DELETE MESSAGE
  ═══════════════════════════════════════════════════ */
  function deleteForMe(ctx, key) {
    // Store locally that this message is hidden for me
    const storageKey = `chat_deleted_${_myUid()}_${key}`;
    localStorage.setItem(storageKey, '1');
    _closeCtxMenu();
    // Re-render
    if (ctx === 'community') _startCommunityListener();
    else _startPrivateChatListener();
    showToast('Mensagem apagada para ti');
  }

  function deleteForAll(ctx, key) {
    const ref = ctx === 'community'
      ? commRef().child(key)
      : privRef().child(key);

    ref.update({ deleted: true, text: '', url: '', deletedTs: firebase.database.ServerValue.TIMESTAMP })
      .then(() => showToast('Mensagem apagada para todos'))
      .catch(() => showToast('Erro ao apagar mensagem'));
    _closeCtxMenu();
  }

  /* ═══════════════════════════════════════════════════
     CONTEXT MENU (long-press or right-click)
  ═══════════════════════════════════════════════════ */
  function _openCtxMenu(e, ctx, msgData) {
    e.preventDefault();
    _ctxTarget = { ctx, ...msgData };
    const menu  = el('msgCtxMenu');
    const isMine = msgData.uid === _myUid();

    // Show/hide edit (only mine text messages)
    el('ctxEdit').style.display = (isMine && msgData.type === 'text' && !msgData.deleted) ? '' : 'none';
    // Show/hide delete for all (only mine)
    el('ctxDeleteAll').style.display = (isMine && !msgData.deleted) ? '' : 'none';
    // Hide delete-for-me if already deleted for all
    el('ctxDeleteMe').style.display = !msgData.deleted ? '' : 'none';
    // Divider visibility
    el('ctxDivider1').style.display = !msgData.deleted ? '' : 'none';

    // Position
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = (e.touches ? e.touches[0].clientX : e.clientX) || vw / 2;
    let y = (e.touches ? e.touches[0].clientY : e.clientY) || vh / 2;
    menu.classList.add('open');
    const mw = menu.offsetWidth  || 210;
    const mh = menu.offsetHeight || 180;
    if (x + mw > vw - 8) x = vw - mw - 8;
    if (y + mh > vh - 8) y = vh - mh - 8;
    if (x < 8) x = 8;
    if (y < 8) y = 8;
    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';
  }

  function _closeCtxMenu() {
    el('msgCtxMenu').classList.remove('open');
    _ctxTarget = null;
  }

  function _bindCtxActions() {
    el('ctxReply').onclick = () => {
      if (!_ctxTarget) return;
      setReply(_ctxTarget.ctx, _ctxTarget.uid, _ctxTarget.name, _ctxTarget.text || '');
      _closeCtxMenu();
    };
    el('ctxEdit').onclick = () => {
      if (!_ctxTarget) return;
      startEdit(_ctxTarget.ctx, _ctxTarget.key, _ctxTarget.text || '');
      _closeCtxMenu();
    };
    el('ctxDeleteMe').onclick = () => {
      if (!_ctxTarget) return;
      deleteForMe(_ctxTarget.ctx, _ctxTarget.key);
    };
    el('ctxDeleteAll').onclick = () => {
      if (!_ctxTarget) return;
      deleteForAll(_ctxTarget.ctx, _ctxTarget.key);
    };
    // Close on outside click
    document.addEventListener('click', e => {
      if (!el('msgCtxMenu').contains(e.target)) _closeCtxMenu();
    });
    document.addEventListener('touchstart', e => {
      if (!el('msgCtxMenu').contains(e.target)) _closeCtxMenu();
    }, { passive: true });
  }

  /* ═══════════════════════════════════════════════════
     PRIVATE CHAT — open / back
  ═══════════════════════════════════════════════════ */
  function startPrivateWith(uid, name) {
    _privUid  = uid;
    _privName = name;
    el('privateChatName').textContent   = name;
    el('privateChatStatus').textContent = 'online';
    el('privateChatAvatar').textContent = (name || '?')[0].toUpperCase();
    el('chatViewPrivateList').classList.remove('active');
    el('chatViewPrivateChat').classList.add('active');
    _startPrivateChatListener();
    _clearUnreadPriv(uid);
    if (_tab !== 'private') switchTab('private');
    db().ref(`chat/convos/${_myUid()}/${uid}`).update({ otherName: name, otherUid: uid, lastTs: firebase.database.ServerValue.TIMESTAMP });
  }

  function backToConvoList() {
    _privUid = null;
    if (_listeners.privChat) { _listeners.privChat(); _listeners.privChat = null; }
    el('chatViewPrivateChat').classList.remove('active');
    el('chatViewPrivateList').classList.add('active');
    cancelReply('private');
    cancelEdit('private');
  }

  /* ═══════════════════════════════════════════════════
     MENTION / PULL TO PRIVATE
  ═══════════════════════════════════════════════════ */
  function _onMentionTap(uid, name, text) {
    if (confirm(`Iniciar conversa privada com ${name}?`)) {
      startPrivateWith(uid, name);
      if (!_isOpen) open();
    } else {
      setReply('community', uid, name, text);
    }
  }

  /* ═══════════════════════════════════════════════════
     FIREBASE LISTENERS
  ═══════════════════════════════════════════════════ */
  function _startCommunityListener() {
    if (_listeners.community) return;
    const area = el('communityMessages');
    const q = commRef().limitToLast(100);
    const handler = snap => {
      const msgs = [];
      snap.forEach(c => msgs.push({ key: c.key, ...c.val() }));
      _renderMessages('community', msgs, area);
      if (_isOpen && _tab === 'community') { _clearUnreadComm(); _scrollBottom('communityMessages'); }
    };
    q.on('value', handler);
    _listeners.community = () => q.off('value', handler);
  }

  function _startConvosListener() {
    const uid = _myUid();
    if (!uid || uid.startsWith('anon') || _listeners.convos) return;
    const ref = db().ref(`chat/convos/${uid}`);
    const handler = snap => {
      const list = [];
      snap.forEach(c => list.push({ uid: c.key, ...c.val() }));
      _renderConvosList(list);
    };
    ref.on('value', handler);
    _listeners.convos = () => ref.off('value', handler);
  }

  function _startPrivateChatListener() {
    if (_listeners.privChat) { _listeners.privChat(); _listeners.privChat = null; }
    if (!_privUid) return;
    const area = el('privateMessages');
    const ref  = privRef().limitToLast(100);
    const handler = snap => {
      const msgs = [];
      snap.forEach(c => msgs.push({ key: c.key, ...c.val() }));
      _renderMessages('private', msgs, area);
      if (_isOpen && _tab === 'private' && _privUid) { _clearUnreadPriv(_privUid); _scrollBottom('privateMessages'); }
    };
    ref.on('value', handler);
    _listeners.privChat = () => ref.off('value', handler);
  }

  function _startBadgeListeners() {
    // Community new-message badge
    let commFirst = true;
    commRef().limitToLast(1).on('child_added', snap => {
      if (commFirst) { commFirst = false; return; }
      const m = snap.val();
      if (m && m.uid !== _myUid() && !m.deleted) _incUnreadComm();
    });
    // Private new-message badge
    const uid = _myUid();
    if (!uid || uid.startsWith('anon')) return;
    db().ref(`chat/convos/${uid}`).on('child_changed', snap => {
      const convo = snap.val();
      if (convo && convo.lastSenderUid && convo.lastSenderUid !== uid) {
        _incUnreadPriv(snap.key);
      }
    });
  }

  /* ═══════════════════════════════════════════════════
     RENDER MESSAGES
  ═══════════════════════════════════════════════════ */
  function _renderMessages(ctx, msgs, container) {
    const myUid = _myUid();
    if (!msgs.length) {
      container.innerHTML = `<div class="chat-empty">
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        <strong>${ctx === 'community' ? 'Chat da Comunidade' : 'Conversa Privada'}</strong>
        <p>${ctx === 'community' ? 'Sê o primeiro a escrever!' : 'Envia a primeira mensagem!'}</p>
      </div>`;
      return;
    }

    let lastDate = '', html = '';

    msgs.forEach(msg => {
      // Hide messages deleted for me
      const hiddenKey = `chat_deleted_${myUid}_${msg.key}`;
      if (localStorage.getItem(hiddenKey)) return;

      const mine    = msg.uid === myUid;
      const ts      = msg.ts ? new Date(msg.ts) : new Date();
      const dateStr = ts.toLocaleDateString('pt-AO', { day: '2-digit', month: 'short', year: '2-digit' });

      if (dateStr !== lastDate) {
        html += `<div class="msg-date-sep">${dateStr}</div>`;
        lastDate = dateStr;
      }

      const timeStr = ts.toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' });
      const editedTag = msg.edited ? '<span class="msg-edited-tag">(editado)</span>' : '';

      // Avatar (only for others)
      const avatarHtml = mine ? '' : `<div class="msg-avatar-sm">${
        msg.avatar
          ? `<img src="${msg.avatar}" onerror="this.style.display='none';this.parentNode.textContent='${_esc((msg.name||'?')[0].toUpperCase())}'">`
          : _esc((msg.name || '?')[0].toUpperCase())
      }</div>`;

      // Reply quote
      let replyHtml = '';
      if (msg.replyTo && !msg.deleted) {
        replyHtml = `<div class="msg-reply-quote"><strong>${_esc(msg.replyTo.name)}</strong>${_esc((msg.replyTo.text || '').substring(0, 60))}</div>`;
      }

      // Content
      let contentHtml = '';
      if (msg.deleted) {
        contentHtml = `<div class="msg-bubble deleted">Mensagem apagada</div>`;
      } else if (msg.type === 'text' || !msg.type) {
        contentHtml = `<div class="msg-bubble">${replyHtml}${_esc(msg.text || '')}${editedTag}</div>`;
      } else if (msg.type === 'image') {
        if (msg.url && !msg.noPreview) {
          contentHtml = `<div class="msg-bubble" style="padding:4px">${replyHtml}<img class="msg-img" src="${msg.url}" data-key="${msg.key}" onclick="ChatSystem._previewImgEl(this)">${editedTag}</div>`;
        } else {
          contentHtml = `<div class="msg-bubble">
            <div class="msg-file">
              <svg viewBox="0 0 24 24" style="fill:#22C55E"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
              <div class="msg-file-info"><div class="msg-file-name">${_esc(msg.fileName || 'imagem')}</div><div class="msg-file-size">${msg.fileSize || ''}</div></div>
            </div>
          </div>`;
        }
      } else if (msg.type === 'file') {
        const dlAttr = msg.url ? `onclick="window.open(this.dataset.url)" data-url="${msg.url}"` : '';
        contentHtml = `<div class="msg-bubble">
          <div class="msg-file" style="${msg.url ? 'cursor:pointer' : ''}" ${dlAttr}>
            <svg viewBox="0 0 24 24" style="fill:#3B82F6"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.89 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>
            <div class="msg-file-info"><div class="msg-file-name">${_esc(msg.fileName || 'ficheiro')}</div><div class="msg-file-size">${msg.fileSize || ''}</div></div>
          </div>
        </div>`;
      }

      // Pull-to-private button (community only, others' messages)
      let mentionBtn = '';
      if (ctx === 'community' && !mine && !msg.deleted) {
        const safeName = _esc(msg.name || '?');
        const safeText = _esc((msg.text || '').substring(0, 60));
        mentionBtn = `<button class="msg-mention-btn" onclick="event.stopPropagation();ChatSystem._onMentionTap('${msg.uid}','${safeName}','${safeText}')">
          <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>Privado
        </button>`;
      }

      // Serialize message data for context menu
      const msgJson = JSON.stringify({
        key:     msg.key,
        ctx:     ctx,
        uid:     msg.uid,
        name:    msg.name || '',
        type:    msg.type || 'text',
        text:    msg.type === 'text' || !msg.type ? (msg.text || '') : ('[' + (msg.type) + ']'),
        deleted: !!msg.deleted
      }).replace(/'/g, '&#39;').replace(/"/g, '&quot;');

      html += `<div class="msg-row ${mine ? 'mine' : 'theirs'}"
          data-key="${msg.key}"
          data-msg='${msgJson}'
          data-ctx="${ctx}">
        ${avatarHtml}
        <div class="msg-bubble-wrap">
          ${!mine ? `<span class="msg-sender-name">${_esc(msg.name || '?')} ${mentionBtn}</span>` : ''}
          ${contentHtml}
          <span class="msg-time">${timeStr}</span>
        </div>
      </div>`;
    });

    container.innerHTML = html;

    // Bind context menu (long-press + right-click)
    container.querySelectorAll('.msg-row').forEach(row => {
      const getMsgData = () => {
        try { return JSON.parse(row.dataset.msg.replace(/&quot;/g, '"').replace(/&#39;/g, "'")); }
        catch(e) { return null; }
      };

      // Long press (touch)
      row.addEventListener('touchstart', e => {
        if (e.target.closest('.msg-mention-btn') || e.target.closest('.msg-img') || e.target.closest('.msg-file')) return;
        _pressTimer = setTimeout(() => {
          const d = getMsgData(); if (d) _openCtxMenu(e, ctx, d);
        }, 500);
      }, { passive: true });
      row.addEventListener('touchend',   () => clearTimeout(_pressTimer));
      row.addEventListener('touchmove',  () => clearTimeout(_pressTimer), { passive: true });

      // Right-click (desktop)
      row.addEventListener('contextmenu', e => {
        if (e.target.closest('.msg-mention-btn')) return;
        const d = getMsgData(); if (d) _openCtxMenu(e, ctx, d);
      });
    });
  }

  /* ═══════════════════════════════════════════════════
     RENDER CONVERSATIONS LIST
  ═══════════════════════════════════════════════════ */
  function _renderConvosList(convos) {
    const container = el('convosList');
    if (!convos.length) {
      container.innerHTML = `<div class="chat-empty">
        <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        <strong>Sem conversas privadas</strong>
        <p>No chat da comunidade, toca em "Privado" ao lado do nome de alguém.</p>
      </div>`;
      return;
    }
    convos.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
    container.innerHTML = convos.map(c => {
      const initial = (c.otherName || '?')[0].toUpperCase();
      const unread  = _unreadMap[c.uid] || 0;
      const ts      = c.lastTs ? new Date(c.lastTs).toLocaleTimeString('pt-AO', { hour: '2-digit', minute: '2-digit' }) : '';
      const safeName = _esc(c.otherName || '?');
      const safeUid  = c.otherUid || c.uid;
      return `<div class="convo-item" onclick="ChatSystem.startPrivateWith('${safeUid}','${safeName}')">
        <div class="convo-avatar">${initial}</div>
        <div class="convo-info">
          <div class="convo-name">${safeName}</div>
          <div class="convo-preview">${_esc(c.lastMsg || '')}</div>
        </div>
        <div class="convo-meta">
          <span class="convo-time">${ts}</span>
          <span class="convo-unread ${unread > 0 ? 'show' : ''}">${unread || ''}</span>
        </div>
      </div>`;
    }).join('');
  }

  /* ═══════════════════════════════════════════════════
     UNREAD BADGES
  ═══════════════════════════════════════════════════ */
  function _clearUnreadComm() {
    _unreadComm = 0;
    _updateBadges();
  }
  function _clearUnreadPriv(uid) {
    delete _unreadMap[uid];
    _unreadPriv = Object.values(_unreadMap).reduce((a, b) => a + b, 0);
    _updateBadges();
  }
  function _incUnreadComm() {
    if (_isOpen && _tab === 'community') return;
    _unreadComm++;
    _updateBadges();
  }
  function _incUnreadPriv(uid) {
    if (_isOpen && _tab === 'private' && _privUid === uid) return;
    _unreadMap[uid] = (_unreadMap[uid] || 0) + 1;
    _unreadPriv = Object.values(_unreadMap).reduce((a, b) => a + b, 0);
    _updateBadges();
  }
  function _updateBadges() {
    const total = _unreadComm + _unreadPriv;
    // Main chat icon
    const cb = el('headerChatBadge');
    if (cb) { cb.textContent = total > 99 ? '99+' : (total || ''); cb.classList.toggle('show', total > 0); }
    // Tab badges
    const commB = el('communityTabBadge');
    if (commB) { commB.textContent = _unreadComm > 99 ? '99+' : (_unreadComm || ''); commB.classList.toggle('show', _unreadComm > 0); }
    const privB = el('privateTabBadge');
    if (privB) { privB.textContent = _unreadPriv > 99 ? '99+' : (_unreadPriv || ''); privB.classList.toggle('show', _unreadPriv > 0); }
  }

  /* ── Notif badge (upgrade dot → number) ───────────── */
  function _patchNotifBadge() {
    const orig = window.renderNotifPanel;
    if (!orig) return;
    window.renderNotifPanel = function() {
      orig.call(this);
      const count = (window._notifItems || []).length;
      const badge = el('headerNotifBadge');
      const dot   = el('headerNotifDot');
      if (!badge) return;
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.add('show');
        if (dot) dot.classList.remove('show');
      } else {
        badge.classList.remove('show');
      }
    };
    const clearBtn = el('notifPanelClear');
    if (clearBtn) {
      const origClear = clearBtn.onclick;
      clearBtn.onclick = function(e) {
        if (origClear) origClear.call(this, e);
        const badge = el('headerNotifBadge');
        if (badge) badge.classList.remove('show');
      };
    }
  }

  /* ═══════════════════════════════════════════════════
     IMAGE PREVIEW
  ═══════════════════════════════════════════════════ */
  function _previewImgEl(imgEl) {
    const url = imgEl.dataset.full || imgEl.src;
    el('imgPreviewImg').src = url;
    el('imgPreviewOverlay').classList.add('open');
  }

  /* ═══════════════════════════════════════════════════
     HELPERS
  ═══════════════════════════════════════════════════ */
  function _scrollBottom(id) {
    const e = el(id);
    if (e) setTimeout(() => { e.scrollTop = e.scrollHeight; }, 80);
  }

  function autoResize(inp) {
    inp.style.height = 'auto';
    inp.style.height = Math.min(inp.scrollHeight, 100) + 'px';
  }

  function _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ═══════════════════════════════════════════════════
     INIT
  ═══════════════════════════════════════════════════ */
  function init() {
    // Chat button
    const btn = el('headerChatBtn');
    if (btn) btn.onclick = e => { e.stopPropagation(); open(); };

    // Close overlay on background click
    el('chatOverlay').addEventListener('click', function(e) { if (e.target === this) close(); });

    // Image preview close
    el('imgPreviewOverlay').addEventListener('click', function() { this.classList.remove('open'); });

    // File inputs
    el('chatImgInput').addEventListener('change', _onImgChange);
    el('chatFileInput').addEventListener('change', _onFileChange);

    // Keyboard send (Enter = send, Shift+Enter = newline)
    ['communityInput', 'privateInput'].forEach(id => {
      const inp = el(id);
      if (!inp) return;
      const ctx = id === 'communityInput' ? 'community' : 'private';
      inp.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(ctx); }
        if (e.key === 'Escape') { cancelEdit(ctx); cancelReply(ctx); }
      });
    });

    // Attach menu close on outside click
    document.addEventListener('click', e => {
      if (!e.target.closest('.attach-menu') && !e.target.closest('.chat-attach-btn')) {
        document.querySelectorAll('.attach-menu').forEach(m => m.classList.remove('open'));
      }
    });

    // Context menu actions
    _bindCtxActions();

    // Auth listener → start badge listeners
    firebase.auth().onAuthStateChanged(user => {
      if (user) setTimeout(_startBadgeListeners, 1500);
    });

    // Patch notif badge
    setTimeout(_patchNotifBadge, 600);
  }

  /* ─── Public API ──────────────────────────────────── */
  return {
    open, close, switchTab,
    sendText, toggleAttach, pickImage, pickFile,
    setReply, cancelReply,
    startEdit, cancelEdit,
    startPrivateWith, backToConvoList,
    _onMentionTap,
    _previewImgEl,
    autoResize,
    init
  };
})();

/* ── Boot ──────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ChatSystem.init());
} else {
  ChatSystem.init();
}
