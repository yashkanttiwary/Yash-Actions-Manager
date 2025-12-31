
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, GamificationData, Settings, Status, ConnectionHealth, SettingsTab, Goal } from '../types';
import { ConnectionHealthIndicator } from './ConnectionHealthIndicator';
import { exportTasksToCSV } from '../utils/exportUtils';
import { getAccurateCurrentDate, initializeTimeSync } from '../services/timeService';
import { LiquidGauge } from './LiquidGauge';
import { calculateProgress } from '../services/gamificationService';
import { PomodoroTimer } from './PomodoroTimer';
import { getLegibleTextColor } from '../utils/colorUtils';
import { UNASSIGNED_GOAL_ID } from '../constants';

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
    goals: Goal[]; 
    isTodayView: boolean;
    setIsTodayView: (isToday: boolean) => void;
    onOpenAIAssistant: () => void;
    onToggleTheme: () => void;
    currentTheme: string;
    onResetLayout: () => void;
    gamification: GamificationData;
    settings: Settings;
    onUpdateSettings: (newSettings: Partial<Settings>) => void;
    currentViewMode: 'kanban' | 'calendar' | 'goals' | 'focus';
    onViewModeChange: (mode: 'kanban' | 'calendar' | 'goals' | 'focus') => void;
    googleAuthState: GoogleAuthState;
    onGoogleSignIn: () => void;
    onGoogleSignOut: () => void;
    onOpenShortcutsModal: () => void;
    focusMode: Status | 'None';
    setFocusMode: (mode: Status | 'None') => void;
    onOpenSettings: (tab?: SettingsTab) => void; 
    connectionHealth: ConnectionHealth;
    syncStatus: 'idle' | 'syncing' | 'error' | 'success'; 
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
    
    isRocketFlying: boolean;
    onRocketLaunch: (flying: boolean) => void;

    isMenuHovered: boolean;
    onMenuHoverChange: (isHovered: boolean) => void;
    
    activeFocusGoal?: Goal | null;
    onFocusGoal: (goalId: string) => void; 
    onExitFocus?: () => void;
}

export const Header: React.FC<HeaderProps> = ({ 
    tasks, goals, isTodayView, setIsTodayView, onOpenAIAssistant, onToggleTheme, currentTheme, onResetLayout, 
    gamification, settings, onUpdateSettings, currentViewMode, onViewModeChange, 
    googleAuthState, onGoogleSignIn, onGoogleSignOut, onOpenShortcutsModal, 
    focusMode, setFocusMode, onOpenSettings, connectionHealth, syncStatus,
    onManualPull, onManualPush, isCompactMode, onToggleCompactMode, isFitToScreen, onToggleFitToScreen,
    zoomLevel, setZoomLevel, audioControls, isTimelineVisible, onToggleTimeline,
    isMenuLocked, setIsMenuLocked, isRocketFlying, onRocketLaunch,
    isMenuHovered, onMenuHoverChange, activeFocusGoal, onFocusGoal, onExitFocus
}) => {
    
    const [currentTime, setCurrentTime] = useState(new Date());

    useEffect(() => {
        initializeTimeSync();
        const interval = setInterval(() => {
            setCurrentTime(getAccurateCurrentDate());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    const headerDateStr = currentTime.toLocaleDateString('en-US', { 
        weekday: 'short',
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

    const focusDropdownRef = useRef<HTMLDivElement>(null);

    // K-Mode: Removed Rocket completely.
    
    // 1. Time Budget (Total Hours) - The Fact of Time
    const todaysBudgetedTime = useMemo(() => {
        try {
            const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone });
            const todayStr = formatter.format(new Date());

            return tasks
                .filter(task => {
                    if (task.status === 'Done' || task.status === "Won't Complete" || task.status === 'Hold') return false;
                    if (task.status === 'To Do' || task.status === 'In Progress') return true;
                    if (task.scheduledStartDateTime) {
                        const taskScheduleStr = formatter.format(new Date(task.scheduledStartDateTime));
                        return taskScheduleStr === todayStr;
                    }
                    if (task.dueDate === todayStr) return true;
                    return false;
                })
                .reduce((sum, task) => sum + (task.timeEstimate || 0), 0);
        } catch (e) {
            return 0;
        }
    }, [tasks, settings.timezone]);

    // Derived State
    const isMenuOpen = isMenuHovered || isMenuLocked;
    const isSpaceVisualsActive = currentTheme === 'space';
    const isDarkMode = currentTheme === 'dark' || isSpaceVisualsActive;
    
    const isSheetConnected = connectionHealth.sheet.status === 'connected';
    
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
        return {
            icon: 'fa-cloud-upload-alt',
            text: 'Sync',
            classes: isSpaceVisualsActive 
                ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                : 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-gray-700 hover:border-indigo-300'
        };
    };

    const syncProps = getSyncButtonProps();

    const handleZoomIn = () => setZoomLevel(prev => Math.min(1.5, prev + 0.1));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(0.1, prev - 0.1));

    const [isFocusMenuOpen, setIsFocusMenuOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (focusDropdownRef.current && !focusDropdownRef.current.contains(event.target as Node)) {
                setIsFocusMenuOpen(false);
            }
        };
        if (isFocusMenuOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isFocusMenuOpen]);

    const headerBgClass = isSpaceVisualsActive 
        ? 'bg-transparent border-transparent shadow-none'
        : 'bg-white/90 dark:bg-gray-900/90 backdrop-blur-md border-b border-gray-200 dark:border-gray-700/50 shadow-lg';
    
    const textBaseClass = isSpaceVisualsActive ? 'text-white' : 'text-gray-500 dark:text-gray-400';
    const textAccentClass = isSpaceVisualsActive ? 'text-cyan-400' : 'text-indigo-600 dark:text-indigo-400';

    const getThemeIcon = () => {
        if (currentTheme === 'light') return 'fa-sun text-neutral-400';
        if (currentTheme === 'dark') return 'fa-moon text-neutral-200';
        return 'fa-star text-neutral-200'; 
    };

    const togglePomodoro = () => {
        onUpdateSettings({ showPomodoroTimer: !settings.showPomodoroTimer });
    };

    const pillTextColor = (activeFocusGoal && !isSpaceVisualsActive) 
        ? getLegibleTextColor(activeFocusGoal.color, isDarkMode) 
        : undefined;

    const titleTextColor = activeFocusGoal 
        ? getLegibleTextColor(activeFocusGoal.color, isSpaceVisualsActive || isDarkMode) 
        : undefined;

    return (
        <header 
            className={`
                fixed top-0 left-0 right-0 z-50 
                transition-all duration-700 ease-in-out
                ${headerBgClass}
                ${isMenuOpen ? 'translate-y-0 opacity-100' : '-translate-y-[calc(100%-48px)] opacity-95'}
            `}
            style={{ 
                minHeight: '48px'
            }}
            onMouseEnter={() => onMenuHoverChange(true)}
            onMouseLeave={() => onMenuHoverChange(false)}
        >
            {/* DRAG HANDLE / VISIBLE BAR */}
            <div 
                className="absolute bottom-0 left-0 right-0 h-12 flex items-center justify-between px-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors rounded-b-lg"
                onClick={() => setIsMenuLocked(!isMenuLocked)}
                title={isMenuLocked ? "Unlock Menu" : "Lock Menu"}
            >
                
                {/* Left: Clock & Context Pill (Rocket Removed) */}
                <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-col leading-tight pl-2">
                        <div className={`text-[10px] font-bold ${textBaseClass} uppercase tracking-wider transition-colors duration-500`}>
                            {headerDateStr}
                        </div>
                        <div className={`text-base font-black ${textAccentClass} font-mono transition-colors duration-500`}>
                            {headerTimeStr}
                        </div>
                    </div>

                    {/* Focus Context Pill */}
                    <div className="relative flex items-center gap-2 ml-2 pl-4 border-l border-gray-300 dark:border-gray-700 h-8 animate-fadeIn" ref={focusDropdownRef}>
                        <button
                            onClick={() => setIsFocusMenuOpen(!isFocusMenuOpen)}
                            className={`flex items-center gap-2 px-3 py-1 rounded-full border shadow-sm backdrop-blur-sm transition-all group hover:brightness-110 active:scale-95 cursor-pointer ${
                                !activeFocusGoal 
                                    ? (isSpaceVisualsActive ? 'bg-white/10 border-white/20 text-white' : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700') 
                                    : ''
                            }`}
                            style={activeFocusGoal ? { 
                                backgroundColor: isSpaceVisualsActive ? 'rgba(255,255,255,0.1)' : activeFocusGoal.color + '25', 
                                borderColor: activeFocusGoal.color + '40'
                            } : {}}
                        >
                            <i 
                                className={`fas fa-layer-group text-xs ${activeFocusGoal ? '' : 'text-gray-400 dark:text-gray-500'}`} 
                                style={{ color: activeFocusGoal ? (pillTextColor || activeFocusGoal.color) : undefined }}
                            ></i>
                            <span 
                                className={`text-xs font-bold truncate max-w-[120px] hidden sm:block ${isSpaceVisualsActive ? 'text-white' : ''}`}
                                style={{ color: pillTextColor }}
                            >
                                {activeFocusGoal ? activeFocusGoal.title : 'All Contexts'}
                            </span>
                            <i className={`fas fa-chevron-down text-[10px] ml-1 transition-transform duration-200 ${isFocusMenuOpen ? 'rotate-180' : ''} ${isSpaceVisualsActive ? 'text-white/70' : 'text-gray-500'}`} style={{ color: pillTextColor }}></i>
                        </button>
                        
                        {activeFocusGoal && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onExitFocus?.(); }}
                                className={`w-5 h-5 flex items-center justify-center rounded-full hover:bg-black/10 dark:hover:bg-white/20 transition-colors ml-1 ${isSpaceVisualsActive ? 'text-white/70 hover:text-white' : 'text-gray-400 hover:text-red-500'}`}
                                title="Show All"
                            >
                                <i className="fas fa-times text-xs"></i>
                            </button>
                        )}

                        {/* Dropdown Menu */}
                        {isFocusMenuOpen && (
                            <div className={`absolute top-full left-4 mt-2 w-60 rounded-xl shadow-2xl border backdrop-blur-xl z-[100] overflow-hidden ${
                                isSpaceVisualsActive 
                                    ? 'bg-black/80 border-white/20 text-white' 
                                    : 'bg-white/95 dark:bg-gray-900/95 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-100'
                            }`}>
                                <div className={`p-2 text-[10px] font-bold uppercase tracking-widest opacity-60 border-b mb-1 ${isSpaceVisualsActive ? 'border-white/10' : 'border-gray-200 dark:border-gray-700'}`}>Filter by Context</div>
                                <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1 space-y-1">
                                    <button
                                        onClick={() => { onFocusGoal(UNASSIGNED_GOAL_ID); setIsFocusMenuOpen(false); }}
                                        className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                                            activeFocusGoal?.id === UNASSIGNED_GOAL_ID 
                                                ? (isSpaceVisualsActive ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700') 
                                                : 'hover:bg-black/5 dark:hover:bg-white/5'
                                        }`}
                                    >
                                        <div className="w-2 h-2 rounded-full bg-slate-500 shadow-sm"></div>
                                        <span className="text-xs font-semibold truncate flex-1">General</span>
                                        {activeFocusGoal?.id === UNASSIGNED_GOAL_ID && <i className="fas fa-check text-xs opacity-80"></i>}
                                    </button>

                                    {goals.map(goal => (
                                        <button
                                            key={goal.id}
                                            onClick={() => { onFocusGoal(goal.id); setIsFocusMenuOpen(false); }}
                                            className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                                                activeFocusGoal?.id === goal.id 
                                                    ? (isSpaceVisualsActive ? 'bg-white/20' : 'bg-gray-100 dark:bg-gray-700') 
                                                    : 'hover:bg-black/5 dark:hover:bg-white/5'
                                            }`}
                                        >
                                            <div className="w-2 h-2 rounded-full shadow-sm" style={{ backgroundColor: goal.color }}></div>
                                            <span className="text-xs font-semibold truncate flex-1">{goal.title}</span>
                                            {activeFocusGoal?.id === goal.id && <i className="fas fa-check text-xs opacity-80"></i>}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Center: Pull Down Indicator */}
                <div className="flex flex-col items-center opacity-50 group-hover:opacity-100 transition-opacity">
                    <div className={`w-12 h-1 rounded-full mb-1 transition-colors ${isMenuLocked ? (isSpaceVisualsActive ? 'bg-cyan-400' : 'bg-indigo-500') : (isSpaceVisualsActive ? 'bg-white/50' : 'bg-gray-300 dark:bg-gray-600')}`}></div>
                </div>

                {/* Right: Essential Status (AI & Sync) & NOW TODAY BUTTON */}
                <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    
                    {currentViewMode !== 'goals' && currentViewMode !== 'focus' && (
                        <button
                            onClick={(e) => { e.stopPropagation(); setIsTodayView(!isTodayView); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all border shadow-sm ${
                                isTodayView
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                                    : isSpaceVisualsActive 
                                        ? 'bg-white/10 text-white border-white/20 hover:bg-white/20'
                                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                            }`}
                            title="Show tasks due today only"
                        >
                            <i className="far fa-calendar-check"></i>
                            <span className="hidden sm:inline">Today</span>
                        </button>
                    )}

                    <button
                        onClick={(e) => { e.stopPropagation(); onOpenAIAssistant(); }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 group ${isSpaceVisualsActive ? 'bg-white/20 text-white hover:bg-white/40' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-800 hover:shadow-md'}`}
                        title="AI Assistant"
                    >
                        <i className="fas fa-brain text-sm transition-transform duration-300 group-hover:scale-110"></i>
                    </button>

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

                    <ConnectionHealthIndicator 
                        health={connectionHealth} 
                        onOpenSettings={onOpenSettings}
                        onManualPull={onManualPull}
                        onManualPush={onManualPush}
                    />
                </div>
            </div>

            {/* EXPANDED CONTENT */}
            <div className={`p-4 pb-14 transition-opacity duration-200 ${isMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                <div className="max-w-screen-2xl mx-auto flex flex-col gap-4">
                    
                    {/* Top Row: Title & Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-y-2">
                        {activeFocusGoal ? (
                            <h1 className={`text-xl font-bold tracking-wider hidden sm:block flex items-center gap-2 ${isSpaceVisualsActive ? 'text-white' : 'text-gray-900 dark:text-white'}`}>
                                <i className="fas fa-layer-group text-gray-500"></i>
                                CONTEXT: <span style={{ color: titleTextColor }}>{activeFocusGoal.title}</span>
                                <button 
                                    onClick={onExitFocus} 
                                    className="ml-3 text-xs bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded text-gray-600 dark:text-gray-300 hover:bg-red-100 hover:text-red-500 transition-colors"
                                >
                                    EXIT
                                </button>
                            </h1>
                        ) : (
                            <h1 className={`text-xl font-bold tracking-wider hidden sm:block ${isSpaceVisualsActive ? 'text-white' : ''}`}>The Mirror</h1>
                        )}
                        
                        <div className="flex items-center space-x-2 sm:space-x-3 flex-wrap gap-y-2">
                            
                            {/* View Toggles */}
                            <div className={`${isSpaceVisualsActive ? 'bg-white/10' : 'bg-gray-200 dark:bg-gray-700'} p-0.5 rounded-lg flex items-center`}>
                                <button onClick={() => onViewModeChange('kanban')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${currentViewMode === 'kanban' ? (isSpaceVisualsActive ? 'bg-white/30 text-white shadow' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50')}`}>Board</button>
                                <button onClick={() => onViewModeChange('focus')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${currentViewMode === 'focus' ? (isSpaceVisualsActive ? 'bg-white/30 text-white shadow' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50')}`}>
                                    <i className="fas fa-eye text-[10px]"></i> Attention
                                </button>
                                <button onClick={() => onViewModeChange('goals')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${currentViewMode === 'goals' ? (isSpaceVisualsActive ? 'bg-white/30 text-white shadow' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50')}`}>Contexts</button>
                                <button onClick={() => onViewModeChange('calendar')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${currentViewMode === 'calendar' ? (isSpaceVisualsActive ? 'bg-white/30 text-white shadow' : 'bg-white dark:bg-gray-800 shadow') : (isSpaceVisualsActive ? 'text-white/60 hover:bg-white/10' : 'text-gray-600 dark:text-gray-400 hover:bg-gray-300/50')}`}>Calendar</button>
                            </div>

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

                            {/* Utility Buttons */}
                            <div className="flex items-center gap-1">
                                <button onClick={onToggleTheme} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'} transition-colors`}>
                                    <i className={`fas ${getThemeIcon()}`}></i>
                                </button>
                                
                                <button onClick={togglePomodoro} className={`w-8 h-8 rounded-lg flex items-center justify-center ${settings.showPomodoroTimer ? 'bg-indigo-600 text-white' : (isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300')} transition-colors`}>
                                    <i className="fas fa-stopwatch"></i>
                                </button>

                                <button onClick={onResetLayout} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'} transition-colors`}>
                                    <i className="fas fa-undo"></i>
                                </button>

                                <button onClick={() => exportTasksToCSV(tasks)} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'} transition-colors`}>
                                    <i className="fas fa-file-export"></i>
                                </button>

                                <button onClick={() => onOpenSettings('general')} className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSpaceVisualsActive ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-gray-200 dark:bg-gray-700 hover:bg-gray-300'} transition-colors`}>
                                    <i className="fas fa-cog"></i>
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Gauge Row: Only Time Estimate (Fact). No XP (Fiction). */}
                    <div className={`grid grid-cols-1 ${settings.showPomodoroTimer ? 'md:grid-cols-2 lg:grid-cols-3' : 'md:grid-cols-1 max-w-sm'} gap-4 ${isSpaceVisualsActive ? 'opacity-80 hover:opacity-100 transition-opacity' : ''}`}>
                        {/* Time Gauge (Factual) */}
                        <div className="w-full">
                            <LiquidGauge 
                                type="fuel"
                                label="Capacity"
                                value={todaysBudgetedTime}
                                max={settings.dailyBudget}
                            />
                        </div>
                        
                        {/* Pomodoro Timer */}
                        {settings.showPomodoroTimer && (
                            <div className="w-full">
                                <PomodoroTimer settings={settings} className="w-full h-full min-h-[50px]" />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </header>
    );
};
