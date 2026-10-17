const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const MASTER_KEY = "7788"; 
let GAME_PASSCODE = "1234"; 

// التخزين في الذاكرة
const registeredPlayers = new Map();
const bannedPlayerIds = new Set();
const vouchers = new Map();

const rooms = {};
const DEFAULT_TURN_TIME = 15;

// بيانات وأعداد كل الكوماندز المعتمدة
const ALL_COMMANDS_META = {
  joker: { name: 'جوكر', defaultCount: 4 },
  hunt: { name: 'اصطاد كارتك', defaultCount: 4 },
  bank: { name: 'لم كمالتك', defaultCount: 4 },
  reverse: { name: 'اعكس لفتك', defaultCount: 4 },
  keda: { name: 'هو كدة', defaultCount: 2 },
  annoy: { name: 'رخم عليهم', defaultCount: 2 },
  wild: { name: 'براحتك', defaultCount: 2 },
  thief: { name: 'الحرامي', defaultCount: 2 },
  reveal: { name: 'ع المكشوف', defaultCount: 4 },
  swap: { name: 'بدّل يا نجم', defaultCount: 2 },
  freeze: { name: 'فرملة', defaultCount: 4 },
  spin: { name: 'شقلباظ', defaultCount: 2 },
  mirror: { name: 'المراية', defaultCount: 2 },
  ambush: { name: 'الكمين', defaultCount: 2 },
  magnet: { name: 'المغناطيس', defaultCount: 2 },
  curse: { name: 'عين حسودة', defaultCount: 4 },
  fire: { name: 'ولعانة', defaultCount: 4 }
};

// إنشاء الديك
function createDeck(deckMode = 'classic', customCommands = []) {
  const deck = [];
  
  // 40 كارت أرقام من 1 لـ 10
  for (let num = 1; num <= 10; num++) {
    for (let i = 0; i < 4; i++) {
      deck.push({ id: `num_${num}_${i}_${Math.random()}`, type: 'number', value: num });
    }
  }

  let commandsToInclude = [];

  if (deckMode === 'classic') {
    // الكروت الأصلية فقط بدون كارت الحرامي
    commandsToInclude = ['joker', 'hunt', 'bank', 'reverse', 'keda', 'annoy', 'wild'];
  } else if (deckMode === 'custom' && Array.isArray(customCommands) && customCommands.length > 0) {
    commandsToInclude = customCommands;
  } else {
    commandsToInclude = ['joker', 'hunt', 'bank', 'reverse', 'keda', 'annoy', 'wild'];
  }

  commandsToInclude.forEach(cmdKey => {
    const meta = ALL_COMMANDS_META[cmdKey];
    if (meta) {
      for (let i = 0; i < meta.defaultCount; i++) {
        deck.push({ 
          id: `cmd_${cmdKey}_${i}_${Math.random()}`, 
          type: 'command', 
          cmdType: cmdKey, 
          name: meta.name,
          fromGround: false 
        });
      }
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
    clearTimeout(room.tieTimeout);
    const soleWinner = room.players[0];
    room.gameStarted = false;
    io.to(room.id).emit('gameOver', {
      winnerName: soleWinner.name,
      scores: room.players,
      reason: 'فوز تلقائي لانسحاب باقي اللاعبين من الجيم!'
    });
    expireRoomOneMatchVouchers(room);
    return true;
  }
  return false;
}

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

// فحص اعتراض كارت المراية في يد الهدف
function checkMirrorTrap(room, attacker, target, cmdType, cmdName, executeCallback, reflectCallback, cancelCallback) {
  const mirrorIdx = target.hand.findIndex(c => c.type === 'command' && c.cmdType === 'mirror' && !c.fromGround);

  if (mirrorIdx !== -1) {
    clearTimeout(room.turnTimer);

    room.pendingMirror = {
      attacker,
      target,
      mirrorIdx,
      cmdType,
      cmdName,
      executeCallback,
      reflectCallback,
      cancelCallback
    };

    io.to(target.id).emit('mirrorPrompt', {
      attackerName: attacker.name,
      cmdType,
      cmdName
    });
    return true;
  }

  return false;
}

io.on('connection', (socket) => {

  socket.on('registerPlayerIdentity', ({ playerId, name }) => {
    if (bannedPlayerIds.has(playerId)) return socket.emit('bannedKickNotification');
    const pData = {
      playerId,
      name: name || 'لاعب',
      lastSeen: new Date().toLocaleTimeString('ar-EG'),
      isOnline: true,
      currentRoom: null,
      socketId: socket.id
    };
    registeredPlayers.set(playerId, pData);
  });

  socket.on('verifyGatePasscode', ({ passcode, playerId }) => {
    if (bannedPlayerIds.has(playerId)) return socket.emit('bannedKickNotification');

    const result = validateVoucher(passcode.trim(), playerId);
    if (result.valid) {
      socket.emit('gateAccessGranted', { voucherCode: passcode.trim() });
    } else {
      socket.emit('gateAccessDenied', result.msg);
    }
  });

  socket.on('adminLogin', (key) => {
    if (key === MASTER_KEY) socket.emit('adminLoginSuccess', getAdminDashboardData());
    else socket.emit('adminLoginFail');
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
      io.emit('notify', 'تم تحديث كود الطوارئ العام!');
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
          clearTimeout(room.tieTimeout);
          delete rooms[rId];
        } else {
          io.to(rId).emit('notify', `تم طرد وحظر اللاعب (${found.name}) من اللعبة!`);
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
      io.to(roomId).emit('notify', `عاد اللاعب (${player.name}) إلى اللعبة!`);
    }
  });

  socket.on('createRoom', ({ playerName, playerId, targetPoints, maxRounds, deckMode, customCommands }) => {
    if (bannedPlayerIds.has(playerId)) return socket.emit('bannedKickNotification');

    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      players: [{ 
        id: socket.id, 
        playerId, 
        name: playerName.trim(), 
        hand: [], 
        points: 0, 
        isHost: true,
        isFrozen: false,
        curseTurns: 0,
        revealedHand: null,
        revealedRemainingTurns: 0
      }],
      deck: [],
      discardPile: [],
      currentTurnIndex: 0,
      roundStarterIndex: 0,
      roundCount: 0,
      direction: 1,
      drawnCard: null,
      tempAnnoyCardIndex: null,
      pendingHunter: null,
      pendingThief: null,
      pendingMirror: null,
      pendingSpinMap: new Map(),
      pendingFireMap: new Map(),
      pendingMagnet: null,
      spinTimeout: null,
      fireTimeout: null,
      tieTimeout: null,
      isTieVoting: false,
      tieVotes: new Map(),
      tiedContenders: [],
      gameStarted: false,
      kamelhaCallers: [],
      orbitPendingPlayers: null,
      turnTimer: null,
      turnDeadline: null,
      currentDuration: DEFAULT_TURN_TIME,
      targetPoints: parseInt(targetPoints) >= 0 ? parseInt(targetPoints) : 5,
      maxRounds: parseInt(maxRounds) >= 0 ? parseInt(maxRounds) : 0,
      deckMode: deckMode || 'classic',
      customCommands: Array.isArray(customCommands) ? customCommands : []
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
      isHost: false,
      isFrozen: false,
      curseTurns: 0,
      revealedHand: null,
      revealedRemainingTurns: 0
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
      io.to(roomId).emit('notify', `انضم (${newPlayer.name}) إلى الجيم الحالي!`);
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
    clearTimeout(room.spinTimeout);
    clearTimeout(room.fireTimeout);
    clearTimeout(room.tieTimeout);

    room.gameStarted = true;
    room.isTieVoting = false;
    room.tieVotes.clear();
    room.deck = createDeck(room.deckMode, room.customCommands);
    room.discardPile = [];
    room.direction = 1;
    room.drawnCard = null;
    room.tempAnnoyCardIndex = null;
    room.pendingHunter = null;
    room.pendingThief = null;
    room.pendingMirror = null;
    room.pendingMagnet = null;
    room.pendingSpinMap.clear();
    room.pendingFireMap.clear();
    room.kamelhaCallers = [];
    room.orbitPendingPlayers = null;

    room.players.forEach(p => {
      p.isFrozen = false;
      p.curseTurns = 0;
      p.revealedHand = null;
      p.revealedRemainingTurns = 0;
      p.hand = room.deck.splice(0, 4);
    });

    if (room.roundCount > 0) {
      room.roundStarterIndex = (room.roundStarterIndex + 1) % room.players.length;
    }
    room.currentTurnIndex = room.roundStarterIndex;
    room.roundCount++;

    room.discardPile.push(room.deck.pop());

    io.to(room.id).emit('animateDealing', { numPlayers: room.players.length });

    const starterName = room.players[room.currentTurnIndex].name;
    io.to(room.id).emit('notify', `بدأت الجولة ${room.roundCount}! يبدأ الدور: (${starterName})`);

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
      io.to(room.id).emit('notify', `انتهى وقت (${currPlayer.name}) وتم تفويت دوره!`);

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

  // تمديد الوقت لـ 20 ثانية عند تفعيل أي كوماند
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
    const currPlayer = room.players[room.currentTurnIndex];
    if (currPlayer?.id !== socket.id) return socket.emit('errorMsg', 'مش دورك!');
    if (room.drawnCard) return socket.emit('errorMsg', 'أنت سحبت كارت بالفعل!');

    checkDrawDeckRefill(room);
    if (room.deck.length === 0) return socket.emit('errorMsg', 'الكروت خلصت تماماً!');

    room.drawnCard = room.deck.pop();
    io.to(roomId).emit('playerDrewCardAnim', { playerId: socket.id, from: 'deck' });
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
    if (player.curseTurns > 0) return socket.emit('errorMsg', 'أنت مصاب بعين حسودة وممنوع تسحب من الأرض!');
    if (room.discardPile.length === 0) return;

    const taken = room.discardPile.pop();
    if (taken.type === 'command' && taken.cmdType === 'mirror') {
      taken.fromGround = true;
    }

    const oldCard = player.hand.splice(handCardIndex, 1, taken)[0];
    room.discardPile.push(oldCard);
    io.to(roomId).emit('playerDrewCardAnim', { playerId: socket.id, from: 'discard' });
    advanceTurn(room);
  });

  function broadcastCommandSplash(room, cmdType, cmdName, playerName) {
    clearTimeout(room.turnTimer);
    io.to(room.id).emit('commandSplash', { cmdType, cmdName, playerName });
  }

  // الرد على فخ المراية
  socket.on('resolveMirrorResponse', ({ roomId, action }) => {
    const room = rooms[roomId];
    if (!room || !room.pendingMirror) return;

    const { attacker, target, mirrorIdx, cmdName, executeCallback, reflectCallback, cancelCallback } = room.pendingMirror;
    if (target.id !== socket.id) return;

    if (action === 'cancel' || action === 'reflect') {
      const mirrorCard = target.hand.splice(mirrorIdx, 1)[0];
      room.discardPile.push(mirrorCard);

      checkDrawDeckRefill(room);
      if (room.deck.length > 0) {
        target.hand.push(room.deck.pop());
      }

      if (action === 'cancel') {
        io.to(roomId).emit('notify', `تصدت المراية لكارت (${cmdName}) وحمت اللاعب (${target.name})!`);
        room.pendingMirror = null;
        if (cancelCallback) cancelCallback();
        else advanceTurn(room);
      } else if (action === 'reflect') {
        io.to(roomId).emit('notify', `عكست المراية كارت (${cmdName}) في صدر (${attacker.name})!`);
        room.pendingMirror = null;
        if (reflectCallback) reflectCallback();
        else advanceTurn(room);
      }
    } else {
      room.pendingMirror = null;
      executeCallback();
    }
  });

  socket.on('execReverse', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    broadcastCommandSplash(room, 'reverse', 'اعكس لفتك', player.name);
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
      return socket.emit('errorMsg', 'هذا اللاعب قال كملها ومحمي بقفل الحصانة!');
    }

    const player = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    broadcastCommandSplash(room, 'keda', 'هو كدة', player.name);

    const execute = () => {
      room.discardPile.push(room.drawnCard);
      io.to(roomId).emit('kedaAnimation', { targetId: target.id, targetName: target.name });
      room.discardPile.push(...target.hand);
      checkDrawDeckRefill(room);
      target.hand = room.deck.splice(0, 4);
      io.to(roomId).emit('notify', `كارت هو كدة! تم تغيير كل كروت اللاعب (${target.name})!`);
      advanceTurn(room);
    };

    const reflect = () => {
      room.discardPile.push(room.drawnCard);
      io.to(roomId).emit('kedaAnimation', { targetId: player.id, targetName: player.name });
      room.discardPile.push(...player.hand);
      checkDrawDeckRefill(room);
      player.hand = room.deck.splice(0, 4);
      io.to(roomId).emit('notify', `ارتد كارت هو كدة! تم تغيير كل كروت المهاجم (${player.name})!`);
      advanceTurn(room);
    };

    if (!checkMirrorTrap(room, player, target, 'keda', 'هو كدة', execute, reflect)) {
      execute();
    }
  });

  socket.on('execBank', ({ roomId, discardIndex, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    broadcastCommandSplash(room, 'bank', 'لم كمالتك', player.name);
    room.discardPile.push(room.drawnCard);
    const chosen = room.discardPile.splice(discardIndex, 1)[0];
    
    if (chosen.type === 'command' && chosen.cmdType === 'mirror') {
      chosen.fromGround = true;
    }

    const oldCard = player.hand.splice(handCardIndex, 1, chosen)[0];
    room.discardPile.push(oldCard);

    io.to(roomId).emit('notify', `استخدم (${player.name}) لم كمالتك وأخذ كارت من الأرض!`);
    advanceTurn(room);
  });

  socket.on('checkHuntTarget', ({ roomId, targetPlayerId, requestedItem }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    if (room.kamelhaCallers.includes(targetPlayerId)) {
      return socket.emit('errorMsg', 'هذا اللاعب محمي بقفل الحصانة!');
    }

    const hunter = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    broadcastCommandSplash(room, 'hunt', 'اصطاد كارتك', hunter.name);

    let foundIndex = -1;
    if (requestedItem === 'joker') {
      foundIndex = target.hand.findIndex(c => c.type === 'command' && c.cmdType === 'joker');
    } else {
      foundIndex = target.hand.findIndex(c => c.type === 'number' && c.value === parseInt(requestedItem));
    }

    const itemName = requestedItem === 'joker' ? 'جوكر' : `رقم ${requestedItem}`;

    if (foundIndex !== -1) {
      const execute = () => {
        room.pendingHunter = { targetPlayerId, foundIndex, requestedItem, itemName };
        socket.emit('huntTargetHasCard', { targetName: target.name, itemName });
      };

      const reflect = () => {
        room.discardPile.push(room.drawnCard);
        io.to(roomId).emit('notify', `ارتد الصيد في صدر (${hunter.name})!`);
        advanceTurn(room);
      };

      if (!checkMirrorTrap(room, hunter, target, 'hunt', 'اصطاد كارتك', execute, reflect)) {
        execute();
      }
    } else {
      room.discardPile.push(room.drawnCard);
      room.drawnCard = null;
      io.to(roomId).emit('notify', `فشل الصيد! (${target.name}) معهوش ${itemName}.`);
      advanceTurn(room);
    }
  });

  socket.on('confirmHuntSwap', ({ roomId, handCardIndexToGive }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard || !room.pendingHunter) return;

    const hunter = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === room.pendingHunter.targetPlayerId);

    room.discardPile.push(room.drawnCard);
    if (target && target.hand[room.pendingHunter.foundIndex]) {
      const hunted = target.hand.splice(room.pendingHunter.foundIndex, 1)[0];
      const given = hunter.hand.splice(handCardIndexToGive, 1, hunted)[0];
      target.hand.push(given);
      io.to(roomId).emit('notify', `اصطياد ناجح! أخذ (${hunter.name}) ${room.pendingHunter.itemName} من (${target.name})!`);
    }
    room.pendingHunter = null;
    advanceTurn(room);
  });

  // كارت الحرامي مع متابعة البحث لو الخصم معاه مراية
  socket.on('executeThief', ({ roomId, requestedItem }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;

    const thief = room.players[room.currentTurnIndex];
    broadcastCommandSplash(room, 'thief', 'الحرامي', thief.name);

    const itemName = requestedItem === 'joker' ? 'جوكر' : `رقم ${requestedItem}`;
    const checkCard = (c) => requestedItem === 'joker' ? (c.type === 'command' && c.cmdType === 'joker') : (c.type === 'number' && c.value === parseInt(requestedItem));

    continueThiefSearch(room, thief, requestedItem, itemName, checkCard, []);
  });

  function continueThiefSearch(room, thief, requestedItem, itemName, checkCard, excludedVictimIds) {
    let victim = null;
    let victimCardIndex = -1;

    for (const opp of room.players) {
      if (opp.id !== thief.id && !room.kamelhaCallers.includes(opp.id) && !excludedVictimIds.includes(opp.id)) {
        const idx = opp.hand.findIndex(checkCard);
        if (idx !== -1) {
          victim = opp;
          victimCardIndex = idx;
          break;
        }
      }
    }

    if (victim) {
      const execute = () => {
        room.pendingThief = { tier: 'opponent', victimId: victim.id, cardIndex: victimCardIndex, itemName };
        io.to(thief.id).emit('thiefFoundInHand', { victimName: victim.name, itemName });
      };

      const cancel = () => {
        excludedVictimIds.push(victim.id);
        continueThiefSearch(room, thief, requestedItem, itemName, checkCard, excludedVictimIds);
      };

      const reflect = () => {
        room.discardPile.push(room.drawnCard);
        io.to(room.id).emit('notify', `عكست المراية سرقة الحرامي!`);
        advanceTurn(room);
      };

      if (!checkMirrorTrap(room, thief, victim, 'thief', 'الحرامي', execute, reflect, cancel)) {
        execute();
      }
      return;
    }

    let groundIndex = -1;
    for (let i = room.discardPile.length - 1; i >= 0; i--) {
      if (checkCard(room.discardPile[i])) {
        groundIndex = i;
        break;
      }
    }

    if (groundIndex !== -1) {
      room.pendingThief = { tier: 'ground', groundIndex, itemName };
      return io.to(thief.id).emit('thiefFoundOnGround', { itemName });
    }

    checkDrawDeckRefill(room);
    let deckIndex = room.deck.findIndex(checkCard);

    if (deckIndex !== -1) {
      room.pendingThief = { tier: 'deck', deckIndex, itemName };
      return io.to(thief.id).emit('thiefFoundInDeck', { itemName });
    }

    room.discardPile.push(room.drawnCard);
    room.drawnCard = null;
    io.to(room.id).emit('notify', `لم يجد الحرامي أي كارت متاح لسرقته!`);
    advanceTurn(room);
  }

  socket.on('confirmThiefSwap', ({ roomId, handCardIndexToGive }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard || !room.pendingThief) return;

    const thief = room.players[room.currentTurnIndex];
    room.discardPile.push(room.drawnCard);

    const { tier, itemName } = room.pendingThief;

    if (tier === 'opponent') {
      const victim = room.players.find(p => p.id === room.pendingThief.victimId);
      if (victim && victim.hand[room.pendingThief.cardIndex]) {
        const stolen = victim.hand.splice(room.pendingThief.cardIndex, 1)[0];
        const given = thief.hand.splice(handCardIndexToGive, 1, stolen)[0];
        victim.hand.push(given);
        io.to(roomId).emit('notify', `سرق الحرامي كارت (${itemName}) من يد (${victim.name}) وبدله بكارت من يده!`);
      }
    } else if (tier === 'ground') {
      const stolen = room.discardPile.splice(room.pendingThief.groundIndex, 1)[0];
      const given = thief.hand.splice(handCardIndexToGive, 1, stolen)[0];
      room.discardPile.push(given);
      io.to(roomId).emit('notify', `التقط الحرامي كارت (${itemName}) من الأرض ورمى كارت مكانه!`);
    } else if (tier === 'deck') {
      const stolen = room.deck.splice(room.pendingThief.deckIndex, 1)[0];
      const given = thief.hand.splice(handCardIndexToGive, 1, stolen)[0];
      room.discardPile.push(given);
      io.to(roomId).emit('notify', `أخرج الحرامي كارت (${itemName}) من قلب كروت السحب المقلوبة!`);
    }

    room.pendingThief = null;
    advanceTurn(room);
  });

  // كارت ع المكشوف
  socket.on('execReveal', ({ roomId, targetPlayerId }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    broadcastCommandSplash(room, 'reveal', 'ع المكشوف', player.name);

    const execute = () => {
      room.discardPile.push(room.drawnCard);
      target.revealedHand = target.hand;
      target.revealedRemainingTurns = room.players.length;

      io.to(roomId).emit('notify', `كارت ع المكشوف! أصبحت كروت (${target.name}) مكشوفة للجميع على الترابيزة!`);
      advanceTurn(room);
    };

    const reflect = () => {
      room.discardPile.push(room.drawnCard);
      player.revealedHand = player.hand;
      player.revealedRemainingTurns = room.players.length;

      io.to(roomId).emit('notify', `ارتدت العين! أصبحت كروت المهاجم (${player.name}) مكشوفة للجميع على الترابيزة!`);
      advanceTurn(room);
    };

    if (!checkMirrorTrap(room, player, target, 'reveal', 'ع المكشوف', execute, reflect)) {
      execute();
    }
  });

  // كارت بدّل يا نجم
  socket.on('execSwapHand', ({ roomId, targetPlayerId }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    if (room.kamelhaCallers.includes(targetPlayerId)) {
      return socket.emit('errorMsg', 'هذا اللاعب محمي بقفل الحصانة!');
    }

    const player = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    broadcastCommandSplash(room, 'swap', 'بدّل يا نجم', player.name);

    const execute = () => {
      room.discardPile.push(room.drawnCard);
      const tempHand = player.hand;
      player.hand = target.hand;
      target.hand = tempHand;
      io.to(roomId).emit('notify', `بدّل يا نجم! قام (${player.name}) بتبديل يده بالكامل مع (${target.name})!`);
      advanceTurn(room);
    };

    const reflect = () => {
      room.discardPile.push(room.drawnCard);
      io.to(roomId).emit('notify', `تصدت المراية للتبديل وظلت الكروت كما هي!`);
      advanceTurn(room);
    };

    if (!checkMirrorTrap(room, player, target, 'swap', 'بدّل يا نجم', execute, reflect)) {
      execute();
    }
  });

  // كارت فرملة
  socket.on('execFreeze', ({ roomId, targetPlayerId }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    broadcastCommandSplash(room, 'freeze', 'فرملة', player.name);

    const execute = () => {
      room.discardPile.push(room.drawnCard);
      target.isFrozen = true;
      io.to(roomId).emit('notify', `كارت فرملة! تم تجميد اللاعب (${target.name}) وسيتخطى دوره القادم!`);
      advanceTurn(room);
    };

    const reflect = () => {
      room.discardPile.push(room.drawnCard);
      player.isFrozen = true;
      io.to(roomId).emit('notify', `ارتدت الفرملة! تم تجميد المهاجم (${player.name})!`);
      advanceTurn(room);
    };

    if (!checkMirrorTrap(room, player, target, 'freeze', 'فرملة', execute, reflect)) {
      execute();
    }
  });

  // كارت شقلباظ
  socket.on('execSpin', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    broadcastCommandSplash(room, 'spin', 'شقلباظ', player.name);
    room.discardPile.push(room.drawnCard);
    room.drawnCard = null;
    room.pendingSpinMap.clear();

    io.to(roomId).emit('notify', `كارت شقلباظ! بدأ تمرير الكروت بين اللاعبين!`);
    
    io.to(player.id).emit('spinCasterPrompt');

    room.players.forEach(p => {
      if (p.id !== player.id) {
        io.to(p.id).emit('spinRequest');
      }
    });

    clearTimeout(room.spinTimeout);
    room.spinTimeout = setTimeout(() => {
      autoFillRemainingSpin(room);
    }, 15000);
  });

  socket.on('resolveSpinCasterChoice', ({ roomId, participate }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (participate) {
      io.to(player.id).emit('spinRequest');
    } else {
      room.pendingSpinMap.set(player.id, null);
      checkSpinCompletion(room);
    }
  });

  socket.on('submitSpinCard', ({ roomId, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hand.length === 0) return;

    const card = player.hand.splice(handCardIndex, 1)[0];
    room.pendingSpinMap.set(player.id, card);
    checkSpinCompletion(room);
  });

  function checkSpinCompletion(room) {
    if (room.pendingSpinMap.size === room.players.length) {
      clearTimeout(room.spinTimeout);
      finishSpinExecution(room);
    }
  }

  function autoFillRemainingSpin(room) {
    room.players.forEach(p => {
      if (!room.pendingSpinMap.has(p.id) && p.hand.length > 0) {
        room.pendingSpinMap.set(p.id, p.hand.splice(0, 1)[0]);
      }
    });
    finishSpinExecution(room);
  }

  function finishSpinExecution(room) {
    clearTimeout(room.spinTimeout);
    const participants = room.players.filter(p => room.pendingSpinMap.get(p.id) !== null);
    const count = participants.length;

    if (count > 1) {
      for (let i = 0; i < count; i++) {
        const giver = participants[i];
        const nextIdx = (i + room.direction + count) % count;
        const receiver = participants[nextIdx];
        const passedCard = room.pendingSpinMap.get(giver.id);
        if (passedCard) receiver.hand.push(passedCard);
      }
      io.to(room.id).emit('notify', `دارت الترابيزة واستلم كل لاعب كارت جاره!`);
    }

    room.pendingSpinMap.clear();
    advanceTurn(room);
  }

  // كارت الكمين مع صد المراية
  socket.on('execAmbush', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    broadcastCommandSplash(room, 'ambush', 'الكمين', player.name);
    room.discardPile.push(room.drawnCard);

    const defendersWithJokerAndMirror = room.players.filter(p => 
      p.id !== player.id && 
      p.hand.some(c => c.type === 'command' && c.cmdType === 'joker') &&
      p.hand.some(c => c.type === 'command' && c.cmdType === 'mirror' && !c.fromGround)
    );

    const executeSeizure = (protectedPlayerId = null) => {
      let seizedCount = 0;
      room.players.forEach(p => {
        if (p.id === player.id || p.id === protectedPlayerId) return;

        const jokers = p.hand.filter(c => c.type === 'command' && c.cmdType === 'joker');
        if (jokers.length > 0) {
          p.hand = p.hand.filter(c => !(c.type === 'command' && c.cmdType === 'joker'));
          room.discardPile.push(...jokers);
          seizedCount += jokers.length;

          checkDrawDeckRefill(room);
          for (let j = 0; j < jokers.length; j++) {
            if (room.deck.length > 0) p.hand.push(room.deck.pop());
          }
        }
      });

      if (seizedCount > 0) {
        io.to(roomId).emit('notify', `كمين بواسطة (${player.name})! تم مصادرة (${seizedCount}) جوكر للأرض!`);
      } else {
        io.to(roomId).emit('notify', `نزل الكمين ولم يتم العثور على أي جواكر!`);
      }
      advanceTurn(room);
    };

    const reflectSeizure = () => {
      const attackerJokers = player.hand.filter(c => c.type === 'command' && c.cmdType === 'joker');
      if (attackerJokers.length > 0) {
        player.hand = player.hand.filter(c => !(c.type === 'command' && c.cmdType === 'joker'));
        room.discardPile.push(...attackerJokers);
        checkDrawDeckRefill(room);
        for (let j = 0; j < attackerJokers.length; j++) {
          if (room.deck.length > 0) player.hand.push(room.deck.pop());
        }
        io.to(roomId).emit('notify', `ارتد الكمين وتم مصادرة (${attackerJokers.length}) جوكر من يد المهاجم (${player.name})!`);
      } else {
        io.to(roomId).emit('notify', `ارتد الكمين ولكن المهاجم (${player.name}) ليس معه جواكر!`);
      }
      advanceTurn(room);
    };

    if (defendersWithJokerAndMirror.length > 0) {
      const defender = defendersWithJokerAndMirror[0];
      checkMirrorTrap(room, player, defender, 'ambush', 'الكمين',
        () => executeSeizure(null),
        () => reflectSeizure(),
        () => executeSeizure(defender.id)
      );
    } else {
      executeSeizure(null);
    }
  });

  // كارت المغناطيس
  socket.on('execMagnet', ({ roomId, targetNumber }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    broadcastCommandSplash(room, 'magnet', 'المغناطيس', player.name);
    room.discardPile.push(room.drawnCard);

    const isTargetJoker = targetNumber === 'joker';
    const checkMatching = (c) => isTargetJoker ? (c.type === 'command' && c.cmdType === 'joker') : (c.type === 'number' && c.value === parseInt(targetNumber));

    const pulledCards = [];
    for (let i = room.discardPile.length - 1; i >= 0; i--) {
      if (checkMatching(room.discardPile[i])) {
        pulledCards.push(room.discardPile.splice(i, 1)[0]);
      }
    }

    if (pulledCards.length > 0) {
      room.pendingMagnet = { pulledCards, player };
      const itemName = isTargetJoker ? 'جوكر' : `رقم ${targetNumber}`;
      io.to(player.id).emit('magnetChooseDiscards', { count: pulledCards.length, itemName });
    } else {
      const itemName = isTargetJoker ? 'جواكر' : `كروت برقم ${targetNumber}`;
      io.to(roomId).emit('notify', `لم يجد المغناطيس أي ${itemName} على الأرض!`);
      advanceTurn(room);
    }
  });

  socket.on('submitMagnetDiscards', ({ roomId, discardIndices }) => {
    const room = rooms[roomId];
    if (!room || !room.pendingMagnet) return;

    const { pulledCards, player } = room.pendingMagnet;
    if (player.id !== socket.id) return;

    const sorted = discardIndices.sort((a, b) => b - a);
    sorted.forEach(idx => {
      const discarded = player.hand.splice(idx, 1)[0];
      if (discarded) room.discardPile.push(discarded);
    });

    player.hand.push(...pulledCards);
    io.to(roomId).emit('notify', `شفط المغناطيس (${pulledCards.length}) كروت من الأرض ليد (${player.name})!`);
    
    room.pendingMagnet = null;
    advanceTurn(room);
  });

  // كارت عين حسودة
  socket.on('execCurse', ({ roomId, targetPlayerId }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    broadcastCommandSplash(room, 'curse', 'عين حسودة', player.name);

    const execute = () => {
      room.discardPile.push(room.drawnCard);
      target.curseTurns = 2;
      io.to(roomId).emit('notify', `أصابت عين حسودة (${target.name}) وممنوع يسحب من الأرض لدورين!`);
      advanceTurn(room);
    };

    const reflect = () => {
      room.discardPile.push(room.drawnCard);
      player.curseTurns = 2;
      io.to(roomId).emit('notify', `ارتدت العين الحسودة وأصابت المهاجم (${player.name})!`);
      advanceTurn(room);
    };

    if (!checkMirrorTrap(room, player, target, 'curse', 'عين حسودة', execute, reflect)) {
      execute();
    }
  });

  // كارت ولعانة
  socket.on('execFire', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    broadcastCommandSplash(room, 'fire', 'ولعانة', player.name);
    room.discardPile.push(room.drawnCard);
    room.drawnCard = null;
    room.pendingFireMap.clear();

    io.to(roomId).emit('notify', `كارت ولعانة! استعدوا لحرق واستبدال الكروت!`);
    
    io.to(player.id).emit('fireCasterPrompt');

    room.players.forEach(p => {
      if (p.id !== player.id) {
        io.to(p.id).emit('fireRequest');
      }
    });

    clearTimeout(room.fireTimeout);
    room.fireTimeout = setTimeout(() => {
      autoFillRemainingFire(room);
    }, 15000);
  });

  socket.on('resolveFireCasterChoice', ({ roomId, burn }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    if (burn) {
      io.to(player.id).emit('fireRequest');
    } else {
      room.pendingFireMap.set(player.id, true);
      checkFireCompletion(room);
    }
  });

  socket.on('submitFireCard', ({ roomId, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player || player.hand.length === 0) return;

    const burned = player.hand.splice(handCardIndex, 1)[0];
    room.discardPile.push(burned);
    checkDrawDeckRefill(room);
    if (room.deck.length > 0) player.hand.push(room.deck.pop());
    room.pendingFireMap.set(player.id, true);

    checkFireCompletion(room);
  });

  function checkFireCompletion(room) {
    if (room.pendingFireMap.size === room.players.length) {
      clearTimeout(room.fireTimeout);
      room.pendingFireMap.clear();
      advanceTurn(room);
    }
  }

  function autoFillRemainingFire(room) {
    room.players.forEach(p => {
      if (!room.pendingFireMap.has(p.id) && p.hand.length > 0) {
        const burned = p.hand.splice(0, 1)[0];
        room.discardPile.push(burned);
        checkDrawDeckRefill(room);
        if (room.deck.length > 0) p.hand.push(room.deck.pop());
        room.pendingFireMap.set(p.id, true);
      }
    });
    room.pendingFireMap.clear();
    advanceTurn(room);
  }

  socket.on('peekAnnoy2P', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    const opponent = room.players.find(p => p.id !== player?.id);
    if (!opponent || opponent.hand.length === 0) return;

    if (room.kamelhaCallers.includes(opponent.id)) {
      return socket.emit('errorMsg', 'الخصم قال كملها ومحمي بقفل الحصانة!');
    }

    broadcastCommandSplash(room, 'annoy', 'رخم عليهم', player.name);
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

      io.to(roomId).emit('annoySwapAnimation', { p1Id: player.id, p2Id: opponent.id });
      io.to(roomId).emit('notify', `رخم عليهم: رأى (${player.name}) كارت الخصم وبدّله!`);
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
      return socket.emit('errorMsg', 'لا يمكنك اختيار لاعب محمي بقفل كملها!');
    }

    const player = room.players[room.currentTurnIndex];
    const pA = room.players.find(p => p.id === playerAId);
    const pB = room.players.find(p => p.id === playerBId);
    if (!pA || !pB) return;

    broadcastCommandSplash(room, 'annoy', 'رخم عليهم', player.name);
    room.discardPile.push(room.drawnCard);
    const cardA = pA.hand.splice(Math.floor(Math.random() * pA.hand.length), 1)[0];
    const cardB = pB.hand.splice(Math.floor(Math.random() * pB.hand.length), 1)[0];
    pA.hand.push(cardB);
    pB.hand.push(cardA);

    io.to(roomId).emit('annoySwapAnimation', { p1Id: pA.id, p2Id: pB.id });
    io.to(roomId).emit('notify', `رخم عليهم: تم تبديل كارت سراً بين (${pA.name}) و (${pB.name})!`);
    advanceTurn(room);
  });

  socket.on('execWildAs', ({ roomId, chosenCmdType }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    broadcastCommandSplash(room, 'wild', 'براحتك', player.name);
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

    if (player.isFrozen) {
      return socket.emit('errorMsg', 'أنت متفرمل وممنوع تقول كملها في هذه اللفة!');
    }

    const check = verifyKamelhaHand(player.hand);
    if (!check.valid) return socket.emit('errorMsg', 'كروتك لم تكتمل 4 كروت مطابقة بعد!');

    if (check.isInstantWin) {
      player.points += 5;
      io.to(roomId).emit('notify', `جمع (${player.name}) 4 كروت جوكر وفاز بالفورة كاملة!`);
      return endRound(room, true);
    }

    if (!room.kamelhaCallers.includes(player.id)) {
      room.kamelhaCallers.push(player.id);
      player.earnedPointsThisRound = check.points;
      io.to(roomId).emit('notify', `صاح (${player.name}): "كمّلتهااا!" وتم تفعيل قفل الحصانة له!`);
      io.to(roomId).emit('soundTrigger', 'kamelha');

      // تفعيل لفة الأدوار المتبقية لجميع الخصوم الآخرين فقط
      if (!room.orbitPendingPlayers) {
        room.orbitPendingPlayers = new Set(
          room.players.filter(pl => pl.id !== player.id).map(pl => pl.id)
        );
      }

      sendGameState(roomId);
    }
  });

  function advanceTurn(room) {
    if (checkLastManStanding(room)) return;

    room.drawnCard = null;
    room.tempAnnoyCardIndex = null;
    room.pendingHunter = null;
    room.pendingThief = null;
    room.pendingMirror = null;
    room.pendingMagnet = null;
    const count = room.players.length;
    if (count === 0) return;

    const currentPlayer = room.players[room.currentTurnIndex];

    // لو اللفة الأخيرة مفعلة: شطب دور اللاعب الذي انتهى دوره الآن
    if (room.orbitPendingPlayers) {
      if (currentPlayer && room.orbitPendingPlayers.has(currentPlayer.id)) {
        room.orbitPendingPlayers.delete(currentPlayer.id);
      }

      // انتهاء الجولة إذا انتهت أدوار كل الخصوم
      if (room.orbitPendingPlayers.size === 0) {
        return endRound(room, false);
      }
    }

    room.currentTurnIndex = (room.currentTurnIndex + room.direction + count) % count;
    const nextPlayer = room.players[room.currentTurnIndex];

    // لو اللاعب التالي متفرمل: تخطي دوره وشطبه
    if (nextPlayer && nextPlayer.isFrozen) {
      nextPlayer.isFrozen = false;
      io.to(room.id).emit('notify', `تم تخطي دور (${nextPlayer.name}) لأنه متفرمل!`);
      if (room.orbitPendingPlayers && room.orbitPendingPlayers.has(nextPlayer.id)) {
        room.orbitPendingPlayers.delete(nextPlayer.id);
        if (room.orbitPendingPlayers.size === 0) {
          return endRound(room, false);
        }
      }
      return advanceTurn(room);
    }

    // تقليل عداد العين الحسودة
    if (nextPlayer && nextPlayer.curseTurns > 0) {
      nextPlayer.curseTurns--;
      if (nextPlayer.curseTurns === 0) {
        io.to(room.id).emit('notify', `انتهت مدة العين الحسودة عن اللاعب (${nextPlayer.name})!`);
      }
    }

    // إخفاء كروت ع المكشوف بعد لفة كاملة
    room.players.forEach(p => {
      if (p.revealedRemainingTurns > 0) {
        p.revealedRemainingTurns--;
        if (p.revealedRemainingTurns === 0) {
          p.revealedHand = null;
        }
      }
    });

    startTurnTimer(room, DEFAULT_TURN_TIME);
    sendGameState(room.id);
  }

  // استقبال تصويت اللاعب في التعادل
  socket.on('submitTieVote', ({ roomId, vote }) => {
    const room = rooms[roomId];
    if (!room || !room.isTieVoting) return;

    room.tieVotes.set(socket.id, vote); // 'play' أو 'draw'

    // إذا صوّت جميع اللاعبين على الترابيزة
    if (room.tieVotes.size === room.players.length) {
      clearTimeout(room.tieTimeout);
      finalizeTieVotes(room);
    }
  });

  function finalizeTieVotes(room) {
    if (!room.isTieVoting) return;
    room.isTieVoting = false;
    clearTimeout(room.tieTimeout);

    // أي لاعب لم يصوّت يُسجل صوته تلقائياً مع التعادل
    room.players.forEach(p => {
      if (!room.tieVotes.has(p.id)) {
        room.tieVotes.set(p.id, 'draw');
      }
    });

    let playCount = 0;
    let drawCount = 0;
    room.tieVotes.forEach(v => {
      if (v === 'play') playCount++;
      else drawCount++;
    });

    // إذا كانت الأغلبية مع لعب جولة فاصلة
    if (playCount > drawCount) {
      io.to(room.id).emit('notify', 'نتيجة التصويت: الأغلبية اختارت لعب جولة فاصلة!');
      setTimeout(() => {
        if (rooms[room.id] && rooms[room.id].players.length >= 2) {
          startNewRound(rooms[room.id]);
        }
      }, 3000);
    } else {
      // إنهاء المباراة بالتعادل المشترك
      const coWinners = room.tiedContenders.map(c => c.name).join(' و ');
      io.to(room.id).emit('gameOver', { 
        winnerName: coWinners, 
        scores: room.players, 
        revealedHands: room.players.map(p => ({ name: p.name, hand: p.hand, points: p.points, isHost: p.isHost })),
        reason: 'انتهاء المباراة بالتعادل بقرار الأغلبية!'
      });
      room.gameStarted = false;
      expireRoomOneMatchVouchers(room);
    }
  }

  function endRound(room, instantEnd = false) {
    clearTimeout(room.turnTimer);
    clearTimeout(room.spinTimeout);
    clearTimeout(room.fireTimeout);
    clearTimeout(room.tieTimeout);

    let winMessage = 'نهاية الجولة! نتائج "كمّلها":\n';
    let matchWinner = null;
    let winReason = '';

    if (!instantEnd) {
      room.players.forEach(p => {
        const check = verifyKamelhaHand(p.hand);
        if (check.valid) {
          p.points += check.points;
          winMessage += `• ${p.name} جمع كروته (+${check.points} نقطة) - المجموع: ${p.points}\n`;
        }
      });
    }

    const revealedHands = room.players.map(p => ({
      name: p.name,
      hand: p.hand,
      points: p.points,
      isHost: p.isHost
    }));

    // فحص الفوز الفوري بـ 4 جواكر
    if (instantEnd) {
      matchWinner = room.players.find(p => p.points >= 5);
      winReason = 'فوز ساحق بـ 4 جواكر!';
      io.to(room.id).emit('gameOver', { 
        winnerName: matchWinner ? matchWinner.name : 'اللاعب', 
        scores: room.players, 
        revealedHands,
        reason: winReason
      });
      room.gameStarted = false;
      expireRoomOneMatchVouchers(room);
      return;
    }

    // فحص من وصل إلى هدف النقاط
    let reachedTarget = [];
    if (room.targetPoints > 0) {
      reachedTarget = room.players.filter(p => p.points >= room.targetPoints);
    }

    // فحص انتهاء الجولات
    let maxRoundsReached = false;
    if (room.maxRounds > 0 && room.roundCount >= room.maxRounds) {
      maxRoundsReached = true;
    }

    // إذا وصل أكثر من لاعب لنقاط الهدف في نفس الجولة
    if (reachedTarget.length > 1) {
      const maxPts = Math.max(...reachedTarget.map(p => p.points));
      const tiedTops = reachedTarget.filter(p => p.points === maxPts);

      if (tiedTops.length > 1) {
        // حالة تعادل في الصدارة: بدء التصويت الديمقراطي لمدة 20 ثانية!
        room.isTieVoting = true;
        room.tieVotes.clear();
        room.tiedContenders = tiedTops;

        io.to(room.id).emit('roundEnded', { msg: winMessage, revealedHands });
        
        setTimeout(() => {
          io.to(room.id).emit('tieVotePrompt', { 
            contenders: tiedTops.map(c => c.name), 
            points: maxPts 
          });

          // مهلة أمان 20 ثانية للتصويت
          clearTimeout(room.tieTimeout);
          room.tieTimeout = setTimeout(() => {
            finalizeTieVotes(room);
          }, 20000);
        }, 4000);

        return;
      } else {
        matchWinner = tiedTops[0];
        winReason = `أول من وصل إلى هدف ${room.targetPoints} نقاط وفاز بالمباراة!`;
      }
    } else if (reachedTarget.length === 1) {
      matchWinner = reachedTarget[0];
      winReason = `أول من وصل إلى هدف ${room.targetPoints} نقاط وفاز بالمباراة!`;
    }

    // إذا انتهت الجولات ولم يفز أحد بالنقاط بعد
    if (!matchWinner && maxRoundsReached) {
      const maxPts = Math.max(...room.players.map(p => p.points));
      const tiedTops = room.players.filter(p => p.points === maxPts);

      if (tiedTops.length > 1) {
        room.isTieVoting = true;
        room.tieVotes.clear();
        room.tiedContenders = tiedTops;

        io.to(room.id).emit('roundEnded', { msg: winMessage, revealedHands });
        
        setTimeout(() => {
          io.to(room.id).emit('tieVotePrompt', { 
            contenders: tiedTops.map(c => c.name), 
            points: maxPts 
          });

          clearTimeout(room.tieTimeout);
          room.tieTimeout = setTimeout(() => {
            finalizeTieVotes(room);
          }, 20000);
        }, 4000);

        return;
      } else {
        matchWinner = tiedTops[0];
        winReason = `فاز بأعلى مجموع نقاط بعد انتهاء كل الجولات (${room.maxRounds} جولة)!`;
      }
    }

    if (matchWinner) {
      io.to(room.id).emit('gameOver', { 
        winnerName: matchWinner.name, 
        scores: room.players, 
        revealedHands,
        reason: winReason
      });
      room.gameStarted = false;
      expireRoomOneMatchVouchers(room);
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
      const check = verifyKamelhaHand(p.hand);
      const canCallKamelha = check.valid && !room.kamelhaCallers.includes(p.id);

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
        targetPoints: room.targetPoints,
        maxRounds: room.maxRounds,
        roundCount: room.roundCount,
        canCallKamelha,
        players: room.players.map(pl => ({
          id: pl.id,
          name: pl.name,
          cardCount: pl.hand.length,
          points: pl.points,
          isHost: pl.isHost,
          isImmune: room.kamelhaCallers.includes(pl.id),
          isFrozen: pl.isFrozen,
          isCursed: pl.curseTurns > 0,
          revealedHand: pl.revealedHand
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
      clearTimeout(room.spinTimeout);
      clearTimeout(room.fireTimeout);
      clearTimeout(room.tieTimeout);
      delete rooms[roomId];
      return;
    }

    if (leavingPlayer) {
      io.to(roomId).emit('notify', `غادر اللاعب (${leavingPlayer.name}) الغرفة!`);
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
              clearTimeout(rooms[rId].spinTimeout);
              clearTimeout(rooms[rId].fireTimeout);
              clearTimeout(rooms[rId].tieTimeout);
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
