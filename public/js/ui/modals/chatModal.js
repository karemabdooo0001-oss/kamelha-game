import { socket, playerState } from '../../services/socketService.js';
import { soundService } from '../../services/soundService.js';
import { openModal, closeModal } from '../screenManager.js';

export const quickPhrases = [
  'مش شايف فيها حد',
  'كفاية صياح',
  'حاسب كدة حاسب كدة',
  'ماشيه معاك ايه',
  'في ايه يا يجماااعة',
  'وسع وسع',
  'ايه الهبد ده'
];

let chatMessages = [];

export function addChatMessage(msg) {
  chatMessages.push(msg);
  if (chatMessages.length > 50) chatMessages.shift();
  
  // تشغيل الصوت المناسب
  if (msg.isShout) {
    soundService.play('massage', 0.9);
  } else {
    soundService.play('chat', 0.8);
  }

  // إظهار فقاعة كلامية عائمة فوق مقعد اللاعب
  showSpeechBubble(msg.senderId, msg.senderName, msg.text, msg.isShout);
}

export function openChatModal() {
  let html = `
    <h2 style="color:#e8c99b;margin-bottom:8px;">شات وصيحات كمّلها</h2>
    
    <!-- حقل الصيحة المخصصة -->
    <div style="display:flex;gap:6px;margin-bottom:12px;">
      <input type="text" id="chat-custom-input" placeholder="اكتب صيحة سريعة..." maxlength="60" 
             style="flex:1;background:rgba(10,4,18,0.85);color:#fff;border:1px solid #c59b57;border-radius:10px;padding:8px 12px;font-size:0.9rem;">
      <button id="btn-send-custom-shout" class="btn primary-btn" style="padding:8px 16px;font-size:0.9rem;white-space:nowrap;">صيحة 📢</button>
    </div>

    <!-- شبكة العبارات السريعة -->
    <h4 style="color:#c4b2d9;font-size:0.8rem;text-align:right;margin-bottom:6px;">عبارات سريعة كلاسيكية:</h4>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:180px;overflow-y:auto;margin-bottom:12px;">
  `;

  quickPhrases.forEach(phrase => {
    html += `
      <button class="btn quick-phrase-btn" data-phrase="${phrase}" 
              style="background:rgba(28,12,46,0.85);border:1px solid rgba(212,175,55,0.4);color:#f5ebd9;padding:8px;font-size:0.8rem;border-radius:10px;cursor:pointer;transition:all 0.2s;">
        ${phrase}
      </button>
    `;
  });

  html += `
    </div>

    <!-- سجل الرسائل الأخيرة -->
    <h4 style="color:#c4b2d9;font-size:0.8rem;text-align:right;margin-bottom:4px;">سجل الشات:</h4>
    <div id="modal-chat-history" style="background:rgba(10,4,18,0.85);border:1px solid rgba(212,175,55,0.3);border-radius:10px;padding:8px;max-height:110px;overflow-y:auto;text-align:right;font-size:0.8rem;margin-bottom:10px;">
  `;

  if (chatMessages.length === 0) {
    html += `<div style="color:#777;text-align:center;">لا توجد رسائل حتى الآن</div>`;
  } else {
    chatMessages.forEach(m => {
      const isMe = m.senderId === socket.id;
      const color = isMe ? '#00e676' : '#e8c99b';
      html += `
        <div style="margin-bottom:4px;">
          <b style="color:${color};">${m.senderName}:</b> 
          <span style="color:#fff;">${m.text}</span>
          <span style="color:#666;font-size:0.7rem;margin-right:4px;">${m.time}</span>
        </div>
      `;
    });
  }

  html += `
    </div>
    <button class="btn secondary-btn" onclick="window.closeModal()">إغلاق</button>
  `;

  openModal(html);

  // إرسال صيحة مخصصة
  const customInput = document.getElementById('chat-custom-input');
  const sendBtn = document.getElementById('btn-send-custom-shout');
  const doSend = () => {
    const text = customInput.value.trim();
    if (!text) return;
    socket.emit('sendChatMessage', { roomId: playerState.currentRoomId, text, isShout: true });
    closeModal();
  };

  if (sendBtn) sendBtn.onclick = doSend;
  if (customInput) {
    customInput.onkeydown = (e) => {
      if (e.key === 'Enter') doSend();
    };
  }

  // إرسال عبارة سريعة
  document.querySelectorAll('.quick-phrase-btn').forEach(btn => {
    btn.onclick = () => {
      const phrase = btn.getAttribute('data-phrase');
      socket.emit('sendChatMessage', { roomId: playerState.currentRoomId, text: phrase, isShout: true });
      closeModal();
    };
  });
}

// عرض فقاعة كلامية عائمة فوق مقعد اللاعب
export function showSpeechBubble(senderId, senderName, text, isShout) {
  let targetSeatEl = null;

  if (senderId === socket.id) {
    targetSeatEl = document.getElementById('spot-bottom');
  } else {
    const seats = [
      document.getElementById('spot-top'),
      document.getElementById('spot-left'),
      document.getElementById('spot-right')
    ];
    for (const s of seats) {
      if (s && !s.classList.contains('hidden')) {
        const nameEl = s.querySelector('.seat-name');
        if (nameEl && nameEl.innerText.includes(senderName)) {
          targetSeatEl = s;
          break;
        }
      }
    }
  }

  if (!targetSeatEl) {
    // لو لم نجد مقعداً (مثلاً في شاشة الانتظار)، نظهرها كـ Toast ذهبي
    const banner = document.getElementById('toast-banner');
    if (banner) {
      banner.innerHTML = `💬 <b>${senderName}</b>: ${text}`;
      banner.classList.remove('hidden');
      setTimeout(() => banner.classList.add('hidden'), 3500);
    }
    return;
  }

  // إزالة أي فقاعة سابقة فوق هذا المقعد
  const existingBubble = targetSeatEl.querySelector('.player-speech-bubble');
  if (existingBubble) existingBubble.remove();

  const bubble = document.createElement('div');
  bubble.className = 'player-speech-bubble' + (isShout ? ' is-shout' : '');
  bubble.innerHTML = `
    <span class="bubble-sender">${senderName}</span>
    <span class="bubble-text">${text}</span>
  `;

  targetSeatEl.appendChild(bubble);

  setTimeout(() => {
    bubble.classList.add('fade-out');
    setTimeout(() => bubble.remove(), 400);
  }, 3500);
}
