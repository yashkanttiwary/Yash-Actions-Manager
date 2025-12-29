
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { playTimerSound, playRetroSound } from '../utils/audio';

declare const confetti: any;

interface PomodoroSettings {
    pomodoroFocus: number;
    pomodoroShortBreak: number;
    pomodoroLongBreak: number;
}

interface PomodoroTimerProps {
    settings: PomodoroSettings;
}

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

const modeDurations = (settings: PomodoroSettings): Record<TimerMode, number> => ({
    focus: settings.pomodoroFocus,
    shortBreak: settings.pomodoroShortBreak,
    longBreak: settings.pomodoroLongBreak
});

const STORAGE_KEY = 'pomodoro_state_rpg_v1';

// --- ASSETS (Pixel Art SVGs) ---

const SlimeMonster: React.FC<{ isHit: boolean; isHealing: boolean; hpPercent: number }> = ({ isHit, isHealing, hpPercent }) => {
    // Dynamic color shifting based on HP (Purple -> Red as it gets weaker/angry)
    const bodyColor = hpPercent > 50 ? "#a5b4fc" : "#ef4444";
    const strokeColor = hpPercent > 50 ? "#4338ca" : "#7f1d1d";

    return (
        <svg viewBox="0 0 100 100" className={`w-full h-full transition-transform duration-100 ${isHit ? 'translate-x-2 translate-y-2' : ''}`}>
            <defs>
                <filter id="glow-red">
                    <feDropShadow dx="0" dy="0" stdDeviation="10" floodColor="red" />
                </filter>
                <filter id="glow-green">
                    <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#4ade80" />
                </filter>
                <filter id="boss-shadow">
                    <feDropShadow dx="0" dy="10" stdDeviation="5" floodColor="rgba(0,0,0,0.5)" />
                </filter>
            </defs>
            <g transform="translate(10, 10)" className={isHit ? 'animate-shake' : 'animate-bounce-slow'} filter="url(#boss-shadow)">
                {/* Body */}
                <path 
                    d="M 20 80 Q 5 80 10 60 Q 15 20 50 20 Q 85 20 90 60 Q 95 80 80 80 Z" 
                    fill={isHit ? "#fff" : bodyColor} 
                    stroke={strokeColor} 
                    strokeWidth="3"
                    filter={isHit ? "url(#glow-red)" : (isHealing ? "url(#glow-green)" : "")}
                    className="transition-colors duration-100"
                />
                
                {/* Face Expressions based on HP */}
                <circle cx="35" cy="45" r={hpPercent < 30 ? "7" : "5"} fill="#1e1b4b" />
                <circle cx="65" cy="45" r={hpPercent < 30 ? "3" : "5"} fill="#1e1b4b" />
                
                {isHit || hpPercent < 20 ? (
                    // Pain/Dead Mouth
                    <path d="M 35 65 Q 50 55 65 65" stroke="#1e1b4b" strokeWidth="3" fill="none" /> 
                ) : hpPercent < 50 ? (
                    // Worried Mouth
                    <path d="M 35 65 L 65 65" stroke="#1e1b4b" strokeWidth="3" fill="none" />
                ) : (
                    // Smug Smile
                    <path d="M 35 60 Q 50 75 65 60" stroke="#1e1b4b" strokeWidth="3" fill="none" /> 
                )}
                
                {/* Highlight */}
                <ellipse cx="30" cy="35" rx="5" ry="3" fill="white" opacity="0.4" />
                
                {/* Sweat drop if low HP */}
                {hpPercent < 40 && !isHit && (
                    <path d="M 15 40 Q 10 30 15 20 Q 20 30 15 40" fill="#60a5fa" className="animate-pulse" />
                )}
            </g>
            {isHealing && (
                <g className="animate-float-up">
                    <text x="20" y="20" fontSize="20" fill="#4ade80" fontWeight="bold">REGEN</text>
                </g>
            )}
        </svg>
    );
};

const Campfire: React.FC = () => (
    <svg viewBox="0 0 100 100" className="w-16 h-16">
        <g transform="translate(10, 10)">
            {/* Logs */}
            <rect x="20" y="70" width="60" height="10" fill="#78350f" transform="rotate(5, 50, 75)" />
            <rect x="20" y="70" width="60" height="10" fill="#92400e" transform="rotate(-5, 50, 75)" />
            {/* Fire */}
            <path className="animate-pulse" d="M 30 70 Q 50 10 70 70 Z" fill="#f59e0b" opacity="0.8" />
            <path className="animate-pulse" d="M 40 70 Q 50 30 60 70 Z" fill="#ef4444" opacity="0.9" style={{animationDelay: '0.2s'}} />
            {/* Smoke */}
            <circle cx="50" cy="20" r="5" fill="#aaa" opacity="0.5" className="animate-float-up" />
        </g>
    </svg>
);

// --- MAIN COMPONENT ---

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ settings }) => {
    const [mode, setMode] = useState<TimerMode>('focus');
    const [isActive, setIsActive] = useState(false);
    const [time, setTime] = useState(modeDurations(settings).focus * 60);
    const [sessionCount, setSessionCount] = useState(0);
    
    // Battle State
    const [isHit, setIsHit] = useState(false);
    const [monsterHP, setMonsterHP] = useState(100);
    const [maxHP, setMaxHP] = useState(100);
    const previousMinuteRef = useRef<number>(0);

    // Roaming Physics State
    const [position, setPosition] = useState({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const velocityRef = useRef({ vx: 2, vy: 1.5 }); // Pixels per frame
    const requestRef = useRef<number>();

    // Load State
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                const dur = modeDurations(settings)[parsed.mode as TimerMode] * 60;
                
                if (parsed.targetTime && parsed.isActive) {
                    const now = Date.now();
                    const remaining = Math.ceil((parsed.targetTime - now) / 1000);
                    if (remaining > 0) {
                        setMode(parsed.mode);
                        setIsActive(true);
                        setTime(remaining);
                        setSessionCount(parsed.sessionCount || 0);
                        setMaxHP(dur);
                    } else {
                        handleNextMode(parsed.mode, parsed.sessionCount);
                    }
                } else {
                    setMode(parsed.mode);
                    setIsActive(false);
                    setTime(parsed.savedTime || dur);
                    setSessionCount(parsed.sessionCount || 0);
                    setMaxHP(dur);
                }
            } catch (e) {
                console.error("Failed to load timer", e);
            }
        }
    }, []);

    // Save State
    const saveState = useCallback((currentMode: TimerMode, active: boolean, currentTime: number, count: number) => {
        const state = {
            mode: currentMode,
            isActive: active,
            sessionCount: count,
            targetTime: active ? Date.now() + (currentTime * 1000) : null,
            savedTime: currentTime
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, []);

    // --- PHYSICS ENGINE ---
    const updatePosition = () => {
        if (mode !== 'focus' || !isActive) return;

        setPosition(prev => {
            const size = 150 * (0.5 + (monsterHP / 200)); // Approximate size for collision
            let newX = prev.x + velocityRef.current.vx;
            let newY = prev.y + velocityRef.current.vy;

            // Bounce X
            if (newX <= 0 || newX >= window.innerWidth - size) {
                velocityRef.current.vx *= -1;
                newX = Math.max(0, Math.min(newX, window.innerWidth - size));
            }

            // Bounce Y
            if (newY <= 0 || newY >= window.innerHeight - size) {
                velocityRef.current.vy *= -1;
                newY = Math.max(0, Math.min(newY, window.innerHeight - size));
            }

            return { x: newX, y: newY };
        });

        requestRef.current = requestAnimationFrame(updatePosition);
    };

    useEffect(() => {
        if (isActive && mode === 'focus') {
            requestRef.current = requestAnimationFrame(updatePosition);
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [isActive, mode, monsterHP]); // Re-run if these change

    // Timer Logic
    useEffect(() => {
        if (!isActive) {
            setMonsterHP(Math.ceil((time / (modeDurations(settings)[mode] * 60)) * 100));
            return;
        }

        const interval = setInterval(() => {
            setTime(prev => {
                const newTime = prev - 1;
                
                // Damage Logic
                const currentMinute = Math.ceil(newTime / 60);
                if (currentMinute < previousMinuteRef.current && mode === 'focus') {
                    triggerDamage();
                }
                previousMinuteRef.current = currentMinute;

                // Sync HP
                const totalTime = modeDurations(settings)[mode] * 60;
                setMonsterHP((newTime / totalTime) * 100);

                if (newTime <= 0) {
                    clearInterval(interval);
                    handleNextMode(mode, sessionCount);
                    return 0;
                }
                saveState(mode, true, newTime, sessionCount);
                return newTime;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isActive, mode, sessionCount, settings]);

    useEffect(() => {
        const total = modeDurations(settings)[mode] * 60;
        setMaxHP(total);
        setMonsterHP((time / total) * 100);
        previousMinuteRef.current = Math.ceil(time / 60);
        
        // Reset position to center on mode change
        setPosition({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 });
        // Randomize velocity direction
        velocityRef.current = { 
            vx: (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random()), 
            vy: (Math.random() > 0.5 ? 1 : -1) * (1 + Math.random()) 
        };

    }, [mode, settings]);

    const triggerDamage = () => {
        setIsHit(true);
        playRetroSound('hit');
        // Shake velocity slightly on hit
        velocityRef.current.vx *= -1.1; 
        setTimeout(() => setIsHit(false), 400);
    };

    const handleNextMode = (currentMode: TimerMode, currentCount: number) => {
        setIsActive(false);
        playTimerSound(currentMode === 'focus' ? 'break' : 'focus');

        if (currentMode === 'focus') {
            playRetroSound('explosion');
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 150,
                    spread: 100,
                    origin: { x: position.x / window.innerWidth, y: position.y / window.innerHeight },
                    colors: ['#ef4444', '#f59e0b', '#fbbf24']
                });
            }
        }

        let nextMode: TimerMode = 'focus';
        let newCount = currentCount;

        if (currentMode === 'focus') {
            newCount++;
            nextMode = newCount % 4 === 0 ? 'longBreak' : 'shortBreak';
        }

        setMode(nextMode);
        setSessionCount(newCount);
        const newTime = modeDurations(settings)[nextMode] * 60;
        setTime(newTime);
        setMonsterHP(100);
        saveState(nextMode, false, newTime, newCount);
    };

    const toggleTimer = () => {
        const newState = !isActive;
        setIsActive(newState);
        if (!newState && mode === 'focus' && time > 0) {
            playRetroSound('shield'); // Heal sound
        }
        saveState(mode, newState, time, sessionCount);
    };

    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    // Calculated size for the monster: 
    // Starts big (1.5x) when HP is high, shrinks to 0.5x when HP is low.
    const monsterScale = 0.5 + (monsterHP / 100); 
    const baseSize = 150; // px

    return (
        <>
            <style>{`
                @keyframes shake {
                    0% { transform: translate(1px, 1px) rotate(0deg); }
                    10% { transform: translate(-1px, -2px) rotate(-1deg); }
                    20% { transform: translate(-3px, 0px) rotate(1deg); }
                    30% { transform: translate(3px, 2px) rotate(0deg); }
                    40% { transform: translate(1px, -1px) rotate(1deg); }
                    50% { transform: translate(-1px, 2px) rotate(-1deg); }
                    60% { transform: translate(-3px, 1px) rotate(0deg); }
                    70% { transform: translate(3px, 1px) rotate(-1deg); }
                    80% { transform: translate(-1px, -1px) rotate(1deg); }
                    90% { transform: translate(1px, 2px) rotate(0deg); }
                    100% { transform: translate(1px, -2px) rotate(-1deg); }
                }
                .animate-shake { animation: shake 0.5s; }
                .animate-bounce-slow { animation: bounce 3s infinite; }
                .animate-float-up { animation: floatUp 1s ease-out infinite; opacity: 0; }
                @keyframes floatUp {
                    0% { transform: translateY(0); opacity: 1; }
                    100% { transform: translateY(-20px); opacity: 0; }
                }
                .text-shadow-retro { text-shadow: 2px 2px 0px rgba(0,0,0,0.5); }
            `}</style>

            {/* --- ROAMING BOSS (Only Visible in Focus Mode) --- */}
            {mode === 'focus' && (
                <div 
                    className="fixed z-40 pointer-events-none transition-transform duration-75 ease-linear will-change-transform"
                    style={{
                        left: 0,
                        top: 0,
                        transform: `translate(${position.x}px, ${position.y}px) scale(${monsterScale})`,
                        width: `${baseSize}px`,
                        height: `${baseSize}px`,
                    }}
                >
                    {/* Boss HP Bar Floating Above */}
                    <div className="absolute -top-6 left-0 w-full h-3 bg-gray-900 rounded-full border border-white/30 overflow-hidden opacity-80">
                        <div 
                            className="h-full bg-red-500 transition-all duration-300" 
                            style={{ width: `${monsterHP}%` }}
                        />
                    </div>
                    
                    <SlimeMonster isHit={isHit} isHealing={!isActive && time < maxHP} hpPercent={monsterHP} />
                </div>
            )}

            {/* --- HUD CONTROL PANEL (Bottom Right) --- */}
            <div className="fixed bottom-4 right-4 z-50 animate-slideIn">
                <div className={`
                    flex items-center gap-4 p-4 rounded-xl border-4 shadow-2xl transition-colors duration-300
                    ${mode === 'focus' 
                        ? 'bg-indigo-950 border-indigo-500 shadow-indigo-900/50' 
                        : 'bg-emerald-900 border-emerald-500 shadow-emerald-900/50'}
                `}>
                    {/* Mini Avatar in HUD (Campfire during break, or Mini Boss Icon) */}
                    <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center bg-black/20 rounded-lg">
                        {mode === 'focus' ? (
                            <i className="fas fa-skull text-3xl text-red-400 animate-pulse"></i>
                        ) : (
                            <Campfire />
                        )}
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col min-w-[120px]">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white/70">
                                {mode === 'focus' ? `Boss Battle` : 'Resting at Camp'}
                            </span>
                        </div>

                        {/* Timer */}
                        <div className="flex items-center justify-between">
                            <span className="text-2xl font-black font-mono text-white text-shadow-retro tracking-wider">
                                {timeString}
                            </span>
                            
                            <button 
                                onClick={toggleTimer}
                                className={`
                                    w-8 h-8 flex items-center justify-center rounded-lg border-b-4 active:border-b-0 active:translate-y-1 transition-all
                                    ${isActive 
                                        ? 'bg-gray-700 border-gray-900 text-gray-300' 
                                        : 'bg-yellow-400 border-yellow-600 text-yellow-900 hover:bg-yellow-300'}
                                `}
                                title={isActive ? "Pause" : "Start"}
                            >
                                <i className={`fas ${isActive ? 'fa-pause' : 'fa-play'} text-sm`}></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
