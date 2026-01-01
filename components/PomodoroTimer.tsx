import React, { useState, useEffect, useCallback } from 'react';
import { playTimerSound } from '../utils/audio';
import { storage } from '../utils/storage';

interface PomodoroSettings {
    pomodoroFocus: number;
    pomodoroShortBreak: number;
    pomodoroLongBreak: number;
}

interface PomodoroTimerProps {
    settings: PomodoroSettings;
    className?: string;
}

type TimerMode = 'focus' | 'shortBreak' | 'longBreak';

const modeDurations = (settings: PomodoroSettings): Record<TimerMode, number> => ({
    focus: settings.pomodoroFocus,
    shortBreak: settings.pomodoroShortBreak,
    longBreak: settings.pomodoroLongBreak
});

const STORAGE_KEY = 'pomodoro_state_clean_v1';

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ settings, className }) => {
    const [mode, setMode] = useState<TimerMode>('focus');
    const [isActive, setIsActive] = useState(false);
    const [time, setTime] = useState(modeDurations(settings).focus * 60);
    const [sessionCount, setSessionCount] = useState(0);
    
    // Load State
    useEffect(() => {
        const loadState = async () => {
            const saved = await storage.get(STORAGE_KEY);
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
                        } else {
                            // Expired while away
                            handleNextMode(parsed.mode, parsed.sessionCount);
                        }
                    } else {
                        setMode(parsed.mode);
                        setIsActive(false);
                        setTime(parsed.savedTime || dur);
                        setSessionCount(parsed.sessionCount || 0);
                    }
                } catch (e) {
                    console.error("Failed to load timer", e);
                }
            }
        };
        loadState();
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
        storage.set(STORAGE_KEY, JSON.stringify(state));
    }, []);

    // Timer Logic
    useEffect(() => {
        if (!isActive) return;

        const interval = setInterval(() => {
            setTime(prev => {
                const newTime = prev - 1;
                
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
    }, [isActive, mode, sessionCount, settings, saveState]);

    const handleNextMode = (currentMode: TimerMode, currentCount: number) => {
        setIsActive(false);
        playTimerSound(currentMode === 'focus' ? 'break' : 'focus');

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
        saveState(nextMode, false, newTime, newCount);
    };

    const toggleTimer = () => {
        const newState = !isActive;
        setIsActive(newState);
        saveState(mode, newState, time, sessionCount);
    };

    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Calculate progress for bar
    const totalTime = modeDurations(settings)[mode] * 60;
    const progressPct = 100 - ((time / totalTime) * 100);

    return (
        <div className={`${className || ''} animate-slideIn`}>
            <div className={`
                flex items-center gap-3 p-3 rounded-xl border-2 shadow-lg transition-colors duration-300 w-full h-full
                ${mode === 'focus' 
                    ? 'bg-slate-900 border-slate-700 shadow-slate-900/20' 
                    : 'bg-emerald-900 border-emerald-500 shadow-emerald-900/20'}
            `}>
                {/* HUD */}
                <div className="flex flex-col flex-grow min-w-0">
                    {/* Header */}
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-[9px] font-bold uppercase tracking-widest text-white/70 truncate">
                            {mode === 'focus' ? `Focus Session ${sessionCount + 1}` : 'Rest'}
                        </span>
                        <span className="text-xl font-black font-mono text-white leading-none">
                            {timeString}
                        </span>
                    </div>

                    {/* Progress Bar & Controls Row */}
                    <div className="flex items-center gap-2">
                        <div className="relative flex-grow h-3 bg-gray-800 rounded-full border border-white/10 overflow-hidden">
                            <div 
                                className={`absolute top-0 left-0 h-full transition-all duration-500 ease-out ${mode === 'focus' ? 'bg-indigo-500' : 'bg-green-500'}`}
                                style={{ width: `${progressPct}%` }}
                            ></div>
                        </div>

                        <button 
                            onClick={toggleTimer}
                            className={`
                                w-6 h-6 flex items-center justify-center rounded border-b-2 active:border-b-0 active:translate-y-0.5 transition-all flex-shrink-0
                                ${isActive 
                                    ? 'bg-gray-700 border-gray-900 text-gray-300' 
                                    : 'bg-white border-gray-300 text-gray-900 hover:bg-gray-100'}
                            `}
                            title={isActive ? "Pause" : "Start"}
                        >
                            <i className={`fas ${isActive ? 'fa-pause' : 'fa-play'} text-[10px]`}></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};