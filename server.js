const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

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
  if (hand.length !== 4) return { valid: false };
  let jokers = 0;
  const numCounts = {};
  hand.forEach(c => {
    if (c.type === 'command' && c.cmdType === 'joker') jokers++;
    else if (c.type === 'number') numCounts[c.value] = (numCounts[c.value] || 0) + 1;
  });
  if (jokers === 4) return { valid: true, points: 1 };
  for (const val in numCounts) {
    if (numCounts[val] + jokers === 4) {
      return { valid: true, points: jokers > 0 ? 1 : 2 };
    }
  }
  return { valid: false };
}

io.on('connection', (socket) => {
  // إنشاء الغرفة
  socket.on('createRoom', ({ playerName }) => {
    const roomId = Math.random().toString(36).substring(2, 6).toUpperCase();
    rooms[roomId] = {
      id: roomId,
      players: [{ id: socket.id, name: playerName, hand: [], points: 0, isHost: true }],
      deck: [],
      discardPile: [],
      currentTurnIndex: 0,
      direction: 1,
      drawnCard: null,
      gameStarted: false,
      kamelhaCallers: [],
      turnsLeftInOrbit: null
    };
    socket.join(roomId);
    socket.emit('roomJoined', { roomId, players: rooms[roomId].players, isHost: true });
  });

  // الانضمام لغرفة
  socket.on('joinRoom', ({ playerName, roomId }) => {
    roomId = roomId.toUpperCase();
    const room = rooms[roomId];
    if (!room) return socket.emit('errorMsg', 'الغرفة غير موجودة!');
    if (room.gameStarted) return socket.emit('errorMsg', 'اللعبة بدأت بالفعل!');
    if (room.players.length >= 4) return socket.emit('errorMsg', 'الغرفة ممتلئة!');

    room.players.push({ id: socket.id, name: playerName, hand: [], points: 0, isHost: false });
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', room.players);
    socket.emit('roomJoined', { roomId, players: room.players, isHost: false });
  });

  // بدء الجيم
  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    if (!room || room.players.length < 2) return socket.emit('errorMsg', 'الحد الأدنى لاعبين!');
    startNewRound(room);
  });

  function startNewRound(room) {
    room.gameStarted = true;
    room.deck = createDeck();
    room.discardPile = [];
    room.currentTurnIndex = 0;
    room.direction = 1;
    room.drawnCard = null;
    room.kamelhaCallers = [];
    room.turnsLeftInOrbit = null;

    room.players.forEach(p => p.hand = room.deck.splice(0, 4));
    room.discardPile.push(room.deck.pop());
    io.to(room.id).emit('notify', 'بدأت الجولة! بالتوفيق للجميع.');
    sendGameState(room.id);
  }

  // سحب كارت مقلوب
  socket.on('drawCard', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;
    if (room.players[room.currentTurnIndex].id !== socket.id) return socket.emit('errorMsg', 'مش دورك!');
    if (room.drawnCard) return socket.emit('errorMsg', 'أنت سحبت كارت بالفعل!');

    checkDrawDeckRefill(room);
    if (room.deck.length === 0) return socket.emit('errorMsg', 'الكروت خلصت تماماً!');

    room.drawnCard = room.deck.pop();
    socket.emit('cardDrawn', room.drawnCard);
    sendGameState(roomId);
  });

  // رمي الكارت المسحوب مباشرة
  socket.on('discardDrawnCard', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    room.discardPile.push(room.drawnCard);
    advanceTurn(room);
  });

  // استبدال كارت من اليد بالكارت المسحوب
  socket.on('swapWithHand', ({ roomId, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    if (player.id !== socket.id) return;

    const oldCard = player.hand.splice(handCardIndex, 1, room.drawnCard)[0];
    room.discardPile.push(oldCard);
    advanceTurn(room);
  });

  // أخذ كارت الأرض المكشوف
  socket.on('takeDiscardCard', ({ roomId, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;
    const player = room.players[room.currentTurnIndex];
    if (player.id !== socket.id) return socket.emit('errorMsg', 'مش دورك!');
    if (room.drawnCard) return socket.emit('errorMsg', 'أنت سحبت كارت مقلوب بالفعل!');
    if (room.discardPile.length === 0) return;

    const taken = room.discardPile.pop();
    const oldCard = player.hand.splice(handCardIndex, 1, taken)[0];
    room.discardPile.push(oldCard);
    advanceTurn(room);
  });

  // ================= تنفيذ كروت الكوماندز =================

  // 1. اعكس لفتك
  socket.on('execReverse', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    room.discardPile.push(room.drawnCard);

    if (room.players.length === 2) {
      room.drawnCard = null;
      io.to(roomId).emit('notify', `كارت اعكس لفتك في لاعبين: تخطي دور الخصم ومتابعة دورك!`);
      sendGameState(roomId);
    } else {
      room.direction *= -1;
      io.to(roomId).emit('notify', `تم عكس اتجاه اللعب!`);
      advanceTurn(room);
    }
  });

  // 2. هو كدة
  socket.on('execKeda', ({ roomId, targetPlayerId }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    room.discardPile.push(room.drawnCard);
    room.discardPile.push(...target.hand);
    checkDrawDeckRefill(room);
    target.hand = room.deck.splice(0, 4);

    io.to(roomId).emit('notify', `كارت هو كدة! تم تغيير كل كروت اللاعب (${target.name})!`);
    advanceTurn(room);
  });

  // 3. لم كمالتك
  socket.on('execBank', ({ roomId, discardIndex, handCardIndex }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];

    room.discardPile.push(room.drawnCard);
    const chosenFromGround = room.discardPile.splice(discardIndex, 1)[0];
    const oldCard = player.hand.splice(handCardIndex, 1, chosenFromGround)[0];
    room.discardPile.push(oldCard);

    io.to(roomId).emit('notify', `استخدم (${player.name}) كارت لم كمالتك وأخذ كارت من الأرض!`);
    advanceTurn(room);
  });

  // 4. اصطاد كارتك
  socket.on('execHunt', ({ roomId, targetPlayerId, requestedNumber, handCardIndexToGive }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    const target = room.players.find(p => p.id === targetPlayerId);
    if (!target) return;

    room.discardPile.push(room.drawnCard);

    const foundIndex = target.hand.findIndex(c => c.type === 'number' && c.value === parseInt(requestedNumber));
    if (foundIndex !== -1) {
      const huntedCard = target.hand.splice(foundIndex, 1)[0];
      const givenCard = player.hand.splice(handCardIndexToGive, 1, huntedCard)[0];
      target.hand.push(givenCard);
      io.to(roomId).emit('notify', `🎯 اصطياد ناجح! أخذ (${player.name}) رقم ${requestedNumber} من (${target.name})!`);
    } else {
      io.to(roomId).emit('notify', `🐟 فشل الصيد! (${target.name}) معهوش رقم ${requestedNumber}.`);
    }
    advanceTurn(room);
  });

  // 5. رخم عليهم (لاعبين)
  socket.on('execAnnoy2P', ({ roomId, action, handCardIndexToGive }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    const player = room.players[room.currentTurnIndex];
    const opponent = room.players.find(p => p.id !== player.id);

    room.discardPile.push(room.drawnCard);

    if (action === 'swap') {
      const randomIdx = Math.floor(Math.random() * opponent.hand.length);
      const taken = opponent.hand.splice(randomIdx, 1)[0];
      const given = player.hand.splice(handCardIndexToGive, 1, taken)[0];
      opponent.hand.push(given);
      io.to(roomId).emit('notify', `😈 رخم عليهم: قام (${player.name}) بتبديل كارت مع (${opponent.name})!`);
    } else {
      io.to(roomId).emit('notify', `رخم عليهم: رأى (${player.name}) كارت الخصم وتركه مكانه.`);
    }
    advanceTurn(room);
  });

  // 6. رخم عليهم (3 أو 4 لاعبين)
  socket.on('execAnnoyMulti', ({ roomId, playerAId, playerBId }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
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

  // 7. براحتك
  socket.on('execWildAs', ({ roomId, chosenCmdType }) => {
    const room = rooms[roomId];
    if (!room || !room.drawnCard) return;
    room.drawnCard.cmdType = chosenCmdType;
    room.drawnCard.name = getCmdName(chosenCmdType);
    socket.emit('wildTransformed', room.drawnCard);
  });

  function getCmdName(type) {
    const map = { hunt: 'اصطاد كارتك', bank: 'لم كمالتك', reverse: 'اعكس لفتك', keda: 'هو كدة', annoy: 'رخم عليهم' };
    return map[type] || type;
  }

  // ================= إعلان كملها =================
  socket.on('callKamelha', (roomId) => {
    const room = rooms[roomId];
    if (!room || !room.gameStarted) return;
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    const check = verifyKamelhaHand(player.hand);
    if (!check.valid) {
      return socket.emit('errorMsg', 'كروتك لم تكتمل 4 من نفس النوع بعد!');
    }

    if (!room.kamelhaCallers.includes(player.id)) {
      room.kamelhaCallers.push(player.id);
      player.earnedPointsThisRound = check.points;
      io.to(roomId).emit('notify', `🎉 صاح (${player.name}): "كمّلهااا!" (ستنتهي الجولة عند إكمال الدورة)`);
      if (room.turnsLeftInOrbit === null) {
        room.turnsLeftInOrbit = room.players.length - 1;
      }
    }
  });

  // نقل الدور بأمان وتصفير السحبة
  function advanceTurn(room) {
    room.drawnCard = null; // تصفير السحبة تماماً
    const count = room.players.length;
    if (room.turnsLeftInOrbit !== null) {
      room.turnsLeftInOrbit--;
      if (room.turnsLeftInOrbit <= 0) {
        endRound(room);
        return;
      }
    }
    room.currentTurnIndex = (room.currentTurnIndex + room.direction + count) % count;
    sendGameState(room.id);
  }

  function endRound(room) {
    let winMessage = 'نهاية الجولة! نتائج "كمّلها":\n';
    let matchWinner = null;

    room.players.forEach(p => {
      const check = verifyKamelhaHand(p.hand);
      if (check.valid) {
        p.points += check.points;
        winMessage += `• ${p.name} جمع كروته وكسب ${check.points} نقطة! (مجموعه: ${p.points})\n`;
      }
      if (p.points >= 5) matchWinner = p;
    });

    if (matchWinner) {
      io.to(room.id).emit('gameOver', { winnerName: matchWinner.name, scores: room.players });
      room.gameStarted = false;
    } else {
      io.to(room.id).emit('roundEnded', { msg: winMessage, players: room.players });
      setTimeout(() => startNewRound(room), 6000);
    }
  }

  function sendGameState(roomId) {
    const room = rooms[roomId];
    if (!room) return;
    room.players.forEach(p => {
      io.to(p.id).emit('gameState', {
        hand: p.hand,
        topDiscard: room.discardPile[room.discardPile.length - 1],
        discardPile: room.discardPile,
        deckCount: room.deck.length,
        currentTurn: room.players[room.currentTurnIndex].id,
        currentTurnName: room.players[room.currentTurnIndex].name,
        hasDrawn: room.drawnCard !== null,
        players: room.players.map(pl => ({
          id: pl.id,
          name: pl.name,
          cardCount: pl.hand.length,
          points: pl.points
        }))
      });
    });
  }

  socket.on('disconnect', () => {
    for (const rId in rooms) {
      const room = rooms[rId];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) delete rooms[rId];
      else io.to(rId).emit('updatePlayers', room.players);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`سيرفر كملها شغال على: http://localhost:${PORT}`);
});