const roomService = require('../services/roomService');
const gameEngine = require('../services/gameEngineService');

// فحص اعتراض كارت المراية في يد الهدف (شرط ألا تكون مسحوبة من الأرض)
function checkMirrorTrap(room, attacker, target, cmdType, cmdName, executeCallback, reflectCallback, cancelCallback, io) {
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

function resolveMirrorResponse({ room, socket, action, io }) {
  if (!room || !room.pendingMirror) return;

  const { attacker, target, mirrorIdx, cmdName, executeCallback, reflectCallback, cancelCallback } = room.pendingMirror;
  if (target.id !== socket.id) return;

  if (action === 'cancel' || action === 'reflect') {
    const mirrorCard = target.hand.splice(mirrorIdx, 1)[0];
    room.discardPile.push(mirrorCard);

    roomService.checkDrawDeckRefill(room, io);
    if (room.deck.length > 0) {
      target.hand.push(room.deck.pop());
    }

    if (action === 'cancel') {
      io.to(room.id).emit('notify', `تصدت المراية لكارت (${cmdName}) وحمت اللاعب (${target.name})!`);
      gameEngine.appendActionLog(room, `تصدى (${target.name}) لكارت (${cmdName}) بالمراية`, 'mirror');
      room.pendingMirror = null;
      if (cancelCallback) cancelCallback();
      else gameEngine.advanceTurn(room, io);
    } else if (action === 'reflect') {
      io.to(room.id).emit('notify', `عكست المراية كارت (${cmdName}) في صدر (${attacker.name})!`);
      gameEngine.appendActionLog(room, `عكس (${target.name}) كارت (${cmdName}) في صدر (${attacker.name}) بالمراية`, 'mirror');
      room.pendingMirror = null;
      if (reflectCallback) reflectCallback();
      else gameEngine.advanceTurn(room, io);
    }
  } else {
    room.pendingMirror = null;
    executeCallback();
  }
}

function execBank({ room, socket, discardIndex, handCardIndex, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];

  gameEngine.broadcastCommandSplash(room, 'bank', 'لم كمالتك', player.name, io);
  room.discardPile.push(room.drawnCard);
  const chosen = room.discardPile.splice(discardIndex, 1)[0];
  
  if (chosen.type === 'command' && chosen.cmdType === 'mirror') {
    chosen.fromGround = true;
  }

  const oldCard = player.hand.splice(handCardIndex, 1, chosen)[0];
  room.discardPile.push(oldCard);

  io.to(room.id).emit('notify', `استخدم (${player.name}) لم كمالتك وأخذ كارت من الأرض!`);
  gameEngine.appendActionLog(room, `أخذ (${player.name}) كارت من الأرض بكارت لم كمالتك`, 'bank');
  gameEngine.advanceTurn(room, io);
}

function execAmbush({ room, socket, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];

  gameEngine.broadcastCommandSplash(room, 'ambush', 'الكمين', player.name, io);
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

        roomService.checkDrawDeckRefill(room, io);
        for (let j = 0; j < jokers.length; j++) {
          if (room.deck.length > 0) p.hand.push(room.deck.pop());
        }
      }
    });

    if (seizedCount > 0) {
      io.to(room.id).emit('notify', `كمين بواسطة (${player.name})! تم مصادرة (${seizedCount}) جوكر للأرض!`);
      gameEngine.appendActionLog(room, `صادر (${player.name}) عدد (${seizedCount}) جوكر بالكمين`, 'ambush');
    } else {
      io.to(room.id).emit('notify', `نزل الكمين ولم يتم العثور على أي جواكر!`);
    }
    gameEngine.advanceTurn(room, io);
  };

  const reflectSeizure = () => {
    const attackerJokers = player.hand.filter(c => c.type === 'command' && c.cmdType === 'joker');
    if (attackerJokers.length > 0) {
      player.hand = player.hand.filter(c => !(c.type === 'command' && c.cmdType === 'joker'));
      room.discardPile.push(...attackerJokers);
      roomService.checkDrawDeckRefill(room, io);
      for (let j = 0; j < attackerJokers.length; j++) {
        if (room.deck.length > 0) player.hand.push(room.deck.pop());
      }
      io.to(room.id).emit('notify', `ارتد الكمين وتم مصادرة (${attackerJokers.length}) جوكر من يد المهاجم (${player.name})!`);
      gameEngine.appendActionLog(room, `ارتد الكمين وصودر (${attackerJokers.length}) جوكر من (${player.name})`, 'mirror');
    } else {
      io.to(room.id).emit('notify', `ارتد الكمين ولكن المهاجم (${player.name}) ليس معه جواكر!`);
    }
    gameEngine.advanceTurn(room, io);
  };

  if (defendersWithJokerAndMirror.length > 0) {
    const defender = defendersWithJokerAndMirror[0];
    checkMirrorTrap(room, player, defender, 'ambush', 'الكمين',
      () => executeSeizure(null),
      () => reflectSeizure(),
      () => executeSeizure(defender.id),
      io
    );
  } else {
    executeSeizure(null);
  }
}

function execMagnetPick({ room, socket, targetType, targetValue, targetCmdType, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];

  gameEngine.broadcastCommandSplash(room, 'magnet', 'المغناطيس', player.name, io);
  room.discardPile.push(room.drawnCard);
  room.drawnCard = null;

  const isJoker = targetType === 'command' && targetCmdType === 'joker';
  const checkMatching = (c) => isJoker ? (c.type === 'command' && c.cmdType === 'joker') : (c.type === 'number' && c.value === parseInt(targetValue));

  const pulledCards = [];
  for (let i = room.discardPile.length - 1; i >= 0; i--) {
    if (checkMatching(room.discardPile[i])) {
      pulledCards.push(room.discardPile.splice(i, 1)[0]);
    }
  }

  if (pulledCards.length > 0) {
    room.pendingMagnet = { pulledCards, player };
    const itemName = isJoker ? 'جوكر' : `رقم ${targetValue}`;
    io.to(player.id).emit('magnetChooseDiscards', { count: pulledCards.length, itemName });
  } else {
    const itemName = isJoker ? 'جواكر' : `كروت برقم ${targetValue}`;
    io.to(room.id).emit('notify', `لم يجد المغناطيس أي ${itemName} على الأرض!`);
    gameEngine.advanceTurn(room, io);
  }
}

function submitMagnetDiscards({ room, socket, discardIndices, io }) {
  if (!room || !room.pendingMagnet) return;

  const { pulledCards, player } = room.pendingMagnet;
  if (player.id !== socket.id) return;

  const sorted = discardIndices.sort((a, b) => b - a);
  sorted.forEach(idx => {
    const discarded = player.hand.splice(idx, 1)[0];
    if (discarded) room.discardPile.push(discarded);
  });

  player.hand.push(...pulledCards);
  io.to(room.id).emit('notify', `شفط المغناطيس (${pulledCards.length}) كروت من الأرض ليد (${player.name})!`);
  gameEngine.appendActionLog(room, `شفط (${player.name}) عدد (${pulledCards.length}) كروت بالمغناطيس`, 'magnet');
  
  room.pendingMagnet = null;
  gameEngine.advanceTurn(room, io);
}

function execFire({ room, socket, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];

  gameEngine.broadcastCommandSplash(room, 'fire', 'ولعانة', player.name, io);
  room.discardPile.push(room.drawnCard);
  room.drawnCard = null;
  room.pendingFireMap.clear();

  io.to(room.id).emit('notify', `كارت ولعانة! استعدوا لحرق واستبدال الكروت!`);
  io.to(player.id).emit('fireCasterPrompt');

  room.players.forEach(p => {
    if (p.id !== player.id) {
      const executeBurn = () => {
        io.to(p.id).emit('fireRequest');
      };

      const cancelBurn = () => {
        room.pendingFireMap.set(p.id, true);
        checkFireCompletion(room, io);
      };

      const reflectBurn = () => {
        io.to(player.id).emit('fireRequest');
        room.pendingFireMap.set(p.id, true);
        checkFireCompletion(room, io);
      };

      if (!checkMirrorTrap(room, player, p, 'fire', 'ولعانة', executeBurn, reflectBurn, cancelBurn, io)) {
        executeBurn();
      }
    }
  });

  clearTimeout(room.fireTimeout);
  room.fireTimeout = setTimeout(() => {
    autoFillRemainingFire(room, io);
  }, 15000);
}

function resolveFireCasterChoice({ room, socket, burn, io }) {
  if (!room) return;
  const player = room.players.find(p => p.id === socket.id);
  if (!player) return;

  if (burn) {
    io.to(player.id).emit('fireRequest');
  } else {
    room.pendingFireMap.set(player.id, true);
    checkFireCompletion(room, io);
  }
}

function submitFireCard({ room, socket, handCardIndex, io }) {
  if (!room) return;
  const player = room.players.find(p => p.id === socket.id);
  if (!player || player.hand.length === 0) return;

  const burned = player.hand.splice(handCardIndex, 1)[0];
  room.discardPile.push(burned);
  roomService.checkDrawDeckRefill(room, io);
  if (room.deck.length > 0) player.hand.push(room.deck.pop());
  room.pendingFireMap.set(player.id, true);

  checkFireCompletion(room, io);
}

function checkFireCompletion(room, io) {
  if (room.pendingFireMap.size === room.players.length) {
    clearTimeout(room.fireTimeout);
    room.pendingFireMap.clear();
    gameEngine.advanceTurn(room, io);
  }
}

function autoFillRemainingFire(room, io) {
  room.players.forEach(p => {
    if (!room.pendingFireMap.has(p.id) && p.hand.length > 0) {
      const burned = p.hand.splice(0, 1)[0];
      room.discardPile.push(burned);
      roomService.checkDrawDeckRefill(room, io);
      if (room.deck.length > 0) p.hand.push(room.deck.pop());
      room.pendingFireMap.set(p.id, true);
    }
  });
  room.pendingFireMap.clear();
  gameEngine.advanceTurn(room, io);
}

module.exports = {
  checkMirrorTrap,
  resolveMirrorResponse,
  execBank,
  execAmbush,
  execMagnetPick,
  submitMagnetDiscards,
  execFire,
  resolveFireCasterChoice,
  submitFireCard,
  checkFireCompletion,
  autoFillRemainingFire
};
