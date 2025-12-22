
import React, { useState, useEffect, useCallback, useRef } from 'react';
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

export const PomodoroTimer: React.FC<PomodoroTimerProps> = ({ settings }) => {
    const [mode, setMode] = useState<TimerMode>('focus');
    const [isActive, setIsActive] = useState(false);
    const [sessionCount, setSessionCount] = useState(0);
    const [time, setTime] = useState(modeDurations(settings)[mode] * 60);

    // Update timer when settings change
    useEffect(() => {
        if (!isActive) {
            setTime(modeDurations(settings)[mode] * 60);
        }
    }, [settings, mode, isActive]);

    const handleNextMode = useCallback(() => {
        // Use the safe utility for sound
        playTimerSound(mode === 'focus' ? 'focus' : 'break');

        if (mode === 'focus') {
            const newSessionCount = sessionCount + 1;
            setSessionCount(newSessionCount);
            const nextMode = newSessionCount % 4 === 0 ? 'longBreak' : 'shortBreak';
            setMode(nextMode);
            setTime(modeDurations(settings)[nextMode] * 60);
        } else {
            setMode('focus');
            setTime(modeDurations(settings).focus * 60);
        }
        setIsActive(true); // Auto-start next session
    }, [mode, sessionCount, settings]);

    useEffect(() => {
        if (!isActive) return;

        const interval = setInterval(() => {
            setTime(prevTime => {
                if (prevTime <= 1) {
                    handleNextMode();
                    return 0;
                }
                return prevTime - 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isActive, handleNextMode]);

    const toggle = () => setIsActive(!isActive);

    const resetTimer = useCallback(() => {
        setIsActive(false);
        setMode('focus');
        setSessionCount(0);
        setTime(modeDurations(settings).focus * 60);
    }, [settings]);

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
