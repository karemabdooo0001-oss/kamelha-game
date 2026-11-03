const { MASTER_KEY, DEFAULT_GAME_PASSCODE } = require('../config');

// التخزين في الذاكرة
const registeredPlayers = new Map();
const bannedPlayerIds = new Set();
const vouchers = new Map();
let GAME_PASSCODE = DEFAULT_GAME_PASSCODE;

function getGamePasscode() {
  return GAME_PASSCODE;
}

function setGamePasscode(newCode) {
  GAME_PASSCODE = newCode;
}

function isPlayerBanned(playerId) {
  return bannedPlayerIds.has(playerId);
}

function registerPlayer(playerId, pData) {
  registeredPlayers.set(playerId, pData);
}

function getPlayer(playerId) {
  return registeredPlayers.get(playerId);
}

function validateVoucher(code, playerId) {
  if (code === GAME_PASSCODE) return { valid: true, msg: 'دخول بكود المطور العام' };

  const v = vouchers.get(code);
  if (!v) return { valid: false, msg: 'كود التذكرة غير موجود أو غير صحيح!' };
  if (v.status === 'ملغاة') return { valid: false, msg: 'تم إلغاء هذه التذكرة بواسطة المطور!' };

  if (v.expiresAt && Date.now() > v.expiresAt) {
    v.status = 'منتهية الصلاحية';
    return { valid: false, msg: 'هذه التذكرة انتهت صلاحيتها الزمنية!' };
  }

  if (v.duration === '1match' && v.usedMatch) {
    return { valid: false, msg: 'تم استخدام هذه التذكرة في جيم سابق وانتهت!' };
  }

  if (v.devices.includes(playerId)) return { valid: true, voucher: v };

  if (v.devices.length >= v.maxDevices) {
    return { valid: false, msg: `عفواً! استهلكت التذكرة الحد الأقصى للأجهزة المصرح بها (${v.maxDevices} جهاز)!` };
  }

  v.devices.push(playerId);
  return { valid: true, voucher: v };
}

function expireRoomOneMatchVouchers(room) {
  if (!room || !room.players) return;
  room.players.forEach(p => {
    for (const [code, v] of vouchers.entries()) {
      if (v.duration === '1match' && v.devices.includes(p.playerId)) {
        v.usedMatch = true;
        v.status = 'منتهية (تم لعب الجيم)';
      }
    }
  });
}

function getAdminDashboardData() {
  return {
    passcode: GAME_PASSCODE,
    players: Array.from(registeredPlayers.values()),
    banned: Array.from(bannedPlayerIds),
    vouchers: Array.from(vouchers.values())
  };
}

function createVoucher({ type, duration, price }) {
  const code = 'KM-' + Math.floor(10000 + Math.random() * 90000);
  const maxDevices = type === 'single' ? 1 : 4;

  let expiresAt = null;
  const now = Date.now();
  if (duration === '1hour') expiresAt = now + (60 * 60 * 1000);
  else if (duration === '1day') expiresAt = now + (24 * 60 * 60 * 1000);
  else if (duration === '7days') expiresAt = now + (7 * 24 * 60 * 60 * 1000);
  else if (duration === '30days') expiresAt = now + (30 * 24 * 60 * 60 * 1000);

  const newVoucher = {
    code,
    type,
    maxDevices,
    duration,
    price: price || '0',
    createdAt: new Date().toLocaleDateString('ar-EG'),
    expiresAt,
    usedMatch: false,
    devices: [],
    status: 'نشطة'
  };

  vouchers.set(code, newVoucher);
  return newVoucher;
}

function deleteVoucher(code) {
  return vouchers.delete(code);
}

function banPlayer(targetPlayerId) {
  bannedPlayerIds.add(targetPlayerId);
}

function unbanPlayer(targetPlayerId) {
  bannedPlayerIds.delete(targetPlayerId);
}

module.exports = {
  getGamePasscode,
  setGamePasscode,
  isPlayerBanned,
  registerPlayer,
  getPlayer,
  validateVoucher,
  expireRoomOneMatchVouchers,
  getAdminDashboardData,
  createVoucher,
  deleteVoucher,
  banPlayer,
  unbanPlayer,
  registeredPlayers,
  bannedPlayerIds,
  vouchers
};
