const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// ================= الإعدادات والأمان =================
const MASTER_KEY = "8050"; // كود الماستر لدخول الأدمن
let GAME_PASSCODE = "2026"; // باسوورد الطوارئ العام

const registeredPlayers = new Map(); // playerId => info
const bannedPlayerIds = new Set(); // قائمة المحظورين
const vouchers = new Map(); // code => voucher data

const rooms = {};
const DEFAULT_TURN_TIME = 15;

function createDeck() {
  const deck = [];
  for (let num = 1; num <= 10; num++) {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `num_${num}_${i}_${Math.random()}`, type: 'number', value: num });
    }
  }
  const commands = [
    { type: 'joker', name: 'جوكر', count: 4 },
    { type: 'hunt', name: 'اصطاد كارتك', count: 4 },
    { type: 'bank', name: 'لم كمالتك', count: 4 },
    { type: 'reverse', name: 'اعكس لفتك', count: 4 },
    { type: 'keda', name: 'هو كدة', count: 2 },
    { type: 'annoy', name: 'رخم عليهم', count: 2 },
    { type: 'wild', name: 'براحتك', count: 2 }
  ];
  commands.forEach(cmd => {
    for (let i = 0; i < cmd.count; i++) {
      deck.push({ id: `cmd_${cmd.type}_${i}_${Math.random()}`, type: 'command', cmdType: cmd.type, name: cmd.name });
    }
  });
  return deck.sort(() => Math.random() - 0.5);
}

function checkDrawDeckRefill(room) {
  if (room.deck.length === 0) {
    if (room.discardPile.length > 1) {
      const top = room.discardPile.pop();
      room.deck = room.discardPile.sort(() => Math.random() - 0.5);
      room.discardPile = [top];
      io.to(room.id).emit('notify', 'تم إعادة تفنيط كروت الأرض لوضعها في السحب!');
    }
  }
}

function verifyKamelhaHand(hand) {
  if (!hand || hand.length !== 4) return { valid: false };
  let jokers = 0;
  const numCounts = {};
  hand.forEach(c => {
    if (c.type === 'command' && c.cmdType === 'joker') jokers++;
    else if (c.type === 'number') numCounts[c.value] = (numCounts[c.value] || 0) + 1;
  });

  if (jokers === 4) return { valid: true, points: 5, isInstantWin: true };

  for (const val in numCounts) {
    if (numCounts[val] + jokers === 4) {
      return { valid: true, points: jokers > 0 ? 1 : 2, isInstantWin: false };
    }
  }
  return { valid: false };
}

function checkLastManStanding(room) {
  if (room.gameStarted && room.players.length === 1) {
    clearTimeout(room.turnTimer);
    const soleWinner = room.players[0];
    room.gameStarted = false;
    io.to(room.id).emit('gameOver', {
      winnerName: soleWinner.name,
      scores: room.players,
      reason: 'فوز تلقائي لانسحاب باقي اللاعبين من الجيم! 🏆'
    });
    expireRoomOneMatchVouchers(room);
    return true;
  }
  return false;
}

// إنهاء تذاكر "الجيم الواحد" بعد انتهاء المباراة
function expireRoomOneMatchVouchers(room) {
  room.players.forEach(p => {
    for (const [code, v] of vouchers.entries()) {
      if (v.duration === '1match' && v.devices.includes(p.playerId)) {
        v.usedMatch = true;
        v.status = 'منتهية (تم لعب الجيم)';
      }
    }
  });
}

// دالة التحقق من التذكرة الذكية
function validateVoucher(code, playerId) {
  if (code === GAME_PASSCODE) return { valid: true, msg: 'دخول بكود المطور العام' };

  const v = vouchers.get(code);
  if (!v) return { valid: false, msg: 'كود التذكرة غير موجود أو غير صحيح!' };
  if (v.status === 'ملغاة') return { valid: false, msg: 'تم إلغاء هذه التذكرة بواسطة المطور!' };

  // فحص الوقت
  if (v.expiresAt && Date.now() > v.expiresAt) {
    v.status = 'منتهية الصلاحية';
    return { valid: false, msg: 'هذه التذكرة انتهت صلاحيتها الزمنية!' };
  }

  // فحص جيم واحد
  if (v.duration === '1match' && v.usedMatch) {
    return { valid: false, msg: 'تم استخدام هذه التذكرة في جيم سابق وانتهت!' };
  }

  // فحص الأجهزة
  if (v.devices.includes(playerId)) {
    return { valid: true, voucher: v };
  }

  if (v.devices.length >= v.maxDevices) {
    return { valid: false, msg: `عفواً! استهلكت التذكرة الحد الأقصى للأجهزة المصرح بها (${v.maxDevices} جهاز)!` };
  }

  v.devices.push(playerId);
  return { valid: true, voucher: v };
}

io.on('connection', (socket) => {

  socket.on('registerPlayerIdentity', ({ playerId, name }) => {
    if (bannedPlayerIds.has(playerId)) return socket.emit('bannedKickNotification');
    registeredPlayers.set(playerId, {
      playerId,
      name: name || 'لاعب',
      lastSeen: new Date().toLocaleTimeString('ar-EG'),
      isOnline: true,
      currentRoom: null,
      socketId: socket.id
    });
  });

  // فحص التذكرة أو الباسوورد عند بوابة الدخول
  socket.on('verifyGatePasscode', ({ passcode, playerId }) => {
    if (bannedPlayerIds.has(playerId)) return socket.emit('bannedKickNotification');

    const result = validateVoucher(passcode.trim(), playerId);
    if (result.valid) {
      socket.emit('gateAccessGranted', { voucherCode: passcode.trim() });
    } else {
      socket.emit('gateAccessDenied', result.msg);
    }
  });

  // ================= أوامر لوحة الأدمن والتذاكر =================
  socket.on('adminLogin', (key) => {
    if (key === MASTER_KEY) {
      socket.emit('adminLoginSuccess', getAdminDashboardData());
    } else {
      socket.emit('adminLoginFail');
    }
  });

  socket.on('adminRefreshData', (key) => {
    if (key === MASTER_KEY) {
      socket.emit('adminDataUpdated', getAdminDashboardData());
    }
  });

  function getAdminDashboardData() {
    return {
      passcode: GAME_PASSCODE,
      players: Array.from(registeredPlayers.values()),
      banned: Array.from(bannedPlayerIds),
      vouchers: Array.from(vouchers.values())
    };
  }

  // توليد تذكرة جديدة
  socket.on('adminCreateVoucher', ({ masterKey, type, duration, price }) => {
    if (masterKey !== MASTER_KEY) return;

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
    socket.emit('adminDataUpdated', getAdminDashboardData());
  });

  socket.on('adminDeleteVoucher', ({ masterKey, code }) => {
    if (masterKey !== MASTER_KEY) return;
    vouchers.delete(code);
    socket.emit('adminDataUpdated', getAdminDashboardData());
  });

  socket.on('adminChangePasscode', ({ masterKey, newPasscode }) => {
    if (masterKey === MASTER_KEY && newPasscode) {
      GAME_PASSCODE = newPasscode.trim();
      socket.emit('passcodeUpdated', GAME_PASSCODE);
      io.emit('notify', 'تم تحديث كود الطوارئ العام بواسطة المطور!');
    }
  });

  socket.on('adminBanPlayer', ({ masterKey, targetPlayerId }) => {
    if (masterKey !== MASTER_KEY) return;
    bannedPlayerIds.add(targetPlayerId);

    const playerRecord = registeredPlayers.get(targetPlayerId);
    if (playerRecord && playerRecord.socketId) {
      io.to(playerRecord.socketId).emit('bannedKickNotification');
    }

    for (const rId in rooms) {
      const room = rooms[rId];
      const found = room.players.find(p => p.playerId === targetPlayerId);
      if (found) {
        room.players = room.players.filter(p => p.playerId !== targetPlayerId);
        if (room.players.length === 0) {
          clearTimeout(room.turnTimer);
          delete rooms[rId];
        } else {
          io.to(rId).emit('notify', `تم حظر وطرد اللاعب (${found.name}) من اللعبة! 🚫`);
          io.to(rId).emit('updatePlayers', room.players);
          checkLastManStanding(room);
          sendGameState(rId);
        }
      }
    }
    socket.emit('adminDataUpdated', getAdminDashboardData());
  });

  socket.on('adminUnbanPlayer', ({ masterKey, targetPlayerId }) => {
    if (masterKey !== MASTER_KEY) return;
    bannedPlayerIds.delete(targetPlayerId);
    socket.emit('adminDataUpdated', getAdminDashboardData());
  });

  // ================= منطق اللعبة والغرف =================
  socket.on('reconnectPlayer', ({ roomId, playerId }) => {
    if (bannedPlayerIds.has(playerId)) return socket.emit('bannedKickNotification');

    const room = rooms[roomId];
    if (!room) return socket.emit('reconnectFailed');

    const player = room.players.find(p => p.playerId === playerId);
    if (!player) return socket.emit('reconnectFailed');

    player.id = socket.id;
    player.disconnected = false;
    socket.join(roomId);

    if (registeredPlayers.has(playerId)) {
      const r = registeredPlayers.get(playerId);
      r.socketId = socket.id;
      r.isOnline = true;
      r.currentRoom = roomId;
    }

    socket.emit('roomJoined', { roomId, players: room.players, isHost: player.isHost });
    if (room.gameStarted) {
      sendGameState(roomId);
      io.to(roomId).emit('notify', `عاد اللاعب (${player.name}) إلى اللعبة! 🔄`);
    }
  });

  socket.on('createRoom', ({ playerName, playerId }) => {
    if (bannedPlayerIds.has(playerId)) return socket.emit('bannedKickNotification');

    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, playerId, name: playerName.trim(), hand: [], points: 0, isHost: true }],
      deck: [],
      discardPile: [],
      currentTurnIndex: 0,
      roundStarterIndex: 0,
      roundCount: 0,
      direction: 1,
      drawnCard: null,
      tempAnnoyCardIndex: null,
      gameStarted: false,
      kamelhaCallers: [],
      turnsLeftInOrbit: null,
      turnTimer: null,
      turnDeadline: null,
      currentDuration: DEFAULT_TURN_TIME
    };
    socket.join(roomId);

    if (registeredPlayers.has(playerId)) {
      const r = registeredPlayers.get(playerId);
      r.currentRoom = roomId;
      r.name = playerName.trim();
    }

    socket.emit('roomJoined', { roomId, players: rooms[roomId].players, isHost: true });
  });

  socket.on('joinRoom', ({ playerName, roomId, playerId }) => {
    if (bannedPlayerIds.has(playerId)) return socket.emit('bannedKickNotification');

    roomId = roomId.toUpperCase();
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg', 'الغرفة غير موجودة!');
    if (room.players.length >= 4) return socket.emit('errorMsg', 'الغرفة ممتلئة بالكامل!');

    const trimmedName = playerName.trim();
    if (room.players.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
      return socket.emit('errorMsg', 'هذا الاسم مستخدم بالفعل في هذه الغرفة! اختر اسماً آخر.');
    }

    const newPlayer = {
      id: socket.id,
      playerId,
      name: trimmedName,
      hand: [],
      points: 0,
      isHost: false
    };

    if (room.gameStarted) {
      checkDrawDeckRefill(room);
      newPlayer.hand = room.deck.splice(0, 4);
    }

    room.players.push(newPlayer);
    socket.join(roomId);

    if (registeredPlayers.has(playerId)) {
      const r = registeredPlayers.get(playerId);
      r.currentRoom = roomId;
      r.name = trimmedName;
    }

    io.to(roomId).emit('updatePlayers', room.players);
    socket.emit('roomJoined', { roomId, players: room.players, isHost: false });

    if (room.gameStarted) {
      io.to(roomId).emit('notify', `انضم (${newPlayer.name}) إلى الجيم الحالي! 🎮`);
      sendGameState(roomId);
    }
  });

  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return socket.emit('errorMsg', 'الحد الأدنى لاعبين لبدء الجيم!');
    room.roundCount = 0;
    room.roundStarterIndex = 0;
    startNewRound(room);
  });

  function startNewRound(room) {
    if (checkLastManStanding(room)) return;

    clearTimeout(room.turnTimer);
    room.gameStarted = true;
    room.deck = createDeck();
    room.discardPile = [];
    room.direction = 1;
    room.drawnCard = null;
    room.tempAnnoyCardIndex = null;
    room.kamelhaCallers = [];
    room.turnsLeftInOrbit = null;

    if (room.roundCount > 0) {
      room.roundStarterIndex = (room.roundStarterIndex + 1) % room.players.length;
    }
    room.currentTurnIndex = room.roundStarterIndex;
    room.roundCount++;

    room.players.forEach(p => p.hand = room.deck.splice(0, 4));
    room.discardPile.push(room.deck.pop());

    const starterName = room.players[room.currentTurnIndex].name;
    io.to(room.id).emit('notify', `بدأت الجولة ${room.roundCount}! يبدأ الدور: (${starterName}) 🎯`);

    startTurnTimer(room, DEFAULT_TURN_TIME);
    sendGameState(room.id);
  }

  function startTurnTimer(room, seconds = DEFAULT_TURN_TIME) {
    clearTimeout(room.turnTimer);
    room.currentDuration = seconds;
    room.turnDeadline = Date.now() + (seconds * 1000);

    room.turnTimer = setTimeout(() => {
      const currPlayer = room.players[room.currentTurnIndex];
      if (!currPlayer) return;
      io.to(room.id).emit('notify', `⏰ انتهى وقت (${currPlayer.name}) وتم تفويت دوره!`);

      if (room.drawnCard) {
        room.discardPile.push(room.drawnCard);
      } else {
        checkDrawDeckRefill(room);
        if (room.deck.length > 0) {
          room.discardPile.push(room.deck.pop());
        }
      }
      advanceTurn(room);
    }, seconds * 1000);
  }

  socket.on('extendTimerForCommand', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;
    const currPlayer = room.players[room.currentTurnIndex];
    if (currPlayer && currPlayer.id === socket.id) {
      startTurnTimer(room, 20);
      sendGameState(roomId);
    }
  });

  socket.on('drawCard', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;
    if (room.players[room.currentTurnIndex]?.id !== socket.id) return socket.emit('errorMsg', 'مش دورك!');
    if (room.drawnCard) return socket.emit('errorMsg', 'أنت سحبت كارت بالفعل!');

    checkDrawDeckRefill(room);
    if (room.deck.length === 0) return socket.emit('errorMsg', 'الكروت خلصت تماماً!');

    room.drawnCard = room.deck.pop();
    socket.emit('cardDrawn', room.drawnCard);
    sendGameState(roomId);
  });

  socket.on('discardDrawnCard', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    room.discardPile.push(room.drawnCard);
    advanceTurn(room);
  });

  socket.on('swapWithHand', ({ roomId, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    if (player?.id !== socket.id) return;

    const oldCard = player.hand.splice(handCardIndex, 1, room.drawnCard)[0];
    room.discardPile.push(oldCard);
    advanceTurn(room);
  });

  socket.on('takeDiscardCard', ({ roomId, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;
    const player = room.players[room.currentTurnIndex];
    if (player?.id !== socket.id) return socket.emit('errorMsg', 'مش دورك!');
    if (room.drawnCard) return socket.emit('errorMsg', 'أنت سحبت كارت مقلوب بالفعل!');
    if (room.discardPile.length === 0) return;

    const taken = room.discardPile.pop();
    const oldCard = player.hand.splice(handCardIndex, 1, taken)[0];
    room.discardPile.push(oldCard);
    advanceTurn(room);
  });

  socket.on('execReverse', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    room.discardPile.push(room.drawnCard);

    if (room.players.length === 2) {
      room.drawnCard = null;
      io.to(roomId).emit('notify', `كارت اعكس لفتك في لاعبين: تخطي دور الخصم ومتابعة دورك!`);
      startTurnTimer(room, DEFAULT_TURN_TIME);
      sendGameState(roomId);
    } else {
      room.direction *= -1;
      io.to(roomId).emit('notify', `تم عكس اتجاه اللعب!`);
      advanceTurn(room);
    }
  });

  socket.on('execKeda', ({ roomId, targetPlayerId }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    if (room.kamelhaCallers.includes(targetPlayerId)) {
      return socket.emit('errorMsg', 'هذا اللاعب قال كملها ومحمي بقفل الحصانة! 🔒');
    }

    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    room.discardPile.push(room.drawnCard);
    room.discardPile.push(...target.hand);
    checkDrawDeckRefill(room);
    target.hand = room.deck.splice(0, 4);

    io.to(roomId).emit('notify', `كارت هو كدة! تم تغيير كل كروت اللاعب (${target.name})!`);
    advanceTurn(room);
  });

  socket.on('execBank', ({ roomId, discardIndex, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    room.discardPile.push(room.drawnCard);
    const chosen = room.discardPile.splice(discardIndex, 1)[0];
    const oldCard = player.hand.splice(handCardIndex, 1, chosen)[0];
    room.discardPile.push(oldCard);

    io.to(roomId).emit('notify', `استخدم (${player.name}) لم كمالتك وأخذ كارت من الأرض!`);
    advanceTurn(room);
  });

  socket.on('execHunt', ({ roomId, targetPlayerId, requestedItem, handCardIndexToGive }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    if (room.kamelhaCallers.includes(targetPlayerId)) {
      return socket.emit('errorMsg', 'هذا اللاعب قال كملها ومحمي بقفل الحصانة! 🔒');
    }

    const player = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    room.discardPile.push(room.drawnCard);

    let foundIndex = -1;
    if (requestedItem === 'joker') {
      foundIndex = target.hand.findIndex(c => c.type === 'command' && c.cmdType === 'joker');
    } else {
      foundIndex = target.hand.findIndex(c => c.type === 'number' && c.value === parseInt(requestedItem));
    }

    if (foundIndex !== -1) {
      const hunted = target.hand.splice(foundIndex, 1)[0];
      const given = player.hand.splice(handCardIndexToGive, 1, hunted)[0];
      target.hand.push(given);
      const itemName = requestedItem === 'joker' ? 'جوكر' : `رقم ${requestedItem}`;
      io.to(roomId).emit('notify', `🎯 اصطياد ناجح! أخذ (${player.name}) ${itemName} من (${target.name})!`);
    } else {
      const itemName = requestedItem === 'joker' ? 'جوكر' : `رقم ${requestedItem}`;
      io.to(roomId).emit('notify', `🐟 فشل الصيد! (${target.name}) معهوش ${itemName}.`);
    }
    advanceTurn(room);
  });

  socket.on('peekAnnoy2P', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    const opponent = room.players.find(p => p.id !== player?.id);
    if (!opponent || opponent.hand.length === 0) return;

    if (room.kamelhaCallers.includes(opponent.id)) {
      return socket.emit('errorMsg', 'الخصم قال كملها ومحمي بقفل الحصانة! 🔒');
    }

    room.tempAnnoyCardIndex = Math.floor(Math.random() * opponent.hand.length);
    socket.emit('annoy2PPeekResult', opponent.hand[room.tempAnnoyCardIndex]);
  });

  socket.on('resolveAnnoy2P', ({ roomId, swap, handCardIndexToGive }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    const opponent = room.players.find(p => p.id !== player?.id);

    room.discardPile.push(room.drawnCard);
    if (swap && room.tempAnnoyCardIndex !== null && opponent && !room.kamelhaCallers.includes(opponent.id)) {
      const taken = opponent.hand.splice(room.tempAnnoyCardIndex, 1)[0];
      const given = player.hand.splice(handCardIndexToGive, 1, taken)[0];
      opponent.hand.push(given);
      io.to(roomId).emit('notify', `😈 رخم عليهم: رأى (${player.name}) كارت الخصم وبدّله!`);
    } else {
      io.to(roomId).emit('notify', `رخم عليهم: رأى (${player.name}) كارت الخصم وتركه مكانه.`);
    }
    room.tempAnnoyCardIndex = null;
    advanceTurn(room);
  });

  socket.on('execAnnoyMulti', ({ roomId, playerAId, playerBId }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    if (room.kamelhaCallers.includes(playerAId) || room.kamelhaCallers.includes(playerBId)) {
      return socket.emit('errorMsg', 'لا يمكنك اختيار لاعب محمي بقفل كملها! 🔒');
    }

    const pA = room.players.find(p => p.id === playerAId);
    const pB = room.players.find(p => p.id === playerBId);
    if (!pA || !pB) return;

    room.discardPile.push(room.drawnCard);
    const cardA = pA.hand.splice(Math.floor(Math.random() * pA.hand.length), 1)[0];
    const cardB = pB.hand.splice(Math.floor(Math.random() * pB.hand.length), 1)[0];
    pA.hand.push(cardB);
    pB.hand.push(cardA);

    io.to(roomId).emit('notify', `😈 رخم عليهم: تم تبديل كارت سراً بين (${pA.name}) و (${pB.name})!`);
    advanceTurn(room);
  });

  socket.on('execWildAs', ({ roomId, chosenCmdType }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    room.drawnCard.cmdType = chosenCmdType;
    const map = { hunt: 'اصطاد كارتك', bank: 'لم كمالتك', reverse: 'اعكس لفتك', keda: 'هو كدة', annoy: 'رخم عليهم' };
    room.drawnCard.name = map[chosenCmdType] || chosenCmdType;
    socket.emit('wildTransformed', room.drawnCard);
  });

  socket.on('cancelCommand', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    room.discardPile.push(room.drawnCard);
    io.to(roomId).emit('notify', 'تم إلغاء الكوماند ورميه في الأرض.');
    advanceTurn(room);
  });

  socket.on('callKamelha', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const check = verifyKamelhaHand(player.hand);
    if (!check.valid) return socket.emit('errorMsg', 'كروتك لم تكتمل 4 كروت مطابقة بعد!');

    if (check.isInstantWin) {
      player.points += 5;
      io.to(roomId).emit('notify', `👑 أسطووورة! جمع (${player.name}) 4 كروت جوكر وفاز بالفورة كاملة!`);
      return endRound(room, true);
    }

    if (!room.kamelhaCallers.includes(player.id)) {
      room.kamelhaCallers.push(player.id);
      player.earnedPointsThisRound = check.points;
      io.to(roomId).emit('notify', `🎉 صاح (${player.name}): "كمّلتهااا!" 🔒 وتم تفعيل قفل الحصانة له!`);
      io.to(roomId).emit('soundTrigger', 'kamelha');
      sendGameState(roomId);

      if (room.turnsLeftInOrbit === null) {
        room.turnsLeftInOrbit = room.players.length - 1;
      }
    }
  });

  function advanceTurn(room) {
    if (checkLastManStanding(room)) return;

    room.drawnCard = null;
    room.tempAnnoyCardIndex = null;
    const count = room.players.length;
    if (count === 0) return;

    if (room.turnsLeftInOrbit !== null) {
      room.turnsLeftInOrbit--;
      if (room.turnsLeftInOrbit <= 0) {
        endRound(room, false);
        return;
      }
    }

    room.currentTurnIndex = (room.currentTurnIndex + room.direction + count) % count;
    startTurnTimer(room, DEFAULT_TURN_TIME);
    sendGameState(room.id);
  }

  function endRound(room, instantEnd = false) {
    clearTimeout(room.turnTimer);
    let winMessage = 'نهاية الجولة! نتائج "كمّلها":\n';
    let matchWinner = null;

    if (!instantEnd) {
      room.players.forEach(p => {
        const check = verifyKamelhaHand(p.hand);
        if (check.valid) {
          p.points += check.points;
          winMessage += `• ${p.name} جمع كروته (+${check.points} نقطة) - المجموع: ${p.points}\n`;
        }
        if (p.points >= 5) matchWinner = p;
      });
    } else {
      matchWinner = room.players.find(p => p.points >= 5);
      winMessage = `فوز ساحق بـ 4 جواكر بواسطة ${matchWinner.name}!`;
    }

    const revealedHands = room.players.map(p => ({
      name: p.name,
      hand: p.hand,
      points: p.points,
      isHost: p.isHost
    }));

    if (matchWinner) {
      io.to(room.id).emit('gameOver', { winnerName: matchWinner.name, scores: room.players, revealedHands });
      room.gameStarted = false;
      expireRoomOneMatchVouchers(room); // إنهاء تذاكر الجيم الواحد
    } else {
      io.to(room.id).emit('roundEnded', { msg: winMessage, revealedHands });
      setTimeout(() => {
        if (rooms[room.id] && rooms[room.id].players.length >= 2) {
          startNewRound(rooms[room.id]);
        }
      }, 8000);
    }
  }

  function sendGameState(roomId) {
    const room = rooms[roomId];
    if (!room || room.players.length === 0) return;

    if (room.currentTurnIndex >= room.players.length) {
      room.currentTurnIndex = 0;
    }

    const activePlayer = room.players[room.currentTurnIndex];

    room.players.forEach(p => {
      io.to(p.id).emit('gameState', {
        hand: p.hand,
        topDiscard: room.discardPile[room.discardPile.length - 1],
        discardPile: room.discardPile,
        deckCount: room.deck.length,
        currentTurn: activePlayer ? activePlayer.id : null,
        currentTurnName: activePlayer ? activePlayer.name : '',
        hasDrawn: room.drawnCard !== null,
        turnDeadline: room.turnDeadline,
        turnDuration: room.currentDuration || DEFAULT_TURN_TIME,
        roomId: room.id,
        players: room.players.map(pl => ({
          id: pl.id,
          name: pl.name,
          cardCount: pl.hand.length,
          points: pl.points,
          isHost: pl.isHost,
          isImmune: room.kamelhaCallers.includes(pl.id)
        }))
      });
    });
  }

  socket.on('leaveRoom', (roomId) => {
    const room = rooms[roomId];
    if (!room) return;
    const leavingPlayer = room.players.find(p => p.id === socket.id);
    const wasHisTurn = room.gameStarted && room.players[room.currentTurnIndex]?.id === socket.id;

    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(roomId);

    if (room.players.length === 0) {
      clearTimeout(room.turnTimer);
      delete rooms[roomId];
      return;
    }

    if (leavingPlayer) {
      io.to(roomId).emit('notify', `غادر اللاعب (${leavingPlayer.name}) الغرفة! 🚪`);
    }

    if (checkLastManStanding(room)) return;

    if (wasHisTurn) {
      advanceTurn(room);
    } else {
      io.to(roomId).emit('updatePlayers', room.players);
      sendGameState(roomId);
    }
  });

  socket.on('disconnect', () => {
    for (const rId in rooms) {
      const room = rooms[rId];
      const player = room.players.find(p => p.id === socket.id);
      if (player) {
        player.disconnected = true;
        setTimeout(() => {
          if (player.disconnected && rooms[rId]) {
            const wasHisTurn = rooms[rId].gameStarted && rooms[rId].players[rooms[rId].currentTurnIndex]?.playerId === player.playerId;
            rooms[rId].players = rooms[rId].players.filter(p => p.playerId !== player.playerId);

            if (rooms[rId].players.length === 0) {
              clearTimeout(rooms[rId].turnTimer);
              delete rooms[rId];
            } else {
              io.to(rId).emit('updatePlayers', rooms[rId].players);
              if (checkLastManStanding(rooms[rId])) return;

              if (wasHisTurn) advanceTurn(rooms[rId]);
              else sendGameState(rId);
            }
          }
        }, 45000);
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`السيرفر يعمل على: http://localhost:${PORT}`));