// خدمة الاتصال بالسيرفر بالسوكيت
export const socket = window.io ? window.io() : null;

export const myPlayerId = (() => {
  let uid = localStorage.getItem('kamelha_uid');
  if (!uid) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    uid = 'WL-' + randomNum;
    localStorage.setItem('kamelha_uid', uid);
  }
  return uid;
})();

export const playerState = {
  currentRoomId: localStorage.getItem('kamelha_room') || null,
  isHost: false,
  myName: localStorage.getItem('kamelha_name') || 'لاعب',
  myHand: [],
  gameState: null
};
