const { ALL_COMMANDS_META, DEFAULT_TURN_TIME } = require('../config');
const adminService = require('./adminService');

const rooms = {};

function getRoom(roomId) {
  return rooms[roomId ? roomId.toUpperCase() : ''];
}

function getAllRooms() {
  return rooms;
}

function deleteRoom(roomId) {
  const room = rooms[roomId];
  if (room) {
    clearTimeout(room.turnTimer);
    clearTimeout(room.spinTimeout);
    clearTimeout(room.fireTimeout);
    clearTimeout(room.tieTimeout);
    clearTimeout(room.tieTransitionTimeout);
    delete rooms[roomId];
  }
}

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

function checkDrawDeckRefill(room, io) {
  if (room.deck.length === 0) {
    if (room.discardPile.length > 1) {
      const top = room.discardPile.pop();
      room.deck = room.discardPile.sort(() => Math.random() - 0.5);
      room.discardPile = [top];
      if (io) io.to(room.id).emit('notify', 'تم إعادة تفنيط كروت الأرض لوضعها في السحب!');
    }
  }
}

function checkLastManStanding(room, io) {
  if (room.gameStarted && room.players.length === 1) {
    clearTimeout(room.turnTimer);
    clearTimeout(room.spinTimeout);
    clearTimeout(room.fireTimeout);
    clearTimeout(room.tieTimeout);
    clearTimeout(room.tieTransitionTimeout);
    const soleWinner = room.players[0];
    room.gameStarted = false;
    io.to(room.id).emit('gameOver', {
      winnerName: soleWinner.name,
      scores: room.players,
      reason: 'فوز تلقائي لانسحاب باقي اللاعبين من الجيم!'
    });
    adminService.expireRoomOneMatchVouchers(room);
    return true;
  }
  return false;
}

// دالة نقل القيادة والنجمة تلقائياً عند خروج القائد
function handleHostMigration(room, leavingPlayer, io) {
  if (leavingPlayer.isHost && room.players.length > 0) {
    room.players[0].isHost = true;
    io.to(room.id).emit('hostMigrated', { newHostId: room.players[0].id, newHostName: room.players[0].name });
    io.to(room.id).emit('notify', `انتقلت قيادة الغرفة إلى (${room.players[0].name})!`);
    io.to(room.id).emit('updatePlayers', room.players);
  }
}

function createRoom({ socket, playerName, playerId, targetPoints, maxRounds, deckMode, customCommands }) {
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
    tieTransitionTimeout: null,
    isTieVoting: false,
    tieVotes: new Map(),
    tiedContenders: [],
    gameStarted: false,
    kamelhaCallers: [],
    orbitPendingPlayers: null,
    turnTimer: null,
    turnDeadline: null,
    currentDuration: DEFAULT_TURN_TIME,
    targetPoints: parseInt(targetPoints) >= 0 ? parseInt(targetPoints) : 0,
    maxRounds: parseInt(maxRounds) >= 0 ? parseInt(maxRounds) : 0,
    deckMode: deckMode || 'classic',
    customCommands: Array.isArray(customCommands) ? customCommands : [],
    actionLog: [],
    actionLogByRound: {}
  };
  socket.join(roomId);

  if (adminService.registeredPlayers.has(playerId)) {
    const r = adminService.registeredPlayers.get(playerId);
    r.currentRoom = roomId;
    r.name = playerName.trim();
  }

  socket.emit('roomJoined', { roomId, players: rooms[roomId].players, isHost: true });
  return rooms[roomId];
}

module.exports = {
  rooms,
  getRoom,
  getAllRooms,
  deleteRoom,
  createDeck,
  checkDrawDeckRefill,
  checkLastManStanding,
  handleHostMigration,
  createRoom
};
