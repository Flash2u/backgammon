let audioCtx = null;
let soundEnabled = true;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

export const audio = {
    init: initAudio,
    
    playStone() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;

            // 1. 落子敲擊聲 (高頻瞬態 click)
            const clickOsc = audioCtx.createOscillator();
            const clickGain = audioCtx.createGain();
            clickOsc.type = 'triangle';
            clickOsc.frequency.setValueAtTime(1400, now);
            clickOsc.frequency.exponentialRampToValueAtTime(350, now + 0.012);

            clickGain.gain.setValueAtTime(0.12, now);
            clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.012);

            clickOsc.connect(clickGain);
            clickGain.connect(audioCtx.destination);

            // 2. 木盤沉悶共振 (低頻 resonance)
            const boardOsc = audioCtx.createOscillator();
            const boardGain = audioCtx.createGain();
            boardOsc.type = 'sine';
            boardOsc.frequency.setValueAtTime(300, now);
            boardOsc.frequency.exponentialRampToValueAtTime(100, now + 0.07);

            // 使用帶通濾波器使聲音更具木頭感
            const filter = audioCtx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(220, now);
            filter.Q.setValueAtTime(1.8, now);

            boardGain.gain.setValueAtTime(0.35, now);
            boardGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

            boardOsc.connect(filter);
            filter.connect(boardGain);
            boardGain.connect(audioCtx.destination);

            clickOsc.start(now);
            clickOsc.stop(now + 0.02);

            boardOsc.start(now);
            boardOsc.stop(now + 0.09);
        } catch (e) {
            console.warn("Failed to synthesize move sound", e);
        }
    },

    playWin() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;
            // C 大調五聲音階 (C4, D4, E4, G4, A4, C5)
            const freqs = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];
            
            freqs.forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + idx * 0.07);
                
                // 漸強後漸弱
                gain.gain.setValueAtTime(0, now + idx * 0.07);
                gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.07 + 0.03);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.45);
                
                // 簡單低通濾波，溫和舒適
                const lp = audioCtx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.setValueAtTime(1200, now);
                
                osc.connect(lp);
                lp.connect(gain);
                gain.connect(audioCtx.destination);
                
                osc.start(now + idx * 0.07);
                osc.stop(now + idx * 0.07 + 0.5);
            });
        } catch (e) {
            console.warn("Failed to play win sound", e);
        }
    },

    playUndo() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(280, now);
            osc.frequency.linearRampToValueAtTime(160, now + 0.12);

            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.15);
        } catch (e) {
            console.warn("Failed to play undo sound", e);
        }
    },

    playWarning() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(100, now + 0.15);

            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

            const filter = audioCtx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(300, now);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.16);
        } catch (e) {
            console.warn("Failed to play warning sound", e);
        }
    },

    playLose() {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;
            // 失敗音效：低沉的向下半音階 (G3, F#3, F3, E3)
            const freqs = [196.00, 185.00, 174.61, 164.81];

            freqs.forEach((freq, idx) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'sawtooth'; // 稍微粗糙一點的鋸齒波，表現失落感
                osc.frequency.setValueAtTime(freq, now + idx * 0.15);

                gain.gain.setValueAtTime(0, now + idx * 0.15);
                gain.gain.linearRampToValueAtTime(0.12, now + idx * 0.15 + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.6);

                const lp = audioCtx.createBiquadFilter();
                lp.type = 'lowpass';
                lp.frequency.setValueAtTime(600, now); // 低通濾波，使聲音沉悶

                osc.connect(lp);
                lp.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start(now + idx * 0.15);
                osc.stop(now + idx * 0.15 + 0.7);
            });
        } catch (e) {
            console.warn("Failed to play lose sound", e);
        }
    },


    toggleSound() {
        soundEnabled = !soundEnabled;
        return soundEnabled;
    },

    setEnabled(enabled) {
        soundEnabled = enabled;
    },

    isEnabled() {
        return soundEnabled;
    }
};
