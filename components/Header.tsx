
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, GamificationData, Settings, Status, ConnectionHealth, SettingsTab } from '../types';
import { COLUMN_STATUSES } from '../constants';
import { ConnectionHealthIndicator } from './ConnectionHealthIndicator';
import { exportTasksToCSV } from '../utils/exportUtils';
import { TetrisGameModal } from './TetrisGameModal';
import { getAccurateCurrentDate, initializeTimeSync } from '../services/timeService';
import { LiquidGauge } from './LiquidGauge';
import { calculateProgress } from '../services/gamificationService';

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
    currentViewMode: 'kanban' | 'calendar' | 'goals';
    onViewModeChange: (mode: 'kanban' | 'calendar' | 'goals') => void;
    googleAuthState: GoogleAuthState;
    onGoogleSignIn: () => void;
    onGoogleSignOut: () => void;
    onOpenShortcutsModal: () => void;
    focusMode: Status | 'None';
    setFocusMode: (mode: Status | 'None') => void;
    onOpenSettings: (tab?: SettingsTab) => void; 
    connectionHealth: ConnectionHealth;
    syncStatus: 'idle' | 'syncing' | 'error' | 'success'; // New Prop
    onManualPull: () => Promise<void>;
    onManualPush: () => Promise<void>;
    isCompactMode: boolean;
    onToggleCompactMode: () => void;
    isFitToScreen: boolean; 
    onToggleFitToScreen: () => void;
    zoomLevel: number;
    setZoomLevel: React.Dispatch<React.SetStateAction<number>>;
    audioControls: AudioControls;
    isTimelineVisible: boolean; 
    onToggleTimeline: () => void;
    isMenuLocked: boolean;
    setIsMenuLocked: (locked: boolean) => void;
    
    // Rocket Props
    isRocketFlying: boolean;
    onRocketLaunch: (flying: boolean) => void;

    // Hover State (Lifted)
    isMenuHovered: boolean;
    onMenuHoverChange: (isHovered: boolean) => void;
}

// Helper functions for rocket animation
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const rand = (min: number, max: number) => Math.random() * (max - min) + min;

export const Header: React.FC<HeaderProps> = ({ 
    tasks, isTodayView, setIsTodayView, onOpenAIAssistant, onToggleTheme, currentTheme, onResetLayout, 
    gamification, settings, onUpdateSettings, currentViewMode, onViewModeChange, 
    googleAuthState, onGoogleSignIn, onGoogleSignOut, onOpenShortcutsModal, 
    focusMode, setFocusMode, onOpenSettings, connectionHealth, syncStatus,
    onManualPull, onManualPush, isCompactMode, onToggleCompactMode, isFitToScreen, onToggleFitToScreen,
    zoomLevel, setZoomLevel, audioControls, isTimelineVisible, onToggleTimeline,
    isMenuLocked, setIsMenuLocked, isRocketFlying, onRocketLaunch,
    isMenuHovered, onMenuHoverChange
}) => {
    
    // --- CLOCK LOGIC ---
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        initializeTimeSync(); // Ensure reliable time service is running
        const interval = setInterval(() => {
            setCurrentTime(getAccurateCurrentDate());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const headerDateStr = currentTime.toLocaleDateString('en-US', { 
        weekday: 'short', // Shortened for Zen mode
        day: 'numeric', 
        month: 'short', 
        timeZone: settings.timezone 
    });
    
    const headerTimeStr = currentTime.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: true,
        timeZone: settings.timezone 
    });

    // --- ROCKET LOGIC ---
    const rocketRef = useRef<HTMLDivElement>(null);
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
        if (isRocketFlying || !rocketRef.current) return;
        
        // TRIGGER PARENT STATE
        onRocketLaunch(true);
        
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
            onRocketLaunch(false); // END PARENT STATE
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
    
    // 1. Time Budget (Fuel)
    const todaysBudgetedTime = useMemo(() => {
        try {
            const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone });
            const todayStr = formatter.format(new Date());

            return tasks
                .filter(task => {
                    if (task.status === 'Done' || task.status === "Won't Complete") return false;
                    // Count "To Do" and "In Progress" towards the load
                    if (task.status === 'To Do' || task.status === 'In Progress') return true;
                    // Or if it's scheduled for today
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

    // 2. XP Progress (Reward)
    const xpProgressData = useMemo(() => {
        return calculateProgress(gamification.xp, gamification.level);
    }, [gamification.xp, gamification.level]);

    // Derived State (Moved Up to fix ReferenceError)
    const isMenuOpen = isMenuHovered || isMenuLocked;
    const isSpaceVisualsActive = currentTheme === 'space' || isRocketFlying;
    
    const isSheetConnected = connectionHealth.sheet.status === 'connected';
    
    // Determine Sync Button State
    const getSyncButtonProps = () => {
        if (syncStatus === 'syncing') {
            return {
                icon: 'fa-cloud-arrow-up fa-bounce',
                text: 'Syncing...',
                classes: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-700 cursor-wait'
            };
        }
        if (syncStatus === 'success') {
            return {
                icon: 'fa-check',
                text: 'Synced',
                classes: 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-700'
            };
        }
        if (syncStatus === 'error') {
            return {
                icon: 'fa-exclamation-triangle',
                text: 'Failed',
                classes: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-700'
            };
        }
        // Idle
        return {
            icon: 'fa-cloud-upload-alt',
            text: 'Sync Now',
            classes: isSpaceVisualsActive 
                ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                : 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-gray-700 hover:border-indigo-300'
        };
    };

    const syncProps = getSyncButtonProps();

    const handleZoomIn = () => setZoomLevel(prev => Math.min(1.5, prev + 0.1));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(0.1, prev - 0.1));
    const handleResetZoom = () => setZoomLevel(1);

    const handleRocketClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowGame(true);
    };

    // STYLING: Dynamic classes based on Space Mode
    const headerBgClass = isSpaceVisualsActive 
        ? 'bg-transparent border-transparent shadow-none' // Transparent during flight
        : 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-700/50 shadow-lg';
    
    // Force white text during space flight for visibility against stars
    const textBaseClass = isSpaceVisualsActive ? 'text-white' : 'text-gray-500 dark:text-gray-400';
    const textBoldClass = isSpaceVisualsActive ? 'text-white' : 'text-gray-900 dark:text-white';
    const textAccentClass = isSpaceVisualsActive ? 'text-cyan-400' : 'text-indigo-600 dark:text-indigo-400';

    // Theme Icon Logic
    const getThemeIcon = () => {
        if (currentTheme === 'light') return 'fa-sun text-yellow-400';
        if (currentTheme === 'dark') return 'fa-moon text-indigo-500';
        return 'fa-star text-cyan-300 animate-pulse'; // Space
    };

    return (
        <header 
            className={`
                fixed top-0 left-0 right-0 z-50 
                transition-all duration-700 ease-in-out
                ${headerBgClass}
                ${isMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-[calc(100%-48px)] opacity-95'}
            `}
            style={{ 
                // Ensure it can be pulled down
                minHeight: '48px'
            }}
            onMouseEnter={() => onMenuHoverChange(true)}
            onMouseLeave={() => onMenuHoverChange(false)}
        >
            {/* DRAG HANDLE / VISIBLE BAR (Always visible at bottom of header block) */}
            <div 
                className="absolute bottom-0 left-0 right-0 h-12 flex items-center justify-between px-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-b-lg"
                onClick={() => setIsMenuLocked(!isMenuLocked)}
                title={isMenuLocked ? "Click to Unlock Menu (Auto-hide)" : "Click to Lock Menu Open"}
            >
                
                {/* Left: Rocket & Clock (Always Visible) */}
                <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                    <div 
                        ref={rocketRef}
                        className={`rocket-wrapper cursor-pointer flex items-center justify-center ${isRocketFlying ? 'rocket-flying' : 'rocket-idle'}`}
                        onMouseEnter={flyRocket} 
                        onClick={handleRocketClick} 
                        title="Click to play Tetris!"
                        style={{ width: '32px', height: '32px' }} 
                    >
                        <i 
                            className={`fas fa-rocket text-2xl ${isSpaceVisualsActive ? 'text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]' : 'text-indigo-500 dark:text-indigo-400'} relative z-10 transition-colors duration-500`} 
                            style={{ transform: 'rotate(-45deg)', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}
                        ></i>
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 translate-y-2 z-0">
                            <div className="flame-element"></div>
                        </div>
                    </div>

                    <div className="flex flex-col leading-tight">
                        <div className={`text-[10px] font-bold ${textBaseClass} uppercase tracking-wider transition-colors duration-500`}>
                            {headerDateStr}
                        </div>
                        <div className={`text-base font-black ${textAccentClass} font-mono transition-colors duration-500`}>
                            {headerTimeStr}
                        </div>
                    </div>
                </div>

                {/* Center: Pull Down Indicator */}
                <div className="flex flex-col items-center opacity-50 group-hover:opacity-100 transition-opacity">
                    <div className={`w-12 h-1 rounded-full mb-1 transition-colors ${isMenuLocked ? (isSpaceVisualsActive ? 'bg-cyan-400' : 'bg-indigo-500') : (isSpaceVisualsActive ? 'bg-white/50' : 'bg-gray-300 dark:bg-gray-600')}`}></div>
                    <span className={`text-[10px] font-bold ${isSpaceVisualsActive ? 'text-white/70' : 'text-gray-400'} uppercase tracking-widest`}>
                        {isMenuLocked ? 'Locked' : (isMenuHovered ? 'Click to Lock' : 'Menu')}
                    </span>
                </div>

                {/* Right: Essential Status (AI & Sync) */}
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    {/* Unified Sync Button (Visible in collapsed state too) */}
                    {isSheetConnected && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onManualPull(); }}
                            disabled={syncStatus === 'syncing'}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm ${syncProps.classes}`}
                            title={syncProps.text}
                        >
                            <i className={`fas ${syncProps.icon}`}></i>
                            <span className="hidden lg:inline">{syncProps.text}</span>
                        </button>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenAIAssistant(); }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${isSpaceVisualsActive ? 'bg-white/20 text-white hover:bg-white/40' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800'}`}
                        title="AI Assistant"
                    >
                        <i className="fas fa-magic"></i>
                    </button>
                    <ConnectionHealthIndicator 
                        health={connectionHealth} 
                        onOpenSettings={onOpenSettings}
                        onManualPull={onManualPull}
                        onManualPush={onManualPush}
                    />
                </div>
            </div>

            {/* EXPANDED CONTENT (Hidden when collapsed) */}
            <div className={`p-4 pb-16 transition-opacity duration-200 ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="max-w-screen-2xl mx-auto flex flex-col gap-4">
                    
                    {/* Top Row: Title & Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-y-2">
                        <h1 className={`text-xl font-bold tracking-wider hidden sm:block ${isSpaceVisualsActive ? 'text-white text-shadow-neon' : ''}`}>Task Manager</h1>
                        
                        <div className="flex items-center space-x-2 sm:space-x-3 flex-wrap gap-y-2">
                            
                            {/* View Toggles - UPDATED WITH GOALS */}
                            <div className={`${isSpaceVisualsActive ? 'bg-white/10' : 'bg-gray-200 dark:bg-gray-700'} p-0.5 rounded-lg flex items-center`}>
                                <button onClick={() => onViewModeChange('kanban')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${currentViewMode === 'kanban' ? (isSpaceVisualsActive ? 'bg-white/30 text-white shadow' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50')}`}>Board</button>
                                <button onClick={() => onViewModeChange('goals')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${currentViewMode === 'goals' ? (isSpaceVisualsActive ? 'bg-white/30 text-white shadow' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50')}`}>Goals</button>
                                <button onClick={() => onViewModeChange('calendar')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${currentViewMode === 'calendar' ? (isSpaceVisualsActive ? 'bg-white/30 text-white shadow' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50')}`}>Calendar</button>
                            </div>

                            {/* Today Toggle (Only for Board/Calendar) */}
                            {currentViewMode !== 'goals' && (
                                <button
                                    onClick={() => setIsTodayView(!isTodayView)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                                        isTodayView
                                            ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 shadow-sm'
                                            : isSpaceVisualsActive 
                                                ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                                                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                    title="Show tasks due today only"
                                >
                                    <i className="far fa-calendar-check mr-1.5"></i>
                                    Today
                                </button>
                            )}

                            {/* Zoom */}
                            <div className={`${isSpaceVisualsActive ? 'bg-white/10 text-white' : 'bg-gray-200 dark:bg-gray-700'} p-0.5 rounded-lg flex items-center gap-0.5`}>
                                <button onClick={handleZoomOut} className={`w-6 h-6 flex items-center justify-center rounded-md text-xs ${isSpaceVisualsActive ? 'hover:bg-white/20' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}><i className="fas fa-minus"></i></button>
                                <span className="text-[10px] font-bold px-1 min-w-[30px] text-center">{Math.round(zoomLevel * 100)}%</span>
                                <button onClick={handleZoomIn} className={`w-6 h-6 flex items-center justify-center rounded-md text-xs ${isSpaceVisualsActive ? 'hover:bg-white/20' : 'hover:bg-gray-300 dark:hover:bg-gray-600'}`}><i className="fas fa-plus"></i></button>
                            </div>

                            {/* Compact/Fit */}
                            <div className={`${isSpaceVisualsActive ? 'bg-white/10' : 'bg-gray-200 dark:bg-gray-700'} p-0.5 rounded-lg flex items-center gap-1`}>
                                <button onClick={onToggleCompactMode} className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${isCompactMode ? (isSpaceVisualsActive ? 'bg-white/30 text-white' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'hover:bg-gray-300')}`}>
                                    <i className={`fas ${isCompactMode ? 'fa-expand' : 'fa-compress'}`}></i>
                                </button>
                                <button onClick={onToggleFitToScreen} className={`px-2 py-1 rounded-md text-xs font-semibold transition-all ${isFitToScreen ? (isSpaceVisualsActive ? 'bg-white/30 text-white' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'hover:bg-gray-300')}`}>
                                    <i className={`fas ${isFitToScreen ? 'fa-expand-arrows-alt' : 'fa-compress-arrows-alt'}`}></i>
                                </button>
                            </div>

                            {/* Timeline Toggle */}
                            <button onClick={onToggleTimeline} className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${isTimelineVisible ? 'bg-indigo-600 text-white' : (isSpaceVisualsActive ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-gray-200 dark:bg-gray-700')}`}>
                                Timeline
                            </button>

                            {/* Utility Buttons (Theme, Reset, Export, Settings) */}
                            <div className="flex items-center gap-1">
                                <button onClick={onToggleTheme} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'} transition-colors`} title={`Current Theme: ${currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1)}`}>
                                    <i className={`fas ${getThemeIcon()}`}></i>
                                </button>
                                
                                <button onClick={onResetLayout} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'} transition-colors`} title="Reset Board Layout">
                                    <i className="fas fa-undo"></i>
                                </button>

                                <button onClick={() => exportTasksToCSV(tasks)} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'} transition-colors`} title="Export All Tasks to CSV">
                                    <i className="fas fa-file-export"></i>
                                </button>

                                <button onClick={() => onOpenSettings('general')} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'} transition-colors`}>
                                    <i className="fas fa-cog"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Gauges Row: Fuel and XP */}
                    <div className={`flex flex-col sm:flex-row gap-4 ${isSpaceVisualsActive ? 'opacity-80 hover:opacity-100 transition-opacity' : ''}`}>
                        {/* 1. Time Budget (Fuel) */}
                        <div className="w-full">
                            <LiquidGauge 
                                type="fuel"
                                label="Time Fuel"
                                value={todaysBudgetedTime}
                                max={settings.dailyBudget}
                            />
                        </div>
                        
                        {/* 2. XP Tank (Reward) */}
                        <div className="w-full">
                            <LiquidGauge 
                                type="xp"
                                label={`Level ${gamification.level}`}
                                subLabel={`Streak: ${gamification.streak.current}🔥`}
                                value={xpProgressData.currentLevelXp}
                                max={xpProgressData.levelWidth}
                            />
                        </div>
                    </div>
                </div>
            </div>
            
            {showGame && <TetrisGameModal onClose={() => setShowGame(false)} />}
        </header>
    );
};
