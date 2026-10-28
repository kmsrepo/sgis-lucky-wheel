/**
 * Web Audio API 기반 오프라인 사운드 엔진
 * 외부 오디오 파일이나 인터넷 연결 없이 순수 신디사이징으로 소리를 생성합니다.
 */
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        this.lastTickTime = 0;
    }

    init() {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                this.ctx = new AudioCtx();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    setMuted(muted) {
        this.isMuted = muted;
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        return this.isMuted;
    }

    /**
     * 룰렛이 돌면서 핀(포인터)을 칠 때 나는 틱틱 소리
     */
    playTick() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // 오디오 스레드 과부하 및 음 왜곡 방지 (최소 0.045초 간격 제어)
        if (now - this.lastTickTime < 0.042) return;
        this.lastTickTime = now;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            // 정밀 햅틱 클릭 사운드 (Material Mechanical Pin Click)
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(750 + Math.random() * 80, now);
            osc.frequency.exponentialRampToValueAtTime(140, now + 0.035);

            gain.gain.setValueAtTime(0.22, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.035);
        } catch (e) {
            console.error('Audio playTick error:', e);
        }
    }

    /**
     * 회전 시작 사운드 (스핀 스타트)
     */
    playSpinStart() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, now);
            osc.frequency.exponentialRampToValueAtTime(660, now + 0.25);

            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.25);
        } catch (e) {
            console.error(e);
        }
    }

    /**
     * 당첨 축하 팡파레 사운드
     */
    playWinFanfare() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        // 도-미-솔-도 화음 및 밝은 차임
        const notes = [
            { freq: 523.25, time: 0.00, dur: 0.15 }, // C5
            { freq: 659.25, time: 0.12, dur: 0.15 }, // E5
            { freq: 783.99, time: 0.24, dur: 0.20 }, // G5
            { freq: 1046.50, time: 0.40, dur: 0.70 }, // C6 (길게)
            { freq: 1318.51, time: 0.45, dur: 0.65 }  // E6 (풍성한 화음)
        ];

        try {
            notes.forEach(n => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = 'triangle';
                osc.frequency.setValueAtTime(n.freq, now + n.time);

                gain.gain.setValueAtTime(0.25, now + n.time);
                gain.gain.exponentialRampToValueAtTime(0.001, now + n.time + n.dur);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start(now + n.time);
                osc.stop(now + n.time + n.dur);
            });
        } catch (e) {
            console.error('Audio playWinFanfare error:', e);
        }
    }

    /**
     * 버튼 클릭 등의 가벼운 UI 효과음
     */
    playClick() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start(now);
            osc.stop(now + 0.05);
        } catch (e) {}
    }

    /**
     * QR 코드 인식 성공 비프 사운드
     */
    playSuccessBeep() {
        if (this.isMuted) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        try {
            // 경쾌한 2단계 성공 비프 (도-솔)
            const osc1 = this.ctx.createOscillator();
            const gain1 = this.ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(523.25, now); // C5
            gain1.gain.setValueAtTime(0.2, now);
            gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
            osc1.connect(gain1);
            gain1.connect(this.ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.08);

            const osc2 = this.ctx.createOscillator();
            const gain2 = this.ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(783.99, now + 0.09); // G5
            gain2.gain.setValueAtTime(0.25, now + 0.09);
            gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.22);
            osc2.connect(gain2);
            gain2.connect(this.ctx.destination);
            osc2.start(now + 0.09);
            osc2.stop(now + 0.22);
        } catch (e) {}
    }
}

window.soundEngine = new SoundEngine();
