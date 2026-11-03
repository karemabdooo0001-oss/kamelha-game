import { elements } from './screenManager.js';
import { soundService } from '../services/soundService.js';

let timerInterval = null;

export function createCardHTML(card) {
  if (!card) return '';
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

export function renderMessyDiscardPile(topCard, discardHistory) {
  if (!elements.messyDiscardPile) return;

  if (!topCard) {
    elements.messyDiscardPile.innerHTML = '<div id="top-discard-card" class="card-placeholder">لا يوجد</div>';
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

  elements.messyDiscardPile.innerHTML = html;
}

export function updateTableSeats(players, myId, currentTurnId) {
  const me = players.find(p => p.id === myId);
  if (me) {
    if (elements.myNameDisplay) elements.myNameDisplay.innerText = `${me.isHost ? '★ ' : ''}${me.name}`;
    if (elements.myScoreDisplay) elements.myScoreDisplay.innerText = `${me.points}ن`;
    
    if (elements.spotBottom) {
      if (me.id === currentTurnId) {
        elements.spotBottom.classList.add('active-turn-seat');
      } else {
        elements.spotBottom.classList.remove('active-turn-seat');
      }
    }
  }

  const otherPlayers = players.filter(p => p.id !== myId);

  if (elements.spotTop) elements.spotTop.classList.add('hidden');
  if (elements.spotLeft) elements.spotLeft.classList.add('hidden');
  if (elements.spotRight) elements.spotRight.classList.add('hidden');

  if (otherPlayers.length === 1) {
    renderSeat(elements.spotTop, otherPlayers[0], currentTurnId);
  } else if (otherPlayers.length === 2) {
    renderSeat(elements.spotLeft, otherPlayers[0], currentTurnId);
    renderSeat(elements.spotTop, otherPlayers[1], currentTurnId);
  } else if (otherPlayers.length >= 3) {
    renderSeat(elements.spotLeft, otherPlayers[0], currentTurnId);
    renderSeat(elements.spotTop, otherPlayers[1], currentTurnId);
    renderSeat(elements.spotRight, otherPlayers[2], currentTurnId);
  }
}

export function renderSeat(seatEl, player, currentTurnId) {
  if (!seatEl) return;
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
  if (nameEl) {
    nameEl.innerHTML = `${player.isHost ? '★ ' : ''}${player.name} ${player.isImmune ? '(حصانة)' : ''} ${curseTag} ${frozenTag} ${isTurn ? '<b style="color:#00e676;">• دورك</b>' : ''}`;
  }
  if (scoreEl) {
    scoreEl.innerText = `${player.points}ن`;
  }

  if (cardsEl) {
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
}

export function updateTurnTimer(deadline, totalSeconds) {
  clearInterval(timerInterval);
  const timerBar = elements.timerBar;
  const timerSec = elements.timerSec;
  if (!timerBar || !timerSec) return;

  timerInterval = setInterval(() => {
    const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timerSec.innerText = remaining;

    if (remaining <= 3 && remaining > 0) {
      soundService.playTick();
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
