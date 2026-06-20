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
        if (!soundEnabled) {
            this.stopBGM();
        } else if (this.bgmTheme) {
            this.startBGM(this.bgmTheme);
        }
        return soundEnabled;
    },

    setEnabled(enabled) {
        soundEnabled = enabled;
        if (!soundEnabled) {
            this.stopBGM();
        } else if (this.bgmTheme) {
            this.startBGM(this.bgmTheme);
        }
    },

    isEnabled() {
        return soundEnabled;
    },

    // ==========================================================================
    // 讀秒倒數嗶聲 (v2.0.0)
    // ==========================================================================
    playCountdownBeep(seconds) {
        if (!soundEnabled) return;
        try {
            initAudio();
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            
            osc.type = 'sine';
            const freq = seconds <= 3 ? 1000 : 800; // 最後 3 秒頻率更尖銳
            osc.frequency.setValueAtTime(freq, now);
            
            gain.gain.setValueAtTime(0.08, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            
            osc.start(now);
            osc.stop(now + 0.06);
        } catch (e) {
            console.warn("Failed to play countdown beep", e);
        }
    },

    // ==========================================================================
    // Web Audio API 背景氛圍音樂合成器 (v2.0.0)
    // ==========================================================================
    bgmNode: null,
    bgmSources: [],
    bgmTheme: null,
    bgmWaterTimeout: null,

    startBGM(theme) {
        this.bgmTheme = theme;
        if (!soundEnabled) return;
        this.stopBGM();
        
        try {
            initAudio();
            const now = audioCtx.currentTime;
            
            if (theme === 'neon') {
                // Synthwave Pad: 低通鋸齒波 + 慢速 LFO 頻率調變
                const freqs = [65.41, 98.00, 130.81]; // C2, G2, C3
                const sources = [];
                
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(250, now);
                filter.Q.setValueAtTime(1, now);
                
                const lfo = audioCtx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.setValueAtTime(0.15, now); // 慢速調變
                
                const lfoGain = audioCtx.createGain();
                lfoGain.gain.setValueAtTime(70, now);
                
                lfo.connect(lfoGain);
                lfoGain.connect(filter.frequency);
                lfo.start(now);
                sources.push(lfo);

                const masterGain = audioCtx.createGain();
                masterGain.gain.setValueAtTime(0.035, now); // 輕柔

                freqs.forEach(freq => {
                    const osc = audioCtx.createOscillator();
                    osc.type = 'sawtooth';
                    osc.frequency.setValueAtTime(freq, now);
                    osc.detune.setValueAtTime((Math.random() - 0.5) * 8, now);
                    
                    osc.connect(filter);
                    osc.start(now);
                    sources.push(osc);
                });

                filter.connect(masterGain);
                masterGain.connect(audioCtx.destination);
                
                this.bgmSources = sources;
                this.bgmNode = masterGain;

            } else if (theme === 'wood') {
                // 竹林風聲與空靈水滴聲
                const bufferSize = audioCtx.sampleRate * 2;
                const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    output[i] = Math.random() * 2 - 1;
                }
                
                const whiteNoise = audioCtx.createBufferSource();
                whiteNoise.buffer = noiseBuffer;
                whiteNoise.loop = true;
                
                const filter = audioCtx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.setValueAtTime(450, now);
                filter.Q.setValueAtTime(1.5, now);
                
                const lfo = audioCtx.createOscillator();
                lfo.type = 'sine';
                lfo.frequency.setValueAtTime(0.08, now);
                
                const lfoGain = audioCtx.createGain();
                lfoGain.gain.setValueAtTime(200, now);
                
                lfo.connect(lfoGain);
                lfoGain.connect(filter.frequency);
                
                const masterGain = audioCtx.createGain();
                masterGain.gain.setValueAtTime(0.015, now); // 風聲極小

                whiteNoise.connect(filter);
                filter.connect(masterGain);
                masterGain.connect(audioCtx.destination);
                
                whiteNoise.start(now);
                lfo.start(now);
                
                this.bgmSources = [whiteNoise, lfo];
                
                // 禪意水滴
                const playWaterDrop = () => {
                    if (!soundEnabled || this.bgmTheme !== 'wood') return;
                    try {
                        const dNow = audioCtx.currentTime;
                        const osc = audioCtx.createOscillator();
                        const gain = audioCtx.createGain();
                        
                        osc.type = 'sine';
                        const dropFreq = 1000 + Math.random() * 600;
                        osc.frequency.setValueAtTime(dropFreq, dNow);
                        osc.frequency.exponentialRampToValueAtTime(dropFreq * 1.4, dNow + 0.06);
                        
                        gain.gain.setValueAtTime(0.012, dNow);
                        gain.gain.exponentialRampToValueAtTime(0.001, dNow + 0.08);
                        
                        osc.connect(gain);
                        gain.connect(audioCtx.destination);
                        osc.start(dNow);
                        osc.stop(dNow + 0.1);
                    } catch(e) {}
                    
                    const nextTime = 3000 + Math.random() * 5000;
                    this.bgmWaterTimeout = setTimeout(playWaterDrop, nextTime);
                };
                playWaterDrop();
                
                this.bgmNode = masterGain;

            } else if (theme === 'slate') {
                // 雅緻板岩：慢包絡呼吸正弦波和聲
                const freqs = [130.81, 164.81, 196.00, 246.94]; // C3, E3, G3, B3
                const sources = [];
                
                const masterGain = audioCtx.createGain();
                masterGain.gain.setValueAtTime(0.025, now);

                freqs.forEach(freq => {
                    const osc = audioCtx.createOscillator();
                    const gain = audioCtx.createGain();
                    
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(freq, now);
                    
                    const cycle = 6 + Math.random() * 8;
                    const lfo = audioCtx.createOscillator();
                    lfo.type = 'sine';
                    lfo.frequency.setValueAtTime(1 / cycle, now);
                    
                    const lfoGain = audioCtx.createGain();
                    lfoGain.gain.setValueAtTime(0.35, now);
                    
                    const offsetGain = audioCtx.createGain();
                    offsetGain.gain.setValueAtTime(0.45, now);
                    
                    lfo.connect(lfoGain);
                    lfoGain.connect(gain.gain);
                    offsetGain.connect(gain.gain);
                    
                    osc.connect(gain);
                    gain.connect(masterGain);
                    
                    osc.start(now);
                    lfo.start(now);
                    
                    sources.push(osc);
                    sources.push(lfo);
                });
                
                masterGain.connect(audioCtx.destination);
                this.bgmSources = sources;
                this.bgmNode = masterGain;
            }
        } catch (e) {
            console.warn("Failed to start BGM", e);
        }
    },

    stopBGM() {
        if (this.bgmWaterTimeout) {
            clearTimeout(this.bgmWaterTimeout);
            this.bgmWaterTimeout = null;
        }
        if (this.bgmSources && this.bgmSources.length > 0) {
            this.bgmSources.forEach(src => {
                try {
                    src.stop();
                } catch(e) {}
            });
            this.bgmSources = [];
        }
        if (this.bgmNode) {
            try {
                this.bgmNode.disconnect();
            } catch(e) {}
            this.bgmNode = null;
        }
    }
};

