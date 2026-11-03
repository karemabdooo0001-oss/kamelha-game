const MASTER_KEY = "7788";
const DEFAULT_GAME_PASSCODE = "1234";
const DEFAULT_TURN_TIME = 15;

// بيانات وأعداد كل الكوماندز المعتمدة
const ALL_COMMANDS_META = {
  joker: { name: 'جوكر', defaultCount: 4 },
  hunt: { name: 'اصطاد كارتك', defaultCount: 4 },
  bank: { name: 'لم كمالتك', defaultCount: 4 },
  reverse: { name: 'اعكس لفتك', defaultCount: 4 },
  keda: { name: 'هو كدة', defaultCount: 2 },
  annoy: { name: 'رخم عليهم', defaultCount: 2 },
  wild: { name: 'براحتك', defaultCount: 2 },
  thief: { name: 'الحرامي', defaultCount: 2 },
  reveal: { name: 'ع المكشوف', defaultCount: 4 },
  swap: { name: 'بدّل يا نجم', defaultCount: 2 },
  freeze: { name: 'فرملة', defaultCount: 4 },
  spin: { name: 'شقلباظ', defaultCount: 2 },
  mirror: { name: 'المراية', defaultCount: 2 },
  ambush: { name: 'الكمين', defaultCount: 2 },
  magnet: { name: 'المغناطيس', defaultCount: 2 },
  curse: { name: 'عين حسودة', defaultCount: 4 },
  fire: { name: 'ولعانة', defaultCount: 4 }
};

module.exports = {
  MASTER_KEY,
  DEFAULT_GAME_PASSCODE,
  DEFAULT_TURN_TIME,
  ALL_COMMANDS_META
};
