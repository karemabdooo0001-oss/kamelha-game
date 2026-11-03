const roomService = require('../services/roomService');
const gameEngine = require('../services/gameEngineService');
const { DEFAULT_TURN_TIME } = require('../config');
const { checkMirrorTrap } = require('./specialCommands');

function execReverse({ room, socket, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];

  gameEngine.broadcastCommandSplash(room, 'reverse', 'اعكس لفتك', player.name, io);
  room.discardPile.push(room.drawnCard);

  if (room.players.length === 2) {
    room.drawnCard = null;
    io.to(room.id).emit('notify', `كارت اعكس لفتك في لاعبين: تخطي دور الخصم ومتابعة دورك!`);
    gameEngine.appendActionLog(room, `تخطى (${player.name}) دور الخصم بكارت اعكس لفتك`, 'reverse');
    gameEngine.startTurnTimer(room, DEFAULT_TURN_TIME, io);
    gameEngine.sendGameState(room.id, io);
  } else {
    room.direction *= -1;
    io.to(room.id).emit('notify', `تم عكس اتجاه اللعب!`);
    gameEngine.appendActionLog(room, `عكس (${player.name}) اتجاه اللعب`, 'reverse');
    gameEngine.advanceTurn(room, io);
  }
}

function execKeda({ room, socket, targetPlayerId, io }) {
  if (!room || !room.drawnCard) return;
  if (room.kamelhaCallers.includes(targetPlayerId)) {
    return socket.emit('errorMsg', 'هذا اللاعب قال كملها ومحمي بقفل الحصانة!');
  }

  const player = room.players[room.currentTurnIndex];
  const target = room.players.find(p => p.id === targetPlayerId);
  if (!target) return;

  gameEngine.broadcastCommandSplash(room, 'keda', 'هو كدة', player.name, io);

  const execute = () => {
    room.discardPile.push(room.drawnCard);
    io.to(room.id).emit('kedaAnimation', { targetId: target.id, targetName: target.name });
    room.discardPile.push(...target.hand);
    roomService.checkDrawDeckRefill(room, io);
    target.hand = room.deck.splice(0, 4);
    io.to(room.id).emit('notify', `كارت هو كدة! تم تغيير كل كروت اللاعب (${target.name})!`);
    gameEngine.appendActionLog(room, `غير (${player.name}) كروت اللاعب (${target.name}) بالكامل بكارت هو كدة`, 'keda');
    gameEngine.advanceTurn(room, io);
  };

  const reflect = () => {
    room.discardPile.push(room.drawnCard);
    io.to(room.id).emit('kedaAnimation', { targetId: player.id, targetName: player.name });
    room.discardPile.push(...player.hand);
    roomService.checkDrawDeckRefill(room, io);
    player.hand = room.deck.splice(0, 4);
    io.to(room.id).emit('notify', `ارتد كارت هو كدة! تم تغيير كل كروت المهاجم (${player.name})!`);
    gameEngine.appendActionLog(room, `ارتد كارت هو كدة على (${player.name}) بالمراية`, 'mirror');
    gameEngine.advanceTurn(room, io);
  };

  if (!checkMirrorTrap(room, player, target, 'keda', 'هو كدة', execute, reflect, null, io)) {
    execute();
  }
}

function execSpin({ room, socket, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];

  gameEngine.broadcastCommandSplash(room, 'spin', 'شقلباظ', player.name, io);
  room.discardPile.push(room.drawnCard);
  room.drawnCard = null;
  room.pendingSpinMap.clear();

  io.to(room.id).emit('notify', `كارت شقلباظ! بدأ تمرير الكروت بين اللاعبين!`);
  io.to(player.id).emit('spinCasterPrompt');

  room.players.forEach(p => {
    if (p.id !== player.id) {
      const executeOpponentSpin = () => {
        io.to(p.id).emit('spinRequest');
      };

      const cancelOpponentSpin = () => {
        if (room.players.length === 2) {
          io.to(room.id).emit('notify', `تصدت المراية، وبطل مفعول كارت شقلباظ!`);
          room.pendingSpinMap.clear();
          return gameEngine.advanceTurn(room, io);
        } else {
          room.pendingSpinMap.set(p.id, null);
          checkSpinCompletion(room, io);
        }
      };

      if (!checkMirrorTrap(room, player, p, 'spin', 'شقلباظ', executeOpponentSpin, executeOpponentSpin, cancelOpponentSpin, io)) {
        executeOpponentSpin();
      }
    }
  });

  clearTimeout(room.spinTimeout);
  room.spinTimeout = setTimeout(() => {
    autoFillRemainingSpin(room, io);
  }, 15000);
}

function resolveSpinCasterChoice({ room, socket, participate, io }) {
  if (!room) return;
  const player = room.players.find(p => p.id === socket.id);
  if (!player) return;

  if (participate) {
    io.to(player.id).emit('spinRequest');
  } else {
    if (room.players.length === 2) {
      io.to(room.id).emit('notify', `رفض اللاعب المشاركة، وبطل مفعول كارت شقلباظ!`);
      room.pendingSpinMap.clear();
      clearTimeout(room.spinTimeout);
      return gameEngine.advanceTurn(room, io);
    } else {
      room.pendingSpinMap.set(player.id, null);
      checkSpinCompletion(room, io);
    }
  }
}

function submitSpinCard({ room, socket, handCardIndex, io }) {
  if (!room) return;
  const player = room.players.find(p => p.id === socket.id);
  if (!player || player.hand.length === 0) return;

  const card = player.hand.splice(handCardIndex, 1)[0];
  room.pendingSpinMap.set(player.id, card);
  checkSpinCompletion(room, io);
}

function checkSpinCompletion(room, io) {
  if (room.pendingSpinMap.size === room.players.length) {
    clearTimeout(room.spinTimeout);
    finishSpinExecution(room, io);
  }
}

function autoFillRemainingSpin(room, io) {
  room.players.forEach(p => {
    if (!room.pendingSpinMap.has(p.id) && p.hand.length > 0) {
      room.pendingSpinMap.set(p.id, p.hand.splice(0, 1)[0]);
    }
  });
  finishSpinExecution(room, io);
}

function finishSpinExecution(room, io) {
  clearTimeout(room.spinTimeout);
  const participants = room.players.filter(p => room.pendingSpinMap.get(p.id) !== null);
  const count = participants.length;

  if (count > 1) {
    for (let i = 0; i < count; i++) {
      const giver = participants[i];
      const nextIdx = (i + room.direction + count) % count;
      const receiver = participants[nextIdx];
      const passedCard = room.pendingSpinMap.get(giver.id);
      
      if (passedCard) {
        if (passedCard.type === 'command' && passedCard.cmdType === 'mirror') {
          passedCard.fromGround = true;
        }
        receiver.hand.push(passedCard);
      }
    }
    io.to(room.id).emit('notify', `دارت الترابيزة واستلم كل لاعب كارت جاره!`);
    gameEngine.appendActionLog(room, `دارت الترابيزة واستلم كل لاعب كارت جاره بشقلباظ`, 'spin');
  }

  room.pendingSpinMap.clear();
  gameEngine.advanceTurn(room, io);
}

function execWildAs({ room, socket, chosenCmdType, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];

  gameEngine.broadcastCommandSplash(room, 'wild', 'براحتك', player.name, io);
  room.drawnCard.cmdType = chosenCmdType;
  
  const map = { 
    hunt: 'اصطاد كارتك', 
    bank: 'لم كمالتك', 
    reverse: 'اعكس لفتك', 
    keda: 'هو كدة', 
    annoy: 'رخم عليهم',
    thief: 'الحرامي',
    reveal: 'ع المكشوف',
    swap: 'بدّل يا نجم',
    freeze: 'فرملة',
    spin: 'شقلباظ',
    ambush: 'الكمين',
    magnet: 'المغناطيس',
    curse: 'عين حسودة',
    fire: 'ولعانة'
  };
  room.drawnCard.name = map[chosenCmdType] || chosenCmdType;
  socket.emit('wildTransformed', room.drawnCard);
}

module.exports = {
  execReverse,
  execKeda,
  execSpin,
  resolveSpinCasterChoice,
  submitSpinCard,
  checkSpinCompletion,
  autoFillRemainingSpin,
  finishSpinExecution,
  execWildAs
};
