
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, GamificationData, Settings, Status, ConnectionHealth, SettingsTab } from '../types';
import { COLUMN_STATUSES } from '../constants';
import { ConnectionHealthIndicator } from './ConnectionHealthIndicator';
import { exportTasksToCSV } from '../utils/exportUtils';
import { TetrisGameModal } from './TetrisGameModal';

interface GoogleAuthState {
    gapiLoaded: boolean;
    gisLoaded: boolean;
    isSignedIn: boolean;
    error?: Error;
    disabled?: boolean;
}

interface AudioControls {
    currentTrackName: string;
    isPlaying: boolean;
    skipNext: () => void;
    skipPrev: () => void;
}

interface HeaderProps {
    tasks: Task[];
    isTodayView: boolean;
    setIsTodayView: (isToday: boolean) => void;
    onOpenAIAssistant: () => void;
    onToggleTheme: () => void;
    currentTheme: string;
    onResetLayout: () => void;
    gamification: GamificationData;
    settings: Settings;
    onUpdateSettings: (newSettings: Partial<Settings>) => void;
    currentViewMode: 'kanban' | 'calendar';
    onViewModeChange: (mode: 'kanban' | 'calendar') => void;
    googleAuthState: GoogleAuthState;
    onGoogleSignIn: () => void;
    onGoogleSignOut: () => void;
    onOpenShortcutsModal: () => void;
    focusMode: Status | 'None';
    setFocusMode: (mode: Status | 'None') => void;
    onOpenSettings: (tab?: SettingsTab) => void; 
    connectionHealth: ConnectionHealth;
    onManualPull: () => Promise<void>;
    onManualPush: () => Promise<void>;
    isCompactMode: boolean;
    onToggleCompactMode: () => void;
    zoomLevel: number;
    setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
    audioControls: AudioControls;
}

// Helper functions for rocket animation
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

export const Header: React.FC<HeaderProps> = ({ 
    tasks, isTodayView, setIsTodayView, onOpenAIAssistant, onToggleTheme, currentTheme, onResetLayout, 
    gamification, settings, onUpdateSettings, currentViewMode, onViewModeChange, 
    googleAuthState, onGoogleSignIn, onGoogleSignOut, onOpenShortcutsModal, 
    focusMode, setFocusMode, onOpenSettings, connectionHealth,
    onManualPull, onManualPush, isCompactMode, onToggleCompactMode,
    zoomLevel, setZoomLevel, audioControls
}) => {
    
    // --- ROCKET LOGIC ---
    const rocketRef = useRef<HTMLDivElement>(null);
    const [isFlying, setIsFlying] = useState(false);
    const [showGame, setShowGame] = useState(false); // State for the Game Modal
    const animationRef = useRef<Animation | null>(null);
    const sparkTimerRef = useRef<number | null>(null);

    const spawnSpark = () => {
        if (!rocketRef.current) return;
        const r = rocketRef.current.getBoundingClientRect();
        
        // Place sparks near flame area (bottom center of the rocket relative to its rotation)
        const x = r.left + r.width * 0.5 + rand(-4, 4);
        const y = r.top + r.height * 0.8 + rand(-2, 4);

        const s = document.createElement("div");
        s.className = "spark";
        s.style.left = `${x}px`;
        s.style.top = `${y}px`;
        document.body.appendChild(s);

        // Shoot backwards & fade
        const driftX = rand(-20, 20);
        const driftY = rand(30, 70);

        s.animate([
            { transform: "translate(0,0) scale(1)", opacity: 0.9 },
            { transform: `translate(${driftX}px, ${driftY}px) scale(0.2)`, opacity: 0 }
        ], {
            duration: rand(300, 520),
            easing: "cubic-bezier(.2,.7,.2,1)",
            fill: "forwards"
        }).onfinish = () => s.remove();
    };

    const startSparks = () => {
        if (sparkTimerRef.current) clearInterval(sparkTimerRef.current);
        sparkTimerRef.current = window.setInterval(spawnSpark, 50); // High frequency
    };

    const stopSparks = () => {
        if (sparkTimerRef.current) clearInterval(sparkTimerRef.current);
        sparkTimerRef.current = null;
    };

    const flyRocket = () => {
        if (isFlying || !rocketRef.current) return;
        setIsFlying(true);
        startSparks();

        const rocket = rocketRef.current;
        const r = rocket.getBoundingClientRect();
        const startX = r.left;
        const startY = r.top;
        const w = r.width;
        const h = r.height;

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 50;
        
        // Waypoints
        const points = [
            { x: startX, y: startY }, // Start
            { x: rand(margin, vw - margin), y: rand(margin, vh * 0.4) }, // Fly up somewhere
            { x: rand(vw * 0.5, vw - margin), y: rand(vh * 0.5, vh - margin) }, // Fly down right
            { x: rand(margin, vw * 0.4), y: rand(vh * 0.3, vh * 0.8) }, // Fly left mid
            { x: startX, y: startY }, // Return home
        ];

        // Build Keyframes
        const frames: Keyframe[] = [];
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            const dx = p.x - startX;
            const dy = p.y - startY;

            let angle = 0;
            if (i < points.length - 1) {
                const n = points[i + 1];
                const ndx = n.x - p.x;
                const ndy = n.y - p.y;
                // +90 because icon points UP (0deg) relative to container after our CSS rotation
                angle = (Math.atan2(ndy, ndx) * 180 / Math.PI) + 90;
            }

            // Smooth scaling
            let scale = 1;
            if (i === 1) scale = 1.2; // Zoom out/in effect
            if (i === points.length - 1) scale = 1;

            frames.push({
                transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg) scale(${scale})`,
                offset: i / (points.length - 1),
                easing: i === 0 ? "cubic-bezier(.2,.9,.2,1)" : "cubic-bezier(.2,.7,.2,1)"
            });
        }

        const totalDist = points.reduce((acc, p, i) => {
            if (i === 0) return 0;
            return acc + Math.hypot(p.x - points[i-1].x, p.y - points[i-1].y);
        }, 0);
        
        const duration = clamp(totalDist * 2, 3000, 6000);

        animationRef.current = rocket.animate(frames, {
            duration: duration,
            fill: "forwards"
        });

        animationRef.current.onfinish = () => {
            stopSparks();
            setIsFlying(false);
            animationRef.current = null;
        };
    };
    
    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (animationRef.current) animationRef.current.cancel();
            stopSparks();
        };
    }, []);


    // --- DATA CALCULATIONS ---
    const totalTasks = tasks.length;
    const progress = totalTasks > 0 ? (tasks.filter(t => t.status === 'Done').length / totalTasks) * 100 : 0;
    
    const { xp, level, streak } = gamification;
    const xpForCurrentLevel = (level - 1) * 100;
    const xpForNextLevel = level * 100;
    const xpProgress = xpForNextLevel > xpForCurrentLevel ? ((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100 : 0;

    const todaysBudgetedTime = useMemo(() => {
        try {
            const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone });
            const todayStr = formatter.format(new Date());

            return tasks
                .filter(task => {
                    if (task.status === 'Done' || task.status === "Won't Complete") return false;
                    if (task.status === 'In Progress') return true;
                    if (task.scheduledStartDateTime) {
                        const taskScheduleStr = formatter.format(new Date(task.scheduledStartDateTime));
                        return taskScheduleStr === todayStr;
                    }
                    if (task.dueDate === todayStr) return true;
                    return false;
                })
                .reduce((sum, task) => sum + (task.timeEstimate || 0), 0);
        } catch (e) {
            console.error("Failed to calculate budget, timezone may be invalid:", settings.timezone);
            return 0;
        }
    }, [tasks, settings.timezone]);

    const budgetProgress = settings.dailyBudget > 0 ? (todaysBudgetedTime / settings.dailyBudget) * 100 : 0;
    
    const isSheetConnected = connectionHealth.sheet.status === 'connected';
    const isSyncing = connectionHealth.sheet.message?.toLowerCase().includes('syncing');

    const handleZoomIn = () => setZoomLevel(prev => Math.min(1.5, prev + 0.1));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(0.1, prev - 0.1));
    const handleResetZoom = () => setZoomLevel(1);

    const handleRocketClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowGame(true);
    };

    return (
        <header className="p-4 sm:p-3 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-300 dark:border-gray-700/50 sticky top-0 z-20">
            <div className="max-w-screen-2xl mx-auto flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                     <div className="flex items-center">
                        
                        {/* ROCKET COMPONENT */}
                        <div 
                            ref={rocketRef}
                            className={`rocket-wrapper mr-2 cursor-pointer relative flex items-center justify-center ${isFlying ? 'rocket-flying' : 'rocket-idle'}`}
                            onMouseEnter={flyRocket} // Keep flying on hover
                            onClick={handleRocketClick} // Launch game on click
                            title="Click to play Tetris!"
                            style={{ width: '40px', height: '40px' }} // Fixed container size
                        >
                            {/* 
                                FontAwesome Rocket defaults to 45deg (pointing North-East).
                                We rotate it -45deg so it points UP (0deg).
                                This aligns with the JS flight logic which assumes 0deg is "Forward/Up".
                            */}
                            <i 
                                className="fas fa-rocket text-3xl text-indigo-500 dark:text-indigo-400 relative z-10" 
                                style={{ transform: 'rotate(-45deg)', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
                            ></i>

                            {/* Exhaust Fire - Positioned relative to the wrapper */}
                            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-2 z-0">
                                <div className="flame-element"></div>
                            </div>
                        </div>
                        {/* END ROCKET */}

                        <h1 className="text-xl font-bold tracking-wider">Task Manager</h1>
                     </div>
                     <div className="flex items-center space-x-2 sm:space-x-3 flex-wrap gap-y-2">
                         
                         {/* System Health Indicator & Sync Button */}
                         <div className="mr-2 flex items-center gap-2">
                            <ConnectionHealthIndicator 
                                health={connectionHealth} 
                                onOpenSettings={onOpenSettings}
                                onManualPull={onManualPull}
                                onManualPush={onManualPush}
                            />
                            
                            {/* NEW: Explicit Sync Button */}
                            {isSheetConnected && (
                                <button
                                    onClick={onManualPull}
                                    disabled={!!isSyncing}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm ${
                                        isSyncing 
                                            ? 'bg-blue-100 text-blue-700 border-blue-200 cursor-wait' 
                                            : 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-gray-700 hover:border-indigo-300'
                                    }`}
                                    title="Pull latest changes from Google Sheet"
                                >
                                    <i className={`fas fa-cloud-download-alt ${isSyncing ? 'fa-bounce' : ''}`}></i>
                                    <span className="hidden lg:inline">{isSyncing ? 'Syncing...' : 'Sync from Sheet'}</span>
                                </button>
                            )}
                         </div>

                         {/* Focus Mode Selector - Standard Button Style */}
                         <div className="flex items-center mr-2">
                             <div className="flex items-center bg-gray-200 dark:bg-gray-700 rounded-md px-3 py-1.5 transition-all hover:bg-gray-300 dark:hover:bg-gray-600">
                                <label htmlFor="focus-mode" className="text-xs font-semibold text-gray-600 dark:text-gray-400 mr-2 cursor-pointer whitespace-nowrap">
                                    <span className="hidden sm:inline">Focus:</span>
                                    <span className="sm:hidden"><i className="fas fa-filter"></i></span>
                                </label>
                                <div className="relative">
                                    <select
                                        id="focus-mode"
                                        value={focusMode}
                                        onChange={(e) => setFocusMode(e.target.value as Status | 'None')}
                                        className="appearance-none bg-transparent border-none text-xs font-semibold text-gray-800 dark:text-white focus:ring-0 cursor-pointer pr-5 py-0 pl-1 focus:outline-none"
                                    >
                                        <option value="None" className="bg-gray-100 dark:bg-gray-800">None</option>
                                        {COLUMN_STATUSES.map(status => (
                                            <option key={status} value={status} className="bg-gray-100 dark:bg-gray-800">{status}</option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center text-gray-600 dark:text-gray-400">
                                         <i className="fas fa-chevron-down text-[10px]"></i>
                                    </div>
                                </div>
                             </div>
                        </div>

                         <div className="bg-gray-200 dark:bg-gray-700 p-0.5 rounded-lg flex items-center">
                            <button onClick={() => onViewModeChange('kanban')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${currentViewMode === 'kanban' ? 'bg-white dark:bg-gray-800 shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50 dark:hover:bg-gray-600/50'}`}>
                                <i className="fas fa-columns sm:mr-2"></i><span className="hidden sm:inline">Board</span>
                            </button>
                             <button onClick={() => onViewModeChange('calendar')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${currentViewMode === 'calendar' ? 'bg-white dark:bg-gray-800 shadow' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50 dark:hover:bg-gray-600/50'}`}>
                                <i className="fas fa-calendar-day sm:mr-2"></i><span className="hidden sm:inline">Calendar</span>
                            </button>
                         </div>
                         
                         {/* Zoom Controls */}
                        <div className="bg-gray-200 dark:bg-gray-700 p-0.5 rounded-lg flex items-center gap-0.5">
                            <button onClick={handleZoomOut} className="w-6 h-6 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all text-xs" title="Zoom Out">
                                <i className="fas fa-minus"></i>
                            </button>
                            <button onClick={handleResetZoom} className="px-2 h-6 flex items-center justify-center rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all text-[10px] font-bold min-w-[36px]" title="Reset Zoom">
                                {Math.round(zoomLevel * 100)}%
                            </button>
                            <button onClick={handleZoomIn} className="w-6 h-6 flex items-center justify-center rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600 transition-all text-xs" title="Zoom In">
                                <i className="fas fa-plus"></i>
                            </button>
                        </div>


                         <button
                            onClick={onResetLayout}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                            title="Reset column positions"
                        >
                            <i className="fas fa-th-large sm:mr-2"></i>
                            <span className="hidden sm:inline">Reset</span>
                        </button>
                        <button
                            onClick={onToggleCompactMode}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                isCompactMode 
                                    ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 shadow-inner' 
                                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                            title={isCompactMode ? "Switch to Full View" : "Switch to Compact View"}
                        >
                             <i className={`fas ${isCompactMode ? 'fa-expand' : 'fa-compress'} sm:mr-2`}></i>
                             <span className="hidden sm:inline">{isCompactMode ? 'Full' : 'Compact'}</span>
                        </button>
                        <button
                            onClick={() => exportTasksToCSV(tasks)}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                            title="Download tasks as CSV"
                        >
                            <i className="fas fa-file-csv sm:mr-2"></i>
                            <span className="hidden sm:inline">Export</span>
                        </button>
                         <button
                            onClick={() => setIsTodayView(!isTodayView)}
                            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                                isTodayView ? 'bg-green-500 text-white shadow-lg' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600'
                            }`}
                        >
                            <i className={`far fa-calendar-check sm:mr-2 ${isTodayView ? 'fa-beat' : ''}`}></i>
                            <span className="hidden sm:inline">Today</span>
                        </button>
                        <button
                            onClick={onOpenAIAssistant}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg flex items-center"
                        >
                            <i className="fas fa-magic-sparkles sm:mr-2"></i>
                            <span className="hidden sm:inline">AI</span>
                        </button>
                        <div className="relative">
                            <button onClick={() => onOpenSettings('general')} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" aria-label="Open settings">
                                <i className="fas fa-cog"></i>
                            </button>
                        </div>
                        <button onClick={onToggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" aria-label="Toggle theme">
                            <i className={`fas ${currentTheme === 'dark' ? 'fa-sun text-yellow-400' : 'fa-moon text-indigo-500'}`}></i>
                        </button>
                        
                        {/* Audio Toggle / Settings Button */}
                        <button
                            onClick={() => onOpenSettings('sounds')}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-sm border border-transparent ${
                                audioControls.isPlaying
                                    ? 'bg-indigo-100 text-indigo-600 border-indigo-200 dark:bg-indigo-900/50 dark:text-indigo-400 dark:border-indigo-800'
                                    : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-400'
                            }`}
                            title={audioControls.isPlaying ? `Playing: ${audioControls.currentTrackName}` : "Audio Settings"}
                        >
                            <i className={`fas ${audioControls.isPlaying ? 'fa-volume-up' : 'fa-music'}`}></i>
                        </button>

                        <button onClick={onOpenShortcutsModal} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" aria-label="View keyboard shortcuts">
                            <i className="fas fa-keyboard"></i>
                        </button>

                         {/* Moved Level and Streak Info Here */}
                        <div className="flex-grow flex items-center gap-2 sm:gap-4 ml-2 border-l border-gray-300 dark:border-gray-600 pl-2">
                            <div className="flex items-center gap-2" title={`Level ${level}`}>
                                <span className="font-bold text-indigo-500 dark:text-indigo-400 text-sm">Lvl {level}</span>
                                <div className="w-16 sm:w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-2" title={`${xp}/${xpForNextLevel} XP`}>
                                    <div className="bg-gradient-to-r from-indigo-400 to-purple-500 h-2 rounded-full" style={{ width: `${xpProgress}%` }}></div>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 text-orange-500 dark:text-orange-400 font-bold text-sm" title={`Current Streak: ${streak.current} days, Longest: ${streak.longest} days`}>
                                <i className="fas fa-fire"></i>
                                <span>{streak.current}</span>
                            </div>
                        </div>

                    </div>
                </div>

                 <div className="flex flex-col sm:flex-row gap-4">
                    <div className="w-full">
                        <div className="flex justify-between text-xs mb-1">
                            <span>Overall Progress</span>
                            <span className="font-semibold">{Math.round(progress)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div className="bg-gradient-to-r from-green-400 to-blue-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                        </div>
                    </div>
                     <div className="w-full">
                        <div className="flex justify-between text-xs mb-1">
                            <span>Today's Time Budget</span>
                            <span className="font-semibold">{todaysBudgetedTime.toFixed(1)}h / {settings.dailyBudget}h</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div className={`h-2 rounded-full ${budgetProgress > 100 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${Math.min(budgetProgress, 100)}%` }}></div>
                        </div>
                    </div>
                </div>

            </div>
            
            {/* Game Modal */}
            {showGame && <TetrisGameModal onClose={() => setShowGame(false)} />}
        </header>
    );
};
