import { socket, playerState } from '../../services/socketService.js';
import { soundService } from '../../services/soundService.js';
import { openModal, closeModal, showToast } from '../screenManager.js';
import { createCardHTML } from '../tableRenderer.js';

export function showMirrorPrompt({ attackerName, cmdType, cmdName }) {
  soundService.playCommandSound('mirror');
  openModal(`
    <h2 style="color:#00e5ff;">كارت المراية في إيدك!</h2>
    <p>اللاعب <b>${attackerName}</b> استخدم عليك كارت: <b style="color:#ffcc00;">${cmdName}</b>!</p>
    <p style="font-size:0.85rem;color:#ccc;margin:8px 0;">ماذا تريد أن تفعل؟</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button id="btn-mirror-reflect" class="btn primary-btn">ردّ الكوماند في صدره</button>
      <button id="btn-mirror-cancel" class="btn secondary-btn">إلغاء الكوماند فقط</button>
      <button id="btn-mirror-ignore" class="btn info-btn" style="background:rgba(255,255,255,0.1);color:#fff;">تجاهل واحتفظ بالمراية</button>
    </div>
  `);

  document.getElementById('btn-mirror-reflect').onclick = () => {
    closeModal();
    socket.emit('resolveMirrorResponse', { roomId: playerState.currentRoomId, action: 'reflect' });
  };
  document.getElementById('btn-mirror-cancel').onclick = () => {
    closeModal();
    socket.emit('resolveMirrorResponse', { roomId: playerState.currentRoomId, action: 'cancel' });
  };
  document.getElementById('btn-mirror-ignore').onclick = () => {
    closeModal();
    socket.emit('resolveMirrorResponse', { roomId: playerState.currentRoomId, action: 'ignore' });
  };
}

export function showTieVotePrompt({ contenders, points }) {
  soundService.play('tick');
  openModal(`
    <h2 style="color:#ffcc00;margin-bottom:8px;">تعادل في صدارة المباراة!</h2>
    <p style="font-size:0.95rem;color:#fff;margin-bottom:6px;">المتعادلون برصيد (<b>${points}</b> نقطة):</p>
    <p style="color:#00e5ff;font-weight:900;font-size:1.1rem;margin-bottom:12px;">${contenders.join(' و ')}</p>
    <p style="font-size:0.82rem;color:#ccc;margin-bottom:10px;">صوّت الآن خلال 20 ثانية لتحديد مصير المباراة:</p>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <button id="btn-vote-play" class="btn primary-btn">لعب جولة أخرى فاصلة</button>
      <button id="btn-vote-draw" class="btn secondary-btn">إنهاء المباراة بالتعادل</button>
    </div>
    <div id="tie-voters-box" style="margin-top:14px;background:rgba(0,0,0,0.4);padding:8px;border-radius:10px;text-align:right;font-size:0.75rem;max-height:90px;overflow-y:auto;">
      <span style="color:#aaa;">أصوات اللاعبين الحالية:</span>
      <ul id="tie-voters-list" style="list-style:none;margin-top:4px;color:#eee;"></ul>
    </div>
  `);

  document.getElementById('btn-vote-play').onclick = () => {
    document.getElementById('btn-vote-play').disabled = true;
    document.getElementById('btn-vote-draw').disabled = true;
    showToast('تم تسجيل تصويتك مع (لعب جولة فاصلة)');
    socket.emit('submitTieVote', { roomId: playerState.currentRoomId, vote: 'play' });
  };

  document.getElementById('btn-vote-draw').onclick = () => {
    document.getElementById('btn-vote-play').disabled = true;
    document.getElementById('btn-vote-draw').disabled = true;
    showToast('تم تسجيل تصويتك مع (إنهاء بالتعادل)');
    socket.emit('submitTieVote', { roomId: playerState.currentRoomId, vote: 'draw' });
  };
}

export function updateTieVotesList({ voters }) {
  const listEl = document.getElementById('tie-voters-list');
  if (listEl && Array.isArray(voters)) {
    listEl.innerHTML = '';
    voters.forEach(v => {
      const li = document.createElement('li');
      const voteTxt = v.vote === 'play' ? 'لعب جولة فاصلة' : 'إنهاء بالتعادل';
      const color = v.vote === 'play' ? '#00e676' : '#ffcc00';
      li.innerHTML = `• ${v.name}: <b style="color:${color};">${voteTxt}</b>`;
      listEl.appendChild(li);
    });
  }
}

export function showRoundEndedModal({ msg, revealedHands }) {
  soundService.playKamelha();

  let html = `<h2>نهاية الجولة!</h2>`;
  html += `<p style="white-space:pre-line;font-weight:bold;color:#ffcc00;">${msg}</p>`;
  html += `<h3>كروت اللاعبين في هذه الجولة:</h3><div class="revealed-container">`;

  revealedHands.forEach(p => {
    html += `
      <div class="revealed-player-row">
        <span class="rev-name">${p.isHost ? '★ ' : ''}${p.name} (${p.points} نقطة):</span>
        <div class="rev-cards">${p.hand.map(c => createCardHTML(c)).join('')}</div>
      </div>
    `;
  });
  html += `</div><p style="font-size:0.85rem;color:#aaa;">جاري مراجعة النتائج وحسم الموقف...</p>`;
  openModal(html);
  setTimeout(() => closeModal(), 6500);
}

export function showGameOverModal({ winnerName, scores, revealedHands, awards, reason }) {
  soundService.playWin();

  let html = `
    <h1 style="color:#ffcc00;font-size:2.2rem;">مبروووك!</h1>
    <h2>الفائز بالمباراة: ${winnerName}</h2>
    <p style="color:#00e676;font-weight:bold;margin:8px 0;">${reason || 'فاز بالمباراة!'}</p>
  `;

  // عرض الألقاب الشرفية كما في فلاتر
  if (awards && Array.isArray(awards) && awards.length > 0) {
    html += `
      <div style="background:rgba(255,204,0,0.1);border:1px solid #ffcc00;border-radius:12px;padding:10px;margin:10px 0;">
        <h4 style="color:#ffcc00;margin-bottom:6px;font-size:0.95rem;">👑 الألقاب الشرفية للمباراة:</h4>
        <div style="display:flex;flex-direction:column;gap:4px;text-align:right;font-size:0.85rem;">
    `;
    awards.forEach(a => {
      html += `
        <div>
          <b style="color:#00e5ff;">${a.title}</b>: <span style="color:#fff;">${a.holder}</span> 
          <span style="color:#aaa;font-size:0.75rem;">(${a.desc})</span>
        </div>
      `;
    });
    html += `</div></div>`;
  }

  if (revealedHands) {
    html += `<h3>كروت النهاية:</h3><div class="revealed-container">`;
    revealedHands.forEach(p => {
      html += `
        <div class="revealed-player-row">
          <span class="rev-name">${p.isHost ? '★ ' : ''}${p.name}:</span>
          <div class="rev-cards">${p.hand.map(c => createCardHTML(c)).join('')}</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  html += `
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:15px;">
      <button id="btn-rematch" class="btn primary-btn">العودة لغرفة الانتظار للعب مجدداً</button>
      <button id="btn-leave-to-lobby" class="btn secondary-btn">خروج للوبي الرئيسي</button>
    </div>
  `;
  openModal(html);

  const btnRematch = document.getElementById('btn-rematch');
  if (btnRematch) {
    btnRematch.onclick = () => {
      closeModal();
      socket.emit('returnToWaitingIndividual', playerState.currentRoomId);
    };
  }

  const btnLeave = document.getElementById('btn-leave-to-lobby');
  if (btnLeave) {
    btnLeave.onclick = () => {
      if (playerState.currentRoomId) socket.emit('leaveRoom', playerState.currentRoomId);
      localStorage.removeItem('kamelha_room');
      location.reload();
    };
  }
}
