const { DEFAULT_TURN_TIME } = require('../config');
const adminService = require('./adminService');
const roomService = require('./roomService');

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

function broadcastCommandSplash(room, cmdType, cmdName, playerName, io) {
  if (io && room) {
    io.to(room.id).emit('commandSplash', { cmdType, cmdName, playerName });
  }
}

function appendActionLog(room, text, cmdType) {
  if (!room.actionLog) room.actionLog = [];
  room.actionLog.push({
    text,
    cmdType,
    ts: Date.now()
  });
}

// حساب ألقاب المباراة الشرفية من سجل الأحداث كما في فلاتر
function computeMatchAwards(room, players, winnerName) {
  const awards = [
    { title: 'لقب الحريف', holder: winnerName, desc: 'بطل المباراة والمتوج بالفوز' }
  ];

  const stealsCount = {};
  const mirrorCount = {};
  const unluckyCount = {};

  players.forEach(p => {
    stealsCount[p.name] = 0;
    mirrorCount[p.name] = 0;
    unluckyCount[p.name] = 0;
  });

  const allLogs = [];
  if (room.actionLogByRound) {
    Object.values(room.actionLogByRound).forEach(list => {
      if (Array.isArray(list)) allLogs.push(...list);
    });
  }
  if (Array.isArray(room.actionLog)) {
    allLogs.push(...room.actionLog);
  }

  allLogs.forEach(item => {
    if (!item) return;
    const txt = item.text || '';
    const type = item.cmdType || '';

    players.forEach(p => {
      const name = p.name;
      if ((type === 'thief' || type === 'hunt') && (txt.includes(`اصطاد (${name})`) || txt.includes(`لحساب (${name})`))) {
        stealsCount[name] = (stealsCount[name] || 0) + 1;
      }
      if (type === 'mirror' && txt.includes(`(${name})`)) {
        mirrorCount[name] = (mirrorCount[name] || 0) + 1;
      }
      if ((type === 'freeze' || type === 'curse') && txt.includes(`اللاعب (${name})`)) {
        unluckyCount[name] = (unluckyCount[name] || 0) + 1;
      }
    });
  });

  let topThief = '', maxSteals = 0;
  for (const [k, v] of Object.entries(stealsCount)) {
    if (v > maxSteals) { maxSteals = v; topThief = k; }
  }
  if (topThief && maxSteals > 0) {
    awards.push({ title: 'لقب أخطر حرامي', holder: topThief, desc: `نفذ ${maxSteals} عمليات صيد وسرقة ناجحة` });
  }

  let topWall = '', maxMirrors = 0;
  for (const [k, v] of Object.entries(mirrorCount)) {
    if (v > maxMirrors) { maxMirrors = v; topWall = k; }
  }
  if (topWall && maxMirrors > 0) {
    awards.push({ title: 'لقب الجدار العازل', holder: topWall, desc: `تصدى لـ ${maxMirrors} هجمات بالمراية` });
  }

  let topUnlucky = '', maxUnlucky = 0;
  for (const [k, v] of Object.entries(unluckyCount)) {
    if (v > maxUnlucky) { maxUnlucky = v; topUnlucky = k; }
  }
  if (topUnlucky && maxUnlucky > 0) {
    awards.push({ title: 'لقب المنحوس', holder: topUnlucky, desc: `تعرض لـ ${maxUnlucky} ضربات فرملة وحسد` });
  }

  return awards;
}

function startNewRound(room, io) {
  if (roomService.checkLastManStanding(room, io)) return;

  clearTimeout(room.turnTimer);
  clearTimeout(room.spinTimeout);
  clearTimeout(room.fireTimeout);
  clearTimeout(room.tieTimeout);
  clearTimeout(room.tieTransitionTimeout);

  if (room.roundCount > 0 && Array.isArray(room.actionLog)) {
    if (!room.actionLogByRound) room.actionLogByRound = {};
    room.actionLogByRound[`${room.roundCount}`] = [...room.actionLog];
    room.actionLog = [];
  }

  room.gameStarted = true;
  room.isTieVoting = false;
  room.tieVotes.clear();
  room.deck = roomService.createDeck(room.deckMode, room.customCommands);
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

  startTurnTimer(room, DEFAULT_TURN_TIME, io);
  sendGameState(room.id, io);
}

function startTurnTimer(room, seconds = DEFAULT_TURN_TIME, io) {
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
      roomService.checkDrawDeckRefill(room, io);
      if (room.deck.length > 0) {
        room.discardPile.push(room.deck.pop());
      }
    }
    advanceTurn(room, io);
  }, seconds * 1000);
}

function advanceTurn(room, io) {
  if (roomService.checkLastManStanding(room, io)) return;

  room.drawnCard = null;
  room.tempAnnoyCardIndex = null;
  room.pendingHunter = null;
  room.pendingThief = null;
  room.pendingMirror = null;
  room.pendingMagnet = null;
  const count = room.players.length;
  if (count === 0) return;

  const currentPlayer = room.players[room.currentTurnIndex];

  // شطب دور الخصم المنتهي من قائمة اللفة الأخيرة
  if (room.orbitPendingPlayers) {
    if (currentPlayer && room.orbitPendingPlayers.has(currentPlayer.id)) {
      room.orbitPendingPlayers.delete(currentPlayer.id);
    }

    if (room.orbitPendingPlayers.size === 0) {
      return endRound(room, false, io);
    }
  }

  room.currentTurnIndex = (room.currentTurnIndex + room.direction + count) % count;
  const nextPlayer = room.players[room.currentTurnIndex];

  // لو اللاعب التالي متفرمل: تخطي دوره وشطبه من قائمة اللفة الأخيرة
  if (nextPlayer && nextPlayer.isFrozen) {
    nextPlayer.isFrozen = false;
    io.to(room.id).emit('notify', `تم تخطي دور (${nextPlayer.name}) لأنه متفرمل!`);
    if (room.orbitPendingPlayers && room.orbitPendingPlayers.has(nextPlayer.id)) {
      room.orbitPendingPlayers.delete(nextPlayer.id);
      if (room.orbitPendingPlayers.size === 0) {
        return endRound(room, false, io);
      }
    }
    return advanceTurn(room, io);
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

  startTurnTimer(room, DEFAULT_TURN_TIME, io);
  sendGameState(room.id, io);
}

function endRound(room, instantEnd = false, io) {
  clearTimeout(room.turnTimer);
  clearTimeout(room.spinTimeout);
  clearTimeout(room.fireTimeout);
  clearTimeout(room.tieTimeout);
  clearTimeout(room.tieTransitionTimeout);

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
    const awards = computeMatchAwards(room, room.players, matchWinner ? matchWinner.name : 'اللاعب');
    io.to(room.id).emit('gameOver', { 
      winnerName: matchWinner ? matchWinner.name : 'اللاعب', 
      scores: room.players, 
      revealedHands,
      awards,
      reason: winReason
    });
    room.gameStarted = false;
    adminService.expireRoomOneMatchVouchers(room);
    return;
  }

  // فحص من وصل إلى هدف النقاط
  let reachedTarget = [];
  if (room.targetPoints > 0) {
    reachedTarget = room.players.filter(p => p.points >= room.targetPoints);
  }

  let maxRoundsReached = false;
  if (room.maxRounds > 0 && room.roundCount >= room.maxRounds) {
    maxRoundsReached = true;
  }

  // التعادل عند الوصول للهدف
  if (reachedTarget.length > 1) {
    const maxPts = Math.max(...reachedTarget.map(p => p.points));
    const tiedTops = reachedTarget.filter(p => p.points === maxPts);

    if (tiedTops.length > 1) {
      room.isTieVoting = true;
      room.tieVotes.clear();
      room.tiedContenders = tiedTops;

      io.to(room.id).emit('roundEnded', { msg: winMessage, revealedHands });
      
      clearTimeout(room.tieTransitionTimeout);
      room.tieTransitionTimeout = setTimeout(() => {
        io.to(room.id).emit('tieVotePrompt', { 
          contenders: tiedTops.map(c => c.name), 
          points: maxPts 
        });

        clearTimeout(room.tieTimeout);
        room.tieTimeout = setTimeout(() => {
          finalizeTieVotes(room, io);
        }, 20000);
      }, 7000);

      return;
    } else {
      matchWinner = tiedTops[0];
      winReason = `أول من وصل إلى هدف ${room.targetPoints} نقاط وفاز بالمباراة!`;
    }
  } else if (reachedTarget.length === 1) {
    matchWinner = reachedTarget[0];
    winReason = `أول من وصل إلى هدف ${room.targetPoints} نقاط وفاز بالمباراة!`;
  }

  // التعادل عند انتهاء الجولات
  if (!matchWinner && maxRoundsReached) {
    const maxPts = Math.max(...room.players.map(p => p.points));
    const tiedTops = room.players.filter(p => p.points === maxPts);

    if (tiedTops.length > 1) {
      room.isTieVoting = true;
      room.tieVotes.clear();
      room.tiedContenders = tiedTops;

      io.to(room.id).emit('roundEnded', { msg: winMessage, revealedHands });
      
      clearTimeout(room.tieTransitionTimeout);
      room.tieTransitionTimeout = setTimeout(() => {
        io.to(room.id).emit('tieVotePrompt', { 
          contenders: tiedTops.map(c => c.name), 
          points: maxPts 
        });

        clearTimeout(room.tieTimeout);
        room.tieTimeout = setTimeout(() => {
          finalizeTieVotes(room, io);
        }, 20000);
      }, 7000);

      return;
    } else {
      matchWinner = tiedTops[0];
      winReason = `فاز بأعلى مجموع نقاط بعد انتهاء كل الجولات (${room.maxRounds} جولة)!`;
    }
  }

  if (matchWinner) {
    const awards = computeMatchAwards(room, room.players, matchWinner.name);
    io.to(room.id).emit('gameOver', { 
      winnerName: matchWinner.name, 
      scores: room.players, 
      revealedHands,
      awards,
      reason: winReason
    });
    room.gameStarted = false;
    adminService.expireRoomOneMatchVouchers(room);
  } else {
    io.to(room.id).emit('roundEnded', { msg: winMessage, revealedHands });
    setTimeout(() => {
      if (roomService.rooms[room.id] && roomService.rooms[room.id].players.length >= 2) {
        startNewRound(roomService.rooms[room.id], io);
      }
    }, 8000);
  }
}

function finalizeTieVotes(room, io) {
  if (!room.isTieVoting) return;
  room.isTieVoting = false;
  clearTimeout(room.tieTimeout);

  io.to(room.id).emit('tieVoteResolved');

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

  if (playCount > drawCount) {
    io.to(room.id).emit('notify', 'نتيجة التصويت: الأغلبية اختارت لعب جولة فاصلة!');
    setTimeout(() => {
      if (roomService.rooms[room.id] && roomService.rooms[room.id].players.length >= 2) {
        startNewRound(roomService.rooms[room.id], io);
      }
    }, 2500);
  } else {
    const coWinners = room.tiedContenders.map(c => c.name).join(' و ');
    const awards = computeMatchAwards(room, room.players, coWinners);
    io.to(room.id).emit('gameOver', { 
      winnerName: coWinners, 
      scores: room.players, 
      revealedHands: room.players.map(p => ({ name: p.name, hand: p.hand, points: p.points, isHost: p.isHost })),
      awards,
      reason: 'انتهاء المباراة بالتعادل بقرار الأغلبية!'
    });
    room.gameStarted = false;
    adminService.expireRoomOneMatchVouchers(room);
  }
}

function returnToWaitingIndividual(room, socket, io) {
  const player = room.players.find(p => p.id === socket.id);
  if (!player) return;

  player.points = 0;
  player.hand = [];
  player.isFrozen = false;
  player.curseTurns = 0;
  player.revealedHand = null;
  player.revealedRemainingTurns = 0;

  socket.emit('playerBackInWaiting', { 
    roomId: room.id, 
    players: room.players, 
    isHost: player.isHost 
  });

  io.to(room.id).emit('updatePlayers', room.players);
  io.to(room.id).emit('notify', `عاد اللاعب (${player.name}) إلى غرفة الانتظار!`);
}

function sendGameState(roomId, io) {
  const room = roomService.rooms[roomId];
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
      gameStarted: room.gameStarted,
      deckMode: room.deckMode,
      customCommands: room.customCommands,
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

module.exports = {
  verifyKamelhaHand,
  broadcastCommandSplash,
  appendActionLog,
  computeMatchAwards,
  startNewRound,
  startTurnTimer,
  advanceTurn,
  endRound,
  finalizeTieVotes,
  returnToWaitingIndividual,
  sendGameState
};
