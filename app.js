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
  currentMode:  null,
  currentDisc:  'all',
  currentCat:   'all',
  currentDiff:  'all',
  currentAnswerType: 'todos', // 'todos'|'multipla'|'vf'|'lacunas'|'flashcard'
  dbSource:     'local',  // 'local'|'cloud'
  timerSecs:    0,
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
  roundHistory: [],     // histórico de respostas da rodada actual [{q, userAnswer, correctAnswer, isRight, type}]
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
  $('statBest').textContent  = stats.best > 0 ? formatScore(stats.best) + ' val' : '0';
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

// ─── THEME TOGGLE ────────────────────────────────────────
(function initTheme() {
  const saved = LS.get('eq_theme') || 'dark';
  if (saved === 'light') {
    document.body.classList.add('light-mode');
  }
  updateThemeUI();
})();

function updateThemeUI() {
  const isLight = document.body.classList.contains('light-mode');
  const label = $('themeLabel');
  const icon  = $('themeIcon');
  if (label) label.textContent = isLight ? 'Modo Claro' : 'Modo Escuro';
  if (icon) {
    icon.innerHTML = isLight
      ? '<path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z"/>'
      : '<path d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/>';
  }
}

$('themeToggleBtn').onclick = () => {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  LS.set('eq_theme', isLight ? 'light' : 'dark');
  updateThemeUI();
  showToast(isLight ? 'Modo claro activado' : 'Modo escuro activado');
};

// ─── CHANGE PASSWORD ──────────────────────────────────────
$('changePasswordBtn').onclick = () => {
  const user = State.user;
  if (!user) return showToast('Sem sessão activa.');
  // Check if phone user (anonymous)
  if (user.isAnonymous) {
    // Show phone password change - redirect to recover modal phone tab
    $('recoverPhoneTab').click();
    $('recoverModal').classList.add('show');
    return;
  }
  // Email user
  $('currentPassInput').value = '';
  $('newPassInput').value = '';
  $('newPassConfirmInput').value = '';
  const email = user.email || '';
  $('changePassMsg').textContent = email
    ? `Conta: ${email}`
    : 'Introduza a sua senha atual e a nova senha.';
  $('changePassModal').classList.add('show');
};

$('closeChangePassModal').onclick = () => $('changePassModal').classList.remove('show');

$('submitChangePassBtn').onclick = async () => {
  const current = $('currentPassInput').value;
  const newPass  = $('newPassInput').value;
  const confirm  = $('newPassConfirmInput').value;
  if (!current || !newPass || !confirm) return showToast('Preencha todos os campos.');
  if (newPass.length < 6) return showToast('Nova senha deve ter mínimo 6 caracteres.');
  if (newPass !== confirm) return showToast('As senhas não coincidem.');

  showLoading('A alterar senha...');
  $('changePassModal').classList.remove('show');
  try {
    const user = State.user;
    const cred = firebase.auth.EmailAuthProvider.credential(user.email, current);
    await user.reauthenticateWithCredential(cred);
    await user.updatePassword(newPass);
    hideLoading();
    showToast('Senha alterada com sucesso!');
  } catch (e) {
    hideLoading();
    if (e.code === 'auth/wrong-password') showToast('Senha atual incorrecta.');
    else showToast('Erro ao alterar senha. Tente novamente.');
  }
};

// ─── RECOVERY MODAL ───────────────────────────────────────
$('recoverAccountBtn').onclick = () => {
  $('recoverEmailInput').value  = '';
  $('recoverPhoneInput').value  = '';
  $('recoverPhoneNewPass').value  = '';
  $('recoverPhoneNewPass2').value = '';
  // default to email tab
  $('recoverEmailTab').click();
  $('recoverModal').classList.add('show');
};

$('closeRecoverModal').onclick = () => $('recoverModal').classList.remove('show');

// Recovery tabs
$('recoverEmailTab').onclick = () => {
  $('recoverEmailTab').classList.add('active');
  $('recoverPhoneTab').classList.remove('active');
  $('recoverEmailPanel').style.display = '';
  $('recoverPhonePanel').style.display = 'none';
};
$('recoverPhoneTab').onclick = () => {
  $('recoverPhoneTab').classList.add('active');
  $('recoverEmailTab').classList.remove('active');
  $('recoverPhonePanel').style.display = '';
  $('recoverEmailPanel').style.display = 'none';
};

$('sendRecoveryEmailBtn').onclick = async () => {
  const email = $('recoverEmailInput').value.trim();
  if (!email) return showToast('Introduza o email da conta.');
  showLoading('A enviar email...');
  $('recoverModal').classList.remove('show');
  try {
    await auth.sendPasswordResetEmail(email);
    hideLoading();
    showToast('Email de recuperação enviado! Verifique a caixa de entrada.');
  } catch (e) {
    hideLoading();
    if (e.code === 'auth/user-not-found') showToast('Nenhuma conta encontrada com este email.');
    else showToast('Erro ao enviar email. Verifique o endereço.');
  }
};

$('resetPhonePassBtn').onclick = async () => {
  const phone = $('recoverPhoneInput').value.trim();
  const newP  = $('recoverPhoneNewPass').value;
  const newP2 = $('recoverPhoneNewPass2').value;
  if (!phone || !newP || !newP2) return showToast('Preencha todos os campos.');
  if (newP.length < 6) return showToast('Senha deve ter mínimo 6 caracteres.');
  if (newP !== newP2) return showToast('As senhas não coincidem.');

  showLoading('A redefinir senha...');
  $('recoverModal').classList.remove('show');
  try {
    const key  = phoneToKey(phone);
    const snap = await db.ref('phoneUsers/' + key).once('value');
    if (!snap.exists()) {
      hideLoading();
      return showToast('Número não encontrado. Verifique e tente novamente.');
    }
    const hash = await sha256(newP);
    await db.ref('phoneUsers/' + key + '/passwordHash').set(hash);
    hideLoading();
    showToast('Senha de telefone redefinida com sucesso!');
  } catch (e) {
    hideLoading();
    showToast('Erro ao redefinir senha: ' + e.message);
  }
};

// ─── FORGOT PASSWORD (login screen) ──────────────────────
$('forgotPassBtn').onclick = () => {
  const email = $('loginEmail').value.trim();
  if (email) $('recoverEmailInput').value = email;
  $('recoverEmailTab').click();
  $('recoverModal').classList.add('show');
};

// ─── MAIN MENU NAVIGATION ────────────────────────────────
$('btnJogar').onclick   = () => showScreen('screen-modeselect');
$('btnRanking').onclick = () => { loadRankingScreen('all'); showScreen('screen-ranking'); };
$('btnCriar').onclick   = () => { loadLocalDB(); updateCreateCounter(); showScreen('screen-create'); };
$('btnSync').onclick    = () => { loadSyncScreen(); showScreen('screen-sync'); };
$('btnSobre').onclick   = () => showScreen('screen-sobre');
$('sobreBackBtn').onclick = () => showScreen('screen-mainmenu');

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
    const modeNames = { aprendizado: 'Aprendizado', concurso: 'Concurso Público', prova: 'Prova Escolar', imagem: 'Quiz por Imagem' };
    $('setupModeBadge').textContent = modeNames[State.currentMode] || State.currentMode;
    $('setupTitle').textContent = 'Configurar: ' + (modeNames[State.currentMode] || '');

    const defaults = { aprendizado: 0, concurso: 30, prova: 60, imagem: 0 };
    setTimerDefault(defaults[State.currentMode] || 0);

    // Mostrar dificuldade em todos os modos
    $('difficultyWrap').style.display = 'block';
    State.currentDiff = 'all';
    document.querySelectorAll('#difficultyOptions .timer-opt').forEach(o => {
      o.classList.toggle('active', o.dataset.diff === 'all');
    });

    // Reset category
    State.currentCat = 'all';
    injectCustomDiscsIntoSetup();   // Adicionar disciplinas personalizadas ao selector
    updateCategoryOptions('all');

    // Flashcard só disponível no modo Aprendizado
    updateSetupFlashcardVisibility();

    // Reset fonte de dados para Local
    State.dbSource = 'local';
    document.querySelectorAll('#dbSourceSelector .db-source-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.source === 'local');
    });

    showScreen('screen-gamesetup');
  };
});

function updateSetupFlashcardVisibility() {
  const isAprendizado = State.currentMode === 'aprendizado';
  const fcBtn = document.querySelector('#setupAnswerTypeSelector .answer-type-btn[data-atype="flashcard"]');
  if (!fcBtn) return;
  if (isAprendizado) {
    fcBtn.style.display = '';
    fcBtn.disabled = false;
    fcBtn.title = '';
  } else {
    fcBtn.style.display = 'none';
    // If flashcard was selected, reset to 'todos'
    if (State.currentAnswerType === 'flashcard') {
      State.currentAnswerType = 'todos';
      document.querySelectorAll('#setupAnswerTypeSelector .answer-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.atype === 'todos');
      });
    }
  }
}

function setTimerDefault(secs) {
  document.querySelectorAll('.timer-opt[data-seconds]').forEach(opt => {
    opt.classList.toggle('active', parseInt(opt.dataset.seconds) === secs);
  });
  State.timerSecs = secs;
}

// Populate category dropdown based on selected discipline
function updateCategoryOptions(disc) {
  const catSel = $('setupCat');
  catSel.innerHTML = '<option value="all">Todas as Categorias</option>';

  // Gather categories from local DB
  let pool = State.localDB;
  if (disc !== 'all') pool = pool.filter(q => q.disc === disc);
  const cats = [...new Set(pool.map(q => q.cat).filter(Boolean))].sort();
  cats.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    catSel.appendChild(o);
  });
}

// ─── GAME SETUP ───────────────────────────────────────────
$('setupBackBtn').onclick = () => showScreen('screen-modeselect');

$('setupDisc').onchange = () => {
  loadLocalDB();
  updateCategoryOptions($('setupDisc').value);
  State.currentCat = 'all';
};

document.querySelectorAll('.timer-opt[data-seconds]').forEach(opt => {
  opt.onclick = () => {
    document.querySelectorAll('.timer-opt[data-seconds]').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    State.timerSecs = parseInt(opt.dataset.seconds);
  };
});

document.querySelectorAll('#difficultyOptions .timer-opt').forEach(opt => {
  opt.onclick = () => {
    document.querySelectorAll('#difficultyOptions .timer-opt').forEach(o => o.classList.remove('active'));
    opt.classList.add('active');
    State.currentDiff = opt.dataset.diff;
  };
});

// ─── GAME SETUP: ANSWER TYPE SELECTOR ──────────────────────
document.querySelectorAll('#setupAnswerTypeSelector .answer-type-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#setupAnswerTypeSelector .answer-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.currentAnswerType = btn.dataset.atype;
  };
});

// ─── GAME SETUP: DB SOURCE SELECTOR ────────────────────────
document.querySelectorAll('#dbSourceSelector .db-source-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#dbSourceSelector .db-source-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    State.dbSource = btn.dataset.source;
  };
});

$('startGameBtn').onclick = async () => {
  State.currentDisc = $('setupDisc').value;
  State.currentCat  = $('setupCat').value;
  loadLocalDB();
  loadUsedToday();

  if (State.dbSource === 'cloud') {
    // Jogar directo da nuvem
    if (!navigator.onLine) {
      showToast('Sem conexão. Ligue à internet para jogar na Nuvem, ou escolha Local.');
      return;
    }
    showLoading('A carregar perguntas da nuvem...');
    try {
      const snap = await db.ref('questions').once('value');
      const data = snap.val();
      if (!data) {
        hideLoading();
        showToast('Sem perguntas na nuvem. Tente sincronizar primeiro.');
        return;
      }
      const cloudQs = Object.values(data);
      const pool = buildPool(cloudQs);
      hideLoading();
      if (pool.length < 1) {
        showToast('Nenhuma pergunta disponível com esses filtros na nuvem.');
        return;
      }
      startGame(pool);
    } catch (e) {
      hideLoading();
      showToast('Erro ao carregar da nuvem: ' + e.message);
    }
    return;
  }

  // Jogar com perguntas locais (padrão)
  let pool = buildPool(State.localDB);

  // Se local vazio, oferecer fallback automático para nuvem
  if (pool.length < 1 && navigator.onLine) {
    showLoading('Sem dados locais. A tentar carregar da nuvem...');
    try {
      const snap = await db.ref('questions').once('value');
      const data = snap.val();
      if (data) {
        const cloudQs = Object.values(data);
        const localIds = new Set(State.localDB.map(q => q.id));
        const merged = [...State.localDB, ...cloudQs.filter(q => !localIds.has(q.id))];
        saveLocalDB(merged);
        pool = buildPool(merged);
      }
    } catch (e) {}
    hideLoading();
  }

  if (pool.length < 1) {
    showToast('Nenhuma pergunta disponível. Sincronize a base de dados ou escolha "Nuvem".');
    return;
  }

  startGame(pool);
};

function buildPool(db) {
  let pool = [...db];
  if (State.currentDisc !== 'all') pool = pool.filter(q => q.disc === State.currentDisc);
  if (State.currentCat  !== 'all') pool = pool.filter(q => q.cat  === State.currentCat);
  if (State.currentDiff !== 'all') {
    const diffFilter = State.currentDiff.toLowerCase();
    pool = pool.filter(q => (q.diff || '').toLowerCase() === diffFilter);
  }
  // Image mode filter
  if (State.currentMode === 'imagem') {
    pool = pool.filter(q => q.mode === 'imagem' || q.imgA);
  } else {
    pool = pool.filter(q => q.mode !== 'imagem' && !q.imgA);
  }

  // Flashcard only allowed in Aprendizado mode
  if (State.currentMode !== 'aprendizado') {
    pool = pool.filter(q => (q.answerType || 'multipla') !== 'flashcard');
  }

  const atype = State.currentAnswerType;
  if (atype && atype !== 'todos') {
    pool = pool.filter(q => (q.answerType || 'multipla') === atype);
  } else if (atype === 'todos') {
    // Mix all types: group by answerType then interleave for a balanced 50-question round
    const isAprendizado = State.currentMode === 'aprendizado';
    const allowedTypes = isAprendizado
      ? ['multipla', 'vf', 'lacunas', 'flashcard']
      : ['multipla', 'vf', 'lacunas'];

    // Separate pool into buckets per type
    const buckets = {};
    allowedTypes.forEach(t => { buckets[t] = []; });
    pool.forEach(q => {
      const t = q.answerType || 'multipla';
      if (buckets[t]) buckets[t].push(q);
      // Questions with no known type fall into multipla bucket
      else if (buckets['multipla']) buckets['multipla'].push(q);
    });

    // Shuffle each bucket
    allowedTypes.forEach(t => { buckets[t] = shuffle(buckets[t]); });

    // Interleave: round-robin through available buckets until we have enough
    const mixed = [];
    let safetyLimit = 0;
    while (mixed.length < pool.length && safetyLimit < 10000) {
      safetyLimit++;
      let added = false;
      for (const t of allowedTypes) {
        if (buckets[t].length > 0) {
          mixed.push(buckets[t].shift());
          added = true;
        }
      }
      if (!added) break;
    }
    return mixed;
  }

  return pool;
}

// ─── GAME LOGIC ───────────────────────────────────────────
function startGame(pool) {
  if (!pool) {
    loadLocalDB();
    pool = buildPool(State.localDB);
  }

  if (pool.length < 1) {
    showToast('Poucas perguntas disponíveis. Sincronize a base de dados primeiro.');
    return;
  }

  // Filtrar as usadas hoje
  let available = pool.filter(q => !State.usedTodayIds.includes(q.id));
  if (available.length < 1) {
    State.usedTodayIds = [];
    saveUsedToday();
    available = [...pool];
  }

  const shuffled = shuffle(available);
  State.questions = shuffled.slice(0, Math.min(50, shuffled.length));

  State.questions.forEach(q => {
    if (!State.usedTodayIds.includes(q.id)) State.usedTodayIds.push(q.id);
  });
  saveUsedToday();

  State.qIndex  = 0;
  State.score   = 0;
  State.correct = 0;
  State.wrong   = 0;
  State.roundHistory = [];

  const modeNames = { aprendizado: 'Aprendizado', concurso: 'Concurso Público', prova: 'Prova Escolar', imagem: 'Quiz por Imagem' };
  $('gameModeLabel').textContent = modeNames[State.currentMode] || State.currentMode;

  showScreen('screen-game');
  renderQuestion();
}

function renderQuestion() {
  const q = State.questions[State.qIndex];
  if (!q) { endGame(); return; }

  State.answered = false;

  // Cleanup V/F wrap from previous question
  const oldVfWrap = document.querySelector('.vf-options');
  if (oldVfWrap) oldVfWrap.remove();

  // Barra de progresso
  const pct = ((State.qIndex) / State.questions.length) * 100;
  $('gameProgressFill').style.width = Math.max(2, pct) + '%';
  $('gameProgressLabel').textContent = (State.qIndex + 1) + ' / ' + State.questions.length;
  $('gameScoreBadge').textContent    = formatScore(State.score) + 'v';

  renderGameStars();

  // Determine answer type
  const atype = q.answerType || 'multipla';
  const typeBadgeMap = {
    multipla:  { label: 'Múltipla Escolha', cls: 'type-multipla',  icon: '<path d="M18 7l-1.41-1.41-6.34 6.34-2.83-2.83L6 10.5l4.24 4.24L18 7z"/>' },
    vf:        { label: 'Verdadeiro/Falso',  cls: 'type-vf',        icon: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' },
    lacunas:   { label: 'Preencher Lacuna',  cls: 'type-lacunas',   icon: '<path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/>' },
    flashcard: { label: 'Flashcard',         cls: 'type-flashcard', icon: '<path d="M20 6h-2.18c.07-.44.18-.88.18-1.36C18 2.51 15.5 0 12.36 0c-1.9 0-3.56.98-4.56 2.44L6.5 4.5 4.18 2.18A2.5 2.5 0 000 4v16a2 2 0 002 2h16l4-4V8a2 2 0 00-2-2zm-9 11l-4-4 1.41-1.41L11 14.17l6.59-6.59L19 9l-8 8z"/>' },
  };
  const tb = typeBadgeMap[atype] || typeBadgeMap.multipla;
  $('questionNum').innerHTML = `Questão ${State.qIndex + 1} <span class="qtype-badge ${tb.cls}"><svg viewBox="0 0 24 24">${tb.icon}</svg>${tb.label}</span>`;
  $('questionText').textContent = (atype === 'lacunas' || atype === 'flashcard') ? '' : q.question;

  // Reset areas
  $('gameOptions').innerHTML = '';
  $('gameOptions').style.display = '';
  $('gameOptions').classList.remove('image-mode');
  $('lacunasArea').style.display = 'none';
  $('flashcardArea').style.display = 'none';

  // Show/hide question image
  if (q.questionImg) {
    $('questionImage').src = q.questionImg;
    $('questionImageWrap').style.display = 'block';
  } else {
    $('questionImageWrap').style.display = 'none';
  }

  // Dispatch
  if (atype === 'flashcard') {
    renderFlashcard(q);
  } else if (atype === 'lacunas') {
    renderLacunas(q);
  } else if (atype === 'vf') {
    renderVF(q);
  } else {
    renderMultipla(q);
  }

  // Timer
  if (State.timerSecs > 0) {
    $('timerRingWrap').style.display  = 'flex';
    $('nextBtn').disabled = (State.currentMode !== 'aprendizado');
    startTimer(State.timerSecs);
  } else {
    $('timerRingWrap').style.display = 'none';
    $('nextBtn').disabled = true;
    $('nextBtnText').textContent = 'PRÓXIMA';
  }
}

// ── MÚLTIPLA ESCOLHA ─────────────────────────────────────
function renderMultipla(q) {
  const isImageMode = State.currentMode === 'imagem';
  const originalOpts = [
    { letter: 'A', text: q.a, img: q.imgA },
    { letter: 'B', text: q.b, img: q.imgB },
    { letter: 'C', text: q.c, img: q.imgC },
    { letter: 'D', text: q.d, img: q.imgD },
  ].filter(o => o.text || o.img);

  const shuffledOpts = shuffle(originalOpts);
  const displayLetters = ['A','B','C','D'];
  const optionMap = {};
  shuffledOpts.forEach((opt, i) => { if (i < displayLetters.length) optionMap[displayLetters[i]] = opt; });

  const optWrap = $('gameOptions');
  optWrap.classList.toggle('image-mode', isImageMode);

  displayLetters.forEach(displayLetter => {
    const mappedOpt = optionMap[displayLetter];
    if (!mappedOpt) return;
    const btn = document.createElement('button');
    btn.className = isImageMode ? 'option-btn image-option' : 'option-btn';
    btn.dataset.displayLetter  = displayLetter;
    btn.dataset.originalLetter = mappedOpt.letter;
    btn.dataset.optionText     = mappedOpt.text || '';
    if (isImageMode && mappedOpt.img) {
      btn.innerHTML = `<div class="option-badge">${displayLetter}</div><img class="option-img" src="${mappedOpt.img}" alt="Opção ${displayLetter}"><svg class="option-icon correct-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><svg class="option-icon wrong-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 17.59 13.41 12z"/></svg>`;
    } else {
      btn.innerHTML = `<div class="option-badge">${displayLetter}</div><span class="option-text">${mappedOpt.text}</span><svg class="option-icon correct-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><svg class="option-icon wrong-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 17.59 13.41 12z"/></svg>`;
    }
    btn.onclick = () => handleAnswer(displayLetter, btn, optionMap);
    optWrap.appendChild(btn);
  });
}

// ── VERDADEIRO / FALSO ────────────────────────────────────
function renderVF(q) {
  const isImageMode = State.currentMode === 'imagem';
  if (isImageMode && (q.imgA || q.imgB)) {
    $('gameOptions').classList.add('image-mode');
    const vfOpts = [
      { letter: 'A', text: q.a || 'Verdadeiro', img: q.imgA },
      { letter: 'B', text: q.b || 'Falso',      img: q.imgB },
    ];
    const optionMap = { A: vfOpts[0], B: vfOpts[1] };
    vfOpts.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn image-option';
      btn.dataset.displayLetter = btn.dataset.originalLetter = opt.letter;
      btn.dataset.optionText = opt.text;
      btn.innerHTML = `<div class="option-badge">${opt.letter}</div><img class="option-img" src="${opt.img}" alt="${opt.text}"><svg class="option-icon correct-icon" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg><svg class="option-icon wrong-icon" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 17.59 13.41 12z"/></svg>`;
      btn.onclick = () => handleAnswer(opt.letter, btn, optionMap);
      $('gameOptions').appendChild(btn);
    });
    return;
  }
  $('gameOptions').style.display = 'none';
  const vfWrap = document.createElement('div');
  vfWrap.className = 'vf-options';
  const options = [
    { letter: 'A', label: 'Verdadeiro', icon: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>' },
    { letter: 'B', label: 'Falso',      icon: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 17.59 13.41 12z"/>' },
  ];
  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = `vf-btn vf-${opt.label.toLowerCase()}`;
    btn.dataset.displayLetter = btn.dataset.originalLetter = opt.letter;
    btn.dataset.optionText = opt.label;
    btn.innerHTML = `<svg viewBox="0 0 24 24">${opt.icon}</svg> ${opt.label}`;
    btn.onclick = () => {
      vfWrap.querySelectorAll('.vf-btn').forEach(b => b.disabled = true);
      const isRight = opt.letter === q.answer;
      if (isRight) {
        btn.classList.add('correct');
        State.correct++; State.score += getPointsForMode();
        $('gameScoreBadge').textContent = formatScore(State.score) + 'v';
        renderGameStars(); playCorrectSound();
      } else {
        btn.classList.add('wrong');
        vfWrap.querySelectorAll('.vf-btn').forEach(b => { if (b.dataset.displayLetter === q.answer) b.classList.add('correct'); });
        State.wrong++; playWrongSound();
      }
      State.roundHistory.push({
        question:      q.question,
        answerType:    'vf',
        userAnswer:    opt.label,
        correctAnswer: q.answer === 'A' ? 'Verdadeiro' : 'Falso',
        isRight,
        options: [{ key:'A', text:'Verdadeiro' }, { key:'B', text:'Falso' }],
        explanation:   q.explanation || q.explicacao || '',
      });
      State.answered = true; stopTimer();
      $('nextBtn').disabled = false;
      $('nextBtnText').textContent = State.qIndex + 1 >= State.questions.length ? 'VER RESULTADO' : 'PRÓXIMA';
      if (State.timerSecs > 0) setTimeout(() => { if (State.answered) advanceQuestion(); }, 1600);
    };
    vfWrap.appendChild(btn);
  });
  $('gameOptions').insertAdjacentElement('afterend', vfWrap);
}

// ── LACUNAS ───────────────────────────────────────────────
function renderLacunas(q) {
  $('gameOptions').style.display = 'none';
  const la = $('lacunasArea');
  la.style.display = 'block';
  $('lacunasFeedback').className = 'lacunas-feedback';
  $('lacunasFeedback').textContent = '';
  $('lacunasInput').value = '';
  $('lacunasInput').className = 'lacunas-input';
  $('lacunasInput').disabled = false;
  $('lacunasCheckBtn').disabled = false;

  const frase = q.lacunaFrase || q.question;
  const parts = frase.split('___');
  const lqEl = $('lacunasQuestion');
  lqEl.innerHTML = '';
  parts.forEach((part, i) => {
    lqEl.appendChild(document.createTextNode(part));
    if (i < parts.length - 1) {
      const blank = document.createElement('span');
      blank.className = 'blank'; blank.id = 'lacunaBlank'; blank.textContent = '___';
      lqEl.appendChild(blank);
    }
  });
  setTimeout(() => $('lacunasInput').focus(), 100);
  $('lacunasCheckBtn').onclick = () => checkLacunaAnswer(q);
  $('lacunasInput').onkeydown  = (e) => { if (e.key === 'Enter' && !State.answered) checkLacunaAnswer(q); };
}

function checkLacunaAnswer(q) {
  if (State.answered) return;
  const userAns    = $('lacunasInput').value.trim().toLowerCase();
  const correctAns = (q.lacunaResposta || q.a || '').trim().toLowerCase();
  const isRight    = userAns === correctAns || userAns.includes(correctAns) || correctAns.includes(userAns);
  State.answered = true;
  $('lacunasInput').disabled = true;
  $('lacunasCheckBtn').disabled = true;
  stopTimer();
  const blank = document.getElementById('lacunaBlank');
  const fb = $('lacunasFeedback');
  fb.classList.add('show');
  if (isRight) {
    $('lacunasInput').classList.add('correct');
    if (blank) { blank.textContent = q.lacunaResposta || q.a; blank.classList.add('filled-correct'); }
    fb.className = 'lacunas-feedback show correct-fb';
    fb.textContent = '✓ Correcto! ' + (q.lacunaResposta || q.a);
    State.correct++; State.score += getPointsForMode();
    $('gameScoreBadge').textContent = formatScore(State.score) + 'v';
    renderGameStars(); playCorrectSound();
  } else {
    $('lacunasInput').classList.add('wrong');
    if (blank) { blank.textContent = q.lacunaResposta || q.a; blank.classList.add('filled-wrong'); }
    fb.className = 'lacunas-feedback show wrong-fb';
    fb.textContent = '✗ Errado! A resposta correcta era: ' + (q.lacunaResposta || q.a);
    State.wrong++; playWrongSound();
  }
  State.roundHistory.push({
    question:      q.lacunaFrase || q.question,
    answerType:    'lacunas',
    userAnswer:    userAns,
    correctAnswer: q.lacunaResposta || q.a,
    isRight,
    options: [],
    explanation:   q.explanation || q.explicacao || '',
  });
  $('nextBtn').disabled = false;
  $('nextBtnText').textContent = State.qIndex + 1 >= State.questions.length ? 'VER RESULTADO' : 'PRÓXIMA';
  if (State.timerSecs > 0) setTimeout(() => { if (State.answered) advanceQuestion(); }, 2000);
}

// ── FLASHCARD ─────────────────────────────────────────────
function renderFlashcard(q) {
  $('gameOptions').style.display = 'none';
  $('nextBtn').disabled = true;
  const fcArea = $('flashcardArea');
  fcArea.style.display = 'flex';
  const fc = $('flashcard');
  fc.classList.remove('flipped');
  $('flashcardFrontText').textContent = q.flashFront || q.question;
  $('flashcardBackText').textContent  = q.flashBack  || q.a;
  $('flashcardActions').style.display = 'none';
  const hint = fc.querySelector('.flashcard-tap-hint');
  if (hint) hint.style.display = '';
  fc.onclick = () => {
    if (!fc.classList.contains('flipped')) {
      fc.classList.add('flipped');
      if (hint) hint.style.display = 'none';
      setTimeout(() => { $('flashcardActions').style.display = 'flex'; }, 300);
    }
  };
  $('fcWrongBtn').onclick = () => handleFlashcardResult('wrong');
  $('fcHardBtn').onclick  = () => handleFlashcardResult('hard');
  $('fcGoodBtn').onclick  = () => handleFlashcardResult('good');
}

function handleFlashcardResult(result) {
  if (State.answered) return;
  State.answered = true; stopTimer();
  if (result === 'good') {
    State.correct++; State.score += getPointsForMode();
    $('gameScoreBadge').textContent = formatScore(State.score) + 'v';
    renderGameStars(); playCorrectSound();
  } else if (result === 'hard') {
    State.correct++; State.score += Math.floor(getPointsForMode() / 2);
    $('gameScoreBadge').textContent = formatScore(State.score) + 'v';
    renderGameStars();
  } else {
    State.wrong++; playWrongSound();
  }
  $('nextBtn').disabled = false;
  $('nextBtnText').textContent = State.qIndex + 1 >= State.questions.length ? 'VER RESULTADO' : 'PRÓXIMA';
  if (State.timerSecs > 0) setTimeout(() => advanceQuestion(), 1400);
}

// ─── AUDIO FEEDBACK ────────────────────────────────────────
function playCorrectSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.35, ctx.currentTime + i * 0.1 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.3);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.35);
    });
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance('Resposta certa');
      utter.lang = 'pt-BR';
      utter.rate = 1.0;
      utter.pitch = 1.1;
      window.speechSynthesis.speak(utter);
    }, 400);
  } catch (e) {}
}

function playWrongSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [300, 220];
    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.18);
      gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.35);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.4);
    });
    setTimeout(() => {
      const utter = new SpeechSynthesisUtterance('Resposta errada');
      utter.lang = 'pt-BR';
      utter.rate = 1.0;
      utter.pitch = 0.85;
      window.speechSynthesis.speak(utter);
    }, 450);
  } catch (e) {}
}

function handleAnswer(displayLetter, clickedBtn, optionMap) {
  if (State.answered) return;
  State.answered = true;

  stopTimer();

  const q = State.questions[State.qIndex];
  const correctOriginalLetter = q.answer; // posição original na BD
  const correctOriginalText   = q[correctOriginalLetter.toLowerCase()];
  const correctOriginalImg    = q['img' + correctOriginalLetter]; // imgA, imgB, imgC, imgD

  const selectedOpt            = optionMap ? optionMap[displayLetter] : null;
  const selectedOriginalLetter = selectedOpt ? selectedOpt.letter : displayLetter;
  const selectedText           = selectedOpt ? selectedOpt.text   : '';

  // Verificação dupla: posição original OU texto coincide
  const isRight =
    selectedOriginalLetter === correctOriginalLetter ||
    (selectedText && correctOriginalText &&
     selectedText.trim().toLowerCase() === correctOriginalText.trim().toLowerCase());

  // Encontrar display letter que corresponde à resposta certa
  let correctDisplayLetter = null;
  $('gameOptions').querySelectorAll('.option-btn').forEach(btn => {
    const btnOrigLetter = btn.dataset.originalLetter;
    const btnText       = btn.dataset.optionText || '';
    const isCorrectBtn  =
      btnOrigLetter === correctOriginalLetter ||
      (correctOriginalText && btnText.trim().toLowerCase() === correctOriginalText.trim().toLowerCase());
    if (isCorrectBtn) correctDisplayLetter = btn.dataset.displayLetter;
  });

  // Aplicar estilos
  $('gameOptions').querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    const dl = btn.dataset.displayLetter;
    if (dl === correctDisplayLetter) {
      btn.classList.add('correct');
    } else if (dl === displayLetter && !isRight) {
      btn.classList.add('wrong');
    }
  });

  if (isRight) {
    State.correct++;
    State.score += getPointsForMode();
    $('gameScoreBadge').textContent = formatScore(State.score) + 'v';
    renderGameStars();
    playCorrectSound();
  } else {
    State.wrong++;
    playWrongSound();
  }

  // Guardar no histórico da rodada
  State.roundHistory.push({
    question:      q.question,
    answerType:    q.answerType || 'multipla',
    userAnswer:    selectedText || displayLetter,
    correctAnswer: correctOriginalText || correctOriginalLetter,
    isRight,
    options: ['a','b','c','d'].filter(k => q[k]).map(k => ({ key: k.toUpperCase(), text: q[k] })),
    explanation:   q.explanation || q.explicacao || '',
  });

  // Habilitar PRÓXIMA
  $('nextBtn').disabled = false;
  $('nextBtnText').textContent = State.qIndex + 1 >= State.questions.length ? 'VER RESULTADO' : 'PRÓXIMA';

  if (State.timerSecs > 0) {
    setTimeout(() => {
      if (State.answered) advanceQuestion();
    }, 1600);
  }
}

function getPointsForMode() {
  // 0.5 valores por pergunta — guardado como 5 (×10) para evitar decimais no display
  // 50 perguntas certas = 250 pontos internos = 25/10 = 25... mas queremos 20 valores
  // Portanto: cada pergunta = 0.5 valores → usamos 5 internamente (dividir por 10 para mostrar)
  return 5; // 5 pontos internos = 0.5 valores
}

function formatScore(score) {
  // Converte pontos internos para valores (divde por 10)
  return (score / 10).toFixed(1).replace('.', ',');
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

  // Inicializar o círculo completo
  circle.style.strokeDasharray  = total;
  circle.style.strokeDashoffset = 0;

  function tick() {
    const pct = State.timerLeft / secs;
    circle.style.strokeDashoffset = total * (1 - pct);
    numEl.textContent = State.timerLeft;

    if (State.timerLeft <= 5) {
      circle.classList.add('danger');
      numEl.classList.add('danger');
    } else {
      circle.classList.remove('danger');
      numEl.classList.remove('danger');
    }

    if (State.timerLeft <= 0) {
      stopTimer();
      if (!State.answered) timeUp();
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
  const correctOriginalLetter = q.answer;
  const correctOriginalText   = q[correctOriginalLetter.toLowerCase()];

  $('gameOptions').querySelectorAll('.option-btn').forEach(btn => {
    btn.disabled = true;
    const btnOrigLetter = btn.dataset.originalLetter;
    const btnText       = btn.dataset.optionText || '';
    const isCorrectBtn  =
      btnOrigLetter === correctOriginalLetter ||
      (correctOriginalText && btnText.trim().toLowerCase() === correctOriginalText.trim().toLowerCase());
    if (isCorrectBtn) btn.classList.add('correct');
  });

  playWrongSound();
  showToast('Tempo esgotado! A resposta correcta era ' + correctOriginalLetter + '.');

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
  $('resultScore').textContent = formatScore(State.score) + ' val';
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
  startGame(buildPool(State.localDB));
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
        <div class="rank-score">${formatScore(r.score)} val</div>
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

// Mostrar/ocultar campo de disciplina personalizada
$('createDisc').onchange = () => {
  const isOther = $('createDisc').value === 'Outros';
  $('customDiscWrap').style.display = isOther ? 'block' : 'none';
  if (!isOther) $('createDiscCustom').value = '';
};

// ─── DISCIPLINAS PERSONALIZADAS (localStorage) ─────────────
const LS_CUSTOM_DISCS = 'eq_custom_discs';

function loadCustomDiscs() {
  return LS.get(LS_CUSTOM_DISCS) || [];
}

function saveCustomDisc(name) {
  const discs = loadCustomDiscs();
  if (!discs.includes(name)) {
    discs.push(name);
    LS.set(LS_CUSTOM_DISCS, discs);
  }
}

// Injectar disciplinas personalizadas no selector do jogo
function injectCustomDiscsIntoSetup() {
  const sel = $('setupDisc');
  if (!sel) return;
  // Remover opções customizadas anteriores (têm data-custom)
  sel.querySelectorAll('[data-custom]').forEach(o => o.remove());
  const discs = loadCustomDiscs();
  if (discs.length === 0) return;
  // Separador
  const sep = document.createElement('option');
  sep.disabled = true;
  sep.textContent = '── Minhas Disciplinas ──';
  sep.setAttribute('data-custom', '1');
  sel.appendChild(sep);
  discs.forEach(d => {
    const o = document.createElement('option');
    o.value = d; o.textContent = d;
    o.setAttribute('data-custom', '1');
    sel.appendChild(o);
  });
}

// ─── CREATE QUIZ: MODE SELECTOR ───────────────────────────
let createQuizMode = 'aprendizado';
let createAnswerType = 'multipla'; // 'multipla'|'vf'|'lacunas'|'flashcard'

document.querySelectorAll('.create-mode-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.create-mode-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    createQuizMode = btn.dataset.mode;
    const isImage = createQuizMode === 'imagem';
    $('textOptionsGrid').style.display  = isImage ? 'none' : 'grid';
    $('imageOptionsGrid').style.display = isImage ? 'block' : 'none';
    updateCreateFormForAnswerType();
    updateCreateFlashcardVisibility();
  };
});

function updateCreateFlashcardVisibility() {
  const isAprendizado = createQuizMode === 'aprendizado';
  const fcBtn = document.querySelector('#createAnswerTypeSelector .answer-type-btn[data-atype="flashcard"]');
  if (!fcBtn) return;
  if (isAprendizado) {
    fcBtn.style.display = '';
    fcBtn.disabled = false;
  } else {
    fcBtn.style.display = 'none';
    // If flashcard was selected, revert to multipla
    if (createAnswerType === 'flashcard') {
      createAnswerType = 'multipla';
      document.querySelectorAll('#createAnswerTypeSelector .answer-type-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.atype === 'multipla');
      });
      updateCreateFormForAnswerType();
    }
  }
}

// ─── CREATE QUIZ: ANSWER TYPE SELECTOR ───────────────────
document.querySelectorAll('#createAnswerTypeSelector .answer-type-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#createAnswerTypeSelector .answer-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    createAnswerType = btn.dataset.atype;
    updateCreateFormForAnswerType();
  };
});

function updateCreateFormForAnswerType() {
  const isImage = createQuizMode === 'imagem';
  const atype   = createAnswerType;
  const isFlash = atype === 'flashcard';
  const isLacun = atype === 'lacunas';
  const isVF    = atype === 'vf';
  const isMult  = atype === 'multipla';

  // Esconder/mostrar campos de opções
  if (!isImage) {
    $('textOptionsGrid').style.display = (isFlash || isLacun) ? 'none' : 'grid';
  }
  $('createLacunasWrap').style.display  = isLacun ? 'block' : 'none';
  $('createFlashcardWrap').style.display = isFlash ? 'block' : 'none';

  // Para V/F: colocar alternativas fixas
  if (isVF && !isImage) {
    $('createA').value = 'Verdadeiro';
    $('createB').value = 'Falso';
    $('createC').value = '';
    $('createD').value = '';
    $('textOptionsGrid').style.display = 'grid';
    // desabilitar C e D
    $('createC').disabled = true;
    $('createD').disabled = true;
    $('createC').placeholder = '(não utilizado)';
    $('createD').placeholder = '(não utilizado)';
  } else {
    $('createC').disabled = false;
    $('createD').disabled = false;
    $('createC').placeholder = 'Alternativa C';
    $('createD').placeholder = 'Alternativa D';
    if (isVF) { /* image mode V/F handled in save */ }
  }
}

// ─── IMAGE UPLOAD PREVIEWS ────────────────────────────────
const imgInputIds = ['A','B','C','D'];
const _imgData = { A: null, B: null, C: null, D: null };

imgInputIds.forEach(letter => {
  const input   = $('imgInput' + letter);
  const preview = $('imgPreview' + letter);
  if (!input) return;
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast('Imagem muito grande. Use imagens até 2MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      _imgData[letter] = ev.target.result;
      preview.classList.add('has-image');
      // Remove old img if any
      const oldImg = preview.querySelector('img');
      if (oldImg) oldImg.remove();
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      preview.appendChild(img);
    };
    reader.readAsDataURL(file);
  };
});

$('saveQuestionBtn').onclick = () => {
  let disc = $('createDisc').value.trim();

  // Se selecionou "Outros", usar o campo personalizado
  if (disc === 'Outros') {
    const custom = $('createDiscCustom').value.trim();
    if (!custom) return showToast('Escreva o nome da nova disciplina.');
    disc = custom;
    saveCustomDisc(disc);
    injectCustomDiscsIntoSetup();
  }

  const cat  = $('createCat').value.trim();
  const q    = $('createQ').value.trim();
  const isImage = createQuizMode === 'imagem';

  // ── FLASHCARD ──
  if (createAnswerType === 'flashcard') {
    const front = $('createFlashFront').value.trim();
    const back  = $('createFlashBack').value.trim();
    if (!front || !back) return showToast('Preencha a frente e o verso do flashcard.');
    loadLocalDB();
    const entry = {
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      disc, cat, question: front,
      a: back, b: '', c: '', d: '',
      answer: 'A',
      answerType: 'flashcard',
      flashFront: front,
      flashBack: back,
      diff: 'médio',
      mode: createQuizMode,
      createdAt: Date.now(),
      uid: State.user?.uid || 'anon'
    };
    State.localDB.push(entry);
    saveLocalDB(State.localDB);
    updateCreateCounter();
    $('createFlashFront').value = '';
    $('createFlashBack').value  = '';
    $('createQ').value = '';
    showToast(`Flashcard guardado! (${disc})`);
    return;
  }

  // ── LACUNAS ──
  if (createAnswerType === 'lacunas') {
    const frase = $('createLacunaFrase').value.trim();
    const resp  = $('createLacunaResposta').value.trim();
    if (!frase || !resp) return showToast('Preencha a frase com lacuna e a resposta.');
    if (!frase.includes('___')) return showToast('Use ___ (três underscores) para marcar a lacuna na frase.');
    loadLocalDB();
    const entry = {
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      disc, cat,
      question: frase.replace('___', '___'),
      a: resp, b: '', c: '', d: '',
      answer: 'A',
      answerType: 'lacunas',
      lacunaFrase: frase,
      lacunaResposta: resp,
      diff: 'médio',
      mode: createQuizMode,
      createdAt: Date.now(),
      uid: State.user?.uid || 'anon'
    };
    State.localDB.push(entry);
    saveLocalDB(State.localDB);
    updateCreateCounter();
    $('createLacunaFrase').value    = '';
    $('createLacunaResposta').value = '';
    $('createQ').value = '';
    showToast(`Pergunta de lacuna guardada! (${disc})`);
    return;
  }

  // ── V/F + IMAGEM ──
  if (createAnswerType === 'vf' && isImage) {
    if (!q) return showToast('Preencha a pergunta.');
    if (!_imgData.A || !_imgData.B) return showToast('Carregue imagens para A (Verdadeiro) e B (Falso).');
    const ans = $('createAns').value;
    if (!ans || (ans !== 'A' && ans !== 'B')) return showToast('Selecione A (Verdadeiro) ou B (Falso) como resposta correcta.');
    loadLocalDB();
    const entry = {
      id: 'local_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      disc, cat, question: q,
      a: 'Verdadeiro', b: 'Falso', c: '', d: '',
      imgA: _imgData.A, imgB: _imgData.B, imgC: null, imgD: null,
      answer: ans,
      answerType: 'vf',
      diff: 'médio',
      mode: 'imagem',
      createdAt: Date.now(),
      uid: State.user?.uid || 'anon'
    };
    State.localDB.push(entry);
    saveLocalDB(State.localDB);
    updateCreateCounter();
    imgInputIds.forEach(letter => {
      _imgData[letter] = null;
      const preview = $('imgPreview' + letter);
      preview.classList.remove('has-image');
      const img = preview.querySelector('img');
      if (img) img.remove();
      $('imgInput' + letter).value = '';
    });
    $('createQ').value = '';
    $('createAns').value = '';
    showToast(`Pergunta V/F com imagem guardada! (${disc})`);
    return;
  }

  if (!q && !isImage) return showToast('Preencha a pergunta.');
  const ans  = $('createAns').value;

  if (isImage) {
    if (!q) return showToast('Preencha a pergunta.');
    if (!ans) return showToast('Selecione a resposta correcta.');
    if (!_imgData.A || !_imgData.B || !_imgData.C || !_imgData.D) {
      return showToast('Carregue imagens para todas as alternativas (A, B, C e D).');
    }
    loadLocalDB();
    const entry = {
      id:         'local_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      disc, cat, question: q,
      a: 'Imagem A', b: 'Imagem B', c: 'Imagem C', d: 'Imagem D',
      imgA: _imgData.A, imgB: _imgData.B, imgC: _imgData.C, imgD: _imgData.D,
      answer: ans,
      answerType: createAnswerType !== 'multipla' ? createAnswerType : 'multipla',
      diff: 'médio',
      mode: 'imagem',
      createdAt: Date.now(),
      uid: State.user?.uid || 'anon'
    };
    State.localDB.push(entry);
    saveLocalDB(State.localDB);
    updateCreateCounter();
    imgInputIds.forEach(letter => {
      _imgData[letter] = null;
      const preview = $('imgPreview' + letter);
      preview.classList.remove('has-image');
      const img = preview.querySelector('img');
      if (img) img.remove();
      $('imgInput' + letter).value = '';
    });
    $('createQ').value = '';
    $('createAns').value = '';
    showToast(`Pergunta de imagem guardada! (${disc})`);
    return;
  }

  // ── MÚLTIPLA ESCOLHA ou V/F (texto) ──
  const a = $('createA').value.trim();
  const b = $('createB').value.trim();
  const c = createAnswerType === 'vf' ? 'N/A' : $('createC').value.trim();
  const d = createAnswerType === 'vf' ? 'N/A' : $('createD').value.trim();

  if (!a || !b) return showToast('Preencha pelo menos as alternativas A e B.');
  if (createAnswerType !== 'vf' && (!c || !d)) return showToast('Preencha todos os campos da pergunta.');
  if (!ans) return showToast('Selecione a resposta correcta.');

  loadLocalDB();
  const entry = {
    id:        'local_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
    disc, cat, question: q,
    a, b,
    c: createAnswerType === 'vf' ? '' : c,
    d: createAnswerType === 'vf' ? '' : d,
    answer:    ans,
    answerType: createAnswerType,
    diff:      'médio',
    mode:      createQuizMode,
    createdAt: Date.now(),
    uid:       State.user?.uid || 'anon'
  };
  State.localDB.push(entry);
  saveLocalDB(State.localDB);
  updateCreateCounter();

  $('createQ').value = '';
  $('createA').value = '';
  $('createB').value = '';
  if (createAnswerType !== 'vf') {
    $('createC').value = '';
    $('createD').value = '';
  }
  $('createAns').value = '';

  showToast(`Pergunta guardada! (${disc})`);
};

// ─── UPLOAD PARA NUVEM DESACTIVADO ────────────────────────
// Perguntas criadas pelo utilizador ficam APENAS localmente.
// O botão foi removido do interface; este handler é mantido
// como salvaguarda caso seja invocado por outro meio.
// $('uploadToCloudBtn') já não existe no DOM.

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
    const cloudQs = Object.values(data);

    // Preservar as perguntas criadas localmente pelo utilizador (têm id a começar por 'local_')
    loadLocalDB();
    const userLocalQs = State.localDB.filter(q => q.id && q.id.startsWith('local_'));

    // Mesclar: nuvem + locais do utilizador (sem duplicar IDs)
    const cloudIds = new Set(cloudQs.map(q => q.id));
    const merged = [...cloudQs, ...userLocalQs.filter(q => !cloudIds.has(q.id))];

    saveLocalDB(merged);
    LS.set('eq_last_sync', Date.now());
    hideLoading();
    $('localQCount').textContent  = merged.length;
    $('lastSyncDate').textContent = formatDate(Date.now());
    showToast(`${cloudQs.length} perguntas transferidas da nuvem! (+ ${userLocalQs.length} suas locais preservadas)`);
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
    // Contar apenas as perguntas da nuvem (excluir as criadas localmente pelo utilizador)
    const syncedCount = State.localDB.filter(q => !q.id || !q.id.startsWith('local_')).length;
    if (cloudCount > syncedCount) {
      showUpdateBanner(cloudCount - syncedCount);
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

// ══════════════════════════════════════════════════════════
// LOJA DE PACOTES
// ══════════════════════════════════════════════════════════

// Dados de pagamento fixos
const PAG_INFO = {
  mcxNumero:   '938 882 190',
  atmEntidade: '00930',
  atmRef:      '938 882 190',
  banco:       'Banco BAI (Banco Angolano de Investimento)',
  titular:     'Dário Faustino Bande',
  whatsapp:    '244938882190',
};

const LOJA_NOTIF_KEY = 'bandapp_loja_notif_seen';
let lojaFiltroAtual = 'todos';
let pacoteAtual = null;
let _catalogoCache = null;

// ── Carregar pacotes do Firebase ─────────────────────────
async function carregarCatalogo() {
  if (_catalogoCache) return _catalogoCache;
  try {
    const snap = await db.ref('pacotes').once('value');
    const data = snap.val();
    if (!data) return [];
    _catalogoCache = Object.values(data).sort((a, b) => (b.lancamento || '').localeCompare(a.lancamento || ''));
    return _catalogoCache;
  } catch (e) {
    console.error('Erro ao carregar pacotes:', e);
    return [];
  }
}

function abrirLoja() {
  showScreen('screen-loja');
  _catalogoCache = null; // forçar reload ao abrir
  renderLojaGrid(lojaFiltroAtual);
}

async function renderLojaGrid(filtro) {
  const grid = $('lojaGrid');
  const loading = $('lojaLoading');
  if (loading) loading.style.display = 'flex';

  // Limpar cards antigos
  Array.from(grid.children).forEach(c => {
    if (!c.id || c.id !== 'lojaLoading') c.remove();
  });

  const catalogo = await carregarCatalogo();
  if (loading) loading.style.display = 'none';

  const lista = filtro === 'todos'
    ? catalogo
    : catalogo.filter(p => p.categoria === filtro);

  if (lista.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'loja-empty';
    empty.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3z"/></svg><p>Nenhum pacote nesta categoria ainda.</p>`;
    grid.appendChild(empty);
    return;
  }

  lista.forEach(p => {
    const card = document.createElement('div');
    card.className = 'pacote-card';
    card.dataset.id = p.id;

    const tagClass = { concurso: 'tag-concurso', prova: 'tag-prova', exame: 'tag-exame' }[p.categoria] || 'tag-todos';
    const tagLabel = { concurso: 'Concurso', prova: 'Prova', exame: 'Exame' }[p.categoria] || p.categoria;

    const capaHTML = p.capa
      ? `<img src="${p.capa}" alt="${p.titulo}" class="pacote-card-cover">`
      : `<div class="pacote-card-cover-placeholder"><svg viewBox="0 0 24 24"><path d="M19 6h-2c0-2.76-2.24-5-5-5S7 3.24 7 6H5c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-7-3c1.66 0 3 1.34 3 3H9c0-1.66 1.34-3 3-3zm0 10c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg></div>`;

    card.innerHTML = `
      ${capaHTML}
      ${p.novo ? '<span class="pacote-new-badge">Novo</span>' : ''}
      <div class="pacote-card-body">
        <span class="pacote-card-tag ${tagClass}">${tagLabel}</span>
        <div class="pacote-card-title">${p.titulo}</div>
        <div class="pacote-card-desc">${p.descricao}</div>
        <div class="pacote-card-footer">
          <div class="pacote-card-price">
            <span>Preço</span>
            ${Number(p.preco).toLocaleString('pt-AO')} AOA
          </div>
          <button class="btn-ver-pacote">Ver <svg viewBox="0 0 24 24"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg></button>
        </div>
      </div>`;

    card.onclick = () => abrirDetalhe(p);
    grid.appendChild(card);
  });
}

document.querySelectorAll('.loja-filter').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.loja-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    lojaFiltroAtual = btn.dataset.filter;
    renderLojaGrid(lojaFiltroAtual);
  };
});

function abrirDetalhe(pacote) {
  pacoteAtual = pacote;

  const coverImg = $('pacoteCoverImg');
  if (pacote.capa) {
    coverImg.src = pacote.capa;
    coverImg.style.display = 'block';
  } else {
    coverImg.src = '';
    coverImg.style.display = 'none';
  }

  $('pacoteCoverBadge').textContent = { concurso: 'Concurso', prova: 'Prova', exame: 'Exame' }[pacote.categoria] || pacote.categoria;
  $('pacoteDetailTitle').textContent = pacote.titulo;
  $('pacoteQtd').innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg> ${pacote.qtd} questões`;
  $('pacoteDisc').innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 3L1 9l11 6 9-4.91V17h2V9M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg> ${pacote.disciplina}`;
  $('pacoteDesc').textContent = pacote.descricao;
  $('pacotePrice').textContent = `${Number(pacote.preco).toLocaleString('pt-AO')} AOA`;

  const ul = $('pacoteIncludesList');
  ul.innerHTML = '';
  const inclui = Array.isArray(pacote.inclui)
    ? pacote.inclui
    : Object.values(pacote.inclui || {});
  inclui.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.appendChild(li);
  });

  showScreen('screen-pacote');
}

function abrirPagamento(pacote) {
  const coverEl = $('pagPacoteCover');
  if (pacote.capa) { coverEl.src = pacote.capa; coverEl.style.display = 'block'; }
  else { coverEl.style.display = 'none'; }

  $('pagPacoteTitle').textContent = pacote.titulo;
  $('pagPacotePrice').textContent = `${Number(pacote.preco).toLocaleString('pt-AO')} AOA`;

  const ts = Date.now().toString().slice(-6);

  // Multicaixa Express — número fixo
  $('mcxRef').textContent = PAG_INFO.mcxNumero;
  $('mcxAmount').textContent = `${Number(pacote.preco).toLocaleString('pt-AO')} AOA`;

  // ATM — entidade e referência fixas
  $('atmEntidade').textContent = PAG_INFO.atmEntidade;
  $('atmRef').textContent = PAG_INFO.atmRef;
  $('atmAmount').textContent = `${Number(pacote.preco).toLocaleString('pt-AO')} AOA`;

  // Transferência bancária
  $('trfAmount').textContent = `${Number(pacote.preco).toLocaleString('pt-AO')} AOA`;
  $('trfDesc').textContent = `BANDAPP-${(pacote.id || 'PKT').toUpperCase()}-${ts}`;

  // Abrir MCX por defeito
  $('bodyMCX').style.display = 'block';
  $('pagMethodMCX').classList.add('open');
  $('bodyATM').style.display = 'none';
  $('pagMethodATM').classList.remove('open');
  $('bodyTRF').style.display = 'none';
  $('pagMethodTRF').classList.remove('open');

  showScreen('screen-pagamento');
}

['MCX','ATM','TRF'].forEach(m => {
  const card = $('pagMethod' + m);
  const body = $('body' + m);
  if (!card || !body) return;
  card.querySelector('.pag-method-header').onclick = () => {
    const isOpen = card.classList.contains('open');
    ['MCX','ATM','TRF'].forEach(x => {
      $('pagMethod' + x).classList.remove('open');
      $('body' + x).style.display = 'none';
    });
    if (!isOpen) {
      card.classList.add('open');
      body.style.display = 'block';
    }
  };
});

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg> Copiado!';
    setTimeout(() => { btn.innerHTML = orig; }, 2000);
  }).catch(() => showToast('Não foi possível copiar.'));
}

$('copyMcxRef').onclick = () => copyToClipboard($('mcxRef').textContent.trim(), $('copyMcxRef'));
$('copyAtmRef').onclick = () => copyToClipboard(`Entidade: ${$('atmEntidade').textContent} | Ref: ${$('atmRef').textContent}`, $('copyAtmRef'));
$('copyIban').onclick   = () => copyToClipboard($('ttrfIban').textContent.trim(), $('copyIban'));

$('btnEnviarComprovativo').onclick = () => {
  const titulo = pacoteAtual ? pacoteAtual.titulo : 'Pacote';
  const valor  = pacoteAtual ? `${Number(pacoteAtual.preco).toLocaleString('pt-AO')} AOA` : '';
  const desc   = $('trfDesc').textContent;
  const msg = encodeURIComponent(`Olá! Gostaria de enviar o comprovativo de pagamento.\n\nPacote: ${titulo}\nValor: ${valor}\nReferência: ${desc}`);
  window.open(`https://wa.me/${PAG_INFO.whatsapp}?text=${msg}`, '_blank');
};

$('btnComprarPacote').onclick = () => { if (pacoteAtual) abrirPagamento(pacoteAtual); };

$('lojaBackBtn').onclick   = () => showScreen('screen-mainmenu');
$('pacoteBackBtn').onclick = () => abrirLoja();
$('pagBackBtn').onclick    = () => showScreen('screen-pacote');
$('btnLoja').onclick       = () => abrirLoja();

// ── Notificação de novo pacote ───────────────────────────
async function verificarNotifNovoPacote() {
  const catalogo = await carregarCatalogo();
  const seen = JSON.parse(localStorage.getItem(LOJA_NOTIF_KEY) || '[]');
  const novos = catalogo.filter(p => p.novo && !seen.includes(p.id));
  if (novos.length === 0) return;
  mostrarNotifPacote(novos[0]);
}

function mostrarNotifPacote(pacote) {
  const banner = $('notifPacoteBanner');
  if (!banner) return;
  banner.querySelector('.notif-pacote-text strong').textContent = `Novo pacote: ${pacote.titulo}`;
  banner.querySelector('.notif-pacote-text span').textContent = `${Number(pacote.preco).toLocaleString('pt-AO')} AOA · ${pacote.qtd} questões`;
  banner.classList.add('show');

  banner.querySelector('.notif-pacote-btn').onclick = () => {
    banner.classList.remove('show');
    marcarNotifVista(pacote.id);
    abrirDetalhe(pacote);
  };
  banner.querySelector('.notif-pacote-close').onclick = () => {
    banner.classList.remove('show');
    marcarNotifVista(pacote.id);
  };
  setTimeout(() => banner.classList.remove('show'), 8000);
}

function marcarNotifVista(id) {
  const seen = JSON.parse(localStorage.getItem(LOJA_NOTIF_KEY) || '[]');
  if (!seen.includes(id)) { seen.push(id); localStorage.setItem(LOJA_NOTIF_KEY, JSON.stringify(seen)); }
}

setTimeout(() => verificarNotifNovoPacote(), 3000);

// ══════════════════════════════════════════════════════════
// JOGO DE PACOTE
// ══════════════════════════════════════════════════════════

// Estado do jogo de pacote
const PacoteGame = {
  timerSecs: 0,
  maxQtd: 20,
};

// Selectors do modal de setup
document.querySelectorAll('.pkg-timer').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.pkg-timer').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    PacoteGame.timerSecs = parseInt(btn.dataset.seconds);
  };
});
document.querySelectorAll('.pkg-qtd').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.pkg-qtd').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    PacoteGame.maxQtd = parseInt(btn.dataset.qtd); // 0 = todas
  };
});
$('pacoteSetupCancelar').onclick = () => $('pacoteSetupOverlay').classList.remove('show');
$('pacoteSetupOverlay').onclick  = (e) => { if (e.target === $('pacoteSetupOverlay')) $('pacoteSetupOverlay').classList.remove('show'); };

$('pacoteSetupConfirmar').onclick = () => {
  $('pacoteSetupOverlay').classList.remove('show');
  iniciarJogoPacote();
};

// Verificar se o utilizador tem acesso a um pacote
async function verificarAcessoPacote(pkgId) {
  const uid  = State.user?.uid;
  const email = State.profile?.email || State.user?.email || '';
  const phone = State.profile?.phone || '';
  if (!uid) return false;

  // Verificar via userAccess (chave composta por identifier__pkgId)
  const identifiers = [uid, email, phone].filter(Boolean);
  for (const id of identifiers) {
    const key = id.replace(/[@.+#$[\]/]/g, '_') + '__' + pkgId;
    const snap = await db.ref('userAccess/' + key).once('value');
    if (snap.exists() && snap.val().status === 'active') return true;
  }
  return false;
}

// Abrir modal de setup de jogo do pacote
async function jogarPacote(pacote) {
  $('pacoteSetupTitle').textContent = pacote.titulo || 'Jogar Pacote';
  $('pacoteSetupMsg').textContent   = `${pacote.qtd || '?'} questões disponíveis neste pacote.`;
  // Reset defaults
  PacoteGame.timerSecs = 0;
  PacoteGame.maxQtd    = 20;
  document.querySelectorAll('.pkg-timer').forEach(b => b.classList.toggle('active', b.dataset.seconds === '0'));
  document.querySelectorAll('.pkg-qtd').forEach(b => b.classList.toggle('active', b.dataset.qtd === '20'));
  $('pacoteSetupOverlay').classList.add('show');
}

// Iniciar o jogo depois de confirmar no modal
async function iniciarJogoPacote() {
  if (!pacoteAtual) return;
  const pkgId = pacoteAtual.id;
  showLoading('A carregar questões do pacote...');
  try {
    const snap = await db.ref('pacoteQuestions/' + pkgId).once('value');
    const data = snap.val();
    if (!data) {
      hideLoading();
      showToast('Este pacote ainda não tem questões carregadas.');
      return;
    }

    let qs = Object.values(data);

    // Misturar todos os tipos aleatoriamente (multipla, vf, lacunas, flashcard)
    const allowedTypes = ['multipla', 'vf', 'lacunas', 'flashcard'];
    const buckets = {};
    allowedTypes.forEach(t => { buckets[t] = []; });
    qs.forEach(q => {
      const t = q.answerType || 'multipla';
      if (buckets[t]) buckets[t].push(q);
      else buckets['multipla'].push(q);
    });
    allowedTypes.forEach(t => { buckets[t] = shuffle(buckets[t]); });

    // Intercalar (round-robin) para mistura equilibrada
    const mixed = [];
    let safety = 0;
    while (mixed.length < qs.length && safety < 50000) {
      safety++;
      let added = false;
      for (const t of allowedTypes) {
        if (buckets[t].length > 0) { mixed.push(buckets[t].shift()); added = true; }
      }
      if (!added) break;
    }

    // Limitar pelo nº de perguntas configurado
    const max = PacoteGame.maxQtd > 0 ? PacoteGame.maxQtd : mixed.length;
    const pool = mixed.slice(0, max);

    hideLoading();
    if (pool.length === 0) {
      showToast('Nenhuma questão disponível neste pacote.');
      return;
    }

    // Guardar config do timer no State global para o motor de jogo usar
    State.timerSecs    = PacoteGame.timerSecs;
    State.currentMode  = pacoteAtual.categoria || 'aprendizado';
    State.currentMode  = State.currentMode === 'exame' ? 'prova' : State.currentMode;
    // Flashcards só em aprendizado/exame; para concurso filtrar
    let finalPool = pool;
    if (State.currentMode === 'concurso') {
      finalPool = pool.filter(q => (q.answerType || 'multipla') !== 'flashcard');
    }
    if (finalPool.length === 0) finalPool = pool; // fallback

    startGame(finalPool);
  } catch (e) {
    hideLoading();
    showToast('Erro ao carregar questões: ' + e.message);
  }
}

// ── Injectar botão Jogar no card da loja (quando ativado) ──
async function atualizarBotaoCard(card, pacote) {
  const ativo = await verificarAcessoPacote(pacote.id);
  const btn = card.querySelector('.btn-ver-pacote');
  if (!btn) return;
  if (ativo) {
    btn.classList.add('btn-ver-pacote-jogar');
    btn.innerHTML = `Jogar <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    btn.onclick = (e) => { e.stopPropagation(); pacoteAtual = pacote; jogarPacote(pacote); };
  } else {
    btn.onclick = (e) => { e.stopPropagation(); abrirDetalhe(pacote); };
  }
}

$('btnJogarPacote').onclick = () => { if (pacoteAtual) jogarPacote(pacoteAtual); };


(function init() {
  loadLocalDB();
  loadRankingLocal();
  injectCustomDiscsIntoSetup(); // Carregar disciplinas personalizadas no selector do jogo
  showScreen('screen-splash');
})();
