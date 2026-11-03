import { soundService } from '../services/soundService.js';

export const elements = {
  gateScreen: document.getElementById('gate-screen'),
  gatePassInput: document.getElementById('gate-pass-input'),
  btnSubmitGate: document.getElementById('btn-submit-gate'),
  
  lobbyScreen: document.getElementById('lobby-screen'),
  createRoomScreen: document.getElementById('create-room-screen'),
  joinRoomScreen: document.getElementById('join-room-screen'),
  waitingScreen: document.getElementById('waiting-screen'),
  gameScreen: document.getElementById('game-screen'),
  toastBanner: document.getElementById('toast-banner'),
  
  displayMyUid: document.getElementById('display-my-uid'),
  playerNameInput: document.getElementById('player-name'),
  roomCodeInput: document.getElementById('room-code-input'),
  displayRoomCode: document.getElementById('display-room-code'),
  gameRoomCodeTxt: document.getElementById('game-room-code-txt'),
  playersListDiv: document.getElementById('players-list'),
  playerCount: document.getElementById('player-count'),
  waitMsg: document.getElementById('wait-msg'),
  btnStart: document.getElementById('btn-start'),
  
  targetPointsInput: document.getElementById('target-points-input'),
  maxRoundsInput: document.getElementById('max-rounds-input'),
  matchRulesTag: document.getElementById('match-rules-tag'),
  deckModeSelect: document.getElementById('deck-mode-select'),
  customCommandsBox: document.getElementById('custom-commands-box'),
  
  commandSplash: document.getElementById('command-splash'),
  splashIcon: document.getElementById('splash-icon'),
  splashTitle: document.getElementById('splash-title'),
  splashPlayer: document.getElementById('splash-player'),
  
  spotTop: document.getElementById('spot-top'),
  spotLeft: document.getElementById('spot-left'),
  spotRight: document.getElementById('spot-right'),
  spotBottom: document.getElementById('spot-bottom'),
  
  myNameDisplay: document.getElementById('my-name-display'),
  myScoreDisplay: document.getElementById('my-score-display'),
  messyDiscardPile: document.getElementById('messy-discard-pile'),
  deckPile: document.getElementById('deck-pile'),
  deckCountBadge: document.getElementById('deck-count-badge'),
  
  modalOverlay: document.getElementById('modal-overlay'),
  modalContainer: document.getElementById('modal-container'),
  
  btnCallKamelha: document.getElementById('btn-call-kamelha'),
  btnInspectDiscard: document.getElementById('btn-inspect-discard'),
  btnCopyCodeWait: document.getElementById('btn-copy-code-wait'),
  btnCopyCodeGame: document.getElementById('btn-copy-code-game'),
  btnLeaveGame: document.getElementById('btn-leave-game'),
  
  timerBar: document.getElementById('timer-bar'),
  timerSec: document.getElementById('timer-sec')
};

export function showScreen(screenEl) {
  const screens = [
    elements.gateScreen,
    elements.lobbyScreen,
    elements.createRoomScreen,
    elements.joinRoomScreen,
    elements.waitingScreen,
    elements.gameScreen
  ];
  screens.forEach(s => {
    if (s) {
      if (s === screenEl) s.classList.remove('hidden');
      else s.classList.add('hidden');
    }
  });
}

export function showToast(msg) {
  if (!elements.toastBanner) return;
  elements.toastBanner.innerText = msg;
  elements.toastBanner.classList.remove('hidden');
  setTimeout(() => {
    if (elements.toastBanner) elements.toastBanner.classList.add('hidden');
  }, 4000);
}

export function openModal(html) {
  if (elements.modalContainer && elements.modalOverlay) {
    elements.modalContainer.innerHTML = html;
    elements.modalOverlay.classList.remove('hidden');
  }
}

export function closeModal() {
  if (elements.modalOverlay) {
    elements.modalOverlay.classList.add('hidden');
  }
}

window.openModal = openModal;
window.closeModal = closeModal;

export function showCommandSplash(cmdType, cmdName, playerName) {
  soundService.playCommandSound(cmdType);
  if (elements.splashIcon) elements.splashIcon.innerText = '★';
  if (elements.splashTitle) elements.splashTitle.innerText = cmdName;
  if (elements.splashPlayer) elements.splashPlayer.innerText = `${playerName} قام بتفعيل الكارت!`;

  if (elements.commandSplash) {
    elements.commandSplash.classList.remove('hidden');
    setTimeout(() => {
      elements.commandSplash.classList.add('hidden');
    }, 1600);
  }
}

export function openCardEncyclopediaModal() {
  openModal(`
    <h2 style="color:#ffcc00;margin-bottom:8px;">دليل وقواعد لعبة كمّلها</h2>
    <div class="guide-container">
      <div class="guide-section-title">شروط الفوز بالمباراة:</div>
      <p style="font-size:0.8rem;color:#ccc;line-height:1.5;">
        تجميع <b>4 كروت من نفس الرقم</b> لإعلان "كمّلتها". ويُحسم الفوز بالمباراة بإحدى طريقتين:<br>
        1. <b>الوصول لنقاط الفوز:</b> أول لاعب يصل إلى عدد النقاط المحددة للغرفة يفوز بالمباراة فوراً.<br>
        2. <b>انتهاء الجولات:</b> إذا انتهت جميع الجولات المحددة للمباراة، يفوز اللاعب صاحب أعلى مجموع نقاط!
      </p>

      <div class="guide-section-title">نظام احتساب النقاط للجولة:</div>
      <div style="font-size:0.75rem;color:#00e676;line-height:1.5;margin-top:4px;">
        • 4 كروت مطابقة بدون جوكر = <b>نقطتان</b>.<br>
        • 4 كروت مطابقة مع جوكر = <b>نقطة واحدة</b>.<br>
        • جمع 4 جواكر = <b>فوز فوري وخارق بالمباراة كاملة</b>!
      </div>

      <div class="guide-section-title">موسوعة الكوماندز وقدراتهم:</div>
      <div class="guide-cards-list">
        <div class="guide-card-item">
          <img src="/cards/mirror.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>المراية</h4>
            <p>كارت فخ في إيدك يصد أي هجوم يستهدفك (الحرامي، هو كدة، الكمين، فرملة، بدّل يا نجم، الصيد، عين حسودة، ع المكشوف، ولعانة، شقلباظ) وتلغيه أو ترده وتسحب بداله كارت! (لا تعمل لو سحبتها من الأرض).</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/thief.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>الحرامي</h4>
            <p>سرقة مضمونة للرقم المطلوب من يد الخصوم أولاً، أو من الأرض، أو من قلب كروت السحب المقلوبة! (ولو صده خصم بمراية، يكمل الحرامي طريقه لخصم تاني أو للأرض).</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/wild.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>براحتك</h4>
            <p>كارت ذكي يتحول لأي كوماند مفعّل في الماتش الحالي (بما فيها الحرامي وكل الكروت الجديدة)!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/magnet.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>المغناطيس</h4>
            <p>تختار كارت من الأرض (رقم أو جوكر) وينور حوالين كل مثيلاته فريم مضيء، وتدوس تأكيد فيشفطهم لحسابك وتختار بنفسك الكروت اللي هترميها بدالهم!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/swap.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>بدّل يا نجم</h4>
            <p>تبديل إيدك كلها (الـ 4 كروت) مع إيد أي لاعب تختاره على الترابيزة دفعة واحدة!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/fire.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>ولعانة</h4>
            <p>كل لاعب على الترابيزة مجبر يرمي كارت في الأرض ويسحب بداله كارت مقلوب، مع خيار حماية اختياري لصاحب الكارت لإبقاء يده كما هي.</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/reveal.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>ع المكشوف</h4>
            <p>تكشف الـ 4 كروت بتوع أي خصم قدام الكل على الترابيزة مباشرة بدون نوافذ وتفضح خطته لمدة لفة كاملة.</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/freeze.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>فرملة</h4>
            <p>تجميد دور أي لاعب (تخطي دور) ومنعه من قول كمّلتها نهائياً خلال اللفة دي!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/spin.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>شقلباظ</h4>
            <p>تمرير كارت من يد كل لاعب للي جنبه في اتجاه اللعب، مع خيار حماية لصاحب الكارت (وإذا تم تمرير كارت المراية فيه تفقد قوتها وتصل مكسورة).</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/ambush.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>الكمين</h4>
            <p>تفتيش عام ومصادرة لكل الجواكر من أيدي الخصوم فقط للأرض وتوزيع أرقام بدالها، مع حماية جواكر صاحب الكارت!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/curse.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>عين حسودة</h4>
            <p>حرمان لاعب محدد من أخذ أي كارت مكشوف من الأرض لمدة لفتين كاملين (يسحب مقلوب بس)!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/joker.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>جوكر</h4>
            <p>يعوض أي رقم ناقص في إيدك، وجمع 4 جواكر يحقق الفوز الفوري والمباشر!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/hunt.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>اصطاد كارتك</h4>
            <p>تطلب رقم معين أو جوكر من لاعب، لو معاه تاخده منه وتديله كارت مكانه من إيدك.</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/bank.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>لم كمالتك</h4>
            <p>تفتح كروت الأرض كلها وتختار أي كارت محتاجه ليدك وترمي كارت مكانه.</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/reverse.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>اعكس لفتك</h4>
            <p>يعكس اتجاه اللعب (أو يتخطى الخصم وتلعب دور تاني في حالة لاعبين فقط).</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/keda.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>هو كدة</h4>
            <p>تغيير كل كروت الخصم الأربعة وترميهم في الأرض وتوزعله 4 جداد من السحب!</p>
          </div>
        </div>

        <div class="guide-card-item">
          <img src="/cards/annoy.png" class="guide-card-thumb" alt="">
          <div class="guide-card-info">
            <h4>رخم عليهم</h4>
            <p>تبديل كارت عشوائي سراً بين اتنين لاعيبة، أو كشف كارت الخصم وتبديله في لاعبين.</p>
          </div>
        </div>
      </div>
    </div>
    <button class="btn primary-btn" onclick="window.closeModal()" style="margin-top:12px;">فهمت القواعد</button>
  `);
}

export function openBuyModal() {
  openModal(`
    <h2 style="color:#ffcc00;margin-bottom:6px;">شراء التذاكر / النسخة الأصلية</h2>
    <div class="buy-card-info">
      <div class="brand-badge">Wello_0</div>
      <p class="phone-number-display">01121040020</p>
    </div>
    <div style="display:flex;flex-direction:column;gap:8px;">
      <a href="https://wa.me/201121040020?text=أهلاً%20Wello_0،%20عايز%20أشتري%20تذكرة%20دخول%20للعبة%20كملها" target="_blank" class="btn whatsapp-btn">تواصل عبر واتساب</a>
      <a href="tel:01121040020" class="btn call-btn">اتصال تليفوني مباشر</a>
      <button class="btn secondary-btn" onclick="window.closeModal()">إغلاق</button>
    </div>
  `);
}

window.openCardEncyclopediaModal = openCardEncyclopediaModal;
window.openBuyModal = openBuyModal;
