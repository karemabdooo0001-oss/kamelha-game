const socket = io();

// DOM
const lobbyScreen = document.getElementById('lobby-screen');
const waitingScreen = document.getElementById('waiting-screen');
const gameScreen = document.getElementById('game-screen');
const toastBanner = document.getElementById('toast-banner');

const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const btnStart = document.getElementById('btn-start');
const btnKamelha = document.getElementById('btn-kamelha');

const displayRoomCode = document.getElementById('display-room-code');
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

const modalOverlay = document.getElementById('modal-overlay');
const modalContainer = document.getElementById('modal-container');

let currentRoomId = null;
let isMyTurn = false;
let currentDrawnCard = null;
let latestGameState = null;

// إشعارات عائمة
function showToast(msg) {
  toastBanner.innerText = msg;
  toastBanner.classList.remove('hidden');
  setTimeout(() => toastBanner.classList.add('hidden'), 4000);
}
socket.on('notify', msg => showToast(msg));
socket.on('errorMsg', msg => alert(msg));

// إنشاء ودخول الغرف
btnCreate.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  if (!name) return alert('اكتب اسمك الأول!');
  socket.emit('createRoom', { playerName: name });
});

btnJoin.addEventListener('click', () => {
  const name = playerNameInput.value.trim();
  const code = roomCodeInput.value.trim();
  if (!name || !code) return alert('اكتب اسمك وكود الغرفة!');
  socket.emit('joinRoom', { playerName: name, roomId: code });
});

socket.on('roomJoined', ({ roomId, players, isHost }) => {
  currentRoomId = roomId;
  lobbyScreen.classList.add('hidden');
  waitingScreen.classList.remove('hidden');
  displayRoomCode.innerText = roomId;
  renderWaitingPlayers(players);
  if (isHost) {
    btnStart.classList.remove('hidden');
    waitMsg.classList.add('hidden');
  }
});

socket.on('updatePlayers', players => renderWaitingPlayers(players));

function renderWaitingPlayers(players) {
  playersList.innerHTML = '';
  playerCount.innerText = players.length;
  players.forEach(p => {
    const li = document.createElement('li');
    li.innerText = `${p.name} ${p.isHost ? '👑 (صاحب الغرفة)' : ''}`;
    playersList.appendChild(li);
  });
}

btnStart.addEventListener('click', () => socket.emit('startGame', currentRoomId));

// سحب كارت مقلوب
drawDeckBtn.addEventListener('click', () => {
  if (!isMyTurn) return alert('مش دورك دلوقتي!');
  if (currentDrawnCard) return alert('أنت سحبت كارت بالفعل!');
  socket.emit('drawCard', currentRoomId);
});

// أخذ كارت الأرض
discardDeckBtn.addEventListener('click', () => {
  if (!isMyTurn) return alert('مش دورك دلوقتي!');
  if (currentDrawnCard) return alert('أنت سحبت كارت مقلوب بالفعل!');
  showToast('اضغط على كارت من إيدك لتبديله مع كارت الأرض!');
  pickCardFromHand(index => {
    socket.emit('takeDiscardCard', { roomId: currentRoomId, handCardIndex: index });
  });
});

// زر كمّلها
btnKamelha.addEventListener('click', () => {
  socket.emit('callKamelha', currentRoomId);
});

// معالجة الكارت المسحوب
socket.on('cardDrawn', card => {
  currentDrawnCard = card;
  if (card.type === 'number' || card.cmdType === 'joker') {
    handleNumberOrJokerModal(card);
  } else {
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
    socket.emit('discardDrawnCard', currentRoomId);
    currentDrawnCard = null;
  };

  document.getElementById('btn-swap').onclick = () => {
    closeModal();
    showToast('اختار الكارت اللي عايز ترميه من إيدك:');
    pickCardFromHand(index => {
      socket.emit('swapWithHand', { roomId: currentRoomId, handCardIndex: index });
      currentDrawnCard = null;
    });
  };
}

// تنفيذ أوامر الكوماندز
function handleCommandCardModal(card) {
  const actions = {
    reverse: () => {
      currentDrawnCard = null;
      socket.emit('execReverse', currentRoomId);
    },
    keda: () => openPlayerPicker('اختار لاعباً لتبديل كل كروته:', targetId => {
      currentDrawnCard = null;
      socket.emit('execKeda', { roomId: currentRoomId, targetPlayerId: targetId });
    }),
    bank: () => openBankPicker(),
    hunt: () => openHuntFlow(),
    annoy: () => openAnnoyFlow(),
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
    socket.emit('discardDrawnCard', currentRoomId);
    currentDrawnCard = null;
  };
}

// كارت: لم كمالتك
function openBankPicker() {
  const ground = latestGameState.discardPile;
  let html = '<h2>اختر أي كارت من الأرض:</h2><div class="modal-grid">';
  ground.forEach((c, idx) => {
    html += `<div class="bank-pick-card" data-idx="${idx}">${createCardHTML(c)}</div>`;
  });
  html += '</div>';
  openModal(html);

  document.querySelectorAll('.bank-pick-card').forEach(el => {
    el.onclick = () => {
      const discardIdx = parseInt(el.getAttribute('data-idx'));
      closeModal();
      showToast('اختار كارت من إيدك لوضعه مكانه:');
      pickCardFromHand(handIdx => {
        currentDrawnCard = null;
        socket.emit('execBank', { roomId: currentRoomId, discardIndex: discardIdx, handCardIndex: handIdx });
      });
    };
  });
}

// كارت: اصطاد كارتك
function openHuntFlow() {
  openPlayerPicker('اختر لاعباً لتصطاد منه كارت:', targetId => {
    const num = prompt('اكتب الرقم اللي عايز تصطاده منه (من 1 إلى 10):');
    if (!num || num < 1 || num > 10) return alert('رقم غير صحيح!');
    showToast('اختر كارت من إيدك لتعطيه له في المقابل:');
    pickCardFromHand(handIdx => {
      currentDrawnCard = null;
      socket.emit('execHunt', {
        roomId: currentRoomId,
        targetPlayerId: targetId,
        requestedNumber: num,
        handCardIndexToGive: handIdx
      });
    });
  });
}

// كارت: رخم عليهم
function openAnnoyFlow() {
  const others = latestGameState.players.filter(p => p.id !== socket.id);
  if (others.length === 1) {
    openModal(`
      <h2>رخم عليهم!</h2>
      <p>يمكنك التجسس على كارت عشوائي من خصمك واختيار تبديله أو إبقائه:</p>
      <button id="btn-annoy-peek" class="btn primary-btn">اسحب وتجسس 👁️</button>
    `);
    document.getElementById('btn-annoy-peek').onclick = () => {
      const takeIt = confirm('تم سحب كارت الخصم سراً! هل تريد تبديله بكارت من يدك؟ (موافق = نعم، إلغاء = اتركه)');
      closeModal();
      if (takeIt) {
        showToast('اختر كارت من يدك لإعطائه للخصم بدلاً منه:');
        pickCardFromHand(handIdx => {
          currentDrawnCard = null;
          socket.emit('execAnnoy2P', { roomId: currentRoomId, action: 'swap', handCardIndexToGive: handIdx });
        });
      } else {
        currentDrawnCard = null;
        socket.emit('execAnnoy2P', { roomId: currentRoomId, action: 'keep' });
      }
    };
  } else {
    let html = '<h2>اختر لاعبين للتبديل بينهما:</h2>';
    others.forEach(p => {
      html += `<button class="btn secondary-btn annoy-p-btn" style="margin-bottom:8px;" data-id="${p.id}">${p.name}</button>`;
    });
    openModal(html);
    let selected = [];
    document.querySelectorAll('.annoy-p-btn').forEach(btn => {
      btn.onclick = () => {
        selected.push(btn.getAttribute('data-id'));
        btn.disabled = true;
        btn.style.opacity = '0.5';
        if (selected.length === 2) {
          closeModal();
          currentDrawnCard = null;
          socket.emit('execAnnoyMulti', { roomId: currentRoomId, playerAId: selected[0], playerBId: selected[1] });
        }
      };
    });
  }
}

// كارت: براحتك
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
    </div>
  `);
  document.querySelectorAll('.wild-opt').forEach(btn => {
    btn.onclick = () => {
      const type = btn.getAttribute('data-type');
      closeModal();
      socket.emit('execWildAs', { roomId: currentRoomId, chosenCmdType: type });
    };
  });
}

socket.on('wildTransformed', card => handleCommandCardModal(card));

// أدوات مساعدة
function openPlayerPicker(title, onSelect) {
  const others = latestGameState.players.filter(p => p.id !== socket.id);
  let html = `<h2>${title}</h2>`;
  others.forEach(p => {
    html += `<button class="btn primary-btn pick-target-btn" style="margin-bottom:8px;" data-id="${p.id}">${p.name}</button>`;
  });
  openModal(html);
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
  modalContainer.innerHTML = html;
  modalOverlay.classList.remove('hidden');
}
function closeModal() {
  modalOverlay.classList.add('hidden');
}

// استقبال حالة اللعبة مع تصفير ذكي للسحبة
socket.on('gameState', data => {
  latestGameState = data;
  
  // تصفير الكارت المسحوب لو السيرفر بيقول إن اللاعب ممعاهوش سحبة حالية
  if (!data.hasDrawn) {
    currentDrawnCard = null;
  }

  waitingScreen.classList.add('hidden');
  gameScreen.classList.remove('hidden');

  isMyTurn = data.currentTurn === socket.id;
  currentPlayerName.innerText = isMyTurn ? 'أنت (دورك)!' : data.currentTurnName;
  currentPlayerName.parentElement.style.background = isMyTurn ? '#00e676' : '#ffcc00';

  deckCounter.innerText = data.deckCount;

  if (data.topDiscard) {
    topDiscardCardDiv.innerHTML = createCardHTML(data.topDiscard);
  }

  myHandDiv.innerHTML = '';
  data.hand.forEach(c => {
    const el = document.createElement('div');
    el.innerHTML = createCardHTML(c);
    myHandDiv.appendChild(el.firstElementChild);
  });

  otherPlayersDiv.innerHTML = '';
  data.players.forEach(p => {
    if (p.id !== socket.id) {
      const badge = document.createElement('div');
      badge.className = 'other-player-badge';
      badge.innerHTML = `👤 <b>${p.name}</b> (${p.cardCount}) | 🏆 ${p.points}ن`;
      otherPlayersDiv.appendChild(badge);
    }
  });
});

socket.on('roundEnded', ({ msg, players }) => {
  currentDrawnCard = null;
  openModal(`<h2>نهاية الجولة</h2><p style="white-space:pre-line;">${msg}</p><p>الجولة التالية ستبدأ تلقائياً بعد ثوانٍ...</p>`);
});

socket.on('gameOver', ({ winnerName, scores }) => {
  currentDrawnCard = null;
  openModal(`
    <h1 style="color:#ffcc00;font-size:2rem;">مبروووك! 🏆</h1>
    <h2>الفائز بالمباراة: ${winnerName}</h2>
    <p>وصل إلى 5 نقاط وفاز بالجيم بالكامل!</p>
    <button onclick="location.reload()" class="btn primary-btn">العودة للرئيسية</button>
  `);
});

function createCardHTML(card) {
  if (card.type === 'number') {
    return `<div class="card card-num num-${card.value}"><div class="circle-badge">${card.value}</div></div>`;
  } else if (card.type === 'command') {
    return `<div class="card card-cmd cmd-${card.cmdType}"><span>${card.name}</span></div>`;
  }
  return '';
}