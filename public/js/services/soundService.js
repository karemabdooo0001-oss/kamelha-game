// خدمة المؤثرات الصوتية الاحترافية للعبة كمّلها
class SoundService {
  constructor() {
    this.muted = localStorage.getItem('kamelha_muted') === 'true';
    this.cache = new Map();
    this.soundNames = [
      'ambush', 'annoy', 'bank', 'cancel', 'chat', 'curse', 'draw',
      'fire', 'freeze', 'hunt_aim', 'hunt_hit', 'hunt_miss', 'joker',
      'kamelha', 'keda', 'lose', 'magnet', 'massage', 'mirror', 'place',
      'reveal', 'reverse', 'shuffle', 'spin', 'swap', 'thief', 'tick',
      'wild', 'win'
    ];
    this.tickInterval = null;
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem('kamelha_muted', this.muted);
    this.updateSoundIcons();
    return this.muted;
  }

  isMuted() {
    return this.muted;
  }

  updateSoundIcons() {
    const soundBtns = [
      document.getElementById('btn-sound-lobby'),
      document.getElementById('btn-sound-game')
    ];
    soundBtns.forEach(btn => {
      if (btn) {
        btn.innerText = this.muted ? '🔇 مكتوم' : '🔊 صوت';
        btn.style.opacity = this.muted ? '0.6' : '1';
      }
    });
  }

  play(name, volume = 0.8) {
    if (this.muted) return;
    try {
      const audio = new Audio(`/sounds/${name}.mp3`);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => {
        // Safe catch for autoplay restrictions before first user gesture
      });
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  playDraw() { this.play('draw'); }
  playPlace() { this.play('place'); }
  playShuffle() { this.play('shuffle'); }
  playTick() { this.play('tick', 0.4); }
  playKamelha() { this.play('kamelha', 1.0); }
  playWin() { this.play('win', 1.0); }
  playLose() { this.play('lose', 1.0); }

  playCommandSound(cmdType) {
    if (this.soundNames.includes(cmdType)) {
      this.play(cmdType);
    } else {
      this.play('draw');
    }
  }
}

export const soundService = new SoundService();
