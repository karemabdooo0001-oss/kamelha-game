const socket = io();

// توليد رقم فريد دائم للجهاز (مثل: WL-4821)
let myPlayerId = localStorage.getItem('kamelha_uid');
if (!myPlayerId) {
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  myPlayerId = 'WL-' + randomNum;
  localStorage.setItem('kamelha_uid', myPlayerId);
}

const gateScreen = document.getElementById('gate-screen');
const gatePassInput = document.getElementById('gate-pass-input');
const btnSubmitGate = document.getElementById('btn-submit-gate');

const lobbyScreen = document.getElementById('lobby-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');
const toastBanner = document.getElementById('toast-banner');

const displayMyUid = document.getElementById('display-my-uid');
if (displayMyUid) displayMyUid.innerText = myPlayerId;

// ================= فحص التذكرة عند الدخول =================
const urlParams = new URLSearchParams(window.location.search);
const ticketInUrl = urlParams.get('pass') || urlParams.get('ticket');

if (ticketInUrl) {
  socket.emit('verifyGatePasscode', { passcode: ticketInUrl, playerId: myPlayerId });
} else {
  const savedTicket = sessionStorage.getItem('kamelha_gate_ticket');
  if (savedTicket) {
    socket.emit('verifyGatePasscode', { passcode: savedTicket, playerId: myPlayerId });
  }
}

if (btnSubmitGate) {
  btnSubmitGate.onclick = () => {
    const code = gatePassInput.value.trim();
    if (!code) return alert('من فضلك اكتب كود التذكرة أولاً!');
    socket.emit('verifyGatePasscode', { passcode: code, playerId: myPlayerId });
  };
}

socket.on('gateAccessGranted', (data) => {
  const code = (data && data.voucherCode) ? data.voucherCode : 'active';
  sessionStorage.setItem('kamelha_gate_ticket', code);

  gateScreen.classList.add('hidden');
  lobbyScreen.classList.remove('hidden');
});

socket.on('gateAccessDenied', (errMsg) => {
  sessionStorage.removeItem('kamelha_gate_ticket');
  alert(errMsg || 'كود التذكرة غير صحيح أو منتهي الصلاحية! تواصل مع المطور Wello_0: 01121040020');
});

socket.on('bannedKickNotification', () => {
  document.body.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#0d0914;color:#fff;text-align:center;font-family:'Cairo',sans-serif;padding:20px;">
      <div style="background:#1a162b;border:2px solid #ff1744;padding:30px;border-radius:20px;max-width:400px;box-shadow:0 0 30px rgba(255,23,68,0.5);">
        <h1 style="color:#ff1744;font-size:3rem;margin-bottom:10px;">🚫</h1>
        <h2 style="color:#ff1744;margin-bottom:10px;">تم حظرك من اللعبة!</h2>
        <p style="color:#ccc;font-size:0.95rem;line-height:1.6;">تم حظر جهازك ورقمك التعريفي (<b style="color:#ffcc00;">${myPlayerId}</b>) بواسطة المطور <b>Wello_0</b>.</p>
        <p style="color:#777;font-size:0.8rem;margin-top:15px;">للاستفسار: 01121040020</p>
      </div>
    </div>
  `;
});

const savedName = localStorage.getItem('kamelha_name') || 'لاعب';
socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name: savedName });

// ================= نظام الصوت =================
const SoundManager = {
  ctx: null,
  muted: localStorage.getItem('kamelha_muted') === 'true',

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  },

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('kamelha_muted', this.muted);
    updateSoundIcons();
  },

  playTone(freq, type, duration, gainVal = 0.15) {
    if (this.muted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  },

  playDraw() { this.init(); this.playTone(320, 'sine', 0.15, 0.2); },
  playPlace() { this.init(); this.playTone(180, 'triangle', 0.1, 0.25); },
  playCommand() {
    this.init();
    if (this.muted || !this.ctx) return;
    [440, 554, 659].forEach((n, i) => setTimeout(() => this.playTone(n, 'sine', 0.2, 0.18), i * 70));
  },
  playTick() { this.init(); this.playTone(800, 'square', 0.05, 0.05); },
  playKamelha() {
    this.init();
    if (this.muted || !this.ctx) return;
    [523, 659, 783, 1046].forEach((f, i) => setTimeout(() => this.playTone(f, 'triangle', 0.35, 0.3), i * 110));
  },
  playWin() {
    this.init();
    if (this.muted || !this.ctx) return;
    [523, 659, 783, 1046, 1318].forEach((f, i) => setTimeout(() => this.playTone(f, 'sine', 0.5, 0.25), i * 120));
  }
};

window.addEventListener('click', () => SoundManager.init(), { once: true });
window.addEventListener('touchstart', () => SoundManager.init(), { once: true });

// DOM
const btnSoundLobby = document.getElementById('btn-sound-lobby');
const btnSoundGame = document.getElementById('btn-sound-game');
const btnRules = document.getElementById('btn-rules');
const btnBuy = document.getElementById('btn-buy');

const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const btnStart = document.getElementById('btn-start');
const btnKamelha = document.getElementById('btn-kamelha');
const btnLeave = document.getElementById('btn-leave');
const btnLeaveWaiting = document.getElementById('btn-leave-waiting');

const displayRoomCode = document.getElementById('display-room-code');
const gameRoomCodeTxt = document.getElementById('game-room-code-txt');
const btnCopyCodeWait = document.getElementById('btn-copy-code-wait');
const btnCopyCodeGame = document.getElementById('btn-copy-code-game');

const playersList = document.getElementById('players-list');
const playerCount = document.getElementById('player-count');
const waitMsg = document.getElementById('wait-msg');

const myHandDiv = document.getElementById('my-hand');
const topDiscardCardDiv = document.getElementById('top-discard-card');
const deckCounter = document.getElementById('deck-counter');
const currentPlayerName = document.getElementById('current-player-name');
const otherPlayersDiv = document.getElementById('other-players');
const drawDeckBtn = document.getElementById('draw-deck');
const discardDeckBtn = document.getElementById('discard-deck');

const timerSec = document.getElementById('timer-sec');
const timerBar = document.getElementById('timer-bar');

const modalOverlay = document.getElementById('modal-overlay');
const modalContainer = document.getElementById('modal-container');

let currentRoomId = localStorage.getItem('kamelha_room');
let isMyTurn = false;
let currentDrawnCard = null;
let latestGameState = null;
let timerInterval = null;

function updateSoundIcons() {
  const icon = SoundManager.muted ? '🔇' : '🔊';
  if (btnSoundLobby) btnSoundLobby.innerText = icon;
  if (btnSoundGame) btnSoundGame.innerText = icon;
}
updateSoundIcons();

if (btnSoundLobby) btnSoundLobby.addEventListener('click', () => SoundManager.toggleMute());
if (btnSoundGame) btnSoundGame.addEventListener('click', () => SoundManager.toggleMute());

if (btnRules) {
  btnRules.addEventListener('click', () => {
    openModal(`
      <h2 style="color:#ffcc00;margin-bottom:10px;">📖 قواعد لعبة كمّلها</h2>
      <div class="rules-scroll-content">
        <div class="rule-section">
          <h3>🎯 الهدف:</h3>
          <p>تجميع <b>4 كروت من نفس الرقم</b>. أول من يصل لـ <b>5 نقاط</b> يفوز بالمباراة!</p>
        </div>
        <div class="rule-section">
          <h3>🃏 النقاط:</h3>
          <p>• 4 كروت مطابقة بدون جوكر = <b>نقطتان</b>.</p>
          <p>• مع جوكر = <b>نقطة واحدة</b>.</p>
          <p>• 4 جواكر = <b>فوز فوري بالمباراة (5 نقاط)</b>!</p>
        </div>
        <div class="rule-section">
          <h3>🔒 قفل الحصانة:</h3>
          <p>من يقول <b>"كمّلتها"</b> يُقفل عليه بحصانة 🔒 ولا يمكن لأحد استهدافه بأي كوماند!</p>
        </div>
        <div class="rule-section">
          <h3>⚡ الكوماندز:</h3>
          <p>• <b>الجوكر:</b> بديل لأي رقم ويدخل اليد.</p>
          <p>• <b>اصطاد كارتك:</b> تطلب كارت أو جوكر وتبدله.</p>
          <p>• <b>لم كمالتك:</b> تختار أي كارت من الأرض المكشوفة.</p>
          <p>• <b>اعكس لفتك:</b> تعكس الدور (وفي 2 لاعبين تفوت دور الخصم).</p>
          <p>• <b>هو كدة:</b> تجبر لاعباً على تغيير كل كروته.</p>
          <p>• <b>رخم عليهم:</b> تتجسس على كارت الخصم وتبدله أو تبدل بين لاعبين.</p>
          <p>• <b>براحتك:</b> تتحول لأي كوماند تختاره.</p>
        </div>
      </div>
      <button class="btn primary-btn" onclick="closeModal()" style="margin-top:12px;">فهمت القواعد 👍</button>
    `);
  });
}

if (btnBuy) {
  btnBuy.addEventListener('click', () => {
    openModal(`
      <h2 style="color:#ffcc00;margin-bottom:6px;">📦 شراء التذاكر / النسخة الأصلية</h2>
      <div class="buy-card-info">
        <div class="brand-badge">Wello_0</div>
        <p class="phone-number-display">📞 01121040020</p>
        <p style="font-size:0.85rem;color:#aaa;margin-top:5px;">شراء تذاكر لعب أونلاين فردية أو لشلة + النسخة الورقية الحقيقية</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px;">
        <a href="https://wa.me/201121040020?text=أهلاً%20Wello_0،%20عايز%20أشتري%20تذكرة%20دخول%20للعبة%20كملها" target="_blank" class="btn whatsapp-btn">💬 تواصل عبر واتساب للشراء</a>
        <a href="tel:01121040020" class="btn call-btn">📞 اتصال هاتفي مباشر</a>
        <button class="btn secondary-btn" onclick="closeModal()">إغلاق</button>
      </div>
    `);
  });
}

window.addEventListener('load', () => {
  const savedName = localStorage.getItem('kamelha_name');
  if (savedName && playerNameInput) playerNameInput.value = savedName;

  if (currentRoomId) {
    socket.emit('reconnectPlayer', { roomId: currentRoomId, playerId: myPlayerId });
  }
});

socket.on('reconnectFailed', () => {
  localStorage.removeItem('kamelha_room');
  currentRoomId = null;
});

function showToast(msg) {
  toastBanner.innerText = msg;
  toastBanner.classList.remove('hidden');
  setTimeout(() => toastBanner.classList.add('hidden'), 4000);
}
socket.on('notify', msg => showToast(msg));
socket.on('errorMsg', msg => alert(msg));
socket.on('soundTrigger', (type) => {
  if (type === 'kamelha') SoundManager.playKamelha();
});

function copyRoomCode() {
  if (!currentRoomId) return;
  navigator.clipboard.writeText(currentRoomId).then(() => {
    showToast(`تم نسخ كود الغرفة: ${currentRoomId} 📋`);
  }).catch(() => prompt('انسخ كود الغرفة:', currentRoomId));
}
if (btnCopyCodeWait) btnCopyCodeWait.addEventListener('click', copyRoomCode);
if (btnCopyCodeGame) btnCopyCodeGame.addEventListener('click', copyRoomCode);

if (btnCreate) {
  btnCreate.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    if (!name) return alert('اكتب اسمك الأول!');
    localStorage.setItem('kamelha_name', name);
    socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name });
    socket.emit('createRoom', { playerName: name, playerId: myPlayerId });
  });
}

if (btnJoin) {
  btnJoin.addEventListener('click', () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim();
    if (!name || !code) return alert('اكتب اسمك وكود الغرفة!');
    localStorage.setItem('kamelha_name', name);
    socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name });
    socket.emit('joinRoom', { playerName: name, roomId: code, playerId: myPlayerId });
  });
}

socket.on('roomJoined', ({ roomId, players, isHost }) => {
  currentRoomId = roomId;
  localStorage.setItem('kamelha_room', roomId);

  if (lobbyScreen) lobbyScreen.classList.add('hidden');
  if (waitingScreen) waitingScreen.classList.remove('hidden');
  if (displayRoomCode) displayRoomCode.innerText = roomId;
  if (gameRoomCodeTxt) gameRoomCodeTxt.innerText = roomId;

  renderWaitingPlayers(players);
  if (isHost && btnStart) {
    btnStart.classList.remove('hidden');
    waitMsg.classList.add('hidden');
  }
});

socket.on('updatePlayers', players => renderWaitingPlayers(players));

function renderWaitingPlayers(players) {
  if (!playersList) return;
  playersList.innerHTML = '';
  if (playerCount) playerCount.innerText = players.length;
  players.forEach(p => {
    const li = document.createElement('li');
    li.innerText = `${p.isHost ? '👑 ' : ''}${p.name}`;
    playersList.appendChild(li);
  });
}

if (btnStart) btnStart.addEventListener('click', () => socket.emit('startGame', currentRoomId));

function leaveCurrentRoom() {
  if (confirm('هل أنت متأكد من الخروج من الغرفة؟')) {
    socket.emit('leaveRoom', currentRoomId);
    localStorage.removeItem('kamelha_room');
    location.reload();
  }
}
if (btnLeave) btnLeave.addEventListener('click', leaveCurrentRoom);
if (btnLeaveWaiting) btnLeaveWaiting.addEventListener('click', leaveCurrentRoom);

if (drawDeckBtn) {
  drawDeckBtn.addEventListener('click', () => {
    if (!isMyTurn) return alert('مش دورك دلوقتي!');
    if (currentDrawnCard) return alert('أنت سحبت كارت بالفعل!');
    SoundManager.playDraw();
    socket.emit('drawCard', currentRoomId);
  });
}

if (discardDeckBtn) {
  discardDeckBtn.addEventListener('click', () => {
    if (!isMyTurn) return alert('مش دورك دلوقتي!');
    if (currentDrawnCard) return alert('أنت سحبت كارت مقلوب بالفعل!');
    showToast('اضغط على كارت من إيدك لتبديله مع كارت الأرض!');
    pickCardFromHand(index => {
      SoundManager.playPlace();
      socket.emit('takeDiscardCard', { roomId: currentRoomId, handCardIndex: index });
    });
  });
}

if (btnKamelha) {
  btnKamelha.addEventListener('click', () => {
    SoundManager.playKamelha();
    socket.emit('callKamelha', currentRoomId);
  });
}

socket.on('cardDrawn', card => {
  currentDrawnCard = card;
  if (card.type === 'number' || card.cmdType === 'joker') {
    handleNumberOrJokerModal(card);
  } else {
    SoundManager.playCommand();
    handleCommandCardModal(card);
  }
});

function handleNumberOrJokerModal(card) {
  openModal(`
    <h2>الكارت المسحوب:</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(card)}</div>
    <p>ماذا تريد أن تفعل؟</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-discard" class="btn secondary-btn">ارميه على المكشوف 🗑️</button>
      <button id="btn-swap" class="btn primary-btn">بدله بكارت من إيدك 🔄</button>
    </div>
  `);

  document.getElementById('btn-discard').onclick = () => {
    closeModal();
    SoundManager.playPlace();
    socket.emit('discardDrawnCard', currentRoomId);
    currentDrawnCard = null;
  };

  document.getElementById('btn-swap').onclick = () => {
    closeModal();
    showToast('اختار الكارت اللي عايز ترميه من إيدك:');
    pickCardFromHand(index => {
      SoundManager.playPlace();
      socket.emit('swapWithHand', { roomId: currentRoomId, handCardIndex: index });
      currentDrawnCard = null;
    });
  };
}

function handleCommandCardModal(card) {
  const actions = {
    reverse: () => {
      currentDrawnCard = null;
      SoundManager.playCommand();
      socket.emit('execReverse', currentRoomId);
    },
    keda: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openPlayerPicker('اختار لاعباً لتبديل كل كروته:', targetId => {
        currentDrawnCard = null;
        SoundManager.playCommand();
        socket.emit('execKeda', { roomId: currentRoomId, targetPlayerId: targetId });
      });
    },
    bank: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openBankPicker();
    },
    hunt: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openHuntFlow();
    },
    annoy: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openAnnoyFlow();
    },
    wild: () => openWildFlow()
  };

  openModal(`
    <h2>سحبت كوماند: ${card.name}!</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(card)}</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-run-cmd" class="btn primary-btn">تفعيل الأمر الآن ⚡</button>
      <button id="btn-drop-cmd" class="btn secondary-btn">رميه بدون تفعيل 🗑️</button>
    </div>
  `);

  document.getElementById('btn-run-cmd').onclick = () => {
    closeModal();
    if (actions[card.cmdType]) actions[card.cmdType]();
  };
  document.getElementById('btn-drop-cmd').onclick = () => {
    closeModal();
    SoundManager.playPlace();
    socket.emit('discardDrawnCard', currentRoomId);
    currentDrawnCard = null;
  };
}

function cancelCommandExecution() {
  closeModal();
  currentDrawnCard = null;
  SoundManager.playPlace();
  socket.emit('cancelCommand', currentRoomId);
}

function openBankPicker() {
  const ground = latestGameState.discardPile;
  let html = '<h2>اختر أي كارت من الأرض:</h2><div class="modal-grid">';
  ground.forEach((c, idx) => {
    html += `<div class="bank-pick-card" data-idx="${idx}">${createCardHTML(c)}</div>`;
  });
  html += '</div>';
  html += '<button id="btn-cancel-bank" class="btn secondary-btn" style="margin-top:10px;">إلغاء ورمي الكارت ❌</button>';
  openModal(html);

  document.getElementById('btn-cancel-bank').onclick = cancelCommandExecution;

  document.querySelectorAll('.bank-pick-card').forEach(el => {
    el.onclick = () => {
      const discardIdx = parseInt(el.getAttribute('data-idx'));
      closeModal();
      showToast('اختار كارت من إيدك لوضعه مكانه:');
      pickCardFromHand(handIdx => {
        currentDrawnCard = null;
        SoundManager.playPlace();
        socket.emit('execBank', { roomId: currentRoomId, discardIndex: discardIdx, handCardIndex: handIdx });
      });
    };
  });
}

function openHuntFlow() {
  openPlayerPicker('اختر لاعباً لتصطاد منه:', targetId => {
    let html = `<h2>اختر الكارت الذي تبحث عنه:</h2><div class="hunt-grid">`;
    for (let i = 1; i <= 10; i++) {
      html += `<button class="btn secondary-btn hunt-num-btn" data-val="${i}">${i}</button>`;
    }
    html += `</div>`;
    html += `<button class="btn primary-btn hunt-num-btn" style="margin-top:8px;background:#00bcd4;color:#fff;" data-val="joker">🃏 صيد كارت الجوكر</button>`;
    html += `<button id="btn-cancel-hunt" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت ❌</button>`;
    openModal(html);

    document.getElementById('btn-cancel-hunt').onclick = cancelCommandExecution;

    document.querySelectorAll('.hunt-num-btn').forEach(b => {
      b.onclick = () => {
        const item = b.getAttribute('data-val');
        closeModal();
        showToast('اختر كارت من إيدك لتعطيه له في المقابل:');
        pickCardFromHand(handIdx => {
          currentDrawnCard = null;
          SoundManager.playCommand();
          socket.emit('execHunt', {
            roomId: currentRoomId,
            targetPlayerId: targetId,
            requestedItem: item,
            handCardIndexToGive: handIdx
          });
        });
      };
    });
  });
}

function openAnnoyFlow() {
  const others = latestGameState.players.filter(p => p.id !== socket.id && !p.isImmune);
  if (others.length === 0) {
    alert('الخصوم جميعاً قالوا كملها ومحميون بقفل الحصانة! 🔒');
    cancelCommandExecution();
    return;
  }

  if (others.length === 1 && latestGameState.players.length === 2) {
    socket.emit('peekAnnoy2P', currentRoomId);
  } else {
    let html = '<h2>اختر لاعبين للتبديل بينهما:</h2>';
    others.forEach(p => {
      html += `<button class="btn secondary-btn annoy-p-btn" style="margin-bottom:8px;" data-id="${p.id}">${p.name}</button>`;
    });
    html += `<button id="btn-cancel-annoy" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت ❌</button>`;
    openModal(html);

    document.getElementById('btn-cancel-annoy').onclick = cancelCommandExecution;

    let selected = [];
    document.querySelectorAll('.annoy-p-btn').forEach(btn => {
      btn.onclick = () => {
        selected.push(btn.getAttribute('data-id'));
        btn.disabled = true;
        btn.style.opacity = '0.5';
        if (selected.length === 2) {
          closeModal();
          currentDrawnCard = null;
          SoundManager.playCommand();
          socket.emit('execAnnoyMulti', { roomId: currentRoomId, playerAId: selected[0], playerBId: selected[1] });
        }
      };
    });
  }
}

socket.on('annoy2PPeekResult', (peekedCard) => {
  openModal(`
    <h2>كارت الخصم المسحوب:</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(peekedCard)}</div>
    <p>هل يعجبك وتريد تبديله بكارت من يدك؟</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-annoy-swap" class="btn primary-btn">نعم، بدله بكارت من إيدي 🔄</button>
      <button id="btn-annoy-keep" class="btn secondary-btn">لا، اتركه مكانه للخصم ❌</button>
    </div>
  `);

  document.getElementById('btn-annoy-swap').onclick = () => {
    closeModal();
    showToast('اختر كارت من يدك لإعطائه للخصم:');
    pickCardFromHand(handIdx => {
      currentDrawnCard = null;
      SoundManager.playPlace();
      socket.emit('resolveAnnoy2P', { roomId: currentRoomId, swap: true, handCardIndexToGive: handIdx });
    });
  };

  document.getElementById('btn-annoy-keep').onclick = () => {
    closeModal();
    currentDrawnCard = null;
    socket.emit('resolveAnnoy2P', { roomId: currentRoomId, swap: false });
  };
});

function openWildFlow() {
  openModal(`
    <h2>كارت براحتك!</h2>
    <p>اختر أي كوماند تريد تحويله إليه:</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn primary-btn wild-opt" data-type="hunt">اصطاد كارتك 🎯</button>
      <button class="btn primary-btn wild-opt" data-type="bank">لم كمالتك 🏛️</button>
      <button class="btn primary-btn wild-opt" data-type="reverse">اعكس لفتك 🔄</button>
      <button class="btn primary-btn wild-opt" data-type="keda">هو كدة 😎</button>
      <button class="btn primary-btn wild-opt" data-type="annoy">رخم عليهم 😈</button>
      <button id="btn-cancel-wild" class="btn secondary-btn" style="margin-top:5px;">إلغاء ورمي الكارت ❌</button>
    </div>
  `);

  document.getElementById('btn-cancel-wild').onclick = cancelCommandExecution;

  document.querySelectorAll('.wild-opt').forEach(btn => {
    btn.onclick = () => {
      const type = btn.getAttribute('data-type');
      closeModal();
      SoundManager.playCommand();
      socket.emit('execWildAs', { roomId: currentRoomId, chosenCmdType: type });
    };
  });
}

socket.on('wildTransformed', card => handleCommandCardModal(card));

function openPlayerPicker(title, onSelect) {
  const others = latestGameState.players.filter(p => p.id !== socket.id && !p.isImmune);
  if (others.length === 0) {
    alert('جميع اللاعبين قالوا كملها ومحميون بقفل الحصانة! 🔒');
    cancelCommandExecution();
    return;
  }

  let html = `<h2>${title}</h2>`;
  others.forEach(p => {
    html += `<button class="btn primary-btn pick-target-btn" style="margin-bottom:8px;" data-id="${p.id}">${p.name}</button>`;
  });
  html += `<button id="btn-cancel-picker" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت ❌</button>`;
  openModal(html);

  document.getElementById('btn-cancel-picker').onclick = cancelCommandExecution;

  document.querySelectorAll('.pick-target-btn').forEach(b => {
    b.onclick = () => {
      closeModal();
      onSelect(b.getAttribute('data-id'));
    };
  });
}

function pickCardFromHand(callback) {
  const cards = myHandDiv.querySelectorAll('.card');
  cards.forEach((cardEl, index) => {
    cardEl.classList.add('selectable');
    cardEl.onclick = () => {
      cards.forEach(c => {
        c.classList.remove('selectable');
        c.onclick = null;
      });
      callback(index);
    };
  });
}

function openModal(html) {
  if (modalContainer && modalOverlay) {
    modalContainer.innerHTML = html;
    modalOverlay.classList.remove('hidden');
  }
}
function closeModal() {
  if (modalOverlay) modalOverlay.classList.add('hidden');
}

function updateTurnTimer(deadline, totalSeconds) {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    if (timerSec) timerSec.innerText = remaining;

    if (remaining <= 3 && remaining > 0) {
      SoundManager.playTick();
    }

    if (timerBar) {
      const percentage = Math.max(0, (remaining / totalSeconds) * 100);
      timerBar.style.width = percentage + '%';

      if (percentage > 50) {
        timerBar.style.background = '#00e676';
      } else if (percentage > 25) {
        timerBar.style.background = '#ffcc00';
      } else {
        timerBar.style.background = '#ff3d00';
      }
    }

    if (remaining <= 0) {
      clearInterval(timerInterval);
    }
  }, 200);
}

socket.on('gameState', data => {
  latestGameState = data;
  if (!data.hasDrawn) currentDrawnCard = null;

  if (waitingScreen) waitingScreen.classList.add('hidden');
  if (gameScreen) gameScreen.classList.remove('hidden');

  if (data.roomId && gameRoomCodeTxt) {
    gameRoomCodeTxt.innerText = data.roomId;
    currentRoomId = data.roomId;
  }

  isMyTurn = data.currentTurn === socket.id;
  if (currentPlayerName) {
    currentPlayerName.innerText = isMyTurn ? 'أنت (دورك)!' : data.currentTurnName;
    currentPlayerName.parentElement.style.background = isMyTurn ? '#00e676' : '#ffcc00';
  }

  if (data.turnDeadline) {
    updateTurnTimer(data.turnDeadline, data.turnDuration || 15);
  }

  if (deckCounter) deckCounter.innerText = data.deckCount;

  if (data.topDiscard && topDiscardCardDiv) {
    topDiscardCardDiv.innerHTML = createCardHTML(data.topDiscard);
  }

  if (myHandDiv) {
    myHandDiv.innerHTML = '';
    data.hand.forEach(c => {
      const el = document.createElement('div');
      el.innerHTML = createCardHTML(c);
      myHandDiv.appendChild(el.firstElementChild);
    });
  }

  const maxScore = Math.max(...data.players.map(p => p.points));

  if (otherPlayersDiv) {
    otherPlayersDiv.innerHTML = '';
    data.players.forEach(p => {
      const badge = document.createElement('div');
      badge.className = `player-score-chip ${p.id === data.currentTurn ? 'active-turn' : ''} ${p.isImmune ? 'immune-player' : ''}`;
      
      const hasTrophy = p.points > 0 && p.points === maxScore;
      const trophyIcon = hasTrophy ? '🏆 ' : '';

      badge.innerHTML = `
        <span class="chip-name">
          ${p.isHost ? '👑 ' : ''}${p.name} ${p.id === socket.id ? '(أنت)' : ''}
          ${p.isImmune ? '<b class="lock-tag">🔒 محمي</b>' : ''}
        </span>
        <span class="chip-score ${hasTrophy ? 'leader-score' : ''}">${trophyIcon}${p.points}ن</span>
      `;
      otherPlayersDiv.appendChild(badge);
    });
  }
});

socket.on('roundEnded', ({ msg, revealedHands }) => {
  clearInterval(timerInterval);
  currentDrawnCard = null;
  SoundManager.playKamelha();

  let html = `<h2>نهاية الجولة! 🏁</h2>`;
  html += `<p style="white-space:pre-line;font-weight:bold;color:#ffcc00;">${msg}</p>`;
  html += `<h3>كروت اللاعبين في هذه الجولة:</h3><div class="revealed-container">`;

  revealedHands.forEach(p => {
    html += `
      <div class="revealed-player-row">
        <span class="rev-name">${p.isHost ? '👑 ' : ''}${p.name} (${p.points} نقطة):</span>
        <div class="rev-cards">${p.hand.map(c => createCardHTML(c)).join('')}</div>
      </div>
    `;
  });
  html += `</div><p style="font-size:0.85rem;color:#aaa;">الجولة التالية ستبدأ خلال ثوانٍ...</p>`;
  openModal(html);
  setTimeout(() => closeModal(), 8000);
});

socket.on('gameOver', ({ winnerName, scores, revealedHands, reason }) => {
  clearInterval(timerInterval);
  currentDrawnCard = null;
  SoundManager.playWin();

  let html = `
    <h1 style="color:#ffcc00;font-size:2.2rem;">مبروووك! 👑</h1>
    <h2>الفائز بالمباراة: ${winnerName}</h2>
    <p style="color:#00e676;font-weight:bold;margin:8px 0;">${reason || 'أول من وصل إلى 5 نقاط وفاز بالجيم!'}</p>
  `;
  if (revealedHands) {
    html += `<h3>كروت النهاية:</h3><div class="revealed-container">`;
    revealedHands.forEach(p => {
      html += `
        <div class="revealed-player-row">
          <span class="rev-name">${p.isHost ? '👑 ' : ''}${p.name}:</span>
          <div class="rev-cards">${p.hand.map(c => createCardHTML(c)).join('')}</div>
        </div>
      `;
    });
    html += `</div>`;
  }
  html += `<button onclick="localStorage.removeItem('kamelha_room');location.reload();" class="btn primary-btn" style="margin-top:15px;">العودة للرئيسية</button>`;
  openModal(html);
});

function createCardHTML(card) {
  if (card.type === 'number') {
    return `<div class="card card-num num-${card.value}"><div class="circle-badge">${card.value}</div></div>`;
  } else if (card.type === 'command') {
    return `<div class="card card-cmd cmd-${card.cmdType}"><span>${card.name}</span></div>`;
  }
  return '';
}