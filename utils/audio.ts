
// Singleton AudioContext manager to prevent "AudioContext not allowed to start" errors
// and the 6-context limit in Chrome/Edge.

let audioCtx: AudioContext | null = null;

const getAudioContext = () => {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    // Resume context if suspended (browser policy often suspends until user interaction)
    if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(e => console.warn("Audio Context resume failed", e));
    }
    return audioCtx;
};

// Expose state checker
export const getAudioContextState = () => {
    return audioCtx ? audioCtx.state : 'closed';
};

// New Helper to explicitly resume, can be bound to document click in App.tsx if needed
export const resumeAudioContext = async () => {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
        try {
            await ctx.resume();
        } catch (e) {
            console.error("Failed to resume AudioContext", e);
        }
    }
};

export const playCompletionSound = () => {
    try {
        const ctx = getAudioContext();
        
        // Safety check for resume
        if(ctx.state === 'suspended') ctx.resume();

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
        
        // Envelope
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.7);
        
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.7);
    } catch (e) {
        console.error("Audio playback error:", e);
    }
};

export const playTimerSound = (type: 'focus' | 'break') => {
    try {
        const ctx = getAudioContext();
        
        // Safety check for resume
        if(ctx.state === 'suspended') ctx.resume();

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.type = 'sine';
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);

        if (type === 'focus') { 
             oscillator.frequency.setValueAtTime(880, ctx.currentTime); // A5 (End of focus)
        } else { 
             oscillator.frequency.setValueAtTime(440, ctx.currentTime); // A4 (End of break)
        }
       
        gainNode.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 1);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 1);
    } catch (e) {
        console.error("Audio playback error:", e);
    }
};

// --- GAME AUDIO SYNTHESIZER ---

// Create a reusable noise buffer (perf optimization)
let noiseBuffer: AudioBuffer | null = null;

const getNoiseBuffer = (ctx: AudioContext) => {
    if (!noiseBuffer) {
        const bufferSize = ctx.sampleRate * 2; // 2 seconds of noise
        noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
    }
    return noiseBuffer;
};

export const playRetroSound = (type: 'thrust' | 'shoot' | 'explosion' | 'score' | 'hit' | 'shield') => {
    try {
        const ctx = getAudioContext();
        const t = ctx.currentTime;
        const masterGain = ctx.createGain();
        masterGain.connect(ctx.destination);

        if (type === 'thrust') {
            // Filtered white noise for rocket rumble
            const noise = ctx.createBufferSource();
            noise.buffer = getNoiseBuffer(ctx);
            const filter = ctx.createBiquadFilter();
            
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(200, t);
            filter.frequency.linearRampToValueAtTime(100, t + 0.1);
            
            masterGain.gain.setValueAtTime(0.1, t);
            masterGain.gain.linearRampToValueAtTime(0, t + 0.1); // Short burst per frame

            noise.connect(filter);
            filter.connect(masterGain);
            noise.start(t);
            noise.stop(t + 0.1);

        } else if (type === 'shoot') {
            // Square wave frequency sweep
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.setValueAtTime(800, t);
            osc.frequency.exponentialRampToValueAtTime(200, t + 0.15);
            
            masterGain.gain.setValueAtTime(0.05, t);
            masterGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
            
            osc.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.15);

        } else if (type === 'explosion') {
            // Heavy noise with decay
            const noise = ctx.createBufferSource();
            noise.buffer = getNoiseBuffer(ctx);
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            
            filter.frequency.setValueAtTime(1000, t);
            filter.frequency.exponentialRampToValueAtTime(100, t + 0.4);
            
            masterGain.gain.setValueAtTime(0.2, t);
            masterGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
            
            noise.connect(filter);
            filter.connect(masterGain);
            noise.start(t);
            noise.stop(t + 0.4);

        } else if (type === 'score') {
            // High ping (coin sound)
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            
            // Double beep effect
            osc.frequency.setValueAtTime(1200, t);
            osc.frequency.setValueAtTime(1800, t + 0.05);
            
            masterGain.gain.setValueAtTime(0.05, t);
            masterGain.gain.linearRampToValueAtTime(0, t + 0.3);
            
            osc.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.3);
        } else if (type === 'hit') {
            // Short thud for damage
            const noise = ctx.createBufferSource();
            noise.buffer = getNoiseBuffer(ctx);
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(300, t);
            
            masterGain.gain.setValueAtTime(0.1, t);
            masterGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
            
            noise.connect(filter);
            filter.connect(masterGain);
            noise.start(t);
            noise.stop(t + 0.1);
        } else if (type === 'shield') {
            // Rising tone for healing/buff
            const osc = ctx.createOscillator();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(220, t);
            osc.frequency.linearRampToValueAtTime(440, t + 0.3);
            
            masterGain.gain.setValueAtTime(0.05, t);
            masterGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
            
            osc.connect(masterGain);
            osc.start(t);
            osc.stop(t + 0.3);
        }

    } catch (e) {
        // Silent fail for game audio
    }
};

// --- BROWN NOISE GENERATOR ---
export class BrownNoiseGenerator {
    private ctx: AudioContext;
    private node: ScriptProcessorNode | null = null;
    private gainNode: GainNode | null = null;
    private isPlaying: boolean = false;

    constructor() {
        this.ctx = getAudioContext();
    }

    play(volume: number = 0.5) {
        if (this.isPlaying) {
            if (this.gainNode) this.gainNode.gain.value = volume;
            return;
        }

        try {
            // Resume context if browser suspended it (autoplay policy)
            if (this.ctx.state === 'suspended') {
                this.ctx.resume();
            }

            const bufferSize = 4096;
            this.node = this.ctx.createScriptProcessor(bufferSize, 1, 1);
            this.gainNode = this.ctx.createGain();
            
            this.gainNode.gain.value = volume;
            
            let lastOut = 0;
            this.node.onaudioprocess = (e) => {
                const output = e.outputBuffer.getChannelData(0);
                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    // Integrate white noise to get brown noise
                    // Standard Brown noise formula: output[i] = (lastOut + (0.02 * white)) / 1.02;
                    // Adjusted for smoother rolloff
                    output[i] = (lastOut + (0.02 * white)) / 1.02;
                    lastOut = output[i];
                    // Normalize to prevent clipping (roughly)
                    output[i] *= 3.5; 
                }
            };

            this.node.connect(this.gainNode);
            this.gainNode.connect(this.ctx.destination);
            this.isPlaying = true;
        } catch (e) {
            console.error("Brown Noise Generator Error:", e);
        }
    }

    stop() {
        if (this.node && this.gainNode) {
            this.node.disconnect();
            this.gainNode.disconnect();
            this.node = null;
            this.gainNode = null;
            this.isPlaying = false;
        }
    }

    setVolume(volume: number) {
        if (this.gainNode) {
            this.gainNode.gain.setValueAtTime(volume, this.ctx.currentTime);
        }
    }
}
