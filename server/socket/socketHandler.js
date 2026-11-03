const { MASTER_KEY, DEFAULT_TURN_TIME } = require('../config');
const adminService = require('../services/adminService');
const roomService = require('../services/roomService');
const gameEngine = require('../services/gameEngineService');
const specialCommands = require('../commands/specialCommands');
const targetedCommands = require('../commands/targetedCommands');
const chaosCommands = require('../commands/chaosCommands');

function setupSocketHandler(io) {
  io.on('connection', (socket) => {
    // -------------------------------------------------------------
    // 1. هوية اللاعب والتسجيل والبوابة
    // -------------------------------------------------------------
    socket.on('registerPlayerIdentity', ({ playerId, name }) => {
      const pData = {
        playerId,
        name: name || 'لاعب',
        lastSeen: new Date().toLocaleTimeString('ar-EG'),
        isOnline: true,
        currentRoom: null,
        socketId: socket.id
      };
      adminService.registerPlayer(playerId, pData);
    });

    socket.on('verifyGatePasscode', ({ passcode, playerId }) => {
      if (adminService.isPlayerBanned(playerId)) return socket.emit('bannedKickNotification');

      const result = adminService.validateVoucher(passcode.trim(), playerId);
      if (result.valid) {
        socket.emit('gateAccessGranted', { voucherCode: passcode.trim() });
      } else {
        socket.emit('gateAccessDenied', result.msg);
      }
    });

    // -------------------------------------------------------------
    // 2. لوحة تحكم الأدمن
    // -------------------------------------------------------------
    socket.on('adminLogin', (key) => {
      if (key === MASTER_KEY) socket.emit('adminLoginSuccess', adminService.getAdminDashboardData());
      else socket.emit('adminLoginFail');
    });

    socket.on('adminRefreshData', (key) => {
      if (key === MASTER_KEY) {
        socket.emit('adminDataUpdated', adminService.getAdminDashboardData());
      }
    });

    socket.on('adminCreateVoucher', ({ masterKey, type, duration, price }) => {
      if (masterKey !== MASTER_KEY) return;
      adminService.createVoucher({ type, duration, price });
      socket.emit('adminDataUpdated', adminService.getAdminDashboardData());
    });

    socket.on('adminDeleteVoucher', ({ masterKey, code }) => {
      if (masterKey !== MASTER_KEY) return;
      adminService.deleteVoucher(code);
      socket.emit('adminDataUpdated', adminService.getAdminDashboardData());
    });

    socket.on('adminChangePasscode', ({ masterKey, newPasscode }) => {
      if (masterKey === MASTER_KEY && newPasscode) {
        adminService.setGamePasscode(newPasscode.trim());
        socket.emit('passcodeUpdated', adminService.getGamePasscode());
        io.emit('notify', 'تم تحديث كود الطوارئ العام!');
      }
    });

    socket.on('adminBanPlayer', ({ masterKey, targetPlayerId }) => {
      if (masterKey !== MASTER_KEY) return;
      adminService.banPlayer(targetPlayerId);

      const playerRecord = adminService.getPlayer(targetPlayerId);
      if (playerRecord && playerRecord.socketId) {
        io.to(playerRecord.socketId).emit('bannedKickNotification');
      }

      for (const rId in roomService.rooms) {
        const room = roomService.rooms[rId];
        const found = room.players.find(p => p.playerId === targetPlayerId);
        if (found) {
          room.players = room.players.filter(p => p.playerId !== targetPlayerId);
          if (room.players.length === 0) {
            roomService.deleteRoom(rId);
          } else {
            roomService.handleHostMigration(room, found, io);
            io.to(rId).emit('notify', `تم طرد وحظر اللاعب (${found.name}) من اللعبة!`);
            io.to(rId).emit('updatePlayers', room.players);
            roomService.checkLastManStanding(room, io);
            gameEngine.sendGameState(rId, io);
          }
        }
      }
      socket.emit('adminDataUpdated', adminService.getAdminDashboardData());
    });

    socket.on('adminUnbanPlayer', ({ masterKey, targetPlayerId }) => {
      if (masterKey !== MASTER_KEY) return;
      adminService.unbanPlayer(targetPlayerId);
      socket.emit('adminDataUpdated', adminService.getAdminDashboardData());
    });

    // -------------------------------------------------------------
    // 3. إعادة الاتصال وإنشاء / انضمام الغرف
    // -------------------------------------------------------------
    socket.on('reconnectPlayer', ({ roomId, playerId }) => {
      if (adminService.isPlayerBanned(playerId)) return socket.emit('bannedKickNotification');

      const room = roomService.getRoom(roomId);
      if (!room) return socket.emit('reconnectFailed');

      const player = room.players.find(p => p.playerId === playerId);
      if (!player) return socket.emit('reconnectFailed');

      player.id = socket.id;
      player.disconnected = false;
      socket.join(room.id);

      const reg = adminService.getPlayer(playerId);
      if (reg) {
        reg.socketId = socket.id;
        reg.currentRoom = room.id;
        reg.isOnline = true;
      }

      socket.emit('roomJoined', { roomId: room.id, players: room.players, isHost: player.isHost });
      io.to(room.id).emit('updatePlayers', room.players);
      io.to(room.id).emit('notify', `استعاد اللاعب (${player.name}) اتصاله بالجيم!`);

      if (room.gameStarted) {
        gameEngine.sendGameState(room.id, io);
      }
    });

    socket.on('createRoom', ({ playerName, playerId, targetPoints, maxRounds, deckMode, customCommands }) => {
      if (adminService.isPlayerBanned(playerId)) return socket.emit('bannedKickNotification');

      roomService.createRoom({
        socket,
        playerName,
        playerId,
        targetPoints,
        maxRounds,
        deckMode,
        customCommands
      });
    });

    socket.on('joinRoom', ({ playerName, roomId, playerId }) => {
      if (adminService.isPlayerBanned(playerId)) return socket.emit('bannedKickNotification');

      const room = roomService.getRoom(roomId);
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
        roomService.checkDrawDeckRefill(room, io);
        newPlayer.hand = room.deck.splice(0, 4);
      }

      room.players.push(newPlayer);
      socket.join(room.id);

      const reg = adminService.getPlayer(playerId);
      if (reg) {
        reg.currentRoom = room.id;
        reg.name = trimmedName;
      }

      io.to(room.id).emit('updatePlayers', room.players);
      socket.emit('roomJoined', { roomId: room.id, players: room.players, isHost: false });

      if (room.gameStarted) {
        io.to(room.id).emit('notify', `انضم (${newPlayer.name}) إلى الجيم الحالي!`);
        gameEngine.sendGameState(room.id, io);
      }
    });

    socket.on('startGame', (roomId) => {
      const room = roomService.getRoom(roomId);
      if (!room || room.players.length < 2) return socket.emit('errorMsg', 'الحد الأدنى لاعبين لبدء الجيم!');
      room.roundCount = 0;
      room.roundStarterIndex = 0;
      room.players.forEach(p => p.points = 0);
      gameEngine.startNewRound(room, io);
    });

    // -------------------------------------------------------------
    // 4. أساسيات اللعب (السحب، الإلقاء، التبديل، الوقت، كمّلها)
    // -------------------------------------------------------------
    socket.on('extendTimerForCommand', (roomId) => {
      const room = roomService.getRoom(roomId);
      if (!room || !room.gameStarted) return;
      const currPlayer = room.players[room.currentTurnIndex];
      if (currPlayer && currPlayer.id === socket.id) {
        gameEngine.startTurnTimer(room, 20, io);
        gameEngine.sendGameState(roomId, io);
      }
    });

    socket.on('drawCard', (roomId) => {
      const room = roomService.getRoom(roomId);
      if (!room || !room.gameStarted) return;
      const currPlayer = room.players[room.currentTurnIndex];
      if (currPlayer?.id !== socket.id) return socket.emit('errorMsg', 'مش دورك!');
      if (room.drawnCard) return socket.emit('errorMsg', 'أنت سحبت كارت بالفعل!');

      roomService.checkDrawDeckRefill(room, io);
      if (room.deck.length === 0) return socket.emit('errorMsg', 'الكروت خلصت تماماً!');

      room.drawnCard = room.deck.pop();
      io.to(roomId).emit('playerDrewCardAnim', { playerId: socket.id, from: 'deck' });
      socket.emit('cardDrawn', room.drawnCard);
      gameEngine.sendGameState(roomId, io);
    });

    socket.on('discardDrawnCard', (roomId) => {
      const room = roomService.getRoom(roomId);
      if (!room || !room.drawnCard) return;
      room.discardPile.push(room.drawnCard);
      gameEngine.advanceTurn(room, io);
    });

    socket.on('swapWithHand', ({ roomId, handCardIndex }) => {
      const room = roomService.getRoom(roomId);
      if (!room || !room.drawnCard) return;
      const player = room.players[room.currentTurnIndex];
      if (player?.id !== socket.id) return;

      const oldCard = player.hand.splice(handCardIndex, 1, room.drawnCard)[0];
      room.discardPile.push(oldCard);
      gameEngine.advanceTurn(room, io);
    });

    socket.on('takeDiscardCard', ({ roomId, handCardIndex }) => {
      const room = roomService.getRoom(roomId);
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
      gameEngine.advanceTurn(room, io);
    });

    socket.on('cancelCommand', (roomId) => {
      const room = roomService.getRoom(roomId);
      if (!room || !room.drawnCard) return;
      room.discardPile.push(room.drawnCard);
      io.to(roomId).emit('notify', 'تم إلغاء الكوماند ورميه في الأرض.');
      gameEngine.advanceTurn(room, io);
    });

    socket.on('callKamelha', (roomId) => {
      const room = roomService.getRoom(roomId);
      if (!room || !room.gameStarted) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      if (player.isFrozen) {
        return socket.emit('errorMsg', 'أنت متفرمل وممنوع تقول كملها في هذه اللفة!');
      }

      const check = gameEngine.verifyKamelhaHand(player.hand);
      if (!check.valid) return socket.emit('errorMsg', 'كروتك لم تكتمل 4 كروت مطابقة بعد!');

      if (check.isInstantWin) {
        player.points += 5;
        io.to(roomId).emit('notify', `جمع (${player.name}) 4 كروت جوكر وفاز بالفورة كاملة!`);
        return gameEngine.endRound(room, true, io);
      }

      if (!room.kamelhaCallers.includes(player.id)) {
        room.kamelhaCallers.push(player.id);
        player.earnedPointsThisRound = check.points;
        io.to(roomId).emit('notify', `صاح (${player.name}): "كمّلتهااا!" وتم تفعيل قفل الحصانة له!`);
        io.to(roomId).emit('soundTrigger', 'kamelha');

        if (!room.orbitPendingPlayers) {
          room.orbitPendingPlayers = new Set(
            room.players.filter(pl => pl.id !== player.id).map(pl => pl.id)
          );
        }

        gameEngine.sendGameState(roomId, io);
      }
    });

    socket.on('submitTieVote', ({ roomId, vote }) => {
      const room = roomService.getRoom(roomId);
      if (!room || !room.isTieVoting) return;

      room.tieVotes.set(socket.id, vote);

      const voterList = Array.from(room.tieVotes.entries()).map(([sId, v]) => ({
        name: room.players.find(p => p.id === sId)?.name || 'لاعب',
        vote: v
      }));
      io.to(room.id).emit('tieVoteUpdate', { voters: voterList });

      if (room.tieVotes.size === room.players.length) {
        clearTimeout(room.tieTimeout);
        gameEngine.finalizeTieVotes(room, io);
      }
    });

    socket.on('returnToWaitingIndividual', (roomId) => {
      const room = roomService.getRoom(roomId);
      if (!room) return;
      gameEngine.returnToWaitingIndividual(room, socket, io);
    });

    // -------------------------------------------------------------
    // 5. أوامر الكروت (Commands Dispatching)
    // -------------------------------------------------------------
    // المراية
    socket.on('resolveMirrorResponse', ({ roomId, action }) => {
      const room = roomService.getRoom(roomId);
      specialCommands.resolveMirrorResponse({ room, socket, action, io });
    });

    // اعكس لفتك
    socket.on('execReverse', (roomId) => {
      const room = roomService.getRoom(roomId);
      chaosCommands.execReverse({ room, socket, io });
    });

    // هو كدة
    socket.on('execKeda', ({ roomId, targetPlayerId }) => {
      const room = roomService.getRoom(roomId);
      chaosCommands.execKeda({ room, socket, targetPlayerId, io });
    });

    // لم كمالتك (البنك)
    socket.on('execBank', ({ roomId, discardIndex, handCardIndex }) => {
      const room = roomService.getRoom(roomId);
      specialCommands.execBank({ room, socket, discardIndex, handCardIndex, io });
    });

    // اصطاد كارتك
    socket.on('checkHuntTarget', ({ roomId, targetPlayerId, requestedItem }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.checkHuntTarget({ room, socket, targetPlayerId, requestedItem, io });
    });

    socket.on('confirmHuntSwap', ({ roomId, handCardIndexToGive }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.confirmHuntSwap({ room, socket, handCardIndexToGive, io });
    });

    // الحرامي
    socket.on('executeThief', ({ roomId, requestedItem }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.executeThief({ room, socket, requestedItem, io });
    });

    socket.on('confirmThiefSwap', ({ roomId, handCardIndexToGive }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.confirmThiefSwap({ room, socket, handCardIndexToGive, io });
    });

    // ع المكشوف
    socket.on('execReveal', ({ roomId, targetPlayerId }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.execReveal({ room, socket, targetPlayerId, io });
    });

    // بدّل يا نجم
    socket.on('execSwapHand', ({ roomId, targetPlayerId }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.execSwapHand({ room, socket, targetPlayerId, io });
    });

    // فرملة
    socket.on('execFreeze', ({ roomId, targetPlayerId }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.execFreeze({ room, socket, targetPlayerId, io });
    });

    // شقلباظ
    socket.on('execSpin', (roomId) => {
      const room = roomService.getRoom(roomId);
      chaosCommands.execSpin({ room, socket, io });
    });

    socket.on('resolveSpinCasterChoice', ({ roomId, participate }) => {
      const room = roomService.getRoom(roomId);
      chaosCommands.resolveSpinCasterChoice({ room, socket, participate, io });
    });

    socket.on('submitSpinCard', ({ roomId, handCardIndex }) => {
      const room = roomService.getRoom(roomId);
      chaosCommands.submitSpinCard({ room, socket, handCardIndex, io });
    });

    // الكمين
    socket.on('execAmbush', (roomId) => {
      const room = roomService.getRoom(roomId);
      specialCommands.execAmbush({ room, socket, io });
    });

    // المغناطيس
    socket.on('execMagnetPick', ({ roomId, targetType, targetValue, targetCmdType }) => {
      const room = roomService.getRoom(roomId);
      specialCommands.execMagnetPick({ room, socket, targetType, targetValue, targetCmdType, io });
    });

    socket.on('submitMagnetDiscards', ({ roomId, discardIndices }) => {
      const room = roomService.getRoom(roomId);
      specialCommands.submitMagnetDiscards({ room, socket, discardIndices, io });
    });

    // عين حسودة
    socket.on('execCurse', ({ roomId, targetPlayerId }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.execCurse({ room, socket, targetPlayerId, io });
    });

    // ولعانة
    socket.on('execFire', (roomId) => {
      const room = roomService.getRoom(roomId);
      specialCommands.execFire({ room, socket, io });
    });

    socket.on('resolveFireCasterChoice', ({ roomId, burn }) => {
      const room = roomService.getRoom(roomId);
      specialCommands.resolveFireCasterChoice({ room, socket, burn, io });
    });

    socket.on('submitFireCard', ({ roomId, handCardIndex }) => {
      const room = roomService.getRoom(roomId);
      specialCommands.submitFireCard({ room, socket, handCardIndex, io });
    });

    // رخم عليهم
    socket.on('peekAnnoy2P', (roomId) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.peekAnnoy2P({ room, socket, io });
    });

    socket.on('resolveAnnoy2P', ({ roomId, swap, handCardIndexToGive }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.resolveAnnoy2P({ room, socket, swap, handCardIndexToGive, io });
    });

    socket.on('execAnnoyMulti', ({ roomId, playerAId, playerBId }) => {
      const room = roomService.getRoom(roomId);
      targetedCommands.execAnnoyMulti({ room, socket, playerAId, playerBId, io });
    });

    // براحتك
    socket.on('execWildAs', ({ roomId, chosenCmdType }) => {
      const room = roomService.getRoom(roomId);
      chaosCommands.execWildAs({ room, socket, chosenCmdType, io });
    });

    // -------------------------------------------------------------
    // 5.ب الشات والرسائل السريعة والصيحات
    // -------------------------------------------------------------
    socket.on('sendChatMessage', ({ roomId, text, isShout }) => {
      const room = roomService.getRoom(roomId);
      if (!room) return;
      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      const cleanText = (text || '').trim().substring(0, 80);
      if (!cleanText) return;

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const msgPayload = {
        id: 'msg_' + Date.now(),
        senderId: socket.id,
        senderName: player.name,
        text: cleanText,
        isShout: !!isShout,
        time: timeStr,
        ts: Date.now()
      };

      if (!room.chatHistory) room.chatHistory = [];
      room.chatHistory.push(msgPayload);
      if (room.chatHistory.length > 50) room.chatHistory.shift();

      io.to(room.id).emit('chatMessageReceived', msgPayload);
    });

    // -------------------------------------------------------------
    // 6. مغادرة الغرفة وانقطاع الاتصال
    // -------------------------------------------------------------
    socket.on('leaveRoom', (roomId) => {
      const room = roomService.getRoom(roomId);
      if (!room) return;
      const leavingPlayer = room.players.find(p => p.id === socket.id);
      const wasHisTurn = room.gameStarted && room.players[room.currentTurnIndex]?.id === socket.id;

      room.players = room.players.filter(p => p.id !== socket.id);
      socket.leave(room.id);

      if (room.players.length === 0) {
        roomService.deleteRoom(room.id);
        return;
      }

      if (leavingPlayer) {
        roomService.handleHostMigration(room, leavingPlayer, io);
        io.to(room.id).emit('notify', `غادر اللاعب (${leavingPlayer.name}) الغرفة!`);
      }

      if (roomService.checkLastManStanding(room, io)) return;

      if (wasHisTurn) {
        gameEngine.advanceTurn(room, io);
      } else {
        io.to(room.id).emit('updatePlayers', room.players);
        if (room.gameStarted) {
          gameEngine.sendGameState(room.id, io);
        }
      }
    });

    socket.on('disconnect', () => {
      for (const rId in roomService.rooms) {
        const room = roomService.rooms[rId];
        const player = room.players.find(p => p.id === socket.id);
        if (player) {
          player.disconnected = true;
          setTimeout(() => {
            if (player.disconnected && roomService.rooms[rId]) {
              const currentRoom = roomService.rooms[rId];
              const wasHisTurn = currentRoom.gameStarted && currentRoom.players[currentRoom.currentTurnIndex]?.playerId === player.playerId;
              currentRoom.players = currentRoom.players.filter(p => p.playerId !== player.playerId);

              if (currentRoom.players.length === 0) {
                roomService.deleteRoom(rId);
              } else {
                roomService.handleHostMigration(currentRoom, player, io);
                io.to(rId).emit('updatePlayers', currentRoom.players);
                if (roomService.checkLastManStanding(currentRoom, io)) return;

                if (wasHisTurn) gameEngine.advanceTurn(currentRoom, io);
                else if (currentRoom.gameStarted) gameEngine.sendGameState(rId, io);
              }
            }
          }, 45000);
        }
      }
    });
  });
}

module.exports = setupSocketHandler;
