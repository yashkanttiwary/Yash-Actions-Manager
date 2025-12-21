
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Task, GamificationData, Settings, Status, ConnectionHealth, SettingsTab } from '../types';
import { COLUMN_STATUSES } from '../constants';
import { ConnectionHealthIndicator } from './ConnectionHealthIndicator';
import { exportTasksToCSV } from '../utils/exportUtils';

interface GoogleAuthState {
    gapiLoaded: boolean;
    gisLoaded: boolean;
    isSignedIn: boolean;
    error?: Error;
    disabled?: boolean;
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
}

export const Header: React.FC<HeaderProps> = ({ 
    tasks, isTodayView, setIsTodayView, onOpenAIAssistant, onToggleTheme, currentTheme, onResetLayout, 
    gamification, settings, onUpdateSettings, currentViewMode, onViewModeChange, 
    googleAuthState, onGoogleSignIn, onGoogleSignOut, onOpenShortcutsModal, 
    focusMode, setFocusMode, onOpenSettings, connectionHealth,
    onManualPull, onManualPush
}) => {
    const totalTasks = tasks.length;
    const progress = totalTasks > 0 ? (tasks.filter(t => t.status === 'Done').length / totalTasks) * 100 : 0;
    
    const { xp, level, streak } = gamification;
    const xpForCurrentLevel = (level - 1) * 100;
    const xpForNextLevel = level * 100;
    const xpProgress = xpForNextLevel > xpForCurrentLevel ? ((xp - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100 : 0;

    const todaysBudgetedTime = useMemo(() => {
        try {
            // Use Intl.DateTimeFormat with 'en-CA' locale to get a consistent 'YYYY-MM-DD' format.
            const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: settings.timezone });
            const todayStr = formatter.format(new Date());

            return tasks
                .filter(task => {
                    // A task must have a scheduled date to be included in the budget.
                    if (!task.scheduledStartDateTime) {
                        return false;
                    }
                    // Compare the task's scheduled date (in the user's timezone) with today's date.
                    const taskDateStr = formatter.format(new Date(task.scheduledStartDateTime));
                    return taskDateStr === todayStr;
                })
                .reduce((sum, task) => sum + (task.timeEstimate || 0), 0);
        } catch (e) {
            console.error("Failed to calculate budget, timezone may be invalid:", settings.timezone);
            return 0; // Return 0 if there's an error (e.g., invalid timezone)
        }
    }, [tasks, settings.timezone]);

    const budgetProgress = settings.dailyBudget > 0 ? (todaysBudgetedTime / settings.dailyBudget) * 100 : 0;
    
    // Check if connected and if currently syncing to update button state
    const isSheetConnected = connectionHealth.sheet.status === 'connected';
    const isSyncing = connectionHealth.sheet.message?.toLowerCase().includes('syncing');


    return (
        <header className="p-4 sm:p-3 bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border-b border-gray-300 dark:border-gray-700/50 sticky top-0 z-20">
            <div className="max-w-screen-2xl mx-auto flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                     <div className="flex items-center">
                        <i className="fas fa-rocket text-2xl text-indigo-500 dark:text-indigo-400 mr-2"></i>
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
                         <button
                            onClick={onResetLayout}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                        >
                            <i className="fas fa-th-large sm:mr-2"></i>
                            <span className="hidden sm:inline">Reset Layout</span>
                        </button>
                        <button
                            onClick={() => exportTasksToCSV(tasks)}
                            className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600"
                            title="Download tasks as CSV"
                        >
                            <i className="fas fa-file-csv sm:mr-2"></i>
                            <span className="hidden sm:inline">Export CSV</span>
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
                            <span className="hidden sm:inline">AI Assistant</span>
                        </button>
                        <div className="relative">
                            <button onClick={() => onOpenSettings('general')} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" aria-label="Open settings">
                                <i className="fas fa-cog"></i>
                            </button>
                        </div>
                        <button onClick={onToggleTheme} className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors" aria-label="Toggle theme">
                            <i className={`fas ${currentTheme === 'dark' ? 'fa-sun text-yellow-400' : 'fa-moon text-indigo-500'}`}></i>
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
        </header>
    );
};
