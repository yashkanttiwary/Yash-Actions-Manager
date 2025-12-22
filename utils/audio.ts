
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

export const playCompletionSound = () => {
    try {
        const ctx = getAudioContext();
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
