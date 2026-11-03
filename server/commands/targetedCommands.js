const roomService = require('../services/roomService');
const gameEngine = require('../services/gameEngineService');
const { checkMirrorTrap } = require('./specialCommands');

function checkHuntTarget({ room, socket, targetPlayerId, requestedItem, io }) {
  if (!room || !room.drawnCard) return;
  if (room.kamelhaCallers.includes(targetPlayerId)) {
    return socket.emit('errorMsg', 'هذا اللاعب محمي بقفل الحصانة!');
  }

  const hunter = room.players[room.currentTurnIndex];
  const target = room.players.find(p => p.id === targetPlayerId);
  if (!target) return;

  gameEngine.broadcastCommandSplash(room, 'hunt', 'اصطاد كارتك', hunter.name, io);

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
      io.to(room.id).emit('notify', `ارتد الصيد في صدر (${hunter.name})!`);
      gameEngine.appendActionLog(room, `ارتد الصيد في صدر (${hunter.name}) بالمراية`, 'mirror');
      gameEngine.advanceTurn(room, io);
    };

    if (!checkMirrorTrap(room, hunter, target, 'hunt', 'اصطاد كارتك', execute, reflect, null, io)) {
      execute();
    }
  } else {
    room.discardPile.push(room.drawnCard);
    room.drawnCard = null;
    io.to(room.id).emit('notify', `فشل الصيد! (${target.name}) معهوش ${itemName}.`);
    gameEngine.advanceTurn(room, io);
  }
}

function confirmHuntSwap({ room, socket, handCardIndexToGive, io }) {
  if (!room || !room.drawnCard || !room.pendingHunter) return;

  const hunter = room.players[room.currentTurnIndex];
  const target = room.players.find(p => p.id === room.pendingHunter.targetPlayerId);

  room.discardPile.push(room.drawnCard);
  if (target && target.hand[room.pendingHunter.foundIndex]) {
    const hunted = target.hand.splice(room.pendingHunter.foundIndex, 1)[0];
    const given = hunter.hand.splice(handCardIndexToGive, 1, hunted)[0];
    target.hand.push(given);
    io.to(room.id).emit('notify', `اصطياد ناجح! أخذ (${hunter.name}) ${room.pendingHunter.itemName} من (${target.name})!`);
    gameEngine.appendActionLog(room, `اصطاد (${hunter.name}) كارت ${room.pendingHunter.itemName} من (${target.name})`, 'hunt');
  }
  room.pendingHunter = null;
  gameEngine.advanceTurn(room, io);
}

function executeThief({ room, socket, requestedItem, io }) {
  if (!room || !room.drawnCard) return;

  const thief = room.players[room.currentTurnIndex];
  gameEngine.broadcastCommandSplash(room, 'thief', 'الحرامي', thief.name, io);

  const itemName = requestedItem === 'joker' ? 'جوكر' : `رقم ${requestedItem}`;
  const checkCard = (c) => requestedItem === 'joker' ? (c.type === 'command' && c.cmdType === 'joker') : (c.type === 'number' && c.value === parseInt(requestedItem));

  continueThiefSearch(room, thief, requestedItem, itemName, checkCard, [], io);
}

function continueThiefSearch(room, thief, requestedItem, itemName, checkCard, excludedVictimIds, io) {
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
      continueThiefSearch(room, thief, requestedItem, itemName, checkCard, excludedVictimIds, io);
    };

    const reflect = () => {
      room.discardPile.push(room.drawnCard);
      io.to(room.id).emit('notify', `عكست المراية سرقة الحرامي!`);
      gameEngine.appendActionLog(room, `عكست المراية سرقة الحرامي من (${thief.name})`, 'mirror');
      gameEngine.advanceTurn(room, io);
    };

    if (!checkMirrorTrap(room, thief, victim, 'thief', 'الحرامي', execute, reflect, cancel, io)) {
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

  roomService.checkDrawDeckRefill(room, io);
  let deckIndex = room.deck.findIndex(checkCard);

  if (deckIndex !== -1) {
    room.pendingThief = { tier: 'deck', deckIndex, itemName };
    return io.to(thief.id).emit('thiefFoundInDeck', { itemName });
  }

  room.discardPile.push(room.drawnCard);
  room.drawnCard = null;
  io.to(room.id).emit('notify', `لم يجد الحرامي أي كارت متاح لسرقته!`);
  gameEngine.advanceTurn(room, io);
}

function confirmThiefSwap({ room, socket, handCardIndexToGive, io }) {
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
      io.to(room.id).emit('notify', `سرق الحرامي كارت (${itemName}) من يد (${victim.name}) وبدله بكارت من يده!`);
      gameEngine.appendActionLog(room, `سرق الحرامي (${thief.name}) كارت ${itemName} من (${victim.name})`, 'thief');
    }
  } else if (tier === 'ground') {
    const stolen = room.discardPile.splice(room.pendingThief.groundIndex, 1)[0];
    const given = thief.hand.splice(handCardIndexToGive, 1, stolen)[0];
    room.discardPile.push(given);
    io.to(room.id).emit('notify', `التقط الحرامي كارت (${itemName}) من الأرض ورمى كارت مكانه!`);
    gameEngine.appendActionLog(room, `التقط الحرامي (${thief.name}) كارت ${itemName} من الأرض`, 'thief');
  } else if (tier === 'deck') {
    const stolen = room.deck.splice(room.pendingThief.deckIndex, 1)[0];
    const given = thief.hand.splice(handCardIndexToGive, 1, stolen)[0];
    room.discardPile.push(given);
    io.to(room.id).emit('notify', `أخرج الحرامي كارت (${itemName}) من قلب كروت السحب المقلوبة!`);
    gameEngine.appendActionLog(room, `سحب الحرامي (${thief.name}) كارت ${itemName} من الديك`, 'thief');
  }

  room.pendingThief = null;
  gameEngine.advanceTurn(room, io);
}

function execReveal({ room, socket, targetPlayerId, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];
  const target = room.players.find(p => p.id === targetPlayerId);
  if (!target) return;

  gameEngine.broadcastCommandSplash(room, 'reveal', 'ع المكشوف', player.name, io);

  const execute = () => {
    room.discardPile.push(room.drawnCard);
    target.revealedHand = target.hand;
    target.revealedRemainingTurns = room.players.length;

    io.to(room.id).emit('notify', `كارت ع المكشوف! أصبحت كروت (${target.name}) مكشوفة للجميع على الترابيزة!`);
    gameEngine.appendActionLog(room, `كشف (${player.name}) كروت اللاعب (${target.name}) ع المكشوف`, 'reveal');
    gameEngine.advanceTurn(room, io);
  };

  const reflect = () => {
    room.discardPile.push(room.drawnCard);
    player.revealedHand = player.hand;
    player.revealedRemainingTurns = room.players.length;

    io.to(room.id).emit('notify', `ارتدت العين! أصبحت كروت المهاجم (${player.name}) مكشوفة للجميع على الترابيزة!`);
    gameEngine.appendActionLog(room, `ارتدت كروت ع المكشوف على (${player.name}) بالمراية`, 'mirror');
    gameEngine.advanceTurn(room, io);
  };

  if (!checkMirrorTrap(room, player, target, 'reveal', 'ع المكشوف', execute, reflect, null, io)) {
    execute();
  }
}

function execSwapHand({ room, socket, targetPlayerId, io }) {
  if (!room || !room.drawnCard) return;
  if (room.kamelhaCallers.includes(targetPlayerId)) {
    return socket.emit('errorMsg', 'هذا اللاعب محمي بقفل الحصانة!');
  }

  const player = room.players[room.currentTurnIndex];
  const target = room.players.find(p => p.id === targetPlayerId);
  if (!target) return;

  gameEngine.broadcastCommandSplash(room, 'swap', 'بدّل يا نجم', player.name, io);

  const execute = () => {
    room.discardPile.push(room.drawnCard);
    const tempHand = player.hand;
    player.hand = target.hand;
    target.hand = tempHand;
    io.to(room.id).emit('notify', `بدّل يا نجم! قام (${player.name}) بتبديل يده بالكامل مع (${target.name})!`);
    gameEngine.appendActionLog(room, `بدل (${player.name}) يده بالكامل مع (${target.name})`, 'swap');
    gameEngine.advanceTurn(room, io);
  };

  const reflect = () => {
    room.discardPile.push(room.drawnCard);
    io.to(room.id).emit('notify', `تصدت المراية للتبديل وظلت الكروت كما هي!`);
    gameEngine.appendActionLog(room, `تصدى (${target.name}) لتبديل اليد بالمراية`, 'mirror');
    gameEngine.advanceTurn(room, io);
  };

  if (!checkMirrorTrap(room, player, target, 'swap', 'بدّل يا نجم', execute, reflect, null, io)) {
    execute();
  }
}

function execFreeze({ room, socket, targetPlayerId, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];
  const target = room.players.find(p => p.id === targetPlayerId);
  if (!target) return;

  gameEngine.broadcastCommandSplash(room, 'freeze', 'فرملة', player.name, io);

  const execute = () => {
    room.discardPile.push(room.drawnCard);
    target.isFrozen = true;
    io.to(room.id).emit('notify', `كارت فرملة! تم تجميد اللاعب (${target.name}) وسيتخطى دوره القادم!`);
    gameEngine.appendActionLog(room, `فرمل (${player.name}) اللاعب (${target.name})`, 'freeze');
    gameEngine.advanceTurn(room, io);
  };

  const reflect = () => {
    room.discardPile.push(room.drawnCard);
    player.isFrozen = true;
    io.to(room.id).emit('notify', `ارتدت الفرملة! تم تجميد المهاجم (${player.name})!`);
    gameEngine.appendActionLog(room, `ارتدت الفرملة على (${player.name}) بالمراية`, 'mirror');
    gameEngine.advanceTurn(room, io);
  };

  if (!checkMirrorTrap(room, player, target, 'freeze', 'فرملة', execute, reflect, null, io)) {
    execute();
  }
}

function execCurse({ room, socket, targetPlayerId, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];
  const target = room.players.find(p => p.id === targetPlayerId);
  if (!target) return;

  gameEngine.broadcastCommandSplash(room, 'curse', 'عين حسودة', player.name, io);

  const execute = () => {
    room.discardPile.push(room.drawnCard);
    target.curseTurns = 2;
    io.to(room.id).emit('notify', `أصابت عين حسودة (${target.name}) وممنوع يسحب من الأرض لدورين!`);
    gameEngine.appendActionLog(room, `أصاب (${player.name}) اللاعب (${target.name}) بالعين الحسودة`, 'curse');
    gameEngine.advanceTurn(room, io);
  };

  const reflect = () => {
    room.discardPile.push(room.drawnCard);
    player.curseTurns = 2;
    io.to(room.id).emit('notify', `ارتدت العين الحسودة وأصابت المهاجم (${player.name})!`);
    gameEngine.appendActionLog(room, `ارتدت العين الحسودة على (${player.name}) بالمراية`, 'mirror');
    gameEngine.advanceTurn(room, io);
  };

  if (!checkMirrorTrap(room, player, target, 'curse', 'عين حسودة', execute, reflect, null, io)) {
    execute();
  }
}

function peekAnnoy2P({ room, socket, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];
  const opponent = room.players.find(p => p.id !== player?.id);
  if (!opponent || opponent.hand.length === 0) return;

  if (room.kamelhaCallers.includes(opponent.id)) {
    return socket.emit('errorMsg', 'الخصم قال كملها ومحمي بقفل الحصانة!');
  }

  gameEngine.broadcastCommandSplash(room, 'annoy', 'رخم عليهم', player.name, io);
  room.tempAnnoyCardIndex = Math.floor(Math.random() * opponent.hand.length);
  socket.emit('annoy2PPeekResult', opponent.hand[room.tempAnnoyCardIndex]);
}

function resolveAnnoy2P({ room, socket, swap, handCardIndexToGive, io }) {
  if (!room || !room.drawnCard) return;
  const player = room.players[room.currentTurnIndex];
  const opponent = room.players.find(p => p.id !== player?.id);

  room.discardPile.push(room.drawnCard);
  if (swap && room.tempAnnoyCardIndex !== null && opponent && !room.kamelhaCallers.includes(opponent.id)) {
    const taken = opponent.hand.splice(room.tempAnnoyCardIndex, 1)[0];
    const given = player.hand.splice(handCardIndexToGive, 1, taken)[0];
    opponent.hand.push(given);

    io.to(room.id).emit('annoySwapAnimation', { p1Id: player.id, p2Id: opponent.id });
    io.to(room.id).emit('notify', `رخم عليهم: رأى (${player.name}) كارت الخصم وبدّله!`);
    gameEngine.appendActionLog(room, `بدل (${player.name}) كارت مع (${opponent.name}) بكارت رخم عليهم`, 'annoy');
  } else {
    io.to(room.id).emit('notify', `رخم عليهم: رأى (${player.name}) كارت الخصم وتركه مكانه.`);
  }
  room.tempAnnoyCardIndex = null;
  gameEngine.advanceTurn(room, io);
}

function execAnnoyMulti({ room, socket, playerAId, playerBId, io }) {
  if (!room || !room.drawnCard) return;
  if (room.kamelhaCallers.includes(playerAId) || room.kamelhaCallers.includes(playerBId)) {
    return socket.emit('errorMsg', 'لا يمكنك اختيار لاعب محمي بقفل كملها!');
  }

  const player = room.players[room.currentTurnIndex];
  const pA = room.players.find(p => p.id === playerAId);
  const pB = room.players.find(p => p.id === playerBId);
  if (!pA || !pB) return;

  gameEngine.broadcastCommandSplash(room, 'annoy', 'رخم عليهم', player.name, io);
  room.discardPile.push(room.drawnCard);
  const cardA = pA.hand.splice(Math.floor(Math.random() * pA.hand.length), 1)[0];
  const cardB = pB.hand.splice(Math.floor(Math.random() * pB.hand.length), 1)[0];
  pA.hand.push(cardB);
  pB.hand.push(cardA);

  io.to(room.id).emit('annoySwapAnimation', { p1Id: pA.id, p2Id: pB.id });
  io.to(room.id).emit('notify', `رخم عليهم: تم تبديل كارت سراً بين (${pA.name}) و (${pB.name})!`);
  gameEngine.appendActionLog(room, `بدل (${player.name}) كروت بين (${pA.name}) و (${pB.name}) بكارت رخم عليهم`, 'annoy');
  gameEngine.advanceTurn(room, io);
}

module.exports = {
  checkHuntTarget,
  confirmHuntSwap,
  executeThief,
  continueThiefSearch,
  confirmThiefSwap,
  execReveal,
  execSwapHand,
  execFreeze,
  execCurse,
  peekAnnoy2P,
  resolveAnnoy2P,
  execAnnoyMulti
};
