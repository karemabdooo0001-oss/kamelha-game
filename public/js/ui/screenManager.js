import { soundService } from '../services/soundService.js';

export const elements = {
  gateScreen: document.getElementById('gate-screen'),
  gatePassInput: document.getElementById('gate-pass-input'),
  btnSubmitGate: document.getElementById('btn-submit-gate'),
  
  lobbyScreen: document.getElementById('lobby-screen'),
  createRoomScreen: document.getElementById('create-room-screen'),
  joinRoomScreen: document.getElementById('join-room-screen'),
  waitingScreen: document.getElementById('waiting-screen'),
  gameScreen: document.getElementById('game-screen'),
  toastBanner: document.getElementById('toast-banner'),
  
  displayMyUid: document.getElementById('display-my-uid'),
  playerNameInput: document.getElementById('player-name'),
  roomCodeInput: document.getElementById('room-code-input'),
  displayRoomCode: document.getElementById('display-room-code'),
  waitingRoomCode: document.getElementById('waiting-room-code'),
  playersListDiv: document.getElementById('players-list'),
  btnStartGame: document.getElementById('btn-start-game'),
  
  targetPointsInput: document.getElementById('target-points-input'),
  maxRoundsInput: document.getElementById('max-rounds-input'),
  matchRulesTag: document.getElementById('match-rules-tag'),
  deckModeSelect: document.getElementById('deck-mode-select'),
  customCommandsBox: document.getElementById('custom-commands-box'),
  
  commandSplash: document.getElementById('command-splash'),
  splashIcon: document.getElementById('splash-icon'),
  splashTitle: document.getElementById('splash-title'),
  splashPlayer: document.getElementById('splash-player'),
  
  spotTop: document.getElementById('spot-top'),
  spotLeft: document.getElementById('spot-left'),
  spotRight: document.getElementById('spot-right'),
  spotBottom: document.getElementById('spot-bottom'),
  
  myNameDisplay: document.getElementById('my-name-display'),
  myScoreDisplay: document.getElementById('my-score-display'),
  messyDiscardPile: document.getElementById('messy-discard-pile'),
  deckPile: document.getElementById('deck-pile'),
  deckCountBadge: document.getElementById('deck-count-badge'),
  
  modalOverlay: document.getElementById('modal-overlay'),
  modalContainer: document.getElementById('modal-container'),
  
  btnCallKamelha: document.getElementById('btn-call-kamelha'),
  btnInspectDiscard: document.getElementById('btn-inspect-discard'),
  btnCopyCodeWait: document.getElementById('btn-copy-code-wait'),
  btnCopyCodeGame: document.getElementById('btn-copy-code-game'),
  btnLeaveGame: document.getElementById('btn-leave-game'),
  
  turnTimerBar: document.getElementById('turn-timer-bar'),
  turnTimerSecs: document.getElementById('turn-timer-secs')
};

export function showScreen(screenEl) {
  const screens = [
    elements.gateScreen,
    elements.lobbyScreen,
    elements.createRoomScreen,
    elements.joinRoomScreen,
    elements.waitingScreen,
    elements.gameScreen
  ];
  screens.forEach(s => {
    if (s) {
      if (s === screenEl) s.classList.remove('hidden');
      else s.classList.add('hidden');
    }
  });
}

export function showToast(msg) {
  if (!elements.toastBanner) return;
  elements.toastBanner.innerText = msg;
  elements.toastBanner.classList.remove('hidden');
  setTimeout(() => {
    if (elements.toastBanner) elements.toastBanner.classList.add('hidden');
  }, 4000);
}

export function openModal(html) {
  if (elements.modalContainer && elements.modalOverlay) {
    elements.modalContainer.innerHTML = html;
    elements.modalOverlay.classList.remove('hidden');
  }
}

export function closeModal() {
  if (elements.modalOverlay) {
    elements.modalOverlay.classList.add('hidden');
  }
}

window.openModal = openModal;
window.closeModal = closeModal;

export function showCommandSplash(cmdType, cmdName, playerName) {
  soundService.playCommandSound(cmdType);
  if (elements.splashIcon) elements.splashIcon.innerText = '★';
  if (elements.splashTitle) elements.splashTitle.innerText = cmdName;
  if (elements.splashPlayer) elements.splashPlayer.innerText = `${playerName} قام بتفعيل الكارت!`;

  if (elements.commandSplash) {
    elements.commandSplash.classList.remove('hidden');
    setTimeout(() => {
      elements.commandSplash.classList.add('hidden');
    }, 1600);
  }
}
