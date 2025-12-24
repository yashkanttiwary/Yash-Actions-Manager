import React, { useMemo, useState, useRef, useEffect, useCallback, useLayoutEffect } from 'react';
import { Task } from '../types';
import { STATUS_STYLES } from '../constants';
import { getAccurateCurrentDate, initializeTimeSync } from '../services/timeService';
import { DependencyLines } from './DependencyLines';

interface TimelineGanttProps {
    tasks: Task[];
    onEditTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void; 
    isVisible: boolean;
    timezone?: string; // Passed from App settings
}

type ViewMode = 'Day' | 'Week' | 'Month';

interface DragState {
    taskId: string;
    type: 'MOVE' | 'RESIZE';
    startX: number;
    originalStart: number; // timestamp
    originalEnd: number; // timestamp
}

interface ZoomConfig {
    unit: 'minute' | 'hour' | 'day' | 'week';
    step: number;
    label: string;
    width: number;
    default?: boolean;
}

interface LineCoordinate {
  start: { x: number; y: number };
  end: { x: number; y: number };
  isBlocked: boolean;
}

const ZOOM_LEVELS: Record<ViewMode, ZoomConfig[]> = {
    'Day': [
        { unit: 'minute', step: 15, label: '15m', width: 60 },
        { unit: 'minute', step: 30, label: '30m', width: 60 },
        { unit: 'hour', step: 1, label: '1h', width: 100, default: true }, // Wider for better readability
        { unit: 'hour', step: 2, label: '2h', width: 80 },
        { unit: 'hour', step: 4, label: '4h', width: 80 },
        { unit: 'hour', step: 6, label: '6h', width: 80 }
    ],
    'Week': [
        { unit: 'day', step: 1, label: '1d', width: 150, default: true }
    ],
    'Month': [
        { unit: 'day', step: 1, label: '1d', width: 45, default: true }
    ]
};

// --- ROBUST TIMEZONE HELPERS ---

// Helper to get the offset of a timezone in minutes at a specific date
const getTimezoneOffset = (date: Date, timeZone: string) => {
    const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
    const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
    return (tzDate.getTime() - utcDate.getTime()) / 60000;
};

// Get the start of the day in the specific timezone
const getStartOfDayInZone = (date: Date, timeZone: string): Date => {
    // 1. Get the components in the target timezone
    const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour12: false
    });
    const parts = fmt.formatToParts(date);
    const p: any = {};
    parts.forEach(({type, value}) => p[type] = value);
    
    // 2. Create a UTC date from these components (effectively "shifting" time)
    // p.month is 1-based string
    const shifted = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0));
    
    // 3. Find the offset difference between UTC and Target Zone at that time
    // We assume the offset is stable for the start of the day calculation usually
    const offset = getTimezoneOffset(shifted, timeZone);
    
    // 4. Adjust to get back to the absolute timestamp
    // If offset is +9h (JST), shifted is 00:00 UTC. Real JST 00:00 is 9 hours earlier in UTC.
    // Actually, `getTimezoneOffset` logic above:
    // If JST (00:00), `tzDate` is 00:00, `utcDate` is 00:00. Diff 0.
    // This helper logic is tricky. Let's use a simpler iteration method.
    
    let d = new Date(date);
    d.setMilliseconds(0);
    d.setSeconds(0);
    d.setMinutes(0);
    
    // Roll back hours until hour is 0 in TZ
    let safety = 25;
    while (safety > 0) {
        const hour = parseInt(d.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', hour12: false }));
        if (hour === 0) break;
        d.setTime(d.getTime() - (60 * 60 * 1000));
        safety--;
    }
    // Just in case we missed due to DST
    if (parseInt(d.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', hour12: false })) !== 0) {
        // Fallback: Use the shifted logic if iteration failed
        return new Date(shifted.getTime() - (offset * 60 * 1000)); // Rough estimation
    }
    return d;
};

const getStartOfWeekInZone = (date: Date, timeZone: string): Date => {
    const startOfDay = getStartOfDayInZone(date, timeZone);
    // We want Monday start.
    // Intl weekday: Sunday is usually dependent on locale but let's check
    const d = new Date(startOfDay);
    const day = d.getDay(); // This is UTC day. Not useful.
    
    // Use string parsing for weekday index (Sun=0, Mon=1...)
    const weekdayStr = d.toLocaleDateString('en-US', { timeZone, weekday: 'short' });
    const map: any = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const tzDay = map[weekdayStr];
    
    const diff = tzDay === 0 ? -6 : 1 - tzDay; // Monday is 1. If Sunday(0), go back 6 days.
    d.setDate(d.getDate() + diff);
    // Re-align to start of day in case DST shift happened during day subtraction
    return getStartOfDayInZone(d, timeZone);
};

const getStartOfMonthInZone = (date: Date, timeZone: string): Date => {
    const d = getStartOfDayInZone(date, timeZone);
    // Iterate back until day is 1
    let safety = 32;
    while (safety > 0) {
        const day = parseInt(d.toLocaleDateString('en-US', { timeZone, day: 'numeric' }));
        if (day === 1) break;
        d.setDate(d.getDate() - 1);
        safety--;
    }
    return getStartOfDayInZone(d, timeZone);
};


export const TimelineGantt: React.FC<TimelineGanttProps> = ({ tasks, onEditTask, onUpdateTask, isVisible, timezone = 'Asia/Kolkata' }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('Week'); 
    const [zoomIndex, setZoomIndex] = useState(2); 
    const [referenceDate, setReferenceDate] = useState(new Date());
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [accurateNow, setAccurateNow] = useState(new Date());
    const [dependencyLines, setDependencyLines] = useState<LineCoordinate[]>([]);
    
    // Local override for tasks while dragging (for smooth UI)
    const [optimisticTaskOverride, setOptimisticTaskOverride] = useState<{id: string, start: number, end: number} | null>(null);

    // Initialize Time Service & Tick
    useEffect(() => {
        initializeTimeSync(); // Start fetching accurate time
        const interval = setInterval(() => {
            setAccurateNow(getAccurateCurrentDate());
        }, 1000); // Update every second for the clock display
        return () => clearInterval(interval);
    }, []);

    // Reset Zoom when ViewMode changes
    useEffect(() => {
        const levels = ZOOM_LEVELS[viewMode];
        const defaultIdx = levels.findIndex(l => l.default);
        setZoomIndex(defaultIdx >= 0 ? defaultIdx : 0);
    }, [viewMode]);

    const handleZoomIn = () => {
        setZoomIndex(prev => Math.max(0, prev - 1));
    };

    const handleZoomOut = () => {
        setZoomIndex(prev => Math.min(ZOOM_LEVELS[viewMode].length - 1, prev + 1));
    };

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.value) return;
        const val = e.target.value;
        const parts = val.split('-').map(Number);
        
        // We set the reference date to local time constructed from input, 
        // the grid logic will handle the timezone alignment.
        if (parts.length === 2) {
            const [y, m] = parts;
            setReferenceDate(new Date(y, m - 1, 1));
        } else if (parts.length === 3) {
            const [y, m, d] = parts;
            setReferenceDate(new Date(y, m - 1, d));
        }
    };

    // Calculate View Range
    const { viewStartDate, viewEndDate, columns, tickWidth, totalWidth, msPerPixel } = useMemo(() => {
        let start: Date;
        
        // 1. Calculate Start Date based on Timezone
        if (viewMode === 'Day') start = getStartOfDayInZone(referenceDate, timezone);
        else if (viewMode === 'Week') start = getStartOfWeekInZone(referenceDate, timezone);
        else start = getStartOfMonthInZone(referenceDate, timezone);

        // 2. Calculate End Date
        const end = new Date(start);
        if (viewMode === 'Day') end.setDate(end.getDate() + 1); // 24h
        else if (viewMode === 'Week') end.setDate(end.getDate() + 7); // 7 days
        else {
            // End of month is start of next month
            end.setMonth(end.getMonth() + 1);
            // Re-align to start of day in zone to handle DST shifts cleanly
            const cleanEnd = getStartOfDayInZone(end, timezone);
            end.setTime(cleanEnd.getTime());
        }
        
        // Subtract 1ms to include up to X:59:59
        end.setTime(end.getTime() - 1);

        const config = ZOOM_LEVELS[viewMode][zoomIndex] || ZOOM_LEVELS[viewMode][0];
        
        // Calculate Duration of one tick
        let tickMs = 0;
        if (config.unit === 'minute') tickMs = config.step * 60 * 1000;
        if (config.unit === 'hour') tickMs = config.step * 60 * 60 * 1000;
        if (config.unit === 'day') tickMs = config.step * 24 * 60 * 60 * 1000;
        if (config.unit === 'week') tickMs = config.step * 7 * 24 * 60 * 60 * 1000;

        const msPerPx = tickMs / config.width;
        
        let cols: { label: string, subLabel?: string, isToday?: boolean, date: Date }[] = [];
        
        const current = new Date(start);
        const endMs = end.getTime();
        
        // Use Accurate Time for "Today" check
        const nowInZoneStr = accurateNow.toLocaleDateString('en-US', { timeZone: timezone });

        while (current.getTime() <= endMs) {
            const dateObj = new Date(current);
            let label = '';
            let subLabel = '';

            // Formatting Labels using TimeZone
            if (config.unit === 'minute' || config.unit === 'hour') {
                label = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
                // Check if midnight in timezone
                const hourInZone = parseInt(dateObj.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }));
                if (hourInZone === 0 && (config.unit === 'hour' || dateObj.getMinutes() === 0)) {
                    subLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
                }
            } else {
                label = dateObj.toLocaleDateString('en-US', { day: 'numeric', timeZone: timezone });
                subLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
                
                if (config.unit === 'week') {
                    // Approximate week number logic for display
                    label = `Week of ${dateObj.getDate()}`;
                    subLabel = dateObj.toLocaleDateString('en-US', { month: 'short', timeZone: timezone });
                }
            }

            const colDateStr = dateObj.toLocaleDateString('en-US', { timeZone: timezone });

            cols.push({
                label,
                subLabel,
                isToday: colDateStr === nowInZoneStr,
                date: dateObj
            });

            // Advance
            // WARNING: Simple setHours/setDate might drift in local time across DST boundaries.
            // But since we use getStartOfDayInZone which anchors correctly, simple addition is usually safe for short ranges.
            // For robustness, we add milliseconds directly.
            current.setTime(current.getTime() + tickMs);
        }

        return { 
            viewStartDate: start, 
            viewEndDate: end, 
            columns: cols, 
            tickWidth: config.width,
            totalWidth: cols.length * config.width,
            msPerPixel: msPerPx
        };
    }, [viewMode, referenceDate, zoomIndex, accurateNow, timezone]);


    // --- DRAG HANDLERS ---

    const handleMouseDown = (e: React.MouseEvent, task: Task, type: 'MOVE' | 'RESIZE', metrics: { start: number, end: number }) => {
        e.stopPropagation();
        e.preventDefault(); 
        
        setDragState({
            taskId: task.id,
            type,
            startX: e.clientX,
            originalStart: metrics.start,
            originalEnd: metrics.end
        });
        setOptimisticTaskOverride({ id: task.id, start: metrics.start, end: metrics.end });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragState) return;

        const deltaPixels = e.clientX - dragState.startX;
        const deltaMs = deltaPixels * msPerPixel;

        let newStart = dragState.originalStart;
        let newEnd = dragState.originalEnd;

        // Snap to grid based on current zoom level
        const config = ZOOM_LEVELS[viewMode][zoomIndex];
        let snapMs = 15 * 60 * 1000; // Default 15m
        
        if (config.unit === 'minute') snapMs = config.step * 60 * 1000;
        if (config.unit === 'hour') snapMs = config.step * 60 * 60 * 1000;
        if (config.unit === 'day') snapMs = 24 * 60 * 60 * 1000;
        if (config.unit === 'day' || config.unit === 'week') snapMs = 60 * 60 * 1000; 

        if (dragState.type === 'MOVE') {
            newStart = Math.round((dragState.originalStart + deltaMs) / snapMs) * snapMs;
            const duration = dragState.originalEnd - dragState.originalStart;
            newEnd = newStart + duration;
        } else {
            // Resize
            newEnd = Math.round((dragState.originalEnd + deltaMs) / snapMs) * snapMs;
            // Min duration 15 mins
            if (newEnd - newStart < 15 * 60 * 1000) {
                newEnd = newStart + (15 * 60 * 1000);
            }
        }

        setOptimisticTaskOverride({ id: dragState.taskId, start: newStart, end: newEnd });

    }, [dragState, msPerPixel, viewMode, zoomIndex]);

    const handleMouseUp = useCallback(() => {
        if (!dragState || !optimisticTaskOverride) {
            setDragState(null);
            setOptimisticTaskOverride(null);
            return;
        }

        const task = tasks.find(t => t.id === dragState.taskId);
        if (task) {
            const newStartObj = new Date(optimisticTaskOverride.start);
            const newEndObj = new Date(optimisticTaskOverride.end);

            // FIX CRIT-001: Update timeEstimate (duration)
            const durationMs = optimisticTaskOverride.end - optimisticTaskOverride.start;
            const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;

            const updatedTask = {
                ...task,
                scheduledStartDateTime: newStartObj.toISOString(),
                timeEstimate: durationHours,
                // FIX MED-001: Due date reflects the DATE of the end time
                dueDate: newEndObj.toISOString().split('T')[0] 
            };
            onUpdateTask(updatedTask);
        }

        setDragState(null);
        setOptimisticTaskOverride(null);
    }, [dragState, optimisticTaskOverride, tasks, onUpdateTask]);

    // Attach global listeners for drag
    useEffect(() => {
        if (dragState) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = dragState.type === 'RESIZE' ? 'ew-resize' : 'grabbing';
        } else {
            document.body.style.cursor = 'default';
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [dragState, handleMouseMove, handleMouseUp]);


    // --- RENDERING HELPERS ---

    // Filter and Process Tasks
    const visibleTasks = useMemo(() => {
        const viewStartMs = viewStartDate.getTime();
        const viewEndMs = viewEndDate.getTime();

        return tasks
            .filter(t => t.status !== 'Done' && t.status !== "Won't Complete")
            .map(task => {
                // If this is the task being dragged, use override values
                if (optimisticTaskOverride && optimisticTaskOverride.id === task.id) {
                    return { ...task, startMs: optimisticTaskOverride.start, endMs: optimisticTaskOverride.end, isDragging: true };
                }

                // Normal calculation
                let startMs = task.scheduledStartDateTime 
                    ? new Date(task.scheduledStartDateTime).getTime() 
                    : new Date(task.createdDate).getTime();
                
                // Fallback end calculation
                let endMs = new Date(task.dueDate).getTime();
                const dueDateObj = new Date(task.dueDate);
                
                // If pure date (00:00), treat as end of day
                if (dueDateObj.getHours() === 0 && dueDateObj.getMinutes() === 0) {
                    endMs += (24 * 60 * 60 * 1000) - 1; 
                }

                // Priority: 1. scheduledStart + timeEstimate, 2. scheduledStart + 1h, 3. dueDate
                if (task.scheduledStartDateTime && task.timeEstimate) {
                     endMs = startMs + (task.timeEstimate * 60 * 60 * 1000);
                } else if (task.scheduledStartDateTime) {
                     endMs = startMs + (60 * 60 * 1000); // Default 1h
                }

                if (startMs > endMs) startMs = endMs - (60 * 60 * 1000); 

                return { ...task, startMs, endMs, isDragging: false };
            })
            .filter(({ startMs, endMs }) => {
                return startMs < viewEndMs && endMs > viewStartMs;
            })
            .sort((a, b) => a.startMs - b.startMs); // Sort by start time
    }, [tasks, viewStartDate, viewEndDate, optimisticTaskOverride]);

    const getBarMetrics = (taskStartMs: number, taskEndMs: number) => {
        const viewStartMs = viewStartDate.getTime();
        
        // Position relative to start of view
        const msFromStart = taskStartMs - viewStartMs;
        const durationMs = taskEndMs - taskStartMs;

        const left = msFromStart / msPerPixel;
        const width = durationMs / msPerPixel;

        return { left, width };
    };

    // IMP-001: Calculate Dependency Lines
    useEffect(() => {
        if (!visibleTasks.length) {
            setDependencyLines([]);
            return;
        }

        const lines: LineCoordinate[] = [];
        const taskMap = new Map<string, { startMs: number, endMs: number, index: number }>();
        
        // Map visible tasks for O(1) lookup
        visibleTasks.forEach((t, i) => taskMap.set(t.id, { startMs: t.startMs, endMs: t.endMs, index: i }));

        visibleTasks.forEach((task, index) => {
            if (task.dependencies && task.dependencies.length > 0) {
                task.dependencies.forEach(depId => {
                    const depInfo = taskMap.get(depId);
                    // Only draw if dependency is also visible (simplification for MVP)
                    if (depInfo) {
                        const startTask = depInfo;
                        const endTask = { startMs: task.startMs, endMs: task.endMs, index: index };

                        // Calculate Coordinates
                        // X: Time axis
                        const startX = getBarMetrics(startTask.startMs, startTask.endMs).left + getBarMetrics(startTask.startMs, startTask.endMs).width;
                        const endX = getBarMetrics(endTask.startMs, endTask.endMs).left;

                        // Y: Row axis (Row Height + Gap)
                        // Assuming row height 36px + 4px margin = 40px per row.
                        // Add header offset (40px header + 20px padding) = 60px roughly
                        const ROW_HEIGHT = 40; 
                        const HEADER_OFFSET = 20; // approximate center of row relative to container content
                        const startY = (startTask.index * ROW_HEIGHT) + HEADER_OFFSET;
                        const endY = (endTask.index * ROW_HEIGHT) + HEADER_OFFSET;

                        lines.push({
                            start: { x: startX, y: startY },
                            end: { x: endX, y: endY },
                            isBlocked: true // Gantt dependencies always imply blocking order
                        });
                    }
                });
            }
        });
        setDependencyLines(lines);
    }, [visibleTasks, viewStartDate, msPerPixel]);


    const handleNavigate = (direction: -1 | 1) => {
        const newDate = new Date(referenceDate);
        if (viewMode === 'Day') newDate.setDate(newDate.getDate() + direction);
        if (viewMode === 'Week') newDate.setDate(newDate.getDate() + (direction * 7));
        if (viewMode === 'Month') newDate.setMonth(newDate.getMonth() + direction);
        setReferenceDate(newDate);
    };

    const handleToday = () => {
        setReferenceDate(new Date());
    };

    // FIX LOW-001: Scroll to 8 AM on Day view load (Timezone Aware)
    useEffect(() => {
        if (isVisible && scrollContainerRef.current && viewMode === 'Day') {
            // Find 8:00 AM in target timezone relative to viewStart
            // viewStartDate is 00:00 TZ. 8 AM is simply 8 hours later.
            const hour8ms = 8 * 60 * 60 * 1000;
            const pixels = hour8ms / msPerPixel;
            scrollContainerRef.current.scrollLeft = pixels; 
        }
    }, [isVisible, viewMode, msPerPixel]); // Dependencies ensure it runs after calc

    const getHeaderText = () => {
        const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric', timeZone: timezone };
        if (viewMode === 'Day') return referenceDate.toLocaleDateString('en-US', { ...opts, day: 'numeric', weekday: 'short' });
        if (viewMode === 'Week') {
            const end = new Date(viewEndDate);
            return `${viewStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })}`;
        }
        return referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: timezone });
    };

    // Formatted current time string for display (Date, Day Month Year)
    const getFormattedCurrentTime = () => {
        return accurateNow.toLocaleDateString('en-GB', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            timeZone: timezone
        });
    };

    // Get current value for date inputs
    const getDateInputValue = () => {
        const y = referenceDate.getFullYear();
        const m = String(referenceDate.getMonth() + 1).padStart(2, '0');
        const d = String(referenceDate.getDate()).padStart(2, '0');
        if (viewMode === 'Month') return `${y}-${m}`;
        return `${y}-${m}-${d}`;
    };

    if (!isVisible) return null;

    return (
        <div className="w-full bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm transition-all duration-500 ease-in-out animate-slideDown overflow-hidden flex flex-col mb-6 rounded-xl relative z-10 flex-shrink-0 select-none">
            {/* --- CONTROLS HEADER --- */}
            <div className="flex flex-col xl:flex-row justify-between items-center p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 gap-3">
                <div className="flex flex-wrap items-center gap-4">
                    <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                        <i className="fas fa-stream text-indigo-500"></i> <span className="hidden sm:inline">Timeline View</span>
                    </h3>
                    <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                        {(['Day', 'Week', 'Month'] as ViewMode[]).map(m => (
                            <button
                                key={m}
                                onClick={() => setViewMode(m)}
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${viewMode === m ? 'bg-white dark:bg-gray-600 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'}`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                    {/* Zoom Controls (Only for Day View) */}
                    {viewMode === 'Day' && (
                        <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                            <button 
                                onClick={handleZoomOut} 
                                disabled={zoomIndex >= ZOOM_LEVELS[viewMode].length - 1}
                                className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-xs"
                                title="Zoom Out"
                            >
                                <i className="fas fa-search-minus"></i>
                            </button>
                            <span className="text-[10px] font-bold px-2 min-w-[30px] text-center text-gray-500 dark:text-gray-400">
                                {ZOOM_LEVELS[viewMode][zoomIndex].label}
                            </span>
                            <button 
                                onClick={handleZoomIn} 
                                disabled={zoomIndex <= 0}
                                className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-xs"
                                title="Zoom In"
                            >
                                <i className="fas fa-search-plus"></i>
                            </button>
                        </div>
                    )}
                </div>

                {/* CURRENT TIME DISPLAY */}
                <div className="hidden lg:flex items-center px-4 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-full">
                    <i className="far fa-clock text-indigo-500 mr-2 animate-pulse"></i>
                    <span className="text-xs font-mono font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wide">
                        {getFormattedCurrentTime()}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <div className="flex items-center bg-white dark:bg-gray-700 rounded-md border border-gray-300 dark:border-gray-600 px-2 py-1 shadow-sm">
                        <input 
                            type={viewMode === 'Month' ? 'month' : 'date'}
                            value={getDateInputValue()}
                            onChange={handleDateChange}
                            className="bg-transparent border-none text-xs font-bold text-gray-700 dark:text-gray-200 focus:outline-none cursor-pointer"
                        />
                    </div>

                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 min-w-[140px] text-center hidden sm:block">
                        {getHeaderText()}
                    </span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => handleNavigate(-1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors">
                            <i className="fas fa-chevron-left text-xs"></i>
                        </button>
                        <button onClick={handleToday} className="px-2 py-1 text-xs font-semibold rounded bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors">
                            Today
                        </button>
                        <button onClick={() => handleNavigate(1)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 transition-colors">
                            <i className="fas fa-chevron-right text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>

            {/* --- TIMELINE BODY --- */}
            <div 
                ref={scrollContainerRef}
                className="overflow-x-auto relative custom-scrollbar bg-gray-50/50 dark:bg-black/20"
                style={{ maxHeight: '350px', minHeight: '200px' }}
            >
                <div style={{ width: `${totalWidth}px`, minWidth: '100%' }} className="relative">
                    
                    {/* Header Row */}
                    <div className="flex border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-800 z-20 shadow-sm h-10">
                        {columns.map((col, i) => (
                            <div 
                                key={i} 
                                className={`flex-shrink-0 border-r border-gray-200 dark:border-gray-700 p-2 text-center flex flex-col justify-center ${col.isToday ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                                style={{ width: `${tickWidth}px` }}
                            >
                                <span className={`text-[10px] font-bold uppercase ${col.isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                    {col.subLabel} {col.label}
                                </span>
                            </div>
                        ))}
                    </div>

                    {/* GRID BACKGROUND LAYER */}
                    <div className="absolute top-10 bottom-0 left-0 flex pointer-events-none z-0">
                        {columns.map((col, i) => (
                            <div 
                                key={`grid-${i}`}
                                className={`flex-shrink-0 border-r border-gray-200/60 dark:border-gray-700/40 h-full ${col.isToday ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                                style={{ width: `${tickWidth}px` }}
                            >
                                {/* Half-tick for precision if width allows */}
                                {tickWidth > 100 && (
                                    <div className="w-px h-full bg-gray-100/50 dark:bg-gray-800/30 mx-auto"></div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* CURRENT TIME INDICATOR (Using Accurate Time) */}
                    {viewMode !== 'Month' && (() => {
                        const nowMs = accurateNow.getTime();
                        if (nowMs >= viewStartDate.getTime() && nowMs <= viewEndDate.getTime()) {
                            const diff = nowMs - viewStartDate.getTime();
                            const left = diff / msPerPixel;
                            return (
                                <div 
                                    className="absolute top-10 bottom-0 border-l-2 border-red-500 z-30 pointer-events-none opacity-80"
                                    style={{ left: `${left}px` }}
                                >
                                    <div className="w-2.5 h-2.5 bg-red-500 rounded-full -ml-[5.5px] -mt-1 shadow-sm"></div>
                                    <div className="absolute top-0 ml-1.5 text-[9px] font-bold text-red-500 bg-white/80 dark:bg-black/80 px-1 rounded shadow-sm border border-red-200 dark:border-red-900">
                                        Now
                                    </div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {/* DEPENDENCY LINES LAYER (IMP-001) */}
                    <div className="absolute top-10 left-0 w-full h-full pointer-events-none z-10 opacity-60">
                        <DependencyLines lines={dependencyLines} />
                    </div>

                    {/* TASK ROWS LAYER */}
                    <div className="relative pt-4 pb-12 z-20 min-h-[200px]">
                        {visibleTasks.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm italic pointer-events-none">
                                <i className="far fa-calendar-times mr-2"></i> No tasks in this period.
                            </div>
                        )}

                        {visibleTasks.map((task, index) => {
                            const metrics = getBarMetrics(task.startMs, task.endMs);
                            
                            // Visuals - Use Status Color Only
                            const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['To Do'];
                            const bgColorClass = statusStyle.header;

                            return (
                                <div 
                                    key={task.id} 
                                    className="relative h-10 mb-1 group"
                                >
                                    <div 
                                        className={`absolute h-8 top-1 rounded-md shadow-sm border border-white/20 flex items-center px-2 overflow-hidden transition-colors ${bgColorClass} ${task.isDragging ? 'opacity-80 ring-2 ring-indigo-400 z-50 shadow-xl' : 'hover:brightness-110 z-20'}`}
                                        style={{ 
                                            left: `${Math.max(0, metrics.left)}px`, 
                                            width: `${Math.max(20, metrics.width)}px`,
                                            cursor: 'grab' 
                                        }}
                                        onMouseDown={(e) => handleMouseDown(e, task, 'MOVE', { start: task.startMs, end: task.endMs })}
                                        onClick={(e) => {
                                            if (!task.isDragging) onEditTask(task);
                                        }}
                                        title={`${task.title} (${new Date(task.startMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(task.endMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`}
                                    >
                                        <span className="text-xs font-bold text-white whitespace-nowrap truncate drop-shadow-md select-none pointer-events-none">
                                            {task.title}
                                        </span>

                                        {/* Resize Handle */}
                                        <div 
                                            className="absolute right-0 top-0 bottom-0 w-3 cursor-ew-resize hover:bg-white/20 flex items-center justify-center z-30"
                                            onMouseDown={(e) => handleMouseDown(e, task, 'RESIZE', { start: task.startMs, end: task.endMs })}
                                        >
                                            <div className="w-0.5 h-3 bg-white/50 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};