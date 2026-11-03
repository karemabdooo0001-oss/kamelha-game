import { socket, myPlayerId, playerState } from './services/socketService.js';
import { soundService } from './services/soundService.js';
import { elements, showScreen, showToast, openModal, closeModal, showCommandSplash } from './ui/screenManager.js';
import { renderMessyDiscardPile, updateTableSeats, updateTurnTimer, createCardHTML } from './ui/tableRenderer.js';
import { 
  handleNumberOrJokerModal, 
  handleCommandCardModal, 
  handleThiefSuccessPrompt, 
  pickCardFromHand,
  setCurrentDrawnCard,
  getCurrentDrawnCard 
} from './ui/modals/commandModals.js';
import { 
  showMirrorPrompt, 
  showTieVotePrompt, 
  updateTieVotesList, 
  showRoundEndedModal, 
  showGameOverModal 
} from './ui/modals/gameResultModal.js';

let isMyTurn = false;
let hasAlertedKamelhaReady = false;

// -------------------------------------------------------------
// 1. إدارة الهوية وبوابة الدخول
// -------------------------------------------------------------
if (elements.displayMyUid) {
  elements.displayMyUid.innerText = myPlayerId;
}

const savedName = localStorage.getItem('kamelha_name') || 'لاعب';
if (elements.playerNameInput) elements.playerNameInput.value = savedName;

if (socket) {
  socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name: savedName });
}

// فحص التذكرة عند فتح الصفحة
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

if (elements.btnSubmitGate) {
  elements.btnSubmitGate.onclick = () => {
    const code = elements.gatePassInput.value.trim();
    if (!code) return alert('أدخل كود التذكرة!');
    socket.emit('verifyGatePasscode', { passcode: code, playerId: myPlayerId });
  };
}

// -------------------------------------------------------------
// 2. أزرار التنقل الرئيسية والقوائم
// -------------------------------------------------------------
const btnGoCreate = document.getElementById('btn-go-create');
const btnGoJoin = document.getElementById('btn-go-join');
const btnBackFromCreate = document.getElementById('btn-back-from-create');
const btnBackFromJoin = document.getElementById('btn-back-from-join');
const btnBackToGate = document.getElementById('btn-back-to-gate');
const btnBackToLobby = document.getElementById('btn-back-to-lobby');

if (btnGoCreate) {
  btnGoCreate.onclick = () => {
    const name = elements.playerNameInput.value.trim();
    if (!name) return alert('اكتب اسمك الأول في الخانة!');
    localStorage.setItem('kamelha_name', name);
    playerState.myName = name;
    socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name });
    showScreen(elements.createRoomScreen);
  };
}

if (btnGoJoin) {
  btnGoJoin.onclick = () => {
    const name = elements.playerNameInput.value.trim();
    if (!name) return alert('اكتب اسمك الأول في الخانة!');
    localStorage.setItem('kamelha_name', name);
    playerState.myName = name;
    socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name });
    showScreen(elements.joinRoomScreen);
  };
}

if (btnBackFromCreate) {
  btnBackFromCreate.onclick = () => showScreen(elements.lobbyScreen);
}

if (btnBackFromJoin) {
  btnBackFromJoin.onclick = () => showScreen(elements.lobbyScreen);
}

if (btnBackToGate) {
  btnBackToGate.onclick = () => {
    sessionStorage.removeItem('kamelha_gate_ticket');
    showScreen(elements.gateScreen);
  };
}

if (btnBackToLobby) {
  btnBackToLobby.onclick = () => {
    if (playerState.currentRoomId) {
      socket.emit('leaveRoom', playerState.currentRoomId);
      localStorage.removeItem('kamelha_room');
      playerState.currentRoomId = null;
    }
    showScreen(elements.lobbyScreen);
  };
}

// إظهار/إخفاء الكروت المخصصة
function syncCustomCommandsVisibility() {
  if (elements.deckModeSelect && elements.customCommandsBox) {
    elements.customCommandsBox.style.display = elements.deckModeSelect.value === 'custom' ? 'block' : 'none';
  }
}
if (elements.deckModeSelect) {
  elements.deckModeSelect.addEventListener('change', syncCustomCommandsVisibility);
  syncCustomCommandsVisibility();
}

// أزرار الصوت
soundService.updateSoundIcons();
const btnSoundLobby = document.getElementById('btn-sound-lobby');
const btnSoundGame = document.getElementById('btn-sound-game');
if (btnSoundLobby) btnSoundLobby.addEventListener('click', () => soundService.toggleMute());
if (btnSoundGame) btnSoundGame.addEventListener('click', () => soundService.toggleMute());

// -------------------------------------------------------------
// 3. إنشاء وانضمام الغرفة
// -------------------------------------------------------------
const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');

if (btnCreate) {
  btnCreate.onclick = () => {
    const name = elements.playerNameInput.value.trim() || localStorage.getItem('kamelha_name') || 'لاعب';
    localStorage.setItem('kamelha_name', name);
    playerState.myName = name;
    socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name });
    
    const pts = elements.targetPointsInput ? elements.targetPointsInput.value : 0;
    const rnds = elements.maxRoundsInput ? elements.maxRoundsInput.value : 0;
    const deckMode = elements.deckModeSelect ? elements.deckModeSelect.value : 'classic';

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
    const name = elements.playerNameInput.value.trim() || localStorage.getItem('kamelha_name') || 'لاعب';
    const code = elements.roomCodeInput ? elements.roomCodeInput.value.trim() : '';
    if (!code) return alert('اكتب كود الغرفة أولاً!');
    localStorage.setItem('kamelha_name', name);
    playerState.myName = name;
    socket.emit('registerPlayerIdentity', { playerId: myPlayerId, name });
    socket.emit('joinRoom', { playerName: name, roomId: code, playerId: myPlayerId });
  };
}

// نسخ كود الغرفة
function copyRoomCode() {
  if (!playerState.currentRoomId) return;
  navigator.clipboard.writeText(playerState.currentRoomId).then(() => {
    showToast(`تم نسخ كود الغرفة: ${playerState.currentRoomId}`);
  }).catch(() => prompt('انسخ كود الغرفة:', playerState.currentRoomId));
}
if (elements.btnCopyCodeWait) elements.btnCopyCodeWait.onclick = copyRoomCode;
if (elements.btnCopyCodeGame) elements.btnCopyCodeGame.onclick = copyRoomCode;

// بدء الجيم ومغادرته
if (elements.btnStartGame) {
  elements.btnStartGame.onclick = () => socket.emit('startGame', playerState.currentRoomId);
}

const btnLeave = document.getElementById('btn-leave');
if (btnLeave) {
  btnLeave.onclick = () => {
    if (confirm('هل أنت متأكد من الخروج من الغرفة؟')) {
      socket.emit('leaveRoom', playerState.currentRoomId);
      localStorage.removeItem('kamelha_room');
      location.reload();
    }
  };
}

// -------------------------------------------------------------
// 4. السحب واللعب والتبديل على الطاولة
// -------------------------------------------------------------
const drawDeckBtn = document.getElementById('draw-deck');
const discardDeckBtn = document.getElementById('discard-deck');
const btnKamelha = document.getElementById('btn-kamelha');

if (drawDeckBtn) {
  drawDeckBtn.onclick = () => {
    if (!isMyTurn) return showToast('مش دورك!');
    if (getCurrentDrawnCard()) return alert('أنت سحبت كارت بالفعل!');
    soundService.playDraw();
    socket.emit('drawCard', playerState.currentRoomId);
  };
}

if (discardDeckBtn) {
  discardDeckBtn.onclick = () => {
    if (!isMyTurn) {
      openInspectDiscardPileModal();
      return;
    }

    if (getCurrentDrawnCard()) return alert('أنت سحبت كارت مقلوب بالفعل!');
    showToast('اضغط على كارت من إيدك لتبديله مع كارت الأرض!');
    pickCardFromHand(index => {
      soundService.playPlace();
      socket.emit('takeDiscardCard', { roomId: playerState.currentRoomId, handCardIndex: index });
    });
  };
}

if (btnKamelha) {
  btnKamelha.onclick = () => {
    soundService.playKamelha();
    socket.emit('callKamelha', playerState.currentRoomId);
  };
}

function openInspectDiscardPileModal() {
  const ground = (playerState.gameState && playerState.gameState.discardPile) ? playerState.gameState.discardPile : [];
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
  html += '<button class="btn primary-btn" onclick="window.closeModal()" style="margin-top:12px;">إغلاق</button>';
  openModal(html);
}

// -------------------------------------------------------------
// 5. استقبال أحداث السوكيت
// -------------------------------------------------------------
socket.on('gateAccessGranted', (data) => {
  const code = (data && data.voucherCode) ? data.voucherCode : 'active';
  sessionStorage.setItem('kamelha_gate_ticket', code);
  showScreen(elements.lobbyScreen);
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

socket.on('notify', msg => showToast(msg));
socket.on('errorMsg', msg => alert(msg));
socket.on('soundTrigger', (type) => {
  if (type === 'kamelha') soundService.playKamelha();
});

socket.on('roomJoined', ({ roomId, players, isHost }) => {
  playerState.currentRoomId = roomId;
  playerState.isHost = isHost;
  localStorage.setItem('kamelha_room', roomId);

  showScreen(elements.waitingScreen);
  if (elements.displayRoomCode) elements.displayRoomCode.innerText = roomId;
  const gameRoomCodeTxt = document.getElementById('game-room-code-txt');
  if (gameRoomCodeTxt) gameRoomCodeTxt.innerText = roomId;

  renderWaitingPlayers(players);
  if (isHost && elements.btnStartGame) {
    elements.btnStartGame.classList.remove('hidden');
    const waitMsg = document.getElementById('wait-msg');
    if (waitMsg) waitMsg.classList.add('hidden');
  }
});

socket.on('updatePlayers', players => renderWaitingPlayers(players));

function renderWaitingPlayers(players) {
  if (!elements.playersListDiv) return;
  elements.playersListDiv.innerHTML = '';
  const playerCount = document.getElementById('player-count');
  if (playerCount) playerCount.innerText = players.length;
  players.forEach(p => {
    const li = document.createElement('li');
    li.innerText = `${p.isHost ? '★ ' : ''}${p.name}`;
    elements.playersListDiv.appendChild(li);
  });
}

socket.on('hostMigrated', ({ newHostId, newHostName }) => {
  if (newHostId === socket.id && elements.btnStartGame) {
    elements.btnStartGame.classList.remove('hidden');
    const waitMsg = document.getElementById('wait-msg');
    if (waitMsg) waitMsg.classList.add('hidden');
    showToast('أصبحت أنت قائد الغرفة الجديد!');
  }
});

socket.on('cardDrawn', card => {
  setCurrentDrawnCard(card);
  soundService.playDraw();
  if (card.type === 'number' || (card.type === 'command' && (card.cmdType === 'joker' || card.cmdType === 'mirror'))) {
    handleNumberOrJokerModal(card);
  } else {
    handleCommandCardModal(card);
  }
});

socket.on('mirrorPrompt', showMirrorPrompt);
socket.on('tieVotePrompt', showTieVotePrompt);
socket.on('tieVoteResolved', () => closeModal());
socket.on('tieVoteUpdate', updateTieVotesList);

socket.on('huntTargetHasCard', ({ targetName, itemName }) => {
  soundService.play('hunt_hit');
  showToast(`نجح الصيد! (${targetName}) معه كارت ${itemName}!`);
  openModal(`
    <h2 style="color:#00e676;">الصيد نجح!</h2>
    <p>اللاعب <b>${targetName}</b> معه كارت <b>${itemName}</b>!</p>
    <button id="btn-confirm-hunt-pick" class="btn primary-btn">اختر كارتك للمبادلة</button>
  `);

  document.getElementById('btn-confirm-hunt-pick').onclick = () => {
    closeModal();
    showToast('اضغط على كارت من يدك لإعطائه له:');
    pickCardFromHand(handIdx => {
      setCurrentDrawnCard(null);
      socket.emit('confirmHuntSwap', { roomId: playerState.currentRoomId, handCardIndexToGive: handIdx });
    });
  };
});

socket.on('thiefFoundInHand', ({ victimName, itemName }) => {
  handleThiefSuccessPrompt('سرقة من يد الخصم!', `الحرامي سرق كارت <b>${itemName}</b> من يد <b>${victimName}</b>! اضغط لاختيار كارت لتبديله معه:`);
});

socket.on('thiefFoundOnGround', ({ itemName }) => {
  handleThiefSuccessPrompt('سرقة من الأرض!', `التقط الحرامي كارت <b>${itemName}</b> من الأرض! اضغط لاختيار كارت لترميه مكانه:`);
});

socket.on('thiefFoundInDeck', ({ itemName }) => {
  handleThiefSuccessPrompt('سرقة من قلب الديك!', `أخرج الحرامي كارت <b>${itemName}</b> من قلب كروت السحب المقلوبة! اضغط لاختيار كارت لترميه مكانه:`);
});

socket.on('annoy2PPeekResult', (peekedCard) => {
  openModal(`
    <h2>كارت الخصم المسحوب:</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(peekedCard)}</div>
    <p>هل يعجبك وتريد تبديله بكارت من يدك؟</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-annoy-swap" class="btn primary-btn">نعم، بدله بكارت من إيدي</button>
      <button id="btn-annoy-keep" class="btn secondary-btn">لا، اتركه مكانه للخصم</button>
    </div>
  `);

  document.getElementById('btn-annoy-swap').onclick = () => {
    closeModal();
    showToast('اختر كارت من يدك لإعطائه للخصم:');
    pickCardFromHand(handIdx => {
      setCurrentDrawnCard(null);
      soundService.playPlace();
      socket.emit('resolveAnnoy2P', { roomId: playerState.currentRoomId, swap: true, handCardIndexToGive: handIdx });
    });
  };

  document.getElementById('btn-annoy-keep').onclick = () => {
    closeModal();
    setCurrentDrawnCard(null);
    socket.emit('resolveAnnoy2P', { roomId: playerState.currentRoomId, swap: false });
  };
});

socket.on('spinCasterPrompt', () => {
  openModal(`
    <h2>كارت شقلباظ</h2>
    <p>هل تريد مشاركة وتمرير كارت من يدك؟ أم ترغب في الاحتفاظ بكروتك في أمان؟</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button id="btn-spin-yes" class="btn primary-btn">نعم، شارك وبدل كارت</button>
      <button id="btn-spin-no" class="btn secondary-btn">لا، احتفظ بكروتي كما هي</button>
    </div>
  `);
  document.getElementById('btn-spin-yes').onclick = () => {
    closeModal();
    socket.emit('resolveSpinCasterChoice', { roomId: playerState.currentRoomId, participate: true });
  };
  document.getElementById('btn-spin-no').onclick = () => {
    closeModal();
    socket.emit('resolveSpinCasterChoice', { roomId: playerState.currentRoomId, participate: false });
  };
});

socket.on('spinRequest', () => {
  showToast('كارت شقلباظ! اختر كارت من يدك لتمريره لجارك:');
  pickCardFromHand(index => {
    soundService.playPlace();
    socket.emit('submitSpinCard', { roomId: playerState.currentRoomId, handCardIndex: index });
  });
});

socket.on('fireCasterPrompt', () => {
  openModal(`
    <h2>كارت ولعانة</h2>
    <p>هل ترغب في التضحية بكارت من يدك واستبداله؟ أم تريد إبقاء يدك كما هي؟</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button id="btn-fire-yes" class="btn primary-btn">نعم، استبدل كارت</button>
      <button id="btn-fire-no" class="btn secondary-btn">لا، احتفظ بكروتي كما هي</button>
    </div>
  `);
  document.getElementById('btn-fire-yes').onclick = () => {
    closeModal();
    socket.emit('resolveFireCasterChoice', { roomId: playerState.currentRoomId, burn: true });
  };
  document.getElementById('btn-fire-no').onclick = () => {
    closeModal();
    socket.emit('resolveFireCasterChoice', { roomId: playerState.currentRoomId, burn: false });
  };
});

socket.on('fireRequest', () => {
  showToast('كارت ولعانة! اختر كارت من يدك لرميه في الأرض واستبداله:');
  pickCardFromHand(index => {
    soundService.playPlace();
    socket.emit('submitFireCard', { roomId: playerState.currentRoomId, handCardIndex: index });
  });
});

socket.on('commandSplash', ({ cmdType, cmdName, playerName }) => {
  showCommandSplash(cmdType, cmdName, playerName);
});

socket.on('kedaAnimation', ({ targetId, targetName }) => {
  soundService.playCommandSound('keda');
  showToast(`كارت هو كدة! تطايرت كروت ${targetName} إلى الأرض!`);
});

socket.on('annoySwapAnimation', () => {
  soundService.playShuffle();
  showToast('رخم عليهم: تم تبديل كارتين سراً بين اللاعبين في الهواء!');
});

socket.on('playerDrewCardAnim', ({ playerId }) => {
  if (playerId !== socket.id) soundService.playDraw();
});

socket.on('animateDealing', () => {
  soundService.playShuffle();
  showToast('جاري تفنيط وتوزيع الكروت على اللاعبين...');
});

// استقبال حالة اللعبة وتحديث الواجهة
socket.on('gameState', data => {
  playerState.gameState = data;
  if (!data.hasDrawn) setCurrentDrawnCard(null);

  if (data.gameStarted) {
    showScreen(elements.gameScreen);
  }

  const gameRoomCodeTxt = document.getElementById('game-room-code-txt');
  if (data.roomId && gameRoomCodeTxt) {
    gameRoomCodeTxt.innerText = data.roomId;
    playerState.currentRoomId = data.roomId;
  }

  isMyTurn = data.currentTurn === socket.id;
  const currentPlayerName = document.getElementById('current-player-name');
  if (currentPlayerName) {
    currentPlayerName.innerText = isMyTurn ? 'أنت (دورك)!' : data.currentTurnName;
    currentPlayerName.parentElement.style.background = isMyTurn ? '#00e676' : '#ffcc00';
  }

  if (btnKamelha) {
    if (data.canCallKamelha) {
      btnKamelha.classList.add('kamelha-ready-glow');
      if (!hasAlertedKamelhaReady) {
        hasAlertedKamelhaReady = true;
        showToast('كروتك اكتملت! تقدر تضغط على زرار كمّلتهااا! دلوقتي');
        soundService.playKamelha();
      }
    } else {
      btnKamelha.classList.remove('kamelha-ready-glow');
      hasAlertedKamelhaReady = false;
    }
  }

  if (elements.matchRulesTag) {
    const pts = data.targetPoints;
    const rnds = data.maxRounds;

    if (pts > 0 && rnds > 0) {
      elements.matchRulesTag.innerText = `الهدف: ${pts} نقاط أو انتهاء الجولات | الجولة (${data.roundCount} من ${rnds})`;
    } else if (pts > 0 && rnds === 0) {
      elements.matchRulesTag.innerText = `الهدف: أول من يجمع ${pts} نقاط (جولات مفتوحة) | الجولة ${data.roundCount}`;
    } else if (pts === 0 && rnds > 0) {
      elements.matchRulesTag.innerText = `الجولة (${data.roundCount} من ${rnds}) | الأعلى نقاطاً عند النهاية يفوز`;
    } else {
      elements.matchRulesTag.innerText = `الهدف: مفتوح | الجولة ${data.roundCount}`;
    }
  }

  if (data.turnDeadline) {
    updateTurnTimer(data.turnDeadline, data.turnDuration || 15);
  }

  const deckCounter = document.getElementById('deck-counter');
  if (deckCounter) deckCounter.innerText = data.deckCount;
  renderMessyDiscardPile(data.topDiscard, data.discardPile);

  const myHandDiv = document.getElementById('my-hand');
  if (myHandDiv) {
    myHandDiv.innerHTML = '';
    data.hand.forEach(c => {
      const el = document.createElement('div');
      el.innerHTML = createCardHTML(c);
      myHandDiv.appendChild(el.firstElementChild);
    });
  }

  updateTableSeats(data.players, socket.id, data.currentTurn);
});

socket.on('roundEnded', showRoundEndedModal);
socket.on('gameOver', showGameOverModal);

socket.on('playerBackInWaiting', ({ roomId, players, isHost }) => {
  playerState.isHost = isHost;
  showScreen(elements.waitingScreen);
  renderWaitingPlayers(players);
  if (isHost && elements.btnStartGame) {
    elements.btnStartGame.classList.remove('hidden');
    const waitMsg = document.getElementById('wait-msg');
    if (waitMsg) waitMsg.classList.add('hidden');
  }
});

// إعادة الاتصال التلقائي لو كان في روم سابق
window.addEventListener('load', () => {
  if (playerState.currentRoomId) {
    socket.emit('reconnectPlayer', { roomId: playerState.currentRoomId, playerId: myPlayerId });
  }
});

socket.on('reconnectFailed', () => {
  localStorage.removeItem('kamelha_room');
  playerState.currentRoomId = null;
});
