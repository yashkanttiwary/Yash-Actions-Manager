
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Task } from '../types';
import { STATUS_STYLES, PRIORITY_COLORS } from '../constants';
import { getAccurateCurrentDate, initializeTimeSync } from '../services/timeService';
import { DependencyLines } from './DependencyLines';

interface TimelineGanttProps {
    tasks: Task[];
    onEditTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void; 
    isVisible: boolean;
    timezone?: string;
}

type ViewMode = 'Day' | 'Week' | 'Month';

interface DragState {
    taskId: string;
    type: 'MOVE' | 'RESIZE';
    startX: number;
    originalStart: number;
    originalEnd: number;
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
        { unit: 'hour', step: 1, label: '1h', width: 100, default: true },
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

// Fix M-02: Robust Timezone Calculation
// Instead of iterative rollback, we decompose the time in the target zone and rebuild in UTC.
const getStartOfDayInZone = (date: Date, timeZone: string): Date => {
    try {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: 'numeric',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            hour12: false
        }).formatToParts(date);

        const p: any = {};
        parts.forEach(({ type, value }) => p[type] = value);

        const year = parseInt(p.year);
        const month = parseInt(p.month) - 1;
        const day = parseInt(p.day);
        
        let estimated = new Date(Date.UTC(year, month, day, 0, 0, 0));
        
        for(let i=0; i<3; i++) {
            const partsEst = new Intl.DateTimeFormat('en-US', {
                timeZone,
                year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
                hour12: false
            }).formatToParts(estimated);
            const pe: any = {};
            partsEst.forEach(({ type, value }) => pe[type] = value);
            
            const estYear = parseInt(pe.year);
            const estMonth = parseInt(pe.month) - 1;
            const estDay = parseInt(pe.day);
            const estHour = parseInt(pe.hour) === 24 ? 0 : parseInt(pe.hour);
            const estMin = parseInt(pe.minute);
            
            let diffMinutes = (estHour * 60) + estMin;
            
            const targetYMD = year * 10000 + month * 100 + day;
            const currentYMD = estYear * 10000 + estMonth * 100 + estDay;
            
            if (currentYMD > targetYMD) {
                diffMinutes += 24 * 60;
            } else if (currentYMD < targetYMD) {
                diffMinutes -= 24 * 60;
            }
            
            if (Math.abs(diffMinutes) < 1) return estimated; 
            
            estimated = new Date(estimated.getTime() - (diffMinutes * 60 * 1000));
        }
        
        return estimated;

    } catch (e) {
        console.error("Timezone calc failed", e);
        const d = new Date(date);
        d.setUTCHours(0,0,0,0);
        return d;
    }
};

const getStartOfWeekInZone = (date: Date, timeZone: string): Date => {
    const startOfDay = getStartOfDayInZone(date, timeZone);
    const d = new Date(startOfDay);
    
    const weekdayStr = d.toLocaleDateString('en-US', { timeZone, weekday: 'short' });
    const map: any = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const tzDay = map[weekdayStr];
    
    const diff = tzDay === 0 ? -6 : 1 - tzDay; // Monday start
    d.setDate(d.getDate() + diff);
    return getStartOfDayInZone(d, timeZone);
};

const getStartOfMonthInZone = (date: Date, timeZone: string): Date => {
    const d = getStartOfDayInZone(date, timeZone);
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric', month: 'numeric'
    }).formatToParts(d);
    const p: any = {};
    parts.forEach(({ type, value }) => p[type] = value);
    
    const rough = new Date(Date.UTC(parseInt(p.year), parseInt(p.month)-1, 1, 12, 0, 0));
    return getStartOfDayInZone(rough, timeZone);
};


export const TimelineGantt: React.FC<TimelineGanttProps> = ({ tasks, onEditTask, onUpdateTask, isVisible, timezone = 'Asia/Kolkata' }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('Week'); 
    const [zoomIndex, setZoomIndex] = useState(2); 
    const [referenceDate, setReferenceDate] = useState(new Date());
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [accurateNow, setAccurateNow] = useState(new Date());
    const [dependencyLines, setDependencyLines] = useState<LineCoordinate[]>([]);
    
    const [optimisticTaskOverride, setOptimisticTaskOverride] = useState<{id: string, start: number, end: number} | null>(null);

    useEffect(() => {
        initializeTimeSync();
        const interval = setInterval(() => {
            setAccurateNow(getAccurateCurrentDate());
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        const levels = ZOOM_LEVELS[viewMode];
        const defaultIdx = levels.findIndex(l => l.default);
        setZoomIndex(defaultIdx >= 0 ? defaultIdx : 0);
    }, [viewMode]);

    const handleZoomIn = () => setZoomIndex(prev => Math.max(0, prev - 1));
    const handleZoomOut = () => setZoomIndex(prev => Math.min(ZOOM_LEVELS[viewMode].length - 1, prev + 1));

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.value) return;
        const val = e.target.value;
        const parts = val.split('-').map(Number);
        
        if (parts.length === 2) {
            const [y, m] = parts;
            setReferenceDate(new Date(y, m - 1, 1));
        } else if (parts.length === 3) {
            const [y, m, d] = parts;
            setReferenceDate(new Date(y, m - 1, d));
        }
    };

    const { viewStartDate, viewEndDate, columns, tickWidth, totalWidth, msPerPixel } = useMemo(() => {
        let start: Date;
        
        if (viewMode === 'Day') start = getStartOfDayInZone(referenceDate, timezone);
        else if (viewMode === 'Week') start = getStartOfWeekInZone(referenceDate, timezone);
        else start = getStartOfMonthInZone(referenceDate, timezone);

        const end = new Date(start);
        if (viewMode === 'Day') end.setDate(end.getDate() + 1);
        else if (viewMode === 'Week') end.setDate(end.getDate() + 7);
        else {
            end.setMonth(end.getMonth() + 1);
            const cleanEnd = getStartOfDayInZone(end, timezone);
            end.setTime(cleanEnd.getTime());
        }
        
        end.setTime(end.getTime() - 1);

        const config = ZOOM_LEVELS[viewMode][zoomIndex] || ZOOM_LEVELS[viewMode][0];
        
        let tickMs = 0;
        if (config.unit === 'minute') tickMs = config.step * 60 * 1000;
        if (config.unit === 'hour') tickMs = config.step * 60 * 60 * 1000;
        if (config.unit === 'day') tickMs = config.step * 24 * 60 * 60 * 1000;
        if (config.unit === 'week') tickMs = config.step * 7 * 24 * 60 * 60 * 1000;

        const msPerPx = tickMs / config.width;
        
        let cols: { label: string, subLabel?: string, isToday?: boolean, date: Date }[] = [];
        
        const current = new Date(start);
        const endMs = end.getTime();
        const nowInZoneStr = accurateNow.toLocaleDateString('en-US', { timeZone: timezone });

        while (current.getTime() <= endMs) {
            const dateObj = new Date(current);
            let label = '';
            let subLabel = '';

            if (config.unit === 'minute' || config.unit === 'hour') {
                label = dateObj.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
                const hourInZone = parseInt(dateObj.toLocaleTimeString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }));
                if (hourInZone === 0 && (config.unit === 'hour' || dateObj.getMinutes() === 0)) {
                    subLabel = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone });
                }
            } else {
                label = dateObj.toLocaleDateString('en-US', { day: 'numeric', timeZone: timezone });
                subLabel = dateObj.toLocaleDateString('en-US', { weekday: 'short', timeZone: timezone });
                if (config.unit === 'week') {
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

        const config = ZOOM_LEVELS[viewMode][zoomIndex];
        let snapMs = 15 * 60 * 1000; 
        
        if (config.unit === 'minute') snapMs = config.step * 60 * 1000;
        if (config.unit === 'hour') snapMs = config.step * 60 * 60 * 1000;
        if (config.unit === 'day') snapMs = 24 * 60 * 60 * 1000;
        if (config.unit === 'day' || config.unit === 'week') snapMs = 60 * 60 * 1000; 

        if (dragState.type === 'MOVE') {
            newStart = Math.round((dragState.originalStart + deltaMs) / snapMs) * snapMs;
            const duration = dragState.originalEnd - dragState.originalStart;
            newEnd = newStart + duration;
        } else {
            newEnd = Math.round((dragState.originalEnd + deltaMs) / snapMs) * snapMs;
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

            const durationMs = optimisticTaskOverride.end - optimisticTaskOverride.start;
            const durationHours = Math.round((durationMs / (1000 * 60 * 60)) * 100) / 100;

            const updatedTask = {
                ...task,
                scheduledStartDateTime: newStartObj.toISOString(),
                timeEstimate: durationHours,
                dueDate: newEndObj.toISOString().split('T')[0] 
            };
            onUpdateTask(updatedTask);
        }

        setDragState(null);
        setOptimisticTaskOverride(null);
    }, [dragState, optimisticTaskOverride, tasks, onUpdateTask]);

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

    const visibleTasks = useMemo(() => {
        const viewStartMs = viewStartDate.getTime();
        const viewEndMs = viewEndDate.getTime();

        return tasks
            .filter(t => t.status !== 'Done' && t.status !== "Won't Complete")
            .map(task => {
                if (optimisticTaskOverride && optimisticTaskOverride.id === task.id) {
                    return { ...task, startMs: optimisticTaskOverride.start, endMs: optimisticTaskOverride.end, isDragging: true };
                }

                let startMs = task.scheduledStartDateTime 
                    ? new Date(task.scheduledStartDateTime).getTime() 
                    : new Date(task.createdDate).getTime();
                
                let endMs = new Date(task.dueDate).getTime();
                const dueDateObj = new Date(task.dueDate);
                
                if (dueDateObj.getHours() === 0 && dueDateObj.getMinutes() === 0) {
                    endMs += (24 * 60 * 60 * 1000) - 1; 
                }

                if (task.scheduledStartDateTime && task.timeEstimate) {
                     endMs = startMs + (task.timeEstimate * 60 * 60 * 1000);
                } else if (task.scheduledStartDateTime) {
                     endMs = startMs + (60 * 60 * 1000); 
                }

                if (startMs > endMs) startMs = endMs - (60 * 60 * 1000); 

                return { ...task, startMs, endMs, isDragging: false };
            })
            .filter(({ startMs, endMs }) => {
                return startMs < viewEndMs && endMs > viewStartMs;
            })
            .sort((a, b) => a.startMs - b.startMs); 
    }, [tasks, viewStartDate, viewEndDate, optimisticTaskOverride]);

    const getBarMetrics = (taskStartMs: number, taskEndMs: number) => {
        const viewStartMs = viewStartDate.getTime();
        const msFromStart = taskStartMs - viewStartMs;
        const durationMs = taskEndMs - taskStartMs;
        const left = msFromStart / msPerPixel;
        const width = durationMs / msPerPixel;
        return { left, width };
    };

    useEffect(() => {
        if (!visibleTasks.length) {
            setDependencyLines([]);
            return;
        }

        const lines: LineCoordinate[] = [];
        const taskMap = new Map<string, { startMs: number, endMs: number, index: number }>();
        visibleTasks.forEach((t, i) => taskMap.set(t.id, { startMs: t.startMs, endMs: t.endMs, index: i }));

        visibleTasks.forEach((task, index) => {
            if (task.dependencies && task.dependencies.length > 0) {
                task.dependencies.forEach(depId => {
                    const depInfo = taskMap.get(depId);
                    if (depInfo) {
                        const startTask = depInfo;
                        const endTask = { startMs: task.startMs, endMs: task.endMs, index: index };

                        const startX = getBarMetrics(startTask.startMs, startTask.endMs).left + getBarMetrics(startTask.startMs, startTask.endMs).width;
                        const endX = getBarMetrics(endTask.startMs, endTask.endMs).left;

                        const ROW_HEIGHT = 40; 
                        const HEADER_OFFSET = 20; 
                        const startY = (startTask.index * ROW_HEIGHT) + HEADER_OFFSET;
                        const endY = (endTask.index * ROW_HEIGHT) + HEADER_OFFSET;

                        lines.push({
                            start: { x: startX, y: startY },
                            end: { x: endX, y: endY },
                            isBlocked: true
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

    useEffect(() => {
        if (isVisible && scrollContainerRef.current && viewMode === 'Day') {
            const hour8ms = 8 * 60 * 60 * 1000;
            const pixels = hour8ms / msPerPixel;
            scrollContainerRef.current.scrollLeft = pixels; 
        }
    }, [isVisible, viewMode, msPerPixel]); 

    const getHeaderText = () => {
        const opts: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric', timeZone: timezone };
        if (viewMode === 'Day') return referenceDate.toLocaleDateString('en-US', { ...opts, day: 'numeric', weekday: 'short' });
        if (viewMode === 'Week') {
            const end = new Date(viewEndDate);
            return `${viewStartDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: timezone })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })}`;
        }
        return referenceDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: timezone });
    };

    const getFormattedCurrentTime = () => {
        return accurateNow.toLocaleDateString('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            timeZone: timezone
        });
    };

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
                    {viewMode === 'Day' && (
                        <div className="flex items-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
                            <button 
                                onClick={handleZoomOut} 
                                disabled={zoomIndex >= ZOOM_LEVELS[viewMode].length - 1}
                                className="w-7 h-7 flex items-center justify-center rounded bg-white dark:bg-gray-600 text-gray-600 dark:text-gray-300 hover:text-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-xs"
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
                            >
                                <i className="fas fa-search-plus"></i>
                            </button>
                        </div>
                    )}
                </div>

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

            <div 
                ref={scrollContainerRef}
                className="overflow-x-auto relative custom-scrollbar bg-gray-50/50 dark:bg-black/20"
                style={{ maxHeight: '350px', minHeight: '200px' }}
            >
                <div style={{ width: `${totalWidth}px`, minWidth: '100%' }} className="relative">
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

                    <div className="absolute top-10 bottom-0 left-0 flex pointer-events-none z-0">
                        {columns.map((col, i) => (
                            <div 
                                key={`grid-${i}`}
                                className={`flex-shrink-0 border-r border-gray-200/60 dark:border-gray-700/40 h-full ${col.isToday ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                                style={{ width: `${tickWidth}px` }}
                            >
                                {tickWidth > 100 && (
                                    <div className="w-px h-full bg-gray-100/50 dark:bg-gray-800/30 mx-auto"></div>
                                )}
                            </div>
                        ))}
                    </div>

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

                    <div className="absolute top-10 left-0 w-full h-full pointer-events-none z-10 opacity-60">
                        <DependencyLines lines={dependencyLines} />
                    </div>

                    <div className="relative pt-4 pb-12 z-20 min-h-[200px]">
                        {visibleTasks.length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm italic pointer-events-none">
                                <i className="far fa-calendar-times mr-2"></i> No tasks in this period.
                            </div>
                        )}

                        {visibleTasks.map((task, index) => {
                            const metrics = getBarMetrics(task.startMs, task.endMs);
                            const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['To Do'];
                            const bgColorClass = statusStyle.header;
                            const priorityConfig = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS['Medium'];

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
                                        title={`[${task.priority}] ${task.title} (${new Date(task.startMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} - ${new Date(task.endMs).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})})`}
                                    >
                                        <div className="flex items-center w-full overflow-hidden select-none pointer-events-none">
                                            <span 
                                                className={`text-[9px] uppercase font-black mr-1.5 px-1 rounded-sm flex-shrink-0 ${priorityConfig.bg} ${priorityConfig.text} border border-white/20`}
                                            >
                                                {task.priority}
                                            </span>
                                            <span className="text-xs font-bold text-white whitespace-nowrap truncate drop-shadow-md">
                                                {task.title}
                                            </span>
                                        </div>

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
