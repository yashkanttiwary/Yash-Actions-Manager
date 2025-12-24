
import React, { useState, useEffect, useCallback } from 'react';
import { playTimerSound } from '../utils/audio';

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

const modeColors: Record<TimerMode, { text: string; stroke: string; name: string }> = {
    focus: { text: 'text-indigo-500 dark:text-indigo-400', stroke: '#818cf8', name: 'Focus' },
    shortBreak: { text: 'text-green-500 dark:text-green-400', stroke: '#34d399', name: 'Short Break' },
    longBreak: { text: 'text-sky-500 dark:text-sky-400', stroke: '#38bdf8', name: 'Long Break' },
};

const STORAGE_KEY = 'pomodoro_state_v2';

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ settings }) => {
    const [mode, setMode] = useState<TimerMode>('focus');
    const [isActive, setIsActive] = useState(false);
    const [sessionCount, setSessionCount] = useState(0);
    const [time, setTime] = useState(modeDurations(settings).focus * 60);

    // Initial Load from Storage
    useEffect(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                // Validate parsed data
                if (parsed.targetTime && parsed.mode && typeof parsed.isActive === 'boolean') {
                    const now = Date.now();
                    const remaining = Math.ceil((parsed.targetTime - now) / 1000);
                    
                    if (remaining > 0 && parsed.isActive) {
                        // Resume active timer
                        setMode(parsed.mode);
                        setIsActive(true);
                        setTime(remaining);
                        setSessionCount(parsed.sessionCount || 0);
                    } else if (parsed.isActive) {
                        // Timer expired while away
                        setMode(parsed.mode);
                        setIsActive(false);
                        setTime(0); // This will trigger the "next mode" logic immediately on effect
                        setSessionCount(parsed.sessionCount || 0);
                    } else {
                        // Paused state
                        setMode(parsed.mode);
                        setIsActive(false);
                        setTime(parsed.savedTime || modeDurations(settings)[parsed.mode as TimerMode] * 60);
                        setSessionCount(parsed.sessionCount || 0);
                    }
                }
            } catch (e) {
                console.error("Failed to load timer state", e);
            }
        }
    }, []);

    // Save State logic
    const saveState = useCallback((currentMode: TimerMode, active: boolean, currentTime: number, count: number) => {
        const state = {
            mode: currentMode,
            isActive: active,
            sessionCount: count,
            // If active, save the target timestamp (now + remaining)
            // If paused, save the remaining seconds
            targetTime: active ? Date.now() + (currentTime * 1000) : null,
            savedTime: currentTime
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }, []);

    const handleNextMode = useCallback(() => {
        playTimerSound(mode === 'focus' ? 'focus' : 'break');

        let nextMode: TimerMode = 'focus';
        let newSessionCount = sessionCount;

        if (mode === 'focus') {
            newSessionCount++;
            nextMode = newSessionCount % 4 === 0 ? 'longBreak' : 'shortBreak';
        }

        setSessionCount(newSessionCount);
        setMode(nextMode);
        
        const newTime = modeDurations(settings)[nextMode] * 60;
        setTime(newTime);
        setIsActive(true);
        saveState(nextMode, true, newTime, newSessionCount);

    }, [mode, sessionCount, settings, saveState]);

    useEffect(() => {
        if (!isActive) {
            saveState(mode, false, time, sessionCount);
            return;
        }

        const interval = setInterval(() => {
            setTime(prevTime => {
                const newTime = prevTime - 1;
                if (newTime <= 0) {
                    // We can't call handleNextMode directly here inside setState due to dependencies
                    // But we set to 0, and have an effect watch for 0
                    return 0;
                }
                // Save state every second is safe for localStorage (sync)
                // To optimize, maybe every 5s? But 1s ensures accuracy on crash.
                saveState(mode, true, newTime, sessionCount);
                return newTime;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isActive, mode, sessionCount, saveState]);

    // Watch for time hitting 0
    useEffect(() => {
        if (time === 0 && isActive) {
            handleNextMode();
        }
    }, [time, isActive, handleNextMode]);

    const toggle = () => {
        const newState = !isActive;
        setIsActive(newState);
        saveState(mode, newState, time, sessionCount);
    };

    const resetTimer = useCallback(() => {
        setIsActive(false);
        setMode('focus');
        setSessionCount(0);
        const newTime = modeDurations(settings).focus * 60;
        setTime(newTime);
        saveState('focus', false, newTime, 0);
    }, [settings, saveState]);

    const minutes = Math.floor(time / 60);
    const seconds = time % 60;
    const totalDuration = modeDurations(settings)[mode] * 60;
    const progress = totalDuration > 0 ? ((totalDuration - time) / totalDuration) * 100 : 0;
    const color = modeColors[mode];
    
    const radius = 15.9155;
    const circumference = 2 * Math.PI * radius;
    const strokeDashoffset = circumference - (progress / 100) * circumference;

    return (
         <div className="fixed bottom-4 right-4 z-40 flex items-center bg-white/50 dark:bg-gray-800/80 backdrop-blur-sm border border-gray-300 dark:border-gray-600 rounded-xl shadow-lg p-3 animate-slideIn">
            <div className="relative w-16 h-16 mr-3">
                 <svg className="w-full h-full" viewBox="0 0 36 36" transform="rotate(-90)">
                    <circle
                        cx="18"
                        cy="18"
                        r={radius}
                        fill="transparent"
                        className="stroke-gray-200 dark:stroke-gray-700"
                        strokeWidth="2.5"
                    />
                    <circle
                        cx="18"
                        cy="18"
                        r={radius}
                        fill="transparent"
                        stroke={color.stroke}
                        strokeWidth="2.5"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                    />
                 </svg>
                 <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-mono font-semibold text-gray-800 dark:text-gray-100">{`${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`}</span>
                </div>
            </div>
            <div className="flex flex-col">
                <p className={`font-bold text-lg ${color.text}`}>{color.name} {mode === 'focus' ? `#${sessionCount + 1}` : ''}</p>
                <div className="flex items-center gap-2 mt-1">
                    <button onClick={toggle} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" aria-label={isActive ? 'Pause timer' : 'Start timer'}>
                        <i className={`fas fa-fw ${isActive ? 'fa-pause' : 'fa-play'}`}></i>
                    </button>
                    <button onClick={resetTimer} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" aria-label="Reset timer">
                        <i className="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>
        </div>
    );
};
