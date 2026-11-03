import { socket, playerState } from '../../services/socketService.js';
import { soundService } from '../../services/soundService.js';
import { openModal, closeModal, showToast } from '../screenManager.js';
import { createCardHTML } from '../tableRenderer.js';

let currentDrawnCard = null;
let currentSelectedMagnetCard = null;

export function setCurrentDrawnCard(c) {
  currentDrawnCard = c;
}

export function getCurrentDrawnCard() {
  return currentDrawnCard;
}

export function handleNumberOrJokerModal(card) {
  const isMirror = card.cmdType === 'mirror';
  openModal(`
    <h2>الكارت المسحوب:</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(card)}</div>
    <p>${isMirror ? 'كارت المراية بيحميك طول ما هو في إيدك!' : 'ماذا تريد أن تفعل؟'}</p>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-swap" class="btn btn-swap-green">خده في إيدك وبدله</button>
      <button id="btn-discard" class="btn btn-discard-red">ارميه على الأرض</button>
    </div>
  `);

  document.getElementById('btn-discard').onclick = () => {
    closeModal();
    soundService.playPlace();
    socket.emit('discardDrawnCard', playerState.currentRoomId);
    currentDrawnCard = null;
  };

  document.getElementById('btn-swap').onclick = () => {
    closeModal();
    showToast('اختار الكارت اللي عايز ترميه من إيدك:');
    pickCardFromHand(index => {
      soundService.playPlace();
      socket.emit('swapWithHand', { roomId: playerState.currentRoomId, handCardIndex: index });
      currentDrawnCard = null;
    });
  };
}

export function handleCommandCardModal(card) {
  const actions = {
    reverse: () => {
      currentDrawnCard = null;
      socket.emit('execReverse', playerState.currentRoomId);
    },
    keda: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openPlayerPicker('اختار لاعباً لتبديل كل كروته:', targetId => {
        currentDrawnCard = null;
        soundService.playCommandSound('keda');
        socket.emit('execKeda', { roomId: playerState.currentRoomId, targetPlayerId: targetId });
      });
    },
    bank: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openBankPicker();
    },
    hunt: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openHuntFlow();
    },
    thief: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openThiefFlow();
    },
    annoy: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openAnnoyFlow();
    },
    wild: () => openWildFlow(),

    reveal: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openPlayerPicker('اختر لاعباً لكشف كروته للجميع:', targetId => {
        currentDrawnCard = null;
        soundService.playCommandSound('reveal');
        socket.emit('execReveal', { roomId: playerState.currentRoomId, targetPlayerId: targetId });
      });
    },
    swap: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openPlayerPicker('اختر لاعباً لتبديل إيدك بالكامل معه:', targetId => {
        currentDrawnCard = null;
        soundService.playCommandSound('swap');
        socket.emit('execSwapHand', { roomId: playerState.currentRoomId, targetPlayerId: targetId });
      });
    },
    freeze: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openPlayerPicker('اختر لاعباً لفرملته وتجميد دوره:', targetId => {
        currentDrawnCard = null;
        soundService.playCommandSound('freeze');
        socket.emit('execFreeze', { roomId: playerState.currentRoomId, targetPlayerId: targetId });
      });
    },
    spin: () => {
      currentDrawnCard = null;
      soundService.playCommandSound('spin');
      socket.emit('execSpin', playerState.currentRoomId);
    },
    ambush: () => {
      currentDrawnCard = null;
      soundService.playCommandSound('ambush');
      socket.emit('execAmbush', playerState.currentRoomId);
    },
    magnet: () => {
      openVisualMagnetPicker();
    },
    curse: () => {
      socket.emit('extendTimerForCommand', playerState.currentRoomId);
      openPlayerPicker('اختر لاعباً لمنعه من السحب من الأرض:', targetId => {
        currentDrawnCard = null;
        soundService.playCommandSound('curse');
        socket.emit('execCurse', { roomId: playerState.currentRoomId, targetPlayerId: targetId });
      });
    },
    fire: () => {
      currentDrawnCard = null;
      soundService.playCommandSound('fire');
      socket.emit('execFire', playerState.currentRoomId);
    }
  };

  openModal(`
    <h2>سحبت كوماند: ${card.name}!</h2>
    <div style="display:flex;justify-content:center;margin:15px 0;">${createCardHTML(card)}</div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      <button id="btn-run-cmd" class="btn primary-btn">تفعيل الأمر الآن</button>
      <button id="btn-drop-cmd" class="btn secondary-btn">رميه بدون تفعيل</button>
    </div>
  `);

  document.getElementById('btn-run-cmd').onclick = () => {
    closeModal();
    if (actions[card.cmdType]) actions[card.cmdType]();
  };
  document.getElementById('btn-drop-cmd').onclick = () => {
    closeModal();
    soundService.playPlace();
    socket.emit('discardDrawnCard', playerState.currentRoomId);
    currentDrawnCard = null;
  };
}

export function cancelCommandExecution() {
  closeModal();
  currentDrawnCard = null;
  soundService.playPlace();
  socket.emit('cancelCommand', playerState.currentRoomId);
}

export function openBankPicker() {
  const ground = playerState.gameState ? playerState.gameState.discardPile : [];
  let html = '<h2>اختر أي كارت من الأرض:</h2><div class="modal-grid">';
  ground.forEach((c, idx) => {
    html += `<div class="bank-pick-card" data-idx="${idx}">${createCardHTML(c)}</div>`;
  });
  html += '</div>';
  html += '<button id="btn-cancel-bank" class="btn secondary-btn" style="margin-top:10px;">إلغاء ورمي الكارت</button>';
  openModal(html);

  document.getElementById('btn-cancel-bank').onclick = cancelCommandExecution;

  document.querySelectorAll('.bank-pick-card').forEach(el => {
    el.onclick = () => {
      const discardIdx = parseInt(el.getAttribute('data-idx'));
      closeModal();
      showToast('اختار كارت من إيدك لوضعه مكانه:');
      pickCardFromHand(handIdx => {
        currentDrawnCard = null;
        soundService.playPlace();
        socket.emit('execBank', { roomId: playerState.currentRoomId, discardIndex: discardIdx, handCardIndex: handIdx });
      });
    };
  });
}

export function openHuntFlow() {
  openPlayerPicker('اختر لاعباً لتصطاد منه:', targetId => {
    let html = '<h2>اختر الكارت الذي تبحث عنه:</h2><div class="hunt-grid">';
    for (let i = 1; i <= 10; i++) {
      html += `<button class="btn secondary-btn hunt-num-btn" data-val="${i}">${i}</button>`;
    }
    html += '</div>';
    html += '<button id="btn-hunt-joker" class="btn primary-btn" style="margin-top:8px;background:#00bcd4;color:#fff;">صيد كارت الجوكر</button>';
    html += '<button id="btn-cancel-hunt" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
    openModal(html);

    document.getElementById('btn-cancel-hunt').onclick = cancelCommandExecution;

    document.getElementById('btn-hunt-joker').onclick = () => {
      closeModal();
      soundService.play('hunt_aim');
      socket.emit('checkHuntTarget', {
        roomId: playerState.currentRoomId,
        targetPlayerId: targetId,
        requestedItem: 'joker'
      });
    };

    document.querySelectorAll('.hunt-num-btn').forEach(b => {
      b.onclick = () => {
        const item = b.getAttribute('data-val');
        closeModal();
        soundService.play('hunt_aim');
        socket.emit('checkHuntTarget', {
          roomId: playerState.currentRoomId,
          targetPlayerId: targetId,
          requestedItem: item
        });
      };
    });
  });
}

export function openThiefFlow() {
  let html = '<h2>كارت الحرامي!</h2>';
  html += '<p style="font-size:0.85rem;color:#ccc;">اختر الكارت المطلوب، وسيأتي إليك حتماً (من يد الخصم، أو الأرض، أو السحب)!</p>';
  html += '<div class="hunt-grid">';
  for (let i = 1; i <= 10; i++) {
    html += `<button class="btn secondary-btn thief-select-btn" data-val="${i}">${i}</button>`;
  }
  html += '</div>';
  html += '<button id="btn-thief-joker" class="btn primary-btn" style="margin-top:8px;background:#00bcd4;color:#fff;">سرقة كارت الجوكر</button>';
  html += '<button id="btn-cancel-thief" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
  openModal(html);

  document.getElementById('btn-cancel-thief').onclick = cancelCommandExecution;

  document.getElementById('btn-thief-joker').onclick = () => {
    closeModal();
    soundService.play('thief');
    socket.emit('executeThief', { roomId: playerState.currentRoomId, requestedItem: 'joker' });
  };

  document.querySelectorAll('.thief-select-btn').forEach(b => {
    b.onclick = () => {
      const item = b.getAttribute('data-val');
      closeModal();
      soundService.play('thief');
      socket.emit('executeThief', { roomId: playerState.currentRoomId, requestedItem: item });
    };
  });
}

export function handleThiefSuccessPrompt(title, text) {
  soundService.play('thief');
  openModal(`
    <h2 style="color:#00e676;">${title}</h2>
    <p>${text}</p>
    <button id="btn-thief-pick-mine" class="btn primary-btn">اختر كارتك الآن</button>
  `);

  document.getElementById('btn-thief-pick-mine').onclick = () => {
    closeModal();
    showToast('اضغط على كارت من يدك لإكمال التبديل:');
    pickCardFromHand(handIdx => {
      currentDrawnCard = null;
      socket.emit('confirmThiefSwap', { roomId: playerState.currentRoomId, handCardIndexToGive: handIdx });
    });
  };
}

export function openAnnoyFlow() {
  const others = playerState.gameState ? playerState.gameState.players.filter(p => p.id !== socket.id && !p.isImmune) : [];
  if (others.length === 0) {
    alert('الخصوم جميعاً قالوا كملها ومحميون بقفل الحصانة!');
    cancelCommandExecution();
    return;
  }

  if (others.length === 1 && playerState.gameState.players.length === 2) {
    socket.emit('peekAnnoy2P', playerState.currentRoomId);
  } else {
    let html = '<h2>اختر لاعبين للتبديل بينهما:</h2>';
    others.forEach(p => {
      html += `<button class="btn secondary-btn annoy-p-btn" style="margin-bottom:8px;" data-id="${p.id}">${p.name}</button>`;
    });
    html += '<button id="btn-cancel-annoy" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
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
          soundService.playCommandSound('annoy');
          socket.emit('execAnnoyMulti', { roomId: playerState.currentRoomId, playerAId: selected[0], playerBId: selected[1] });
        }
      };
    });
  }
}

export function openWildFlow() {
  const isCustom = playerState.gameState && playerState.gameState.deckMode === 'custom';
  const customCmds = (playerState.gameState && Array.isArray(playerState.gameState.customCommands)) ? playerState.gameState.customCommands : [];

  const commandNames = {
    thief: 'الحرامي',
    reveal: 'ع المكشوف',
    swap: 'بدّل يا نجم',
    freeze: 'فرملة',
    spin: 'شقلباظ',
    ambush: 'الكمين',
    magnet: 'المغناطيس',
    curse: 'عين حسودة',
    fire: 'ولعانة',
    hunt: 'اصطاد كارتك',
    bank: 'لم كمالتك',
    reverse: 'اعكس لفتك',
    keda: 'هو كدة',
    annoy: 'رخم عليهم'
  };

  let html = '<h2>كارت براحتك!</h2>';
  html += '<p style="font-size:0.85rem;color:#ccc;margin-bottom:10px;">اختر الكوماند الذي تريد تحويل الكارت إليه:</p>';
  html += '<div style="display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto;padding-right:4px;">';

  if (!isCustom) {
    const classicList = ['hunt', 'bank', 'reverse', 'keda', 'annoy'];
    classicList.forEach(cmdKey => {
      html += `<button class="btn primary-btn wild-opt" data-type="${cmdKey}">${commandNames[cmdKey]}</button>`;
    });
  } else {
    customCmds.forEach(cmdKey => {
      if (commandNames[cmdKey]) {
        html += `<button class="btn primary-btn wild-opt" data-type="${cmdKey}">${commandNames[cmdKey]}</button>`;
      }
    });
  }

  html += '<button id="btn-cancel-wild" class="btn secondary-btn" style="margin-top:6px;">إلغاء ورمي الكارت</button>';
  html += '</div>';

  openModal(html);

  document.getElementById('btn-cancel-wild').onclick = cancelCommandExecution;

  document.querySelectorAll('.wild-opt').forEach(btn => {
    btn.onclick = () => {
      const type = btn.getAttribute('data-type');
      closeModal();
      soundService.playCommandSound('wild');
      socket.emit('execWildAs', { roomId: playerState.currentRoomId, chosenCmdType: type });
    };
  });
}

export function openVisualMagnetPicker() {
  socket.emit('extendTimerForCommand', playerState.currentRoomId);
  const ground = playerState.gameState ? playerState.gameState.discardPile : [];
  if (!ground || ground.length === 0) {
    showToast('لا توجد كروت في الأرض لشفطها بالمغناطيس!');
    cancelCommandExecution();
    return;
  }

  currentSelectedMagnetCard = null;

  let html = '<h2>اختر أي كارت من الأرض ليشفط المغناطيس كل مثيلاته:</h2>';
  html += '<p style="font-size:0.8rem;color:#ccc;margin-bottom:8px;">اضغط على الكارت لمشاهدة الفريم المضيء ثم اضغط تأكيد:</p>';
  html += '<div class="modal-grid" id="magnet-modal-grid">';
  ground.forEach((c, idx) => {
    html += `<div class="bank-pick-card magnet-ground-card" data-idx="${idx}">${createCardHTML(c)}</div>`;
  });
  html += '</div>';
  html += '<button id="btn-confirm-magnet" class="btn primary-btn" style="display:none;margin-top:10px;">تأكيد الكروت المختارة</button>';
  html += '<button id="btn-cancel-magnet-pick" class="btn secondary-btn" style="margin-top:8px;">إلغاء ورمي الكارت</button>';
  openModal(html);

  document.getElementById('btn-cancel-magnet-pick').onclick = cancelCommandExecution;

  const confirmBtn = document.getElementById('btn-confirm-magnet');
  const cardElements = document.querySelectorAll('.magnet-ground-card');

  cardElements.forEach(el => {
    el.onclick = () => {
      const idx = parseInt(el.getAttribute('data-idx'));
      const chosen = ground[idx];
      currentSelectedMagnetCard = chosen;

      const isJoker = chosen.type === 'command' && chosen.cmdType === 'joker';

      cardElements.forEach(otherEl => {
        const otherIdx = parseInt(otherEl.getAttribute('data-idx'));
        const otherCard = ground[otherIdx];
        const isMatch = isJoker 
          ? (otherCard.type === 'command' && otherCard.cmdType === 'joker') 
          : (otherCard.type === 'number' && otherCard.value === chosen.value);

        if (isMatch) {
          otherEl.classList.add('mini-card-revealed');
        } else {
          otherEl.classList.remove('mini-card-revealed');
        }
      });

      if (confirmBtn) {
        confirmBtn.style.display = 'block';
      }
    };
  });

  if (confirmBtn) {
    confirmBtn.onclick = () => {
      if (!currentSelectedMagnetCard) return;
      closeModal();
      currentDrawnCard = null;
      soundService.playCommandSound('magnet');
      socket.emit('execMagnetPick', {
        roomId: playerState.currentRoomId,
        targetType: currentSelectedMagnetCard.type,
        targetValue: currentSelectedMagnetCard.value,
        targetCmdType: currentSelectedMagnetCard.cmdType
      });
    };
  }
}

export function handleMagnetChooseDiscards({ count, itemName }) {
  showToast(`شفط المغناطيس (${count}) ${itemName}! اختر (${count}) كروت من يدك لرميها في الأرض:`);
  const selectedIndices = [];

  function promptPickNext() {
    pickCardFromHand(index => {
      selectedIndices.push(index);
      if (selectedIndices.length < count) {
        showToast(`اختر الكارت رقم (${selectedIndices.length + 1}) لرميه:`);
        promptPickNext();
      } else {
        soundService.playPlace();
        socket.emit('submitMagnetDiscards', {
          roomId: playerState.currentRoomId,
          discardIndices: selectedIndices
        });
      }
    });
  }

  promptPickNext();
}

export function openPlayerPicker(title, onSelect) {
  const others = playerState.gameState ? playerState.gameState.players.filter(p => p.id !== socket.id && !p.isImmune) : [];
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
  openModal(html);

  document.getElementById('btn-cancel-picker').onclick = cancelCommandExecution;

  document.querySelectorAll('.pick-target-btn').forEach(b => {
    b.onclick = () => {
      closeModal();
      onSelect(b.getAttribute('data-id'));
    };
  });
}

export function pickCardFromHand(callback) {
  const myHandDiv = document.getElementById('my-hand');
  if (!myHandDiv) return;
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
