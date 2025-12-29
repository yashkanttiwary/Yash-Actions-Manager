
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

// --- ASSETS (Pixel Art / Vector SVGs) ---

const SlimeMonster: React.FC<{ isHit: boolean; isHealing: boolean; hpPercent: number }> = ({ isHit, isHealing, hpPercent }) => {
    // Green Grimer Palette
    // High HP: Toxic Green. Low HP: Dark Brown/Reddish (dried up/injured).
    const bodyColor = hpPercent > 50 ? "#84cc16" : "#a16207"; // Lime-500 to Yellow-Brown
    const shadowColor = hpPercent > 50 ? "#3f6212" : "#451a03"; // Dark Green to Dark Brown
    const highlightColor = hpPercent > 50 ? "#d9f99d" : "#fde047";

    return (
        <svg viewBox="0 0 120 120" className={`w-full h-full transition-transform duration-100 ${isHit ? 'translate-x-2 translate-y-2' : ''}`} style={{ overflow: 'visible' }}>
            <defs>
                <filter id="glow-damage">
                    <feDropShadow dx="0" dy="0" stdDeviation="15" floodColor="#ef4444" />
                </filter>
                <filter id="glow-slime">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor={bodyColor} floodOpacity="0.6" />
                </filter>
                <linearGradient id="slimeGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" style={{ stopColor: highlightColor, stopOpacity: 1 }} />
                    <stop offset="100%" style={{ stopColor: bodyColor, stopOpacity: 1 }} />
                </linearGradient>
            </defs>
            
            {/* The Monster Container - Bounces/Oozes */}
            <g transform="translate(10, 10)" className={isHit ? 'animate-shake' : 'animate-ooze'} filter={isHit ? "url(#glow-damage)" : "url(#glow-slime)"}>
                
                {/* 1. Left Arm (Dripping Sludge) */}
                <path 
                    d="M 20 60 Q 5 50 10 30 Q 20 10 35 40" 
                    fill={bodyColor} 
                    stroke={shadowColor} 
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="animate-wave-left origin-bottom"
                />

                {/* 2. Right Arm (Waving Sludge) */}
                <path 
                    d="M 80 60 Q 105 50 100 20 Q 85 10 70 40" 
                    fill={bodyColor} 
                    stroke={shadowColor} 
                    strokeWidth="3"
                    strokeLinecap="round"
                    className="animate-wave-right origin-bottom"
                />

                {/* 3. Main Body (Grimer Shape: Wide base, melting look) */}
                <path 
                    d="M 10 100 
                       C 0 100, 0 70, 15 60 
                       C 25 30, 75 30, 85 60 
                       C 100 70, 100 100, 90 100 
                       Z" 
                    fill={`url(#slimeGradient)`}
                    stroke={shadowColor} 
                    strokeWidth="3"
                />

                {/* 4. Slime Drips/Details on body */}
                <path d="M 30 60 Q 35 70 40 60" fill="none" stroke={shadowColor} strokeWidth="2" opacity="0.6" />
                <path d="M 60 70 Q 65 80 70 70" fill="none" stroke={shadowColor} strokeWidth="2" opacity="0.6" />

                {/* 5. Eyes (Grimer Style: Big white circles, small pupils looking up/derpy) */}
                <g transform="translate(0, -5)">
                    {/* Left Eye */}
                    <circle cx="35" cy="45" r={hpPercent < 30 ? "6" : "8"} fill="white" stroke={shadowColor} strokeWidth="2" />
                    <circle cx="35" cy="45" r="2" fill="black" transform={`translate(${Math.sin(Date.now()/500)}, -2)`} />
                    
                    {/* Right Eye */}
                    <circle cx="65" cy="45" r={hpPercent < 30 ? "6" : "8"} fill="white" stroke={shadowColor} strokeWidth="2" />
                    <circle cx="65" cy="45" r="2" fill="black" transform={`translate(${Math.cos(Date.now()/500)}, -2)`} />
                </g>

                {/* 6. Mouth (Wide/Melting) */}
                {isHit ? (
                    // Ouch Mouth
                    <ellipse cx="50" cy="75" rx="10" ry="12" fill="#3f6212" />
                ) : hpPercent < 30 ? (
                    // Worried/Melting Mouth
                    <path d="M 35 80 Q 50 70 65 80" stroke="#3f6212" strokeWidth="3" fill="none" />
                ) : (
                    // Happy Grimer Grin
                    <path d="M 30 70 Q 50 95 70 70" fill="#3f6212" opacity="0.8" />
                )}
                
                {/* 7. Sweat/Particles if Low HP */}
                {hpPercent < 40 && !isHit && (
                    <circle cx="20" cy="30" r="3" fill="#60a5fa" className="animate-ping" style={{ animationDuration: '2s' }} />
                )}
            </g>

            {isHealing && (
                <g className="animate-float-up">
                    <text x="30" y="20" fontSize="16" fill="#4ade80" fontWeight="bold" stroke="black" strokeWidth="0.5">+HP</text>
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
    // Default start position (centerish)
    const [position, setPosition] = useState({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 });
    
    // Use a ref for velocity so we can mutate it inside the animation frame without re-renders
    const velocityRef = useRef({ vx: 2.5, vy: 2 }); // Faster base speed for roaming
    const requestRef = useRef<number>();
    
    // Use Ref for HP to avoid stale closures in animation loop without resetting the loop
    const monsterHPRef = useRef(monsterHP);
    useEffect(() => { monsterHPRef.current = monsterHP; }, [monsterHP]);

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
            const currentHP = monsterHPRef.current;
            // Base size 150px, scales from 0.5x to 1.5x based on HP
            const scale = 0.5 + (currentHP / 100); 
            const size = 200 * scale; // Approximate hitbox size
            
            let newX = prev.x + velocityRef.current.vx;
            let newY = prev.y + velocityRef.current.vy;

            // Bounce X
            if (newX <= 0) {
                newX = 0;
                velocityRef.current.vx = Math.abs(velocityRef.current.vx);
            } else if (newX >= window.innerWidth - size) {
                newX = window.innerWidth - size;
                velocityRef.current.vx = -Math.abs(velocityRef.current.vx);
            }

            // Bounce Y
            if (newY <= 0) {
                newY = 0;
                velocityRef.current.vy = Math.abs(velocityRef.current.vy);
            } else if (newY >= window.innerHeight - size) {
                newY = window.innerHeight - size;
                velocityRef.current.vy = -Math.abs(velocityRef.current.vy);
            }

            return { x: newX, y: newY };
        });

        requestRef.current = requestAnimationFrame(updatePosition);
    };

    // Start/Stop Animation Loop
    useEffect(() => {
        if (isActive && mode === 'focus') {
            if (!requestRef.current) {
                requestRef.current = requestAnimationFrame(updatePosition);
            }
        } else {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = undefined;
            }
        }
        return () => {
            if (requestRef.current) {
                cancelAnimationFrame(requestRef.current);
                requestRef.current = undefined;
            }
        };
    }, [isActive, mode]);

    // Timer Logic
    useEffect(() => {
        if (!isActive) {
            // Update HP based on manual time edits or resets if inactive
            const total = modeDurations(settings)[mode] * 60;
            if (total > 0) {
                setMonsterHP(Math.ceil((time / total) * 100));
            }
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

    // Handle settings/mode changes
    useEffect(() => {
        const total = modeDurations(settings)[mode] * 60;
        setMaxHP(total);
        if (time > total) setTime(total); // Clamp
        setMonsterHP((time / total) * 100);
        previousMinuteRef.current = Math.ceil(time / 60);
        
        // Reset position to center on mode change
        setPosition({ x: window.innerWidth / 2 - 100, y: window.innerHeight / 2 - 100 });
        // Randomize velocity direction
        velocityRef.current = { 
            vx: (Math.random() > 0.5 ? 2.5 : -2.5) * (0.8 + Math.random() * 0.4), 
            vy: (Math.random() > 0.5 ? 2.5 : -2.5) * (0.8 + Math.random() * 0.4) 
        };

    }, [mode, settings]);

    const triggerDamage = () => {
        setIsHit(true);
        playRetroSound('hit');
        // Shake velocity slightly on hit (recoil)
        velocityRef.current.vx *= -1.2; 
        velocityRef.current.vy *= -1.2;
        setTimeout(() => setIsHit(false), 600);
    };

    const handleNextMode = (currentMode: TimerMode, currentCount: number) => {
        setIsActive(false);
        playTimerSound(currentMode === 'focus' ? 'break' : 'focus');

        if (currentMode === 'focus') {
            playRetroSound('explosion');
            if (typeof confetti === 'function') {
                confetti({
                    particleCount: 200,
                    spread: 120,
                    origin: { x: position.x / window.innerWidth, y: position.y / window.innerHeight },
                    colors: ['#84cc16', '#3f6212', '#facc15'] // Slime colors
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
    const baseSize = 200; // px (Base drawing box)

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
                @keyframes ooze {
                    0%, 100% { transform: scale(1, 1) translate(0, 0); }
                    25% { transform: scale(1.05, 0.95) translate(0, 2px); }
                    50% { transform: scale(0.95, 1.05) translate(0, -2px); }
                    75% { transform: scale(1.02, 0.98) translate(0, 1px); }
                }
                @keyframes wave-left {
                    0%, 100% { d: path("M 20 60 Q 5 50 10 30 Q 20 10 35 40"); }
                    50% { d: path("M 20 60 Q 0 40 5 20 Q 15 5 35 40"); }
                }
                @keyframes wave-right {
                    0%, 100% { d: path("M 80 60 Q 105 50 100 20 Q 85 10 70 40"); }
                    50% { d: path("M 80 60 Q 110 40 105 10 Q 90 5 70 40"); }
                }
                .animate-shake { animation: shake 0.5s; }
                .animate-ooze { animation: ooze 3s ease-in-out infinite; }
                .animate-wave-left { animation: wave-left 4s ease-in-out infinite; }
                .animate-wave-right { animation: wave-right 5s ease-in-out infinite; }
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
                    className="fixed z-[60] pointer-events-none transition-transform duration-75 ease-linear will-change-transform"
                    style={{
                        left: 0,
                        top: 0,
                        transform: `translate(${position.x}px, ${position.y}px) scale(${monsterScale})`,
                        width: `${baseSize}px`,
                        height: `${baseSize}px`,
                    }}
                >
                    {/* Boss HP Bar Floating Above */}
                    <div className="absolute -top-6 left-[10%] w-[80%] h-3 bg-gray-900 rounded-full border-2 border-green-900/50 overflow-hidden opacity-90 shadow-lg">
                        <div 
                            className="h-full transition-all duration-300 ease-out" 
                            style={{ 
                                width: `${monsterHP}%`,
                                backgroundColor: monsterHP > 50 ? '#84cc16' : '#ef4444'
                            }}
                        />
                    </div>
                    
                    <SlimeMonster isHit={isHit} isHealing={!isActive && time < maxHP} hpPercent={monsterHP} />
                </div>
            )}

            {/* --- HUD CONTROL PANEL (Bottom Right) --- */}
            <div className="fixed bottom-4 right-4 z-[70] animate-slideIn">
                <div className={`
                    flex items-center gap-4 p-4 rounded-xl border-4 shadow-2xl transition-colors duration-300
                    ${mode === 'focus' 
                        ? 'bg-gray-900 border-green-600 shadow-green-900/50' 
                        : 'bg-emerald-900 border-emerald-500 shadow-emerald-900/50'}
                `}>
                    {/* Mini Avatar in HUD (Campfire during break, or Mini Boss Icon) */}
                    <div className="relative w-16 h-16 flex-shrink-0 flex items-center justify-center bg-black/40 rounded-lg border border-white/10">
                        {mode === 'focus' ? (
                            <div className="animate-ooze transform scale-75">
                                 {/* Simple CSS shape for mini-icon */}
                                <div className="w-10 h-8 bg-lime-500 rounded-full relative">
                                    <div className="absolute -top-3 left-0 w-3 h-6 bg-lime-500 rounded-full"></div>
                                    <div className="absolute -top-3 right-0 w-3 h-6 bg-lime-500 rounded-full"></div>
                                    <div className="absolute top-2 left-2 w-2 h-2 bg-white rounded-full"><div className="w-1 h-1 bg-black rounded-full ml-0.5 mt-0.5"></div></div>
                                    <div className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full"><div className="w-1 h-1 bg-black rounded-full ml-0.5 mt-0.5"></div></div>
                                </div>
                            </div>
                        ) : (
                            <Campfire />
                        )}
                    </div>

                    {/* Controls */}
                    <div className="flex flex-col min-w-[120px]">
                        <div className="flex justify-between items-end mb-1">
                            <span className={`text-[10px] font-bold uppercase tracking-widest ${mode === 'focus' ? 'text-lime-400' : 'text-emerald-200'}`}>
                                {mode === 'focus' ? `Slime Battle` : 'Resting at Camp'}
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
