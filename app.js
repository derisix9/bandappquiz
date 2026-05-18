/* ══════════════════════════════════════════════════════════
   BANDAQUIZ — app.js
   Lógica completa: Firebase Auth + RTDB, Quiz, Timer, Ranking
   ══════════════════════════════════════════════════════════ */

'use strict';

// ─── FIREBASE CONFIG ──────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDnKcx2hgTJIQEDeEo2FXTZASiiGHKJ1ws",
  authDomain: "bandaquiz-f669f.firebaseapp.com",
  databaseURL: "https://bandaquiz-f669f-default-rtdb.firebaseio.com",
  projectId: "bandaquiz-f669f",
  storageBucket: "bandaquiz-f669f.firebasestorage.app",
  messagingSenderId: "274332121291",
  appId: "1:274332121291:web:702ce3eded841b668b034e",
  measurementId: "G-J0VEQ18776"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.database();

// ─── UTIL: SHA-256 hash para senha de telefone (guardada no RTDB) ──
async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// Normaliza número de telefone
function normalizePhone(p) {
  return p.replace(/[\s\-\(\)]/g, '');
}

// Converte telefone para chave RTDB segura (sem +, /, etc.)
function phoneToKey(p) {
  return normalizePhone(p).replace(/\+/g, '00').replace(/[^0-9]/g, '');
}

// ─── APP STATE ────────────────────────────────────────────
const State = {
  user:         null,
  profile:      null,
  currentMode:  null,   // 'aprendizado' | 'concurso' | 'prova'
  currentDisc:  'all',
  timerSecs:    0,      // 0 = livre
  questions:    [],     // perguntas da rodada (50)
  qIndex:       0,
  score:        0,
  correct:      0,
  wrong:        0,
  answered:     false,
  timerInterval:null,
  timerLeft:    0,
  usedTodayIds: [],     // IDs usados hoje (anti-repetição)
  localDB:      [],     // perguntas offline (localStorage)
  rankingList:  [],
  confirmCallback: null,
  phoneUser: null,        // dados do utilizador de telefone (RTDB)
};

// ─── PAÍSES (completo) ────────────────────────────────────
const COUNTRIES = [
  "Afeganistão","África do Sul","Albânia","Alemanha","Andorra","Angola","Antígua e Barbuda","Arábia Saudita",
  "Argélia","Argentina","Arménia","Austrália","Áustria","Azerbaijão","Bahamas","Bangladesh","Barbados",
  "Barém","Bélgica","Belize","Benim","Bielorrússia","Birmânia","Bolívia","Bósnia e Herzegovina",
  "Botswana","Brasil","Brunei","Bulgária","Burquina Faso","Burúndi","Butão","Cabo Verde","Camarões",
  "Cambodja","Canadá","Catar","Cazaquistão","Chade","Chile","China","Chipre","Colômbia","Comores",
  "Congo","Coreia do Norte","Coreia do Sul","Costa do Marfim","Costa Rica","Croácia","Cuba","Dinamarca",
  "Djibuti","Dominica","Egipto","El Salvador","Emirados Árabes Unidos","Equador","Eritreia","Eslováquia",
  "Eslovénia","Espanha","Estados Unidos","Estónia","Etiópia","Fiji","Filipinas","Finlândia","França",
  "Gabão","Gâmbia","Gana","Geórgia","Granada","Grécia","Guatemala","Guiné","Guiné Equatorial",
  "Guiné-Bissau","Guiana","Haiti","Honduras","Hungria","Iémen","Ilhas Marshall","Ilhas Salomão",
  "Índia","Indonésia","Irão","Iraque","Irlanda","Islândia","Israel","Itália","Jamaica","Japão",
  "Jordânia","Kosovo","Kuwait","Laos","Lesoto","Letónia","Líbano","Libéria","Líbia","Listenstaine",
  "Lituânia","Luxemburgo","Macedónia do Norte","Madagáscar","Malásia","Malawi","Maldivas","Mali",
  "Malta","Marrocos","Maurícia","Mauritânia","México","Micronésia","Moçambique","Mónaco","Mongólia",
  "Montenegro","Namíbia","Nauru","Nepal","Nicarágua","Níger","Nigéria","Noruega","Nova Zelândia",
  "Omã","Países Baixos","Palau","Palestina","Panamá","Papua Nova Guiné","Paquistão","Paraguai","Peru",
  "Polónia","Portugal","Quénia","Quirguistão","República Centro-Africana","República Checa",
  "República Democrática do Congo","República Dominicana","Roménia","Ruanda","Rússia","Samoa",
  "San Marino","Santa Lúcia","São Cristóvão e Nevis","São Marino","São Tomé e Príncipe",
  "São Vicente e Granadinas","Senegal","Serra Leoa","Sérvia","Seicheles","Singapura","Síria",
  "Somália","Sri Lanka","Sudão","Sudão do Sul","Suécia","Suíça","Suriname","Svalbard","Suazilândia",
  "Tailândia","Taiwan","Tajiquistão","Tanzânia","Timor-Leste","Togo","Tonga","Trindade e Tobago",
  "Tunísia","Turquemenistão","Turquia","Tuvalu","Ucrânia","Uganda","Uruguai","Uzbequistão",
  "Vanuatu","Vaticano","Venezuela","Vietname","Zâmbia","Zimbábue"
];

const ANGOLA_PROVINCES = [
  "Bengo","Benguela","Bié","Cabinda","Cuando Cubango","Cuanza Norte",
  "Cuanza Sul","Cunene","Huambo","Huíla","Luanda","Lunda Norte",
  "Lunda Sul","Malanje","Moxico","Namibe","Uíge","Zaire",
  "Cuando","Cassai Norte","Cassai Sul"
];

// ─── UTIL HELPERS ─────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = $(id);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function showToast(msg, duration = 2800) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), duration);
}

function showLoading(text = 'A carregar...') {
  $('loadingText').textContent = text;
  $('loadingOverlay').classList.add('show');
}

function hideLoading() {
  $('loadingOverlay').classList.remove('show');
}

function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleDateString('pt-AO', { day:'2-digit', month:'2-digit', year:'numeric' }) +
    ' ' + d.toLocaleTimeString('pt-AO', { hour:'2-digit', minute:'2-digit' });
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function starsFromScore(correct) {
  return Math.floor(correct / 10); // 10 acertos = 1 estrela, max 5
}

// ─── MODAL ────────────────────────────────────────────────
function showModal({ icon = '', title, msg, btns = [] }) {
  const iconEl = $('modalIcon');
  iconEl.innerHTML = icon;
  $('modalTitle').textContent = title;
  $('modalMsg').textContent = msg;
  const actionsEl = $('modalActions');
  actionsEl.innerHTML = '';
  btns.forEach(b => {
    const btn = document.createElement('button');
    btn.className = b.cls || 'btn-primary';
    btn.textContent = b.label;
    btn.onclick = () => {
      $('modalOverlay').classList.remove('show');
      if (b.action) b.action();
    };
    actionsEl.appendChild(btn);
  });
  $('modalOverlay').classList.add('show');
}

function closeModal() {
  $('modalOverlay').classList.remove('show');
}

// ─── LOCAL STORAGE ────────────────────────────────────────
const LS = {
  get(k)    { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k)    { localStorage.removeItem(k); }
};

function loadLocalDB() {
  State.localDB = LS.get('eq_questions') || [];
}

function saveLocalDB(qs) {
  LS.set('eq_questions', qs);
  State.localDB = qs;
}

function loadUsedToday() {
  const key = 'eq_used_' + todayKey();
  State.usedTodayIds = LS.get(key) || [];
}

function saveUsedToday() {
  const key = 'eq_used_' + todayKey();
  LS.set(key, State.usedTodayIds);
}

function loadRankingLocal() {
  State.rankingList = LS.get('eq_ranking') || [];
}

function saveRankingLocal() {
  LS.set('eq_ranking', State.rankingList);
}

// ─── POPULATE COUNTRIES ───────────────────────────────────
function populateCountries() {
  const sel = $('profileCountry');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecionar país...</option>';
  COUNTRIES.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    sel.appendChild(o);
  });
}

// ─── FIREBASE AUTH ────────────────────────────────────────
auth.onAuthStateChanged(user => {
  if (user) {
    State.user = user;
    loadUserProfile(user.uid);
  } else {
    State.user = null;
    State.profile = null;
    showScreen('screen-login');
  }
});

async function loadUserProfile(uid) {
  showLoading('A carregar perfil...');
  try {
    const snap = await db.ref('users/' + uid).once('value');
    const data = snap.val();
    if (data && data.firstName) {
      State.profile = data;
      updateMenuUI();
      updateProfileUI();
      checkCloudUpdates();
      showScreen('screen-mainmenu');
    } else {
      showScreen('screen-profile-setup');
    }
  } catch (e) {
    showToast('Erro ao carregar perfil. Verifique a conexão.');
    showScreen('screen-login');
  } finally {
    hideLoading();
  }
}

function updateMenuUI() {
  const p = State.profile;
  if (!p) return;
  $('menuUserName').textContent = p.firstName || 'Estudante';
  const av = $('menuAvatarSmall');
  if (p.photoURL) {
    av.innerHTML = `<img src="${p.photoURL}" alt="avatar">`;
  } else {
    av.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
  }
}

function updateProfileUI() {
  const p = State.profile;
  if (!p) return;
  $('profileNameDisplay').textContent = (p.firstName || '') + ' ' + (p.lastName || '');
  $('profileEmailDisplay').textContent = State.user?.email || p.phone || '—';
  const avLg = $('profileAvatarLg');
  if (p.photoURL) {
    avLg.innerHTML = `<img src="${p.photoURL}" alt="avatar">`;
  }
  // Stats
  const stats = LS.get('eq_stats_' + State.user.uid) || { games: 0, best: 0, stars: 0 };
  $('statGames').textContent = stats.games;
  $('statBest').textContent  = stats.best;
  $('statStars').textContent = stats.stars;
}

// ─── AUTH: LOGIN EMAIL + SENHA ────────────────────────────
$('loginBtn').onclick = async () => {
  const email = $('loginEmail').value.trim();
  const pass  = $('loginPass').value;
  if (!email || !pass) return showToast('Preencha email e senha.');
  showLoading('A entrar...');
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (e) {
    hideLoading();
    showToast(authError(e.code));
  }
};

// ─── AUTH: LOGIN TELEFONE + SENHA (via RTDB, sem SMS) ─────
$('phoneLoginBtn').onclick = () => {
  $('phoneModal').classList.add('show');
};

$('closePhoneModal').onclick = () => {
  $('phoneModal').classList.remove('show');
  $('phoneLoginInput').value = '';
  $('phoneLoginPass').value  = '';
};

$('phoneLoginSubmitBtn').onclick = async () => {
  const phone = $('phoneLoginInput').value.trim();
  const pass  = $('phoneLoginPass').value;
  if (!phone || !pass) return showToast('Preencha o telefone e a senha.');
  if (pass.length < 6) return showToast('Senha deve ter mínimo 6 caracteres.');
  showLoading('A verificar credenciais...');
  $('phoneModal').classList.remove('show');
  try {
    const key    = phoneToKey(phone);
    const snap   = await db.ref('phoneUsers/' + key).once('value');
    const record = snap.val();

    if (!record) {
      // Número não registado — criar nova conta com login anónimo
      const hash = await sha256(pass);
      const anonResult = await auth.signInAnonymously();
      const uid = anonResult.user.uid;
      const newRecord = {
        uid,
        phone: normalizePhone(phone),
        passwordHash: hash,
        createdAt: Date.now()
      };
      await db.ref('phoneUsers/' + key).set(newRecord);
      // Guardar uid reverso para lookup futuro
      await db.ref('phoneUidMap/' + uid).set(key);
      hideLoading();
      showToast('Conta criada! Complete o seu perfil.');
      showScreen('screen-profile-setup');
      return;
    }

    // Número existe — verificar senha
    const hash = await sha256(pass);
    if (hash !== record.passwordHash) {
      hideLoading();
      return showToast('Senha incorrecta. Tente novamente.');
    }

    // Login com anonimo e carregar perfil do RTDB
    const anonResult = await auth.signInAnonymously();
    const uid = anonResult.user.uid;

    // Verificar se o uid corresponde ao registado
    if (record.uid && record.uid !== uid) {
      // Utilizador já tem uid — actualizar sessão carregando o perfil pelo phoneKey
      await db.ref('users/' + uid).set({
        ...(await db.ref('users/' + record.uid).once('value')).val(),
        loginMethod: 'phone',
        phoneKey: key
      });
    }
    hideLoading();
    // onAuthStateChanged vai carregar o perfil normalmente

  } catch (e) {
    hideLoading();
    showToast('Erro ao entrar: ' + e.message);
  }
};

// ─── AUTH: REGISTO POR EMAIL + SENHA ─────────────────────
$('registerEmailBtn').onclick = async () => {
  const email = $('regEmail').value.trim();
  const pass  = $('regPass').value;
  if (!email || !pass) return showToast('Preencha email e senha.');
  if (pass.length < 6) return showToast('Senha deve ter mínimo 6 caracteres.');
  showLoading('A criar conta...');
  try {
    await auth.createUserWithEmailAndPassword(email, pass);
    hideLoading();
    showScreen('screen-profile-setup');
  } catch (e) {
    hideLoading();
    showToast(authError(e.code));
  }
};

// ─── AUTH: REGISTO POR TELEFONE + SENHA (via RTDB) ────────
$('registerPhoneBtn').onclick = () => {
  $('phoneRegModal').classList.add('show');
};

$('closePhoneRegModal').onclick = () => {
  $('phoneRegModal').classList.remove('show');
  $('regPhoneInput').value = '';
  $('regPhonePass').value  = '';
  $('regPhonePass2').value = '';
};

$('phoneRegSubmitBtn').onclick = async () => {
  const phone = $('regPhoneInput').value.trim();
  const pass  = $('regPhonePass').value;
  const pass2 = $('regPhonePass2').value;
  if (!phone || !pass || !pass2) return showToast('Preencha todos os campos.');
  if (pass.length < 6) return showToast('Senha deve ter mínimo 6 caracteres.');
  if (pass !== pass2) return showToast('As senhas não coincidem.');
  showLoading('A criar conta...');
  $('phoneRegModal').classList.remove('show');
  try {
    const key  = phoneToKey(phone);
    const snap = await db.ref('phoneUsers/' + key).once('value');
    if (snap.exists()) {
      hideLoading();
      return showToast('Este número já tem conta. Use "Entrar" com Telefone + Senha.');
    }
    const hash       = await sha256(pass);
    const anonResult = await auth.signInAnonymously();
    const uid        = anonResult.user.uid;
    await db.ref('phoneUsers/' + key).set({ uid, phone: normalizePhone(phone), passwordHash: hash, createdAt: Date.now() });
    await db.ref('phoneUidMap/' + uid).set(key);
    hideLoading();
    showToast('Conta criada! Complete o seu perfil.');
    showScreen('screen-profile-setup');
  } catch (e) {
    hideLoading();
    showToast('Erro ao criar conta: ' + e.message);
  }
};

// ─── AUTH: GOOGLE — usa redirect para compatibilidade total ─
// signInWithRedirect funciona em file://, http, https, webview, etc.
async function googleSignIn() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    // Tenta popup primeiro; se falhar (file:// ou bloqueado), usa redirect
    await auth.signInWithPopup(provider);
  } catch (e) {
    if (
      e.code === 'auth/operation-not-supported-in-this-environment' ||
      e.code === 'auth/unauthorized-domain' ||
      e.message.includes('location.protocol')
    ) {
      // Fallback para redirect (funciona em qualquer ambiente)
      try {
        await auth.signInWithRedirect(provider);
      } catch (e2) {
        hideLoading();
        showToast('Erro Google: ' + e2.message);
      }
    } else if (e.code !== 'auth/popup-closed-by-user') {
      hideLoading();
      showToast('Erro ao entrar com Google: ' + e.message);
    } else {
      hideLoading();
    }
  }
}

// Verificar resultado de redirect ao carregar a página
auth.getRedirectResult().then(result => {
  if (result && result.user) {
    hideLoading();
  }
}).catch(e => {
  if (e.code && e.code !== 'auth/no-auth-event') {
    showToast('Erro Google: ' + e.message);
  }
});

$('googleLoginBtn').onclick = () => { showLoading('A conectar com Google...'); googleSignIn(); };
$('googleRegBtn').onclick   = () => { showLoading('A conectar com Google...'); googleSignIn(); }

function authError(code) {
  const map = {
    'auth/user-not-found':      'Utilizador não encontrado.',
    'auth/wrong-password':      'Senha incorrecta.',
    'auth/email-already-in-use':'Email já em uso.',
    'auth/invalid-email':       'Email inválido.',
    'auth/weak-password':       'Senha fraca. Use mínimo 6 caracteres.',
    'auth/network-request-failed':'Sem conexão à internet.',
    'auth/too-many-requests':   'Muitas tentativas. Tente mais tarde.',
  };
  return map[code] || 'Erro de autenticação. Tente novamente.';
}

// ─── AUTH TABS ────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
    tab.classList.add('active');
    $('form-' + tab.dataset.tab).classList.add('active');
  };
});

// ─── LOGOUT ───────────────────────────────────────────────
$('logoutBtn').onclick = () => {
  showModal({
    icon: '<svg viewBox="0 0 24 24"><path d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>',
    title: 'Terminar Sessão',
    msg: 'Tem a certeza que quer sair da sua conta?',
    btns: [
      { label: 'CANCELAR', cls: 'btn-outline' },
      { label: 'SAIR', cls: 'btn-danger', action: () => auth.signOut() }
    ]
  });
};

// ─── PROFILE SETUP ────────────────────────────────────────
populateCountries();

$('profileCountry').onchange = () => {
  const val = $('profileCountry').value;
  $('provinceWrap').style.display = val === 'Angola' ? 'block' : 'none';
};

// Avatar upload
$('avatarUploadArea').onclick = () => $('avatarInput').click();
$('avatarInput').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const prev = $('avatarPreview');
    prev.innerHTML = `<img src="${ev.target.result}" alt="avatar">`;
    State._avatarDataURL = ev.target.result;
  };
  reader.readAsDataURL(file);
};

$('saveProfileBtn').onclick = async () => {
  const first   = $('profileFirstName').value.trim();
  const last    = $('profileLastName').value.trim();
  const birth   = $('profileBirthdate').value;
  const gender  = $('profileGender').value;
  const country = $('profileCountry').value;
  const province= $('profileProvince').value;

  if (!first || !last || !birth || !gender || !country) {
    return showToast('Por favor, preencha todos os campos obrigatórios.');
  }
  if (country === 'Angola' && !province) {
    return showToast('Por favor, selecione a sua província.');
  }

  showLoading('A guardar perfil...');
  const uid = State.user.uid;
  const profileData = {
    firstName: first,
    lastName: last,
    birthdate: birth,
    gender,
    country,
    province: country === 'Angola' ? province : '',
    photoURL: State._avatarDataURL || '',
    email: State.user.email || '',
    phone: State.user.phoneNumber || '',
    createdAt: Date.now()
  };
  try {
    await db.ref('users/' + uid).set(profileData);
    // Se for utilizador de telefone, actualizar o registo em phoneUsers com o uid correcto
    const phoneMapSnap = await db.ref('phoneUidMap/' + uid).once('value');
    const phoneKey = phoneMapSnap.val();
    if (phoneKey) {
      await db.ref('phoneUsers/' + phoneKey + '/uid').set(uid);
      await db.ref('phoneUsers/' + phoneKey + '/profileSet').set(true);
    }
    State.profile = profileData;
    updateMenuUI();
    updateProfileUI();
    hideLoading();
    showToast('Perfil guardado com sucesso!');
    showScreen('screen-mainmenu');
  } catch (e) {
    hideLoading();
    showToast('Erro ao guardar perfil. Verifique a conexão.');
  }
};

$('profileSetupBack').onclick = () => showScreen('screen-login');

// ─── PROFILE SCREEN ───────────────────────────────────────
$('profileMenuBtn').onclick = () => {
  updateProfileUI();
  showScreen('screen-profile');
};
$('profileBackBtn').onclick = () => showScreen('screen-mainmenu');

$('editProfileBtn').onclick = () => {
  // Pré-preencher o formulário com dados actuais
  const p = State.profile;
  if (p) {
    $('profileFirstName').value = p.firstName || '';
    $('profileLastName').value  = p.lastName  || '';
    $('profileBirthdate').value = p.birthdate || '';
    $('profileGender').value    = p.gender    || '';
    $('profileCountry').value   = p.country   || '';
    if (p.country === 'Angola') {
      $('provinceWrap').style.display = 'block';
      $('profileProvince').value = p.province || '';
    }
    if (p.photoURL) {
      $('avatarPreview').innerHTML = `<img src="${p.photoURL}" alt="avatar">`;
      State._avatarDataURL = p.photoURL;
    }
  }
  showScreen('screen-profile-setup');
};

$('deleteAccountBtn').onclick = () => {
  showModal({
    icon: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    title: 'Eliminar Conta',
    msg: 'Esta acção é irreversível. Todos os seus dados serão apagados permanentemente.',
    btns: [
      { label: 'CANCELAR', cls: 'btn-outline' },
      { label: 'ELIMINAR', cls: 'btn-danger', action: async () => {
        showLoading('A eliminar conta...');
        try {
          const uid = State.user.uid;
          await db.ref('users/' + uid).remove();
          await State.user.delete();
        } catch (e) {
          hideLoading();
          showToast('Erro: Faça login novamente e tente outra vez.');
        }
      }}
    ]
  });
};

// ─── MAIN MENU NAVIGATION ────────────────────────────────
$('btnJogar').onclick   = () => showScreen('screen-modeselect');
$('btnRanking').onclick = () => { loadRankingScreen('all'); showScreen('screen-ranking'); };
$('btnCriar').onclick   = () => { loadLocalDB(); updateCreateCounter(); showScreen('screen-create'); };
$('btnSync').onclick    = () => { loadSyncScreen(); showScreen('screen-sync'); };

// ─── SPLASH ───────────────────────────────────────────────
$('splashEnterBtn').onclick = () => {
  if (State.user) {
    showScreen('screen-mainmenu');
  } else {
    showScreen('screen-login');
  }
};

// Criar partículas no splash
(function createParticles() {
  const container = $('splashParticles');
  if (!container) return;
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('div');
    p.className = 'splash-particle';
    p.style.left  = Math.random() * 100 + '%';
    p.style.animationDuration = (4 + Math.random() * 8) + 's';
    p.style.animationDelay    = (Math.random() * 6) + 's';
    p.style.width = p.style.height = (2 + Math.random() * 3) + 'px';
    container.appendChild(p);
  }
})();

// ─── MODE SELECTION ───────────────────────────────────────
$('modeBackBtn').onclick = () => showScreen('screen-mainmenu');

document.querySelectorAll('.mode-card').forEach(card => {
  card.onclick = () => {
    State.currentMode = card.dataset.mode;
    // Actualizar badge e título no setup
    const modeNames = { aprendizado: 'Aprendizado', concurso: 'Concurso Público', prova: 'Prova Escolar' };
    $('setupModeBadge').textContent = modeNames[State.currentMode] || State.currentMode;
    $('setupTitle').textContent = 'Configurar: ' + (modeNames[State.currentMode] || '');

    // No modo "aprendizado", timer padrão = Livre
    // No modo "concurso", timer padrão = 30s
    // No modo "prova", timer padrão = 1min
    const defaults = { aprendizado: 0, concurso: 30, prova: 60 };
    setTimerDefault(defaults[State.currentMode] || 0);

    showScreen('screen-gamesetup');
  };
});

function setTimerDefault(secs) {
  document.querySelectorAll('.timer-opt').forEach(opt => {
    opt.classList.toggle('active', parseInt(opt.dataset.seconds) === secs);
  });
  State.timerSecs = secs;
}

// ─── GAME SETUP ───────────────────────────────────────────
$('setupBackBtn').onclick = () => showScreen('screen-modeselect');

document.querySelectorAll('.timer-opt').forEach(opt => {
  opt.onclick = () => {
    document.querySelectorAll('.timer-opt').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    State.timerSecs = parseInt(opt.dataset.seconds);
  };
});

$('startGameBtn').onclick = () => {
  State.currentDisc = $('setupDisc').value;
  loadLocalDB();
  loadUsedToday();
  startGame();
};

// ─── GAME LOGIC ───────────────────────────────────────────
function startGame() {
  let pool = [...State.localDB];
  if (State.currentDisc !== 'all') {
    pool = pool.filter(q => q.disc === State.currentDisc);
  }

  if (pool.length < 10) {
    showToast('Poucas perguntas disponíveis. Sincronize a base de dados primeiro.');
    return;
  }

  // Filtrar as usadas hoje (se pool > 50)
  let available = pool.filter(q => !State.usedTodayIds.includes(q.id));
  if (available.length < 10) {
    // Resetar o registo do dia se ficaram poucas
    State.usedTodayIds = [];
    saveUsedToday();
    available = [...pool];
  }

  // Embaralhar e pegar 50 (ou todas se < 50)
  const shuffled = shuffle(available);
  State.questions = shuffled.slice(0, Math.min(50, shuffled.length));

  // Marcar como usadas
  State.questions.forEach(q => {
    if (!State.usedTodayIds.includes(q.id)) State.usedTodayIds.push(q.id);
  });
  saveUsedToday();

  // Resetar estado do jogo
  State.qIndex  = 0;
  State.score   = 0;
  State.correct = 0;
  State.wrong   = 0;

  const modeNames = { aprendizado: 'Aprendizado', concurso: 'Concurso Público', prova: 'Prova Escolar' };
  $('gameModeLabel').textContent = modeNames[State.currentMode] || State.currentMode;

  showScreen('screen-game');
  renderQuestion();
}

function renderQuestion() {
  const q = State.questions[State.qIndex];
  if (!q) { endGame(); return; }

  State.answered = false;

  // Barra de progresso
  const pct = ((State.qIndex) / State.questions.length) * 100;
  $('gameProgressFill').style.width = Math.max(2, pct) + '%';
  $('gameProgressLabel').textContent = (State.qIndex + 1) + ' / ' + State.questions.length;
  $('gameScoreBadge').textContent    = State.score;
  $('questionNum').textContent       = 'Questão ' + (State.qIndex + 1);
  $('questionText').textContent      = q.question;

  // Estrelas na barra do jogo
  renderGameStars();

  // Opções
  const opts   = ['A','B','C','D'];
  const texts  = [q.a, q.b, q.c, q.d];
  const optWrap = $('gameOptions');
  optWrap.innerHTML = '';

  opts.forEach((letter, i) => {
    if (!texts[i]) return;
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = `
      <div class="option-badge">${letter}</div>
      <span class="option-text">${texts[i]}</span>
      <svg class="option-icon correct-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
      <svg class="option-icon wrong-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
    `;
    btn.onclick = () => handleAnswer(letter, btn);
    optWrap.appendChild(btn);
  });

  // Timer
  if (State.timerSecs > 0) {
    $('gameTimerWrap').style.display  = 'flex';
    $('timerRingWrap').style.display  = 'flex';
    $('nextBtn').disabled = (State.currentMode !== 'aprendizado');
    startTimer(State.timerSecs);
  } else {
    $('gameTimerWrap').style.display = 'none';
    $('timerRingWrap').style.display = 'none';
    $('nextBtn').disabled = true; // Em modo livre, só habilita após responder
    $('nextBtnText').textContent = 'PRÓXIMA';
  }

  // Modo "Livre": o PRÓXIMA aparece após resposta. No timer: aparece automaticamente.
}

function handleAnswer(letter, clickedBtn) {
  if (State.answered) return;
  State.answered = true;

  stopTimer();

  const q = State.questions[State.qIndex];
  const correct = q.answer; // 'A','B','C','D'
  const isRight = letter === correct;

  // Desabilitar todos os botões
  $('gameOptions').querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    const badge = btn.querySelector('.option-badge').textContent;
    if (badge === correct) {
      btn.classList.add('correct');
    } else if (badge === letter && !isRight) {
      btn.classList.add('wrong');
    }
  });

  if (isRight) {
    State.correct++;
    State.score += getPointsForMode();
    $('gameScoreBadge').textContent = State.score;
    renderGameStars();
  } else {
    State.wrong++;
  }

  // Habilitar PRÓXIMA
  $('nextBtn').disabled = false;
  $('nextBtnText').textContent = State.qIndex + 1 >= State.questions.length ? 'VER RESULTADO' : 'PRÓXIMA';

  // Se tem timer: avança automaticamente após mostrar a resposta por 1.5s
  if (State.timerSecs > 0) {
    setTimeout(() => {
      if (State.answered) advanceQuestion();
    }, 1600);
  }
}

function getPointsForMode() {
  const pts = { aprendizado: 10, concurso: 20, prova: 15 };
  return pts[State.currentMode] || 10;
}

function renderGameStars() {
  const stars = starsFromScore(State.correct);
  const maxStars = 5;
  let html = '';
  for (let i = 0; i < maxStars; i++) {
    const filled = i < stars;
    html += `<svg class="star-icon ${filled ? 'filled' : 'empty'}" viewBox="0 0 24 24">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
    </svg>`;
  }
  $('gameStarsDisplay').innerHTML = html;
}

// ─── TIMER ────────────────────────────────────────────────
function startTimer(secs) {
  State.timerLeft = secs;
  const circle = $('timerRingCircle');
  const numEl  = $('timerRingNum');
  const total  = 2 * Math.PI * 23; // r=23

  $('gameTimerDisplay').textContent = secs + 's';

  function tick() {
    const pct = State.timerLeft / secs;
    circle.style.strokeDashoffset = total * (1 - pct);

    numEl.textContent = State.timerLeft;
    $('gameTimerDisplay').textContent = State.timerLeft + 's';

    if (State.timerLeft <= 5) {
      circle.classList.add('danger');
      numEl.classList.add('danger');
    } else {
      circle.classList.remove('danger');
      numEl.classList.remove('danger');
    }

    if (State.timerLeft <= 0) {
      stopTimer();
      if (!State.answered) {
        // Tempo esgotado — mostrar resposta certa e avançar
        timeUp();
      }
      return;
    }
    State.timerLeft--;
  }

  tick();
  State.timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  if (State.timerInterval) {
    clearInterval(State.timerInterval);
    State.timerInterval = null;
  }
}

function timeUp() {
  State.answered = true;
  State.wrong++;
  const q = State.questions[State.qIndex];

  $('gameOptions').querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    if (btn.querySelector('.option-badge').textContent === q.answer) {
      btn.classList.add('correct');
    }
  });

  showToast('Tempo esgotado! A resposta correcta era ' + q.answer + '.');

  setTimeout(() => advanceQuestion(), 2000);
}

function advanceQuestion() {
  stopTimer();
  State.qIndex++;
  if (State.qIndex >= State.questions.length) {
    endGame();
  } else {
    renderQuestion();
  }
}

$('nextBtn').onclick = () => {
  if (!State.answered && State.timerSecs === 0) {
    // Em modo livre: deve responder antes de avançar
    showToast('Escolha uma resposta primeiro.');
    return;
  }
  advanceQuestion();
};

// ─── EXIT GAME ────────────────────────────────────────────
$('gameExitBtn').onclick = () => {
  showModal({
    icon: '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>',
    title: 'Abandonar Jogo',
    msg: 'Quer mesmo sair? O progresso desta rodada será perdido.',
    btns: [
      { label: 'CONTINUAR', cls: 'btn-primary' },
      { label: 'SAIR', cls: 'btn-danger', action: () => { stopTimer(); showScreen('screen-mainmenu'); } }
    ]
  });
};

// ─── END GAME / RESULT ────────────────────────────────────
function endGame() {
  stopTimer();
  const totalQ  = State.questions.length;
  const stars   = starsFromScore(State.correct);
  const pct     = totalQ > 0 ? Math.round((State.correct / totalQ) * 100) : 0;

  // Guardar no ranking
  saveResult(stars, pct);

  // Renderizar ecrã de resultado
  $('resultScore').textContent         = State.score;
  $('resultCorrect').textContent       = State.correct;
  $('resultWrong').textContent         = State.wrong;
  $('resultTotal').textContent         = totalQ;
  $('resultClassification').textContent = getClassification(pct, State.currentMode);

  // Estrelas (0 se nenhum acerto)
  const starsRow = $('resultStarsRow');
  starsRow.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const div = document.createElement('div');
    div.className = 'result-star ' + (i < stars ? 'earned' : 'empty');
    div.style.animationDelay = (i * 0.12) + 's';
    div.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
    starsRow.appendChild(div);
  }

  // Ícone de resultado
  const iconWrap = $('resultIconWrap');
  if (pct >= 60) {
    iconWrap.innerHTML = `<svg class="result-icon" viewBox="0 0 80 80">
      <defs><linearGradient id="rg1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#FFD700"/><stop offset="100%" style="stop-color:#FF8C00"/>
      </linearGradient></defs>
      <circle cx="40" cy="40" r="38" fill="rgba(255,215,0,0.15)" stroke="url(#rg1)" stroke-width="2"/>
      <path d="M25 40l10 10 20-20" stroke="url(#rg1)" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
  } else {
    iconWrap.innerHTML = `<svg class="result-icon" viewBox="0 0 80 80">
      <defs><linearGradient id="rg2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:#EF4444"/><stop offset="100%" style="stop-color:#DC2626"/>
      </linearGradient></defs>
      <circle cx="40" cy="40" r="38" fill="rgba(239,68,68,0.1)" stroke="url(#rg2)" stroke-width="2"/>
      <path d="M28 28l24 24M52 28L28 52" stroke="url(#rg2)" stroke-width="4" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  showScreen('screen-result');
}

function getClassification(pct, mode) {
  if (mode === 'prova') {
    if (pct >= 90) return 'EXCELENTE — 20 VALORES';
    if (pct >= 80) return 'MUITO BOM — 16 VALORES';
    if (pct >= 70) return 'BOM — 14 VALORES';
    if (pct >= 60) return 'SUFICIENTE — 12 VALORES';
    if (pct >= 50) return 'SUFICIENTE — 10 VALORES';
    return 'NEGATIVA — REPROVADO';
  }
  if (mode === 'concurso') {
    if (pct >= 90) return 'APROVADO — EXCELENTE';
    if (pct >= 70) return 'APROVADO — BOM DESEMPENHO';
    if (pct >= 50) return 'APROVADO — LIMITE';
    return 'REPROVADO';
  }
  // Aprendizado
  if (pct >= 90) return 'MESTRE';
  if (pct >= 70) return 'AVANÇADO';
  if (pct >= 50) return 'INTERMÉDIO';
  if (pct >= 30) return 'INICIANTE';
  return 'A COMEÇAR';
}

$('resultPlayAgain').onclick = () => {
  loadLocalDB();
  loadUsedToday();
  startGame();
};
$('resultMenu').onclick = () => showScreen('screen-mainmenu');

// ─── SAVE RESULT & RANKING ────────────────────────────────
function saveResult(stars, pct) {
  const uid  = State.user?.uid || 'anon';
  const name = State.profile ? (State.profile.firstName + ' ' + State.profile.lastName) : 'Anónimo';

  const entry = {
    id:        uid + '_' + Date.now(),
    uid:       uid,
    name:      name,
    mode:      State.currentMode,
    score:     State.score,
    correct:   State.correct,
    wrong:     State.wrong,
    total:     State.questions.length,
    stars:     stars,
    pct:       pct,
    timestamp: Date.now(),
    date:      new Date().toLocaleDateString('pt-AO', { day:'2-digit', month:'2-digit', year:'numeric' }),
    time:      new Date().toLocaleTimeString('pt-AO', { hour:'2-digit', minute:'2-digit' })
  };

  // Guardar local
  loadRankingLocal();
  State.rankingList.unshift(entry);
  if (State.rankingList.length > 200) State.rankingList = State.rankingList.slice(0, 200);
  saveRankingLocal();

  // Guardar Firebase (se online)
  if (navigator.onLine && uid !== 'anon') {
    db.ref('ranking/' + entry.id).set(entry).catch(() => {});
    // Actualizar stats do utilizador
    const statsRef = db.ref('users/' + uid + '/stats');
    statsRef.transaction(stats => {
      if (!stats) stats = { games: 0, best: 0, stars: 0 };
      stats.games++;
      if (State.score > (stats.best || 0)) stats.best = State.score;
      stats.stars = (stats.stars || 0) + stars;
      return stats;
    });
  }

  // Actualizar stats locais
  const statsKey = 'eq_stats_' + uid;
  const ls = LS.get(statsKey) || { games: 0, best: 0, stars: 0 };
  ls.games++;
  if (State.score > ls.best) ls.best = State.score;
  ls.stars += stars;
  LS.set(statsKey, ls);
}

// ─── RANKING SCREEN ───────────────────────────────────────
$('rankingBackBtn').onclick = () => showScreen('screen-mainmenu');

document.querySelectorAll('.rank-filter').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.rank-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadRankingScreen(btn.dataset.filter);
  };
});

$('clearRankingBtn').onclick = () => {
  showModal({
    icon: '<svg viewBox="0 0 24 24"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>',
    title: 'Limpar Ranking',
    msg: 'Apagar todos os registos locais de pontuação?',
    btns: [
      { label: 'CANCELAR', cls: 'btn-outline' },
      { label: 'LIMPAR', cls: 'btn-danger', action: () => {
        LS.del('eq_ranking');
        State.rankingList = [];
        loadRankingScreen('all');
        showToast('Ranking limpo!');
      }}
    ]
  });
};

function loadRankingScreen(filter) {
  loadRankingLocal();
  let list = [...State.rankingList];
  if (filter && filter !== 'all') {
    list = list.filter(r => r.mode === filter);
  }
  // Ordenar por pontuação decrescente
  list.sort((a, b) => b.score - a.score);

  const container = $('rankingList');
  if (list.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24"><path d="M7 4v2H3v4h4v2H3v4h4v2H1V2h6v2zm10 0V2h6v18h-6v-2h4v-4h-4v-2h4V8h-4V6h4V4h-4zm-2-2H9v20h6V2zm-2 9c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/></svg>
        <p>Ainda não há registos.<br>Jogue e apareça aqui!</p>
      </div>`;
    return;
  }

  container.innerHTML = '';
  list.slice(0, 50).forEach((r, idx) => {
    const pos     = idx + 1;
    const posClass= pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : '';
    const modeTag = { aprendizado: 'Aprend.', concurso: 'Concurso', prova: 'Prova' }[r.mode] || r.mode;

    let starsHtml = '';
    for (let i = 0; i < 5; i++) {
      starsHtml += `<svg class="${i < r.stars ? 'f' : 'e'}" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
    }

    const div = document.createElement('div');
    div.className = 'ranking-item';
    div.innerHTML = `
      <div class="rank-pos ${posClass}">${pos}</div>
      <div class="rank-info">
        <div class="rank-name">${escHtml(r.name)}</div>
        <div class="rank-meta">${modeTag} · ${r.date} ${r.time || ''} · ${r.correct}/${r.total} acertos</div>
      </div>
      <div class="rank-right">
        <div class="rank-score">${r.score}</div>
        <div class="rank-stars">${starsHtml}</div>
      </div>
    `;
    container.appendChild(div);
  });
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── CREATE QUIZ ──────────────────────────────────────────
$('createBackBtn').onclick = () => showScreen('screen-mainmenu');

function updateCreateCounter() {
  $('createCounter').textContent = State.localDB.length + ' perguntas guardadas localmente';
}

$('saveQuestionBtn').onclick = () => {
  const disc = $('createDisc').value.trim();
  const cat  = $('createCat').value.trim();
  const q    = $('createQ').value.trim();
  const a    = $('createA').value.trim();
  const b    = $('createB').value.trim();
  const c    = $('createC').value.trim();
  const d    = $('createD').value.trim();
  const ans  = $('createAns').value;

  if (!q || !a || !b || !c || !d || !ans) {
    return showToast('Preencha todos os campos da pergunta.');
  }

  loadLocalDB();
  const entry = {
    id:       'local_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    disc, cat, question: q,
    a, b, c, d,
    answer:   ans,
    createdAt: Date.now(),
    uid:      State.user?.uid || 'anon'
  };
  State.localDB.push(entry);
  saveLocalDB(State.localDB);
  updateCreateCounter();

  // Limpar campos
  $('createQ').value = '';
  $('createA').value = '';
  $('createB').value = '';
  $('createC').value = '';
  $('createD').value = '';
  $('createAns').value = '';

  showToast('Pergunta guardada!');
};

$('uploadToCloudBtn').onclick = async () => {
  if (!navigator.onLine) return showToast('Sem ligação à internet.');
  if (!State.user) return showToast('Precisa de estar autenticado.');
  loadLocalDB();
  const pending = State.localDB.filter(q => q.uid === State.user.uid && !q.synced);
  if (pending.length === 0) return showToast('Nenhuma pergunta nova para enviar.');

  showLoading(`A enviar ${pending.length} perguntas para a nuvem...`);
  try {
    const updates = {};
    pending.forEach(q => {
      updates['questions/' + q.id] = { ...q, synced: true };
    });
    await db.ref().update(updates);
    // Marcar como sincronizadas
    State.localDB.forEach(q => { if (q.uid === State.user.uid) q.synced = true; });
    saveLocalDB(State.localDB);
    hideLoading();
    showToast(pending.length + ' perguntas enviadas para a nuvem!');
  } catch (e) {
    hideLoading();
    showToast('Erro ao enviar: ' + e.message);
  }
};

// ─── SYNC SCREEN ──────────────────────────────────────────
$('syncBackBtn').onclick = () => showScreen('screen-mainmenu');

async function loadSyncScreen() {
  $('syncTitle').textContent = navigator.onLine ? 'Ligado à Nuvem' : 'Sem ligação';
  $('syncSub').textContent   = navigator.onLine ? 'Pronto para sincronizar' : 'Ligue-se à internet para sincronizar';

  loadLocalDB();
  $('localQCount').textContent = State.localDB.length;
  $('lastSyncDate').textContent = LS.get('eq_last_sync') ? formatDate(LS.get('eq_last_sync')) : 'Nunca';

  if (navigator.onLine) {
    try {
      const snap = await db.ref('questions').once('value');
      const data = snap.val();
      const count = data ? Object.keys(data).length : 0;
      $('cloudQCount').textContent = count;
    } catch {
      $('cloudQCount').textContent = 'Erro';
    }
  } else {
    $('cloudQCount').textContent = '—';
  }
}

$('downloadCloudBtn').onclick = async () => {
  if (!navigator.onLine) return showToast('Sem ligação à internet. Conecte-se para descarregar.');

  showModal({
    icon: '<svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>',
    title: 'Transferir da Nuvem',
    msg: 'Deseja descarregar todas as perguntas da nuvem para este dispositivo? O jogo funcionará offline após a transferência.',
    btns: [
      { label: 'CANCELAR', cls: 'btn-outline' },
      { label: 'TRANSFERIR', cls: 'btn-primary', action: downloadFromCloud }
    ]
  });
};

async function downloadFromCloud() {
  showLoading('A transferir perguntas da nuvem...');
  try {
    const snap = await db.ref('questions').once('value');
    const data = snap.val();
    if (!data) {
      hideLoading();
      return showToast('Nenhuma pergunta encontrada na nuvem.');
    }
    const qs = Object.values(data);
    saveLocalDB(qs);
    LS.set('eq_last_sync', Date.now());
    hideLoading();
    $('localQCount').textContent  = qs.length;
    $('lastSyncDate').textContent = formatDate(Date.now());
    showToast(qs.length + ' perguntas transferidas! O jogo funciona agora offline.');
  } catch (e) {
    hideLoading();
    showToast('Erro na transferência: ' + e.message);
  }
}

// ─── CLOUD UPDATES NOTIFICATION ──────────────────────────
async function checkCloudUpdates() {
  if (!navigator.onLine) return;
  try {
    const snap = await db.ref('questions').once('value');
    const data = snap.val();
    if (!data) return;
    const cloudCount = Object.keys(data).length;
    loadLocalDB();
    const localCount = State.localDB.length;
    if (cloudCount > localCount) {
      showUpdateBanner(cloudCount - localCount);
    }
  } catch {}
}

function showUpdateBanner(newCount) {
  const banner = $('notifBanner');
  banner.querySelector('.notif-banner-text strong').textContent = `${newCount} novas perguntas disponíveis!`;
  banner.classList.add('show');
}

$('notifDownloadBtn').onclick = () => {
  $('notifBanner').classList.remove('show');
  loadSyncScreen();
  showScreen('screen-sync');
  setTimeout(downloadFromCloud, 400);
};

$('notifCloseBtn').onclick = () => $('notifBanner').classList.remove('show');

// ─── MODAL CLOSE ON OVERLAY CLICK ────────────────────────
$('modalOverlay').onclick = (e) => {
  if (e.target === $('modalOverlay')) closeModal();
};

// ─── ONLINE/OFFLINE DETECTION ────────────────────────────
window.addEventListener('online',  () => showToast('Ligação restabelecida!'));
window.addEventListener('offline', () => showToast('Sem ligação à internet.'));

// ─── INIT ─────────────────────────────────────────────────
(function init() {
  loadLocalDB();
  loadRankingLocal();
  // Carregar a app começa no splash
  showScreen('screen-splash');
})();
