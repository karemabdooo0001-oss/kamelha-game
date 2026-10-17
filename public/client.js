const socket = io();

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

const targetPointsInput = document.getElementById('target-points-input');
const maxRoundsInput = document.getElementById('max-rounds-input');
const matchRulesTag = document.getElementById('match-rules-tag');

const deckModeSelect = document.getElementById('deck-mode-select');
const customCommandsBox = document.getElementById('custom-commands-box');

const commandSplash = document.getElementById('command-splash');
const splashIcon = document.getElementById('splash-icon');
const splashTitle = document.getElementById('splash-title');
const splashPlayer = document.getElementById('splash-player');

const spotTop = document.getElementById('spot-top');
const spotLeft = document.getElementById('spot-left');
const spotRight = document.getElementById('spot-right');
const spotBottom = document.getElementById('spot-bottom');

const myNameDisplay = document.getElementById('my-name-display');
const myScoreDisplay = document.getElementById('my-score-display');
const messyDiscardPile = document.getElementById('messy-discard-pile');

const modalOverlay = document.getElementById('modal-overlay');
const modalContainer = document.getElementById('modal-container');

// إتاحة دوال النوافذ للـ HTML مباشرة
window.openModal = function(html) {
  if (modalContainer && modalOverlay) {
    modalContainer.innerHTML = html;
    modalOverlay.classList.remove('hidden');
  }
};

window.closeModal = function() {
  if (modalOverlay) {
    modalOverlay.classList.add('hidden');
  }
};

// إظهار وإخفاء قائمة الكوماندز المخصصة في اللوبي مباشرة
function syncCustomCommandsVisibility() {
  if (deckModeSelect && customCommandsBox) {
    if (deckModeSelect.value === 'custom') {
      customCommandsBox.style.display = 'block';
    } else {
      customCommandsBox.style.display = 'none';
    }
  }
}
if (deckModeSelect) {
  deckModeSelect.addEventListener('change', syncCustomCommandsVisibility);
  syncCustomCommandsVisibility();
}

// أزرار الرجوع
const btnBackToGate = document.getElementById('btn-back-to-gate');
const btnBackToLobby = document.getElementById('btn-back-to-lobby');

if (btnBackToGate) {
  btnBackToGate.onclick = () => {
    sessionStorage.removeItem('kamelha_gate_ticket');
    if (lobbyScreen) lobbyScreen.classList.add('hidden');
    if (gateScreen) gateScreen.classList.remove('hidden');
  };
}

if (btnBackToLobby) {
  btnBackToLobby.onclick = () => {
    if (currentRoomId) {
      socket.emit('leaveRoom', currentRoomId);
      localStorage.removeItem('kamelha_room');
    }
    if (waitingScreen) waitingScreen.classList.add('hidden');
    if (lobbyScreen) lobbyScreen.classList.remove('hidden');
  };
}

// فحص التذاكر
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
    if (!code) return alert('أدخل كود التذكرة!');
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
  alert(errMsg || 'كود التذكرة غير صحيح! تواصل مع المطور: 01121040020');
});

socket.on('bannedKickNotification', () => {
  document.body.innerHTML = `
    <div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#0d0914;color:#fff;text-align:center;font-family:'Cairo',sans-serif;padding:20px;">
      <div style="background:#1a162b;border:2px solid #ff1744;padding:30px;border-radius:20px;max-width:400px;">
        <h2 style="color:#ff1744;">تم حظرك من اللعبة</h2>
        <p style="color:#ccc;">تم حظر جهازك ورقمك التعريفي (<b style="color:#ffcc00;">${myPlayerId}</b>) بواسطة Wello_0.</p>
      </div>
    </div>
  `;
});

const savedName = localStorage.getItem('kamelha_name') || 'لاعب';
socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name: savedName });

// محرك الصوت
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
  playShuffle() {
    this.init();
    for (let i = 0; i < 6; i++) {
      setTimeout(() => this.playTone(200 + Math.random() * 200, 'triangle', 0.08, 0.1), i * 60);
    }
  },
  playCommand() {
    this.init();
    if (this.muted || !this.ctx) return;
    [440, 554, 659, 880].forEach((n, i) => setTimeout(() => this.playTone(n, 'sine', 0.25, 0.2), i * 60));
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

const btnSoundLobby = document.getElementById('btn-sound-lobby');
const btnSoundGame = document.getElementById('btn-sound-game');
const btnBuy = document.getElementById('btn-buy');

const btnRulesGate = document.getElementById('btn-rules-gate');
const btnRulesLobby = document.getElementById('btn-rules-lobby');
const btnRulesWait = document.getElementById('btn-rules-wait');

const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const btnStart = document.getElementById('btn-start');
const btnKamelha = document.getElementById('btn-kamelha');
const btnLeave = document.getElementById('btn-leave');

const displayRoomCode = document.getElementById('display-room-code');
const gameRoomCodeTxt = document.getElementById('game-room-code-txt');
const btnCopyCodeWait = document.getElementById('btn-copy-code-wait');
const btnCopyCodeGame = document.getElementById('btn-copy-code-game');

const playersList = document.getElementById('players-list');
const playerCount = document.getElementById('player-count');
const waitMsg = document.getElementById('wait-msg');

const myHandDiv = document.getElementById('my-hand');
const deckCounter = document.getElementById('deck-counter');
const currentPlayerName = document.getElementById('current-player-name');
const drawDeckBtn = document.getElementById('draw-deck');
const discardDeckBtn = document.getElementById('discard-deck');

const timerSec = document.getElementById('timer-sec');
const timerBar = document.getElementById('timer-bar');

let currentRoomId = localStorage.getItem('kamelha_room');
let isMyTurn = false;
let currentDrawnCard = null;
let latestGameState = null;
let timerInterval = null;
let hasAlertedKamelhaReady = false;

function updateSoundIcons() {
  const icon = SoundManager.muted ? 'كتم' : 'صوت';
  if (btnSoundLobby) btnSoundLobby.innerText = icon;
  if (btnSoundGame) btnSoundGame.innerText = icon;
}
updateSoundIcons();

if (btnSoundLobby) btnSoundLobby.addEventListener('click', () => SoundManager.toggleMute());
if (btnSoundGame) btnSoundGame.addEventListener('click', () => SoundManager.toggleMute());

// موسوعة ودليل الكروت المصورة بالكامل
window.openCardEncyclopediaModal = function() {
  window.openModal(`
    <h2 style="color:#ffcc00;margin-bottom:8px;">دليل وقواعد لعبة كمّلها</h2>
    <div class="guide-container">
      <div class="guide-section-title">الهدف وطريقة المكسب:</div>
      <p style="font-size:0.8rem;color:#ccc;line-height:1.4;">
        تجميع <b>4 كروت من نفس الرقم</b>. والمباراة تُحسم إما بالوصول للهدف المحدد من النقاط أو انتهاء الجولات!
      </p>
      <div style="font-size:0.75rem;color:#00e676;margin-top:4px;">
        • 4 كروت مطابقة بدون جوكر = <b>نقطتان</b>.<br>
        • مع جوكر = <b>نقطة واحدة</b>.<br>
        • 4 جواكر = <b>فوز فوري بالمباراة كاملة (5 نقاط)</b>!
      </div>

      <div class="guide-section-title">موسوعة الكوماندز وقدراتهم:</div>
      <div class="guide-cards-list">
        <div class="guide-card-item">
          <img src="/cards/mirror.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>المراية</h4>
            <p>كارت فخ في إيدك؛ لو حد هاجمك بكوماند تقدر تلغيه فوراً أو ترده في صدره وتسحب بداله كارت!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/swap.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>بدّل يا نجم</h4>
            <p>تبديل إيدك كلها (الـ 4 كروت) مع إيد أي لاعب تختاره على الترابيزة دفعة واحدة!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/fire.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>ولعانة</h4>
            <p>كل لاعب على الترابيزة مجبر يختار كارت يرميه في الأرض ويسحب بداله كارت مقلوب عشوائي!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/reveal.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>ع المكشوف</h4>
            <p>تكشف الـ 4 كروت بتوع أي خصم قدام الكل على الترابيزة مباشرة بدون نوافذ وتفضح خطته!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/freeze.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>فرملة</h4>
            <p>تجميد دور أي لاعب (تخطي دور) ومنعه من قول كمّلتها نهائياً خلال اللفة دي!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/spin.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>شقلباظ</h4>
            <p>دربكة جماعية؛ كل لاعب مجبر يختار كارت من إيده ويباصيه للي جنبه في اتجاه اللعب!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/magnet.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>المغناطيس</h4>
            <p>تختار رقم أو الجوكر، ويشفط كل الكروت المطابقة من الأرض وتختار بإيدك اللي هترميه بدالهم!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/ambush.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>الكمين</h4>
            <p>تفتيش عام؛ يصادر كل الجواكر من أيدي الخصوم للأرض ويحميك أنت شخصياً!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/curse.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>عين حسودة</h4>
            <p>حرمان لاعب محدد من أخذ أي كارت مكشوف من الأرض لمدة لفتين كاملين (يسحب مقلوب بس)!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/joker.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>جوكر</h4>
            <p>يعوض أي رقم ناقص في إيدك، وجمع 4 جواكر يحقق الفوز الفوري والمباشر!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/hunt.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>اصطاد كارتك</h4>
            <p>تطلب رقم معين أو جوكر من لاعب، لو معاه تاخده منه وتديله كارت مكانه من إيدك.</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/bank.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>لم كمالتك</h4>
            <p>تفتح كروت الأرض كلها وتختار أي كارت محتاجه ليدك وترمي كارت مكانه.</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/reverse.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>اعكس لفتك</h4>
            <p>يعكس اتجاه اللعب (أو يتخطى الخصم وتلعب دور تاني في حالة لاعبين فقط).</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/keda.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>هو كدة</h4>
            <p>تغيير كل كروت الخصم الأربعة وترميهم في الأرض وتوزعله 4 جداد من السحب!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/annoy.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>رخم عليهم</h4>
            <p>تبديل كارت عشوائي سراً بين اتنين لاعيبة، أو كشف كارت الخصم وتبديله في لاعبين.</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/wild.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>براحتك</h4>
            <p>يتحول لأي كوماند تختاره أنت (اصطاد، لم كمالتك، اعكس لفتك، هو كدة، رخم عليهم).</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/thief.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>الحرامي</h4>
            <p>سرقة مضمونة للكارت المطلوب من يد الخصوم أولاً، أو من الأرض، أو من قلب السحب!</p>
          </div>
        </div>
      </div>
    </div>
    <button class="btn primary-btn" onclick="window.closeModal()" style="margin-top:12px;">فهمت القواعد</button>
  `);
};

if (btnRulesGate) btnRulesGate.onclick = () => window.openCardEncyclopediaModal();
if (btnRulesLobby) btnRulesLobby.onclick = () => window.openCardEncyclopediaModal();
if (btnRulesWait) btnRulesWait.onclick = () => window.openCardEncyclopediaModal();

if (btnBuy) {
  btnBuy.onclick = () => {
    window.openModal(`
      <h2 style="color:#ffcc00;margin-bottom:6px;">شراء التذاكر / النسخة الأصلية</h2>
      <div class="buy-card-info">
        <div class="brand-badge">Wello_0</div>
        <p class="phone-number-display">01121040020</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <a href="https://wa.me/201121040020?text=أهلاً%20Wello_0،%20عايز%20أشتري%20تذكرة%20دخول%20للعبة%20كملها" target="_blank" class="btn whatsapp-btn">تواصل عبر واتساب</a>
        <a href="tel:01121040020" class="btn call-btn">اتصال تليفوني مباشر</a>
        <button class="btn secondary-btn" onclick="window.closeModal()">إغلاق</button>
      </div>
    `);
  };
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
    showToast(`تم نسخ كود الغرفة: ${currentRoomId}`);
  }).catch(() => prompt('انسخ كود الغرفة:', currentRoomId));
}
if (btnCopyCodeWait) btnCopyCodeWait.onclick = copyRoomCode;
if (btnCopyCodeGame) btnCopyCodeGame.onclick = copyRoomCode;

// إنشاء غرفة
if (btnCreate) {
  btnCreate.onclick = () => {
    const name = playerNameInput.value.trim();
    if (!name) return alert('اكتب اسمك الأول!');
    localStorage.setItem('kamelha_name', name);
    socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name });
    
    const pts = targetPointsInput ? targetPointsInput.value : 5;
    const rnds = maxRoundsInput ? maxRoundsInput.value : 0;
    const deckMode = deckModeSelect ? deckModeSelect.value : 'classic';

    const customCommands = [];
    if (deckMode === 'custom') {
      document.querySelectorAll('.commands-checkbox-grid input:checked').forEach(cb => {
        customCommands.push(cb.value);
      });
      if (customCommands.length === 0) {
        return alert('يرجى اختيار كوماند واحد على الأقل في الوضع المخصص!');
      }
    }

    socket.emit('createRoom', { 
      playerName: name, 
      playerId: myPlayerId,
      targetPoints: pts,
      maxRounds: rnds,
      deckMode,
      customCommands
    });
  };
}

if (btnJoin) {
  btnJoin.onclick = () => {
    const name = playerNameInput.value.trim();
    const code = roomCodeInput.value.trim();
    if (!name || !code) return alert('اكتب اسمك وكود الغرفة!');
    localStorage.setItem('kamelha_name', name);
    socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name });
    socket.emit('joinRoom', { playerName: name, roomId: code, playerId: myPlayerId });
  };
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
    li.innerText = `${p.isHost ? '★ ' : ''}${p.name}`;
    playersList.appendChild(li);
  });
}

if (btnStart) btnStart.onclick = () => socket.emit('startGame', currentRoomId);

function leaveCurrentRoom() {
  if (confirm('هل أنت متأكد من الخروج من الغرفة؟')) {
    socket.emit('leaveRoom', currentRoomId);
    localStorage.removeItem('kamelha_room');
    location.reload();
  }
}
if (btnLeave) btnLeave.onclick = leaveCurrentRoom;

// نافذة مراجعة كروت الأرض عند الضغط بدون دور
function openInspectDiscardPileModal() {
  const ground = (latestGameState && latestGameState.discardPile) ? latestGameState.discardPile : [];
  if (ground.length === 0) {
    return showToast('لا توجد أي كروت في الأرض حالياً');
  }

  let html = '<h2 style="color:#ffcc00;margin-bottom:8px;">كروت الأرض المرمية</h2>';
  html += '<p style="font-size:0.8rem;color:#ccc;margin-bottom:10px;">استعراض ومراجعة الكروت التي نزلت في الأرض (للتذكر فقط):</p>';
  html += '<div class="modal-grid">';
  ground.forEach(c => {
    html += `<div class="bank-pick-card" style="cursor:default;">${createCardHTML(c)}</div>`;
  });
  html += '</div>';
  html += '<button class="btn secondary-btn" onclick="window.closeModal()" style="margin-top:10px;">إغلاق</button>';
  window.openModal(html);
}

if (drawDeckBtn) {
  drawDeckBtn.onclick = () => {
    if (!isMyTurn) return alert('مش دورك دلوقتي!');
    if (currentDrawnCard) return alert('أنت سحبت كارت بالفعل!');
    SoundManager.playDraw();
    socket.emit('drawCard', currentRoomId);
  };
}

if (discardDeckBtn) {
  discardDeckBtn.onclick = () => {
    if (!isMyTurn) {
      openInspectDiscardPileModal();
      return;
    }

    if (currentDrawnCard) return alert('أنت سحبت كارت مقلوب بالفعل!');
    showToast('اضغط على كارت من إيدك لتبديله مع كارت الأرض!');
    pickCardFromHand(index => {
      SoundManager.playPlace();
      socket.emit('takeDiscardCard', { roomId: currentRoomId, handCardIndex: index });
    });
  };
}

if (btnKamelha) {
  btnKamelha.onclick = () => {
    SoundManager.playKamelha();
    socket.emit('callKamelha', currentRoomId);
  };
}

// نافذة فخ المراية
socket.on('mirrorPrompt', ({ attackerName, cmdType, cmdName }) => {
  SoundManager.playCommand();
  window.openModal(`
    <h2 style="color:#00e5ff;">كارت المراية في إيدك!</h2>
    <p>اللاعب <b>${attackerName}</b> استخدم عليك كارت: <b style="color:#ffcc00;">${cmdName}</b>!</p>
    <p style="font-size:0.85rem;color:#ccc;margin:8px 0;">ماذا تريد أن تفعل؟</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button id="btn-mirror-reflect" class="btn primary-btn">ردّ الكوماند في صدره</button>
      <button id="btn-mirror-cancel" class="btn secondary-btn">إلغاء الكوماند فقط</button>
      <button id="btn-mirror-ignore" class="btn info-btn" style="background:rgba(255,255,255,0.1);color:#fff;">تجاهل واحتفظ بالمراية</button>
    </div>
  `);

  document.getElementById('btn-mirror-reflect').onclick = () => {
    window.closeModal();
    socket.emit('resolveMirrorResponse', { roomId: currentRoomId, action: 'reflect' });
  };
  document.getElementById('btn-mirror-cancel').onclick = () => {
    window.closeModal();
    socket.emit('resolveMirrorResponse', { roomId: currentRoomId, action: 'cancel' });
  };
  document.getElementById('btn-mirror-ignore').onclick = () => {
    window.closeModal();
    socket.emit('resolveMirrorResponse', { roomId: currentRoomId, action: 'ignore' });
  };
});

// نافذة التصويت الديمقراطي عند التعادل
socket.on('tieVotePrompt', ({ contenders, points }) => {
  SoundManager.playCommand();
  window.openModal(`
    <h2 style="color:#ffcc00;margin-bottom:8px;">تعادل في صدارة المباراة!</h2>
    <p style="font-size:0.95rem;color:#fff;margin-bottom:6px;">المتعادلون برصيد (<b>${points}</b> نقطة):</p>
    <p style="color:#00e5ff;font-weight:900;font-size:1.1rem;margin-bottom:12px;">${contenders.join(' و ')}</p>
    <p style="font-size:0.82rem;color:#ccc;margin-bottom:12px;">صوّت الآن خلال 20 ثانية لتحديد مصير المباراة:</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-vote-play" class="btn primary-btn">لعب جولة أخرى فاصلة</button>
      <button id="btn-vote-draw" class="btn secondary-btn">إنهاء المباراة بالتعادل</button>
    </div>
  `);

  document.getElementById('btn-vote-play').onclick = () => {
    window.closeModal();
    showToast('تم تسجيل تصويتك مع (لعب جولة فاصلة)');
    socket.emit('submitTieVote', { roomId: currentRoomId, vote: 'play' });
  };

  document.getElementById('btn-vote-draw').onclick = () => {
    window.closeModal();
    showToast('تم تسجيل تصويتك مع (إنهاء المباراة بالتعادل)');
    socket.emit('submitTieVote', { roomId: currentRoomId, vote: 'draw' });
  };
});

// سؤال صاحب كارت شقلباظ
socket.on('spinCasterPrompt', () => {
  window.openModal(`
    <h2>كارت شقلباظ</h2>
    <p>هل تريد مشاركة وتمرير كارت من يدك؟ أم ترغب في الاحتفاظ بكروتك في أمان؟</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button id="btn-spin-yes" class="btn primary-btn">نعم، شارك وبدل كارت</button>
      <button id="btn-spin-no" class="btn secondary-btn">لا، احتفظ بكروتي كما هي</button>
    </div>
  `);
  document.getElementById('btn-spin-yes').onclick = () => {
    window.closeModal();
    socket.emit('resolveSpinCasterChoice', { roomId: currentRoomId, participate: true });
  };
  document.getElementById('btn-spin-no').onclick = () => {
    window.closeModal();
    socket.emit('resolveSpinCasterChoice', { roomId: currentRoomId, participate: false });
  };
});

// طلب شقلباظ
socket.on('spinRequest', () => {
  showToast('كارت شقلباظ! اختر كارت من يدك لتمريره لجارك:');
  pickCardFromHand(index => {
    SoundManager.playPlace();
    socket.emit('submitSpinCard', { roomId: currentRoomId, handCardIndex: index });
  });
});

// سؤال صاحب كارت ولعانة
socket.on('fireCasterPrompt', () => {
  window.openModal(`
    <h2>كارت ولعانة</h2>
    <p>هل ترغب في التضحية بكارت من يدك واستبداله؟ أم تريد إبقاء يدك كما هي؟</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button id="btn-fire-yes" class="btn primary-btn">نعم، استبدل كارت</button>
      <button id="btn-fire-no" class="btn secondary-btn">لا، احتفظ بكروتي كما هي</button>
    </div>
  `);
  document.getElementById('btn-fire-yes').onclick = () => {
    window.closeModal();
    socket.emit('resolveFireCasterChoice', { roomId: currentRoomId, burn: true });
  };
  document.getElementById('btn-fire-no').onclick = () => {
    window.closeModal();
    socket.emit('resolveFireCasterChoice', { roomId: currentRoomId, burn: false });
  };
});

// طلب ولعانة
socket.on('fireRequest', () => {
  showToast('كارت ولعانة! اختر كارت من يدك لرميه في الأرض واستبداله:');
  pickCardFromHand(index => {
    SoundManager.playPlace();
    socket.emit('submitFireCard', { roomId: currentRoomId, handCardIndex: index });
  });
});

// كارت المغناطيس: اختيار يدوي للكروت المراد التضحية بها
socket.on('magnetChooseDiscards', ({ count, itemName }) => {
  showToast(`شفط المغناطيس (${count}) ${itemName}! اختر (${count}) كروت من يدك لرميها في الأرض:`);
  const selectedIndices = [];

  function promptPickNext() {
    pickCardFromHand(index => {
      selectedIndices.push(index);
      if (selectedIndices.length < count) {
        showToast(`اختر الكارت رقم (${selectedIndices.length + 1}) لرميه:`);
        promptPickNext();
      } else {
        socket.emit('submitMagnetDiscards', { roomId: currentRoomId, discardIndices: selectedIndices });
      }
    });
  }

  promptPickNext();
});

socket.on('cardDrawn', card => {
  currentDrawnCard = card;
  if (card.type === 'number' || card.cmdType === 'joker' || card.cmdType === 'mirror') {
    if (card.cmdType === 'joker') {
      SoundManager.playWin();
      showToast('سحبت جوكر! الكارت سري ومحدش يعرف.');
    } else if (card.cmdType === 'mirror') {
      SoundManager.playCommand();
      showToast('سحبت كارت المراية! احتفظ بيه في إيدك لحمايتك.');
    }
    handleNumberOrJokerModal(card);
  } else {
    handleCommandCardModal(card);
  }
});

function handleNumberOrJokerModal(card) {
  const isMirror = card.cmdType === 'mirror';
  window.openModal(`
    <h2>الكارت المسحوب:</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(card)}</div>
    <p>${isMirror ? 'كارت المراية بيحميك طول ما هو في إيدك!' : 'ماذا تريد أن تفعل؟'}</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-swap" class="btn btn-swap-green">خده في إيدك وبدله</button>
      <button id="btn-discard" class="btn btn-discard-red">ارميه على الأرض</button>
    </div>
  `);

  document.getElementById('btn-discard').onclick = () => {
    window.closeModal();
    SoundManager.playPlace();
    socket.emit('discardDrawnCard', currentRoomId);
    currentDrawnCard = null;
  };

  document.getElementById('btn-swap').onclick = () => {
    window.closeModal();
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
    // الكروت الأصلية
    reverse: () => {
      currentDrawnCard = null;
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
    thief: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openThiefFlow();
    },
    annoy: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openAnnoyFlow();
    },
    wild: () => openWildFlow(),

    // الكروت الجديدة
    reveal: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openPlayerPicker('اختر لاعباً لكشف كروته للجميع:', targetId => {
        currentDrawnCard = null;
        SoundManager.playCommand();
        socket.emit('execReveal', { roomId: currentRoomId, targetPlayerId: targetId });
      });
    },
    swap: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openPlayerPicker('اختر لاعباً لتبديل إيدك بالكامل معه:', targetId => {
        currentDrawnCard = null;
        SoundManager.playCommand();
        socket.emit('execSwapHand', { roomId: currentRoomId, targetPlayerId: targetId });
      });
    },
    freeze: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openPlayerPicker('اختر لاعباً لفرملته وتجميد دوره:', targetId => {
        currentDrawnCard = null;
        SoundManager.playCommand();
        socket.emit('execFreeze', { roomId: currentRoomId, targetPlayerId: targetId });
      });
    },
    spin: () => {
      currentDrawnCard = null;
      SoundManager.playCommand();
      socket.emit('execSpin', currentRoomId);
    },
    ambush: () => {
      currentDrawnCard = null;
      SoundManager.playCommand();
      socket.emit('execAmbush', currentRoomId);
    },
    magnet: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openMagnetFlow();
    },
    curse: () => {
      socket.emit('extendTimerForCommand', currentRoomId);
      openPlayerPicker('اختر لاعباً لمنعه من السحب من الأرض:', targetId => {
        currentDrawnCard = null;
        SoundManager.playCommand();
        socket.emit('execCurse', { roomId: currentRoomId, targetPlayerId: targetId });
      });
    },
    fire: () => {
      currentDrawnCard = null;
      SoundManager.playCommand();
      socket.emit('execFire', currentRoomId);
    }
  };

  window.openModal(`
    <h2>سحبت كوماند: ${card.name}!</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(card)}</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-run-cmd" class="btn primary-btn">تفعيل الأمر الآن</button>
      <button id="btn-drop-cmd" class="btn secondary-btn">رميه بدون تفعيل</button>
    </div>
  `);

  document.getElementById('btn-run-cmd').onclick = () => {
    window.closeModal();
    if (actions[card.cmdType]) actions[card.cmdType]();
  };
  document.getElementById('btn-drop-cmd').onclick = () => {
    window.closeModal();
    SoundManager.playPlace();
    socket.emit('discardDrawnCard', currentRoomId);
    currentDrawnCard = null;
  };
}

function cancelCommandExecution() {
  window.closeModal();
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
  html += '<button id="btn-cancel-bank" class="btn secondary-btn" style="margin-top:10px;">إلغاء ورمي الكارت</button>';
  window.openModal(html);

  document.getElementById('btn-cancel-bank').onclick = cancelCommandExecution;

  document.querySelectorAll('.bank-pick-card').forEach(el => {
    el.onclick = () => {
      const discardIdx = parseInt(el.getAttribute('data-idx'));
      window.closeModal();
      showToast('اختار كارت من إيدك لوضعه مكانه:');
      pickCardFromHand(handIdx => {
        currentDrawnCard = null;
        SoundManager.playPlace();
        socket.emit('execBank', { roomId: currentRoomId, discardIndex: discardIdx, handCardIndex: handIdx });
      });
    };
  });
}

function openMagnetFlow() {
  let html = '<h2>اختر الرقم لشفطه من الأرض:</h2><div class="hunt-grid">';
  for (let i = 1; i <= 10; i++) {
    html += `<button class="btn secondary-btn magnet-num-btn" data-val="${i}">${i}</button>`;
  }
  html += '</div>';
  html += '<button id="btn-pull-joker" class="btn primary-btn" style="margin-top:8px;background:#00bcd4;color:#fff;">سحب كروت الجوكر</button>';
  html += '<button id="btn-cancel-magnet" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
  window.openModal(html);

  document.getElementById('btn-cancel-magnet').onclick = cancelCommandExecution;

  document.getElementById('btn-pull-joker').onclick = () => {
    window.closeModal();
    currentDrawnCard = null;
    SoundManager.playCommand();
    socket.emit('execMagnet', { roomId: currentRoomId, targetNumber: 'joker' });
  };

  document.querySelectorAll('.magnet-num-btn').forEach(b => {
    b.onclick = () => {
      const val = b.getAttribute('data-val');
      window.closeModal();
      currentDrawnCard = null;
      SoundManager.playCommand();
      socket.emit('execMagnet', { roomId: currentRoomId, targetNumber: val });
    };
  });
}

function openHuntFlow() {
  openPlayerPicker('اختر لاعباً لتصطاد منه:', targetId => {
    let html = '<h2>اختر الكارت الذي تبحث عنه:</h2><div class="hunt-grid">';
    for (let i = 1; i <= 10; i++) {
      html += `<button class="btn secondary-btn hunt-num-btn" data-val="${i}">${i}</button>`;
    }
    html += '</div>';
    html += '<button id="btn-hunt-joker" class="btn primary-btn" style="margin-top:8px;background:#00bcd4;color:#fff;">صيد كارت الجوكر</button>';
    html += '<button id="btn-cancel-hunt" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
    window.openModal(html);

    document.getElementById('btn-cancel-hunt').onclick = cancelCommandExecution;

    document.getElementById('btn-hunt-joker').onclick = () => {
      window.closeModal();
      socket.emit('checkHuntTarget', {
        roomId: currentRoomId,
        targetPlayerId: targetId,
        requestedItem: 'joker'
      });
    };

    document.querySelectorAll('.hunt-num-btn').forEach(b => {
      b.onclick = () => {
        const item = b.getAttribute('data-val');
        window.closeModal();
        socket.emit('checkHuntTarget', {
          roomId: currentRoomId,
          targetPlayerId: targetId,
          requestedItem: item
        });
      };
    });
  });
}

socket.on('huntTargetHasCard', ({ targetName, itemName }) => {
  SoundManager.playWin();
  showToast(`نجح الصيد! (${targetName}) معه كارت ${itemName}!`);
  window.openModal(`
    <h2 style="color:#00e676;">الصيد نجح!</h2>
    <p>اللاعب <b>${targetName}</b> معه كارت <b>${itemName}</b>!</p>
    <button id="btn-confirm-hunt-pick" class="btn primary-btn">اختر كارتك للمبادلة</button>
  `);

  document.getElementById('btn-confirm-hunt-pick').onclick = () => {
    window.closeModal();
    showToast('اضغط على كارت من يدك لإعطائه له:');
    pickCardFromHand(handIdx => {
      currentDrawnCard = null;
      socket.emit('confirmHuntSwap', { roomId: currentRoomId, handCardIndexToGive: handIdx });
    });
  };
});

function openThiefFlow() {
  let html = '<h2>كارت الحرامي!</h2>';
  html += '<p style="font-size:0.85rem;color:#ccc;">اختر الكارت المطلوب، وسيأتي إليك حتماً (من يد الخصم، أو الأرض، أو السحب)!</p>';
  html += '<div class="hunt-grid">';
  for (let i = 1; i <= 10; i++) {
    html += `<button class="btn secondary-btn thief-select-btn" data-val="${i}">${i}</button>`;
  }
  html += '</div>';
  html += '<button id="btn-thief-joker" class="btn primary-btn" style="margin-top:8px;background:#00bcd4;color:#fff;">سرقة كارت الجوكر</button>';
  html += '<button id="btn-cancel-thief" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
  window.openModal(html);

  document.getElementById('btn-cancel-thief').onclick = cancelCommandExecution;

  document.getElementById('btn-thief-joker').onclick = () => {
    window.closeModal();
    socket.emit('executeThief', { roomId: currentRoomId, requestedItem: 'joker' });
  };

  document.querySelectorAll('.thief-select-btn').forEach(b => {
    b.onclick = () => {
      const item = b.getAttribute('data-val');
      window.closeModal();
      socket.emit('executeThief', { roomId: currentRoomId, requestedItem: item });
    };
  });
}

function handleThiefSuccessPrompt(title, text) {
  SoundManager.playWin();
  window.openModal(`
    <h2 style="color:#00e676;">${title}</h2>
    <p>${text}</p>
    <button id="btn-thief-pick-mine" class="btn primary-btn">اختر كارتك الآن</button>
  `);

  document.getElementById('btn-thief-pick-mine').onclick = () => {
    window.closeModal();
    showToast('اضغط على كارت من يدك لإكمال التبديل:');
    pickCardFromHand(handIdx => {
      currentDrawnCard = null;
      socket.emit('confirmThiefSwap', { roomId: currentRoomId, handCardIndexToGive: handIdx });
    });
  };
}

socket.on('thiefFoundInHand', ({ victimName, itemName }) => {
  handleThiefSuccessPrompt('سرقة من يد الخصم!', `الحرامي سرق كارت <b>${itemName}</b> من يد <b>${victimName}</b>! اضغط لاختيار كارت لتبديله معه:`);
});

socket.on('thiefFoundOnGround', ({ itemName }) => {
  handleThiefSuccessPrompt('سرقة من الأرض!', `التقط الحرامي كارت <b>${itemName}</b> من الأرض! اضغط لاختيار كارت لترميه مكانه:`);
});

socket.on('thiefFoundInDeck', ({ itemName }) => {
  handleThiefSuccessPrompt('سرقة من قلب الديك!', `أخرج الحرامي كارت <b>${itemName}</b> من قلب كروت السحب المقلوبة! اضغط لاختيار كارت لترميه مكانه:`);
});

function openAnnoyFlow() {
  const others = latestGameState.players.filter(p => p.id !== socket.id && !p.isImmune);
  if (others.length === 0) {
    alert('الخصوم جميعاً قالوا كملها ومحميون بقفل الحصانة!');
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
    html += '<button id="btn-cancel-annoy" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
    window.openModal(html);

    document.getElementById('btn-cancel-annoy').onclick = cancelCommandExecution;

    let selected = [];
    document.querySelectorAll('.annoy-p-btn').forEach(btn => {
      btn.onclick = () => {
        selected.push(btn.getAttribute('data-id'));
        btn.disabled = true;
        btn.style.opacity = '0.5';
        if (selected.length === 2) {
          window.closeModal();
          currentDrawnCard = null;
          socket.emit('execAnnoyMulti', { roomId: currentRoomId, playerAId: selected[0], playerBId: selected[1] });
        }
      };
    });
  }
}

socket.on('annoy2PPeekResult', (peekedCard) => {
  window.openModal(`
    <h2>كارت الخصم المسحوب:</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(peekedCard)}</div>
    <p>هل يعجبك وتريد تبديله بكارت من يدك؟</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-annoy-swap" class="btn primary-btn">نعم، بدله بكارت من إيدي</button>
      <button id="btn-annoy-keep" class="btn secondary-btn">لا، اتركه مكانه للخصم</button>
    </div>
  `);

  document.getElementById('btn-annoy-swap').onclick = () => {
    window.closeModal();
    showToast('اختر كارت من يدك لإعطائه للخصم:');
    pickCardFromHand(handIdx => {
      currentDrawnCard = null;
      SoundManager.playPlace();
      socket.emit('resolveAnnoy2P', { roomId: currentRoomId, swap: true, handCardIndexToGive: handIdx });
    });
  };

  document.getElementById('btn-annoy-keep').onclick = () => {
    window.closeModal();
    currentDrawnCard = null;
    socket.emit('resolveAnnoy2P', { roomId: currentRoomId, swap: false });
  };
});

function openWildFlow() {
  window.openModal(`
    <h2>كارت براحتك!</h2>
    <p>اختر أي كوماند تريد تحويله إليه (ما عدا الجوكر والحرامي):</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button class="btn primary-btn wild-opt" data-type="hunt">اصطاد كارتك</button>
      <button class="btn primary-btn wild-opt" data-type="bank">لم كمالتك</button>
      <button class="btn primary-btn wild-opt" data-type="reverse">اعكس لفتك</button>
      <button class="btn primary-btn wild-opt" data-type="keda">هو كدة</button>
      <button class="btn primary-btn wild-opt" data-type="annoy">رخم عليهم</button>
      <button id="btn-cancel-wild" class="btn secondary-btn" style="margin-top:5px;">إلغاء ورمي الكارت</button>
    </div>
  `);

  document.getElementById('btn-cancel-wild').onclick = cancelCommandExecution;

  document.querySelectorAll('.wild-opt').forEach(btn => {
    btn.onclick = () => {
      const type = btn.getAttribute('data-type');
      window.closeModal();
      socket.emit('execWildAs', { roomId: currentRoomId, chosenCmdType: type });
    };
  });
}

socket.on('wildTransformed', card => handleCommandCardModal(card));

function openPlayerPicker(title, onSelect) {
  const others = latestGameState.players.filter(p => p.id !== socket.id && !p.isImmune);
  if (others.length === 0) {
    alert('جميع اللاعبين قالوا كملها ومحميون بقفل الحصانة!');
    cancelCommandExecution();
    return;
  }

  let html = `<h2>${title}</h2>`;
  others.forEach(p => {
    html += `<button class="btn primary-btn pick-target-btn" style="margin-bottom:8px;" data-id="${p.id}">${p.name}</button>`;
  });
  html += '<button id="btn-cancel-picker" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
  window.openModal(html);

  document.getElementById('btn-cancel-picker').onclick = cancelCommandExecution;

  document.querySelectorAll('.pick-target-btn').forEach(b => {
    b.onclick = () => {
      window.closeModal();
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

socket.on('commandSplash', ({ cmdType, cmdName, playerName }) => {
  SoundManager.playCommand();
  splashIcon.innerText = '★';
  splashTitle.innerText = cmdName;
  splashPlayer.innerText = `${playerName} قام بتفعيل الكارت!`;

  commandSplash.classList.remove('hidden');
  setTimeout(() => {
    commandSplash.classList.add('hidden');
  }, 1600);
});

socket.on('kedaAnimation', ({ targetId, targetName }) => {
  SoundManager.playPlace();
  showToast(`كارت هو كدة! تطايرت كروت ${targetName} إلى الأرض!`);
});

socket.on('annoySwapAnimation', ({ p1Id, p2Id }) => {
  SoundManager.playShuffle();
  showToast('رخم عليهم: تم تبديل كارتين سراً بين اللاعبين في الهواء!');
});

socket.on('playerDrewCardAnim', ({ playerId, from }) => {
  if (playerId !== socket.id) SoundManager.playDraw();
});

socket.on('animateDealing', ({ numPlayers }) => {
  SoundManager.playShuffle();
  showToast('جاري تفنيط وتوزيع الكروت على اللاعبين...');
});

function renderMessyDiscardPile(topCard, discardHistory) {
  if (!topCard) {
    messyDiscardPile.innerHTML = '<div id="top-discard-card" class="card-placeholder">لا يوجد</div>';
    return;
  }

  const angles = [-9, 7, -4, 11];
  let html = '';

  if (discardHistory && discardHistory.length > 1) {
    const underCount = Math.min(3, discardHistory.length - 1);
    for (let i = 0; i < underCount; i++) {
      const prevCard = discardHistory[discardHistory.length - 2 - i];
      const img = prevCard.type === 'number' ? `${prevCard.value}.png` : `${prevCard.cmdType}.png`;
      const rot = angles[i % angles.length];
      html += `
        <div class="messy-under-card" style="transform: rotate(${rot}deg) translate(${i * 2}px, ${-i * 2}px); opacity: 0.85;">
          <img src="/cards/${img}" alt="">
        </div>
      `;
    }
  }

  html += `
    <div id="top-discard-card" style="position:relative; z-index:2;">
      ${createCardHTML(topCard)}
    </div>
  `;

  messyDiscardPile.innerHTML = html;
}

function updateTableSeats(players, myId, currentTurnId) {
  const me = players.find(p => p.id === myId);
  if (me) {
    myNameDisplay.innerText = `${me.isHost ? '★ ' : ''}${me.name}`;
    myScoreDisplay.innerText = `${me.points}ن`;
    
    if (me.id === currentTurnId) {
      spotBottom.classList.add('active-turn-seat');
    } else {
      spotBottom.classList.remove('active-turn-seat');
    }
  }

  const otherPlayers = players.filter(p => p.id !== myId);

  spotTop.classList.add('hidden');
  spotLeft.classList.add('hidden');
  spotRight.classList.add('hidden');

  if (otherPlayers.length === 1) {
    renderSeat(spotTop, otherPlayers[0], currentTurnId);
  } else if (otherPlayers.length === 2) {
    renderSeat(spotLeft, otherPlayers[0], currentTurnId);
    renderSeat(spotTop, otherPlayers[1], currentTurnId);
  } else if (otherPlayers.length === 3) {
    renderSeat(spotLeft, otherPlayers[0], currentTurnId);
    renderSeat(spotTop, otherPlayers[1], currentTurnId);
    renderSeat(spotRight, otherPlayers[2], currentTurnId);
  }
}

// رسم مقعد الخصم وعرض كروته المكشوفة بدقة
function renderSeat(seatEl, player, currentTurnId) {
  seatEl.classList.remove('hidden');
  
  if (player.id === currentTurnId) {
    seatEl.classList.add('active-turn-seat');
  } else {
    seatEl.classList.remove('active-turn-seat');
  }

  const nameEl = seatEl.querySelector('.seat-name');
  const scoreEl = seatEl.querySelector('.seat-score');
  const cardsEl = seatEl.querySelector('.seat-cards');

  const isTurn = player.id === currentTurnId;
  const curseTag = player.isCursed ? '(محسود)' : '';
  const frozenTag = player.isFrozen ? '(متفرمل)' : '';
  nameEl.innerHTML = `${player.isHost ? '★ ' : ''}${player.name} ${player.isImmune ? '(حصانة)' : ''} ${curseTag} ${frozenTag} ${isTurn ? '<b style="color:#00e676;">• دورك</b>' : ''}`;
  scoreEl.innerText = `${player.points}ن`;

  cardsEl.innerHTML = '';
  if (player.revealedHand && Array.isArray(player.revealedHand) && player.revealedHand.length > 0) {
    player.revealedHand.forEach(c => {
      const imgName = c.type === 'number' ? `${c.value}.png` : `${c.cmdType}.png`;
      const mini = document.createElement('div');
      mini.className = 'mini-card-back mini-card-revealed';
      mini.innerHTML = `<img src="/cards/${imgName}" alt="">`;
      cardsEl.appendChild(mini);
    });
  } else {
    for (let i = 0; i < (player.cardCount || 4); i++) {
      const mini = document.createElement('div');
      mini.className = 'mini-card-back';
      mini.innerHTML = `<img src="/cards/back.png" alt="">`;
      cardsEl.appendChild(mini);
    }
  }
}

function updateTurnTimer(deadline, totalSeconds) {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerSec.innerText = remaining;

    if (remaining <= 3 && remaining > 0) {
      SoundManager.playTick();
    }

    const percentage = Math.max(0, (remaining / totalSeconds) * 100);
    timerBar.style.width = percentage + '%';

    if (percentage > 50) {
      timerBar.style.background = '#00e676';
    } else if (percentage > 25) {
      timerBar.style.background = '#ffcc00';
    } else {
      timerBar.style.background = '#ff3d00';
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

  // تنبيه واهتزاز زرار "كمّلتهااا!" أول ما كروتك تكتمل
  if (btnKamelha) {
    if (data.canCallKamelha) {
      btnKamelha.classList.add('kamelha-ready-glow');
      if (!hasAlertedKamelhaReady) {
        hasAlertedKamelhaReady = true;
        showToast('كروتك اكتملت! تقدر تضغط على زرار كمّلتهااا! دلوقتي');
        SoundManager.playKamelha();
      }
    } else {
      btnKamelha.classList.remove('kamelha-ready-glow');
      hasAlertedKamelhaReady = false;
    }
  }

  if (matchRulesTag) {
    const pts = data.targetPoints;
    const rnds = data.maxRounds;

    if (pts > 0 && rnds > 0) {
      matchRulesTag.innerText = `الهدف: ${pts} نقاط أو انتهاء الجولات | الجولة (${data.roundCount} من ${rnds})`;
    } else if (pts > 0 && rnds === 0) {
      matchRulesTag.innerText = `الهدف: أول من يجمع ${pts} نقاط (جولات مفتوحة) | الجولة ${data.roundCount}`;
    } else if (pts === 0 && rnds > 0) {
      matchRulesTag.innerText = `الجولة (${data.roundCount} من ${rnds}) | الأعلى نقاطاً عند النهاية يفوز`;
    } else {
      matchRulesTag.innerText = `الهدف: أول من يجمع 5 نقاط | الجولة ${data.roundCount}`;
    }
  }

  if (data.turnDeadline) {
    updateTurnTimer(data.turnDeadline, data.turnDuration || 15);
  }

  deckCounter.innerText = data.deckCount;
  renderMessyDiscardPile(data.topDiscard, data.discardPile);

  myHandDiv.innerHTML = '';
  data.hand.forEach(c => {
    const el = document.createElement('div');
    el.innerHTML = createCardHTML(c);
    myHandDiv.appendChild(el.firstElementChild);
  });

  updateTableSeats(data.players, socket.id, data.currentTurn);
});

socket.on('roundEnded', ({ msg, revealedHands }) => {
  clearInterval(timerInterval);
  currentDrawnCard = null;
  hasAlertedKamelhaReady = false;
  SoundManager.playKamelha();

  let html = `<h2>نهاية الجولة!</h2>`;
  html += `<p style="white-space:pre-line;font-weight:bold;color:#ffcc00;">${msg}</p>`;
  html += `<h3>كروت اللاعبين في هذه الجولة:</h3><div class="revealed-container">`;

  revealedHands.forEach(p => {
    html += `
      <div class="revealed-player-row">
        <span class="rev-name">${p.isHost ? '★ ' : ''}${p.name} (${p.points} نقطة):</span>
        <div class="rev-cards">${p.hand.map(c => createCardHTML(c)).join('')}</div>
      </div>
    `;
  });
  html += `</div><p style="font-size:0.85rem;color:#aaa;">الجولة التالية ستبدأ خلال ثوانٍ...</p>`;
  window.openModal(html);
  setTimeout(() => window.closeModal(), 8000);
});

socket.on('gameOver', ({ winnerName, scores, revealedHands, reason }) => {
  clearInterval(timerInterval);
  currentDrawnCard = null;
  hasAlertedKamelhaReady = false;
  SoundManager.playWin();

  let html = `
    <h1 style="color:#ffcc00;font-size:2.2rem;">مبروووك!</h1>
    <h2>الفائز بالمباراة: ${winnerName}</h2>
    <p style="color:#00e676;font-weight:bold;margin:8px 0;">${reason || 'فاز بالمباراة!'}</p>
  `;
  if (revealedHands) {
    html += `<h3>كروت النهاية:</h3><div class="revealed-container">`;
    revealedHands.forEach(p => {
      html += `
        <div class="revealed-player-row">
          <span class="rev-name">${p.isHost ? '★ ' : ''}${p.name}:</span>
          <div class="rev-cards">${p.hand.map(c => createCardHTML(c)).join('')}</div>
        </div>
      `;
    });
    html += `</div>`;
  }
  html += `<button onclick="localStorage.removeItem('kamelha_room');location.reload();" class="btn primary-btn" style="margin-top:15px;">العودة للرئيسية</button>`;
  window.openModal(html);
});

function createCardHTML(card) {
  let imgFile = '';
  if (card.type === 'number') {
    imgFile = `${card.value}.png`;
  } else if (card.type === 'command') {
    imgFile = `${card.cmdType}.png`;
  }

  if (imgFile) {
    return `
      <div class="card card-real-img">
        <img src="/cards/${imgFile}" alt="${card.name || card.value}">
      </div>
    `;
  }
  return '';
}
