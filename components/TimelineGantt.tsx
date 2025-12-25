
import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { Task } from '../types';
import { STATUS_STYLES, PRIORITY_COLORS } from '../constants';
import { getAccurateCurrentDate, initializeTimeSync } from '../services/timeService';
import { DependencyLines } from './DependencyLines';

interface TimelineGanttProps {
    tasks: Task[];
    onEditTask: (task: Task) => void;
    onUpdateTask: (task: Task) => void; 
    addTask: (task: Omit<Task, 'id' | 'createdDate' | 'lastModified' | 'statusChangeDate'>) => void; 
    isVisible: boolean;
    timezone?: string;
}

type ViewMode = 'Day' | 'Week' | 'Month';
type ToolType = 'select' | 'blade';

interface DragState {
    taskId: string;
    type: 'MOVE' | 'RESIZE' | 'DUPLICATE';
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

interface Gap {
    startMs: number;
    endMs: number;
    rowIndex: number;
    left: number;
    width: number;
}

// Visual Config - FCP Style
const ROW_HEIGHT = 48; 
const BAR_HEIGHT = 34; 
const HEADER_HEIGHT = 48; 

const ZOOM_LEVELS: Record<ViewMode, ZoomConfig[]> = {
    'Day': [
        { unit: 'minute', step: 1, label: '1m', width: 40 }, // Ultra-granular
        { unit: 'minute', step: 5, label: '5m', width: 50 },
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


export const TimelineGantt: React.FC<TimelineGanttProps> = ({ tasks, onEditTask, onUpdateTask, addTask, isVisible, timezone = 'Asia/Kolkata' }) => {
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('Day'); 
    const [zoomIndex, setZoomIndex] = useState(2); 
    const [referenceDate, setReferenceDate] = useState(new Date());
    const [dragState, setDragState] = useState<DragState | null>(null);
    const [accurateNow, setAccurateNow] = useState(new Date());
    const [dependencyLines, setDependencyLines] = useState<LineCoordinate[]>([]);
    
    // Theme state
    const [isDarkTheme, setIsDarkTheme] = useState(false);
    const [activeTool, setActiveTool] = useState<ToolType>('select');
    
    const [optimisticTaskOverride, setOptimisticTaskOverride] = useState<{id: string, start: number, end: number} | null>(null);
    
    // Skimmer Refs
    const skimmerRef = useRef<HTMLDivElement>(null);
    const skimmerLabelRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // Style memoization
    const styles = useMemo(() => ({
        container: isDarkTheme ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200',
        header: isDarkTheme ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200',
        textMain: isDarkTheme ? 'text-gray-200' : 'text-gray-800',
        textMuted: isDarkTheme ? 'text-gray-400' : 'text-gray-500',
        textAccent: isDarkTheme ? 'text-indigo-400' : 'text-indigo-600',
        input: isDarkTheme ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800',
        button: isDarkTheme ? 'bg-gray-700 text-gray-300 hover:text-white' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50',
        buttonActive: isDarkTheme ? 'bg-gray-600 shadow text-indigo-300' : 'bg-gray-100 shadow text-indigo-600',
        scrollArea: isDarkTheme ? 'bg-gray-950' : 'bg-gray-50',
        rulerBorder: isDarkTheme ? 'border-gray-700/50' : 'border-gray-200',
        rulerTick: isDarkTheme ? 'bg-gray-600' : 'bg-gray-300',
        rowEven: isDarkTheme ? 'bg-gray-900' : 'bg-white',
        rowOdd: isDarkTheme ? 'bg-gray-900/50' : 'bg-gray-50',
        gridLine: isDarkTheme ? 'border-gray-700/30' : 'border-gray-200/60',
        todayHighlight: isDarkTheme ? 'bg-indigo-900/10' : 'bg-indigo-50',
        emptyText: isDarkTheme ? 'text-gray-600' : 'text-gray-400',
        minimapBg: isDarkTheme ? 'bg-gray-900 border-gray-700' : 'bg-gray-100 border-gray-300',
    }), [isDarkTheme]);

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

    // Handle Skimmer Movement
    const handleContainerMouseMove = useCallback((e: React.MouseEvent) => {
        if (!containerRef.current || !skimmerRef.current || !skimmerLabelRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        // Offset Calculation Fixed: Remove redundant scroll addition.
        // rect.left already accounts for horizontal scroll offset of the container.
        const relativeX = e.clientX - rect.left;
        
        // Ensure within bounds
        if (relativeX < 0 || relativeX > totalWidth) {
            skimmerRef.current.style.display = 'none';
            skimmerLabelRef.current.style.opacity = '0';
            return;
        }

        // Show Line
        skimmerRef.current.style.display = 'block';
        skimmerRef.current.style.left = `${relativeX}px`;
        
        // Update Time Label in Header
        const timeMs = viewStartDate.getTime() + (relativeX * msPerPixel);
        const timeDate = new Date(timeMs);
        const timeStr = timeDate.toLocaleTimeString('en-US', { 
            hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone 
        });

        skimmerLabelRef.current.textContent = timeStr;
        skimmerLabelRef.current.style.left = `${relativeX}px`;
        skimmerLabelRef.current.style.opacity = '1';

    }, [totalWidth, msPerPixel, viewStartDate, timezone]);

    const handleContainerMouseLeave = () => {
        if (skimmerRef.current) skimmerRef.current.style.display = 'none';
        if (skimmerLabelRef.current) skimmerLabelRef.current.style.opacity = '0';
    };

    const handleMouseDown = (e: React.MouseEvent, task: Task, type: 'MOVE' | 'RESIZE', metrics: { start: number, end: number }) => {
        e.stopPropagation();
        e.preventDefault(); 
        
        // Blade Tool Logic
        if (activeTool === 'blade') {
            const rect = containerRef.current!.getBoundingClientRect();
            // FIX: Use e.clientX - rect.left directly. containerRef is the scrolling content div.
            const clickX = e.clientX - rect.left; 
            const splitTimeMs = viewStartDate.getTime() + (clickX * msPerPixel);
            
            if (splitTimeMs <= metrics.start + 1000 || splitTimeMs >= metrics.end - 1000) {
                return; // Too close to edge
            }

            // Create Right Side Task
            const newDurationMs = metrics.end - splitTimeMs;
            const newDurationHours = Math.max(0.1, Math.round((newDurationMs / (1000 * 60 * 60)) * 100) / 100);
            
            addTask({
                title: `${task.title} (Part 2)`,
                status: task.status,
                priority: task.priority,
                dueDate: task.dueDate,
                scheduledStartDateTime: new Date(splitTimeMs).toISOString(),
                timeEstimate: newDurationHours,
                description: task.description,
                tags: task.tags
            });

            // Update Left Side Task
            const updatedOldDurationMs = splitTimeMs - metrics.start;
            const updatedOldDurationHours = Math.max(0.1, Math.round((updatedOldDurationMs / (1000 * 60 * 60)) * 100) / 100);
            
            onUpdateTask({
                ...task,
                timeEstimate: updatedOldDurationHours
            });
            return;
        }

        // Option+Drag to Duplicate
        if (type === 'MOVE' && e.altKey) {
            setDragState({
                taskId: task.id,
                type: 'DUPLICATE',
                startX: e.clientX,
                originalStart: metrics.start,
                originalEnd: metrics.end
            });
            // Initial render position for duplicate
            setOptimisticTaskOverride({ id: task.id, start: metrics.start, end: metrics.end });
            return;
        }

        // Standard Move/Resize
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

        const snapMs = viewMode === 'Month' ? 60 * 60 * 1000 : 60 * 1000; 

        if (dragState.type === 'MOVE' || dragState.type === 'DUPLICATE') {
            const rawStart = dragState.originalStart + deltaMs;
            const newStart = Math.round(rawStart / snapMs) * snapMs;
            const duration = dragState.originalEnd - dragState.originalStart;
            const newEnd = newStart + duration;
            setOptimisticTaskOverride({ id: dragState.taskId, start: newStart, end: newEnd });
        } else {
            const rawEnd = dragState.originalEnd + deltaMs;
            let newEnd = Math.round(rawEnd / snapMs) * snapMs;
            if (newEnd - dragState.originalStart < 15 * 60 * 1000) {
                newEnd = dragState.originalStart + (15 * 60 * 1000);
            }
            setOptimisticTaskOverride({ id: dragState.taskId, start: dragState.originalStart, end: newEnd });
        }

    }, [dragState, msPerPixel, viewMode]);

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

            if (dragState.type === 'DUPLICATE') {
                addTask({
                    title: `${task.title} (Copy)`,
                    status: task.status,
                    priority: task.priority,
                    dueDate: task.dueDate,
                    scheduledStartDateTime: newStartObj.toISOString(),
                    timeEstimate: durationHours,
                    description: task.description,
                    tags: task.tags
                });
            } else {
                onUpdateTask({
                    ...task,
                    scheduledStartDateTime: newStartObj.toISOString(),
                    timeEstimate: durationHours,
                    dueDate: newEndObj.toISOString().split('T')[0] 
                });
            }
        }

        setDragState(null);
        setOptimisticTaskOverride(null);
    }, [dragState, optimisticTaskOverride, tasks, onUpdateTask, addTask]);

    useEffect(() => {
        if (dragState) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = dragState.type === 'RESIZE' ? 'ew-resize' : 'grabbing';
        } else {
            document.body.style.cursor = activeTool === 'blade' ? 'text' : 'default'; 
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'default';
        };
    }, [dragState, handleMouseMove, handleMouseUp, activeTool]);

    // PACKING LOGIC
    const { packedTasks, totalRows, gaps } = useMemo(() => {
        const viewStartMs = viewStartDate.getTime();
        const viewEndMs = viewEndDate.getTime();

        const rawTasks: any[] = [];

        tasks.forEach(task => {
            if (task.status === 'Done' || task.status === "Won't Complete") return;

            let startMs = task.scheduledStartDateTime 
                ? new Date(task.scheduledStartDateTime).getTime() 
                : new Date(task.createdDate).getTime();
            
            let endMs = new Date(task.dueDate).getTime();
            
            if (task.scheduledStartDateTime && task.timeEstimate) {
                 endMs = startMs + (task.timeEstimate * 60 * 60 * 1000);
            } else if (task.scheduledStartDateTime) {
                 endMs = startMs + (60 * 60 * 1000); 
            } else {
                 if (new Date(task.dueDate).getHours() === 0) endMs += 86399000;
                 if (startMs > endMs) startMs = endMs - 3600000;
            }

            if (optimisticTaskOverride && optimisticTaskOverride.id === task.id) {
                if (dragState?.type === 'DUPLICATE') {
                    rawTasks.push({ ...task, startMs, endMs, isDragging: false });
                    rawTasks.push({ 
                        ...task, 
                        id: 'ghost-duplicate', 
                        startMs: optimisticTaskOverride.start, 
                        endMs: optimisticTaskOverride.end, 
                        isDragging: true,
                        isGhost: true 
                    });
                } else {
                    rawTasks.push({ ...task, startMs: optimisticTaskOverride.start, endMs: optimisticTaskOverride.end, isDragging: true });
                }
            } else {
                rawTasks.push({ ...task, startMs, endMs, isDragging: false });
            }
        });

        const visibleTasks = rawTasks.filter(({ startMs, endMs }) => startMs < viewEndMs && endMs > viewStartMs)
                                     .sort((a, b) => a.startMs - b.startMs);

        const lanes: number[] = []; 
        const rowTasks: any[][] = []; 

        const packed = visibleTasks.map(task => {
            let laneIndex = -1;
            for(let i=0; i<lanes.length; i++) {
                if (lanes[i] <= task.startMs) {
                    laneIndex = i;
                    break;
                }
            }
            if (laneIndex === -1) {
                laneIndex = lanes.length;
                lanes.push(0);
                rowTasks[laneIndex] = [];
            }

            lanes[laneIndex] = task.endMs;
            rowTasks[laneIndex].push(task);

            return { ...task, rowIndex: laneIndex };
        });

        const detectedGaps: Gap[] = [];
        rowTasks.forEach((tasksInRow, rowIndex) => {
            tasksInRow.sort((a,b) => a.startMs - b.startMs);
            for(let i=0; i<tasksInRow.length - 1; i++) {
                const current = tasksInRow[i];
                const next = tasksInRow[i+1];
                if (next.startMs > current.endMs + (1000 * 60 * 5)) { 
                    const duration = next.startMs - current.endMs;
                    detectedGaps.push({
                        startMs: current.endMs,
                        endMs: next.startMs,
                        rowIndex,
                        left: (current.endMs - viewStartMs) / msPerPixel,
                        width: duration / msPerPixel
                    });
                }
            }
        });

        return { packedTasks: packed, totalRows: Math.max(5, lanes.length), gaps: detectedGaps };
    }, [tasks, viewStartDate, viewEndDate, optimisticTaskOverride, msPerPixel, dragState]);

    // ... (keep getBarMetrics and dependency effects) ...
    const getBarMetrics = (taskStartMs: number, taskEndMs: number) => {
        const viewStartMs = viewStartDate.getTime();
        const msFromStart = taskStartMs - viewStartMs;
        const durationMs = taskEndMs - taskStartMs;
        const left = msFromStart / msPerPixel;
        const width = durationMs / msPerPixel;
        return { left, width };
    };

    useEffect(() => {
        if (!packedTasks.length) {
            setDependencyLines([]);
            return;
        }
        const lines: LineCoordinate[] = [];
        const taskMap = new Map<string, { startMs: number, endMs: number, rowIndex: number }>();
        packedTasks.forEach(t => taskMap.set(t.id, { startMs: t.startMs, endMs: t.endMs, rowIndex: t.rowIndex }));

        packedTasks.forEach((task) => {
            if (task.dependencies && task.dependencies.length > 0) {
                task.dependencies.forEach(depId => {
                    const depInfo = taskMap.get(depId);
                    if (depInfo) {
                        const startTask = depInfo;
                        const endTask = task; 
                        const startX = getBarMetrics(startTask.startMs, startTask.endMs).left + getBarMetrics(startTask.startMs, startTask.endMs).width;
                        const endX = getBarMetrics(endTask.startMs, endTask.endMs).left;
                        const TOP_PADDING = (ROW_HEIGHT - BAR_HEIGHT) / 2;
                        const BAR_CENTER = BAR_HEIGHT / 2;
                        
                        const startY = HEADER_HEIGHT + (startTask.rowIndex * ROW_HEIGHT) + TOP_PADDING + BAR_CENTER;
                        const endY = HEADER_HEIGHT + (endTask.rowIndex * ROW_HEIGHT) + TOP_PADDING + BAR_CENTER;

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
    }, [packedTasks, viewStartDate, msPerPixel]);

    // ... (keep navigation and minimap handlers) ...
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

    const handleMiniMapDrag = (e: React.MouseEvent) => {
        if (!scrollContainerRef.current) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const ratio = x / rect.width;
        scrollContainerRef.current.scrollLeft = (scrollContainerRef.current.scrollWidth * ratio) - (scrollContainerRef.current.clientWidth / 2);
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
        <div className={`w-full ${styles.container} border-b shadow-xl transition-all duration-500 ease-in-out animate-slideDown overflow-hidden flex flex-col mb-6 rounded-xl relative z-10 flex-shrink-0 select-none`}>
            {/* Control Bar */}
            <div className={`flex flex-col xl:flex-row justify-between items-center p-3 border-b ${styles.header} gap-3`}>
                <div className="flex flex-wrap items-center gap-4">
                    <h3 className={`text-sm font-bold ${styles.textMain} flex items-center gap-2`}>
                        <i className={`fas fa-video ${styles.textAccent}`}></i> <span className="hidden sm:inline">Timeline</span>
                    </h3>
                    <div className={`${isDarkTheme ? 'bg-gray-700' : 'bg-gray-200'} rounded-lg p-1 flex`}>
                        {(['Day', 'Week', 'Month'] as ViewMode[]).map(m => (
                            <button key={m} onClick={() => setViewMode(m)} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${viewMode === m ? styles.buttonActive : `${styles.textMuted} hover:${styles.textMain}`}`}>
                                {m}
                            </button>
                        ))}
                    </div>
                    <div className={`${isDarkTheme ? 'bg-gray-700' : 'bg-gray-200'} rounded-lg p-1 flex`}>
                        <button onClick={() => setActiveTool('select')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activeTool === 'select' ? styles.buttonActive : `${styles.textMuted} hover:${styles.textMain}`}`} title="Select Tool (V) - Hold Alt to Duplicate">
                            <i className="fas fa-mouse-pointer mr-1"></i> Select
                        </button>
                        <button onClick={() => setActiveTool('blade')} className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${activeTool === 'blade' ? styles.buttonActive : `${styles.textMuted} hover:${styles.textMain}`}`} title="Blade Tool (B) - Click to split clips">
                            <i className="fas fa-cut mr-1"></i> Blade
                        </button>
                    </div>
                    <button onClick={() => setIsDarkTheme(!isDarkTheme)} className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${styles.button}`}>
                        <i className={`fas ${isDarkTheme ? 'fa-sun' : 'fa-moon'}`}></i>
                    </button>
                    {viewMode === 'Day' && (
                        <div className={`flex items-center gap-1 ${isDarkTheme ? 'bg-gray-700' : 'bg-gray-200'} rounded-lg p-1`}>
                            <button onClick={handleZoomOut} disabled={zoomIndex >= ZOOM_LEVELS[viewMode].length - 1} className={`w-7 h-7 flex items-center justify-center rounded ${styles.button} disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-xs`}>
                                <i className="fas fa-search-minus"></i>
                            </button>
                            <span className={`text-[10px] font-bold px-2 min-w-[30px] text-center ${styles.textMuted}`}>{ZOOM_LEVELS[viewMode][zoomIndex].label}</span>
                            <button onClick={handleZoomIn} disabled={zoomIndex <= 0} className={`w-7 h-7 flex items-center justify-center rounded ${styles.button} disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-xs`}>
                                <i className="fas fa-search-plus"></i>
                            </button>
                        </div>
                    )}
                </div>
                <div className={`hidden lg:flex items-center px-4 py-1.5 ${isDarkTheme ? 'bg-indigo-900/30 border-indigo-800' : 'bg-indigo-50 border-indigo-100'} border rounded-full`}>
                    <i className={`far fa-clock ${styles.textAccent} mr-2 animate-pulse`}></i>
                    <span className={`text-xs font-mono font-bold ${isDarkTheme ? 'text-indigo-300' : 'text-indigo-800'} uppercase tracking-wide`}>{getFormattedCurrentTime()}</span>
                </div>
                <div className="flex items-center gap-3">
                    <div className={`flex items-center ${styles.input} rounded-md px-2 py-1 shadow-sm`}>
                        <input type={viewMode === 'Month' ? 'month' : 'date'} value={getDateInputValue()} onChange={handleDateChange} className={`bg-transparent border-none text-xs font-bold focus:outline-none cursor-pointer ${styles.textMain}`} />
                    </div>
                    <span className={`text-xs font-bold ${styles.textMain} min-w-[140px] text-center hidden sm:block`}>{getHeaderText()}</span>
                    <div className="flex items-center gap-1">
                        <button onClick={() => handleNavigate(-1)} className={`w-7 h-7 flex items-center justify-center rounded ${styles.button}`}><i className="fas fa-chevron-left text-xs"></i></button>
                        <button onClick={handleToday} className={`px-2 py-1 text-xs font-semibold rounded bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 transition-colors`}>Today</button>
                        <button onClick={() => handleNavigate(1)} className={`w-7 h-7 flex items-center justify-center rounded ${styles.button}`}><i className="fas fa-chevron-right text-xs"></i></button>
                    </div>
                </div>
            </div>

            {/* Main Timeline Area */}
            <div 
                ref={scrollContainerRef}
                onMouseMove={handleContainerMouseMove}
                onMouseLeave={handleContainerMouseLeave}
                className={`overflow-x-auto relative custom-scrollbar ${styles.scrollArea}`}
                style={{ maxHeight: '450px', minHeight: '200px' }}
            >
                <div 
                    ref={containerRef}
                    style={{ width: `${totalWidth}px`, minWidth: '100%', height: `${Math.max(200, (totalRows * ROW_HEIGHT) + HEADER_HEIGHT + 20)}px` }} 
                    className="relative"
                >
                    {/* Ruler Header (Sticky) */}
                    <div className={`flex border-b ${styles.header} sticky top-0 z-40 shadow-md select-none`} style={{ height: `${HEADER_HEIGHT}px` }}>
                        
                        {/* 1. Playhead Cap (Current Time) - Static/Time driven */}
                        {viewMode !== 'Month' && (() => {
                            const nowMs = accurateNow.getTime();
                            if (nowMs >= viewStartDate.getTime() && nowMs <= viewEndDate.getTime()) {
                                const diff = nowMs - viewStartDate.getTime();
                                const left = diff / msPerPixel;
                                return (
                                    <div className="absolute top-0 bottom-0 pointer-events-none z-50 flex flex-col items-center" style={{ left: `${left}px`, transform: 'translateX(-50%)' }}>
                                        <div className="absolute top-8">
                                            <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-red-500"></div>
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        })()}

                        {/* 2. Skimmer Cap (Mouse) - Ref driven */}
                        <div 
                            ref={skimmerLabelRef}
                            className="absolute top-8 pointer-events-none z-50 bg-gray-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded -translate-x-1/2 opacity-0 hidden"
                        >
                            00:00
                        </div>

                        {columns.map((col, i) => (
                            <div 
                                key={i} 
                                className={`flex-shrink-0 border-r ${styles.rulerBorder} relative ${col.isToday ? styles.todayHighlight : ''}`}
                                style={{ width: `${tickWidth}px` }}
                            >
                                <div className={`absolute top-0 left-1 text-[10px] font-bold ${styles.textMuted} uppercase`}>{col.label}</div>
                                <div className={`absolute bottom-0 left-0 w-px h-2 bg-gray-500`}></div>
                                <div className={`absolute bottom-0 left-1/4 w-px h-1 bg-gray-600`}></div>
                                <div className={`absolute bottom-0 left-1/2 w-px h-1.5 bg-gray-600`}></div>
                                <div className={`absolute bottom-0 left-3/4 w-px h-1 bg-gray-600`}></div>
                                {col.subLabel && <div className={`absolute bottom-3 left-1 text-[9px] ${styles.textMuted} font-mono`}>{col.subLabel}</div>}
                            </div>
                        ))}
                    </div>

                    {/* Skimmer Line (In content area, full height) */}
                    <div 
                        ref={skimmerRef}
                        className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none hidden -translate-x-1/2"
                        style={{ height: '100%' }}
                    ></div>

                    {/* Background Tracks */}
                    <div className="absolute left-0 right-0 pointer-events-none z-0" style={{ top: `${HEADER_HEIGHT}px` }}>
                        {Array.from({ length: totalRows }).map((_, i) => (
                            <div key={`row-${i}`} className={`w-full border-b ${isDarkTheme ? 'border-gray-800/30' : 'border-gray-100'} ${i % 2 === 0 ? styles.rowEven : styles.rowOdd}`} style={{ height: `${ROW_HEIGHT}px` }}></div>
                        ))}
                    </div>

                    {/* Vertical Time Grid Lines */}
                    <div className="absolute bottom-0 left-0 flex pointer-events-none z-0 opacity-30" style={{ top: `${HEADER_HEIGHT}px` }}>
                        {columns.map((col, i) => (
                            <div key={`grid-${i}`} className={`flex-shrink-0 border-r h-full ${styles.gridLine}`} style={{ width: `${tickWidth}px` }}></div>
                        ))}
                    </div>

                    {/* Gap Indicators */}
                    {gaps.map((gap, i) => (
                        <div key={`gap-${i}`} className="absolute z-10 group" style={{ left: `${gap.left}px`, width: `${gap.width}px`, top: `${HEADER_HEIGHT + (gap.rowIndex * ROW_HEIGHT)}px`, height: `${ROW_HEIGHT}px` }}>
                            <div className="w-full h-full bg-stripes-gray opacity-0 group-hover:opacity-1 transition-opacity border-l border-r border-dashed border-gray-400/30"></div>
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-500 bg-white/80 dark:bg-black/80 px-1 rounded opacity-0 group-hover:opacity-100 pointer-events-none">
                                Gap: {Math.round((gap.endMs - gap.startMs) / 60000)}m
                            </div>
                        </div>
                    ))}

                    {/* Current Time Line */}
                    {viewMode !== 'Month' && (() => {
                        const nowMs = accurateNow.getTime();
                        if (nowMs >= viewStartDate.getTime() && nowMs <= viewEndDate.getTime()) {
                            const diff = nowMs - viewStartDate.getTime();
                            const left = diff / msPerPixel;
                            return (
                                <div className="absolute top-0 bottom-0 z-50 pointer-events-none" style={{ left: `${left}px`, transform: 'translateX(-50%)' }}>
                                    <div className="w-px h-full bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.5)]"></div>
                                </div>
                            );
                        }
                        return null;
                    })()}

                    {/* Dependency Lines */}
                    <div className="absolute left-0 w-full h-full pointer-events-none z-10 opacity-40" style={{ top: 0 }}>
                        <DependencyLines lines={dependencyLines} />
                    </div>

                    {/* Tasks Layer */}
                    <div className="relative w-full h-full z-20">
                        {packedTasks.map((task) => {
                            const metrics = getBarMetrics(task.startMs, task.endMs);
                            const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['To Do'];
                            const priorityConfig = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS['Medium'];
                            const isCompound = (task.subtasks?.length || 0) > 0;
                            const top = HEADER_HEIGHT + (task.rowIndex * ROW_HEIGHT) + ((ROW_HEIGHT - BAR_HEIGHT) / 2);
                            const isGhost = (task as any).isGhost;

                            return (
                                <div 
                                    key={isGhost ? `ghost-${task.id}` : task.id}
                                    className={`absolute rounded-md shadow-md flex items-center px-2 overflow-hidden transition-all duration-75 group
                                        ${statusStyle.header} 
                                        ${task.isDragging ? 'opacity-90 ring-2 ring-yellow-400 z-50 scale-[1.02] shadow-xl' : 'hover:brightness-110 z-20 hover:ring-1 hover:ring-white/50'}
                                        ${isGhost ? 'opacity-50 saturate-0 border-2 border-dashed border-white' : ''}
                                    `}
                                    style={{ 
                                        left: `${Math.max(0, metrics.left)}px`, 
                                        width: `${Math.max(20, metrics.width)}px`,
                                        top: `${top}px`,
                                        height: `${BAR_HEIGHT}px`,
                                        cursor: activeTool === 'blade' ? 'url(https://img.icons8.com/material-sharp/24/FA5252/cut.png) 12 12, crosshair' : 'grab'
                                    }}
                                    onMouseDown={(e) => handleMouseDown(e, task, 'MOVE', { start: task.startMs, end: task.endMs })}
                                    onClick={(e) => {
                                        if (!task.isDragging && activeTool !== 'blade' && !isGhost) onEditTask(task);
                                    }}
                                    title={`[${task.priority}] ${task.title}`}
                                >
                                    {activeTool === 'select' && (
                                        <div className="absolute left-0 top-0 bottom-0 w-2 cursor-w-resize opacity-0 group-hover:opacity-100 bg-black/20 hover:bg-black/40 z-30"></div>
                                    )}
                                    <div className="flex items-center w-full overflow-hidden select-none pointer-events-none gap-2">
                                        <span className={`text-[9px] uppercase font-bold px-1.5 rounded-sm flex-shrink-0 ${priorityConfig.bg} ${priorityConfig.text} bg-opacity-90 border border-white/20 shadow-sm`}>{task.priority}</span>
                                        {isCompound && <i className="fas fa-layer-group text-white/70 text-xs"></i>}
                                        <span className="text-xs font-bold text-white whitespace-nowrap truncate drop-shadow-md">
                                            {isGhost ? `(Copy) ${task.title}` : task.title}
                                        </span>
                                    </div>
                                    {activeTool === 'select' && (
                                        <div className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize flex items-center justify-center z-30 group-hover:bg-black/10 hover:!bg-white/30" onMouseDown={(e) => handleMouseDown(e, task, 'RESIZE', { start: task.startMs, end: task.endMs })}>
                                            <div className="w-0.5 h-3 bg-white/30 rounded-full"></div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Mini-Map ... (Same as before) */}
            <div className={`h-[60px] border-t ${isDarkTheme ? 'border-gray-700 bg-gray-900' : 'border-gray-300 bg-gray-100'} relative overflow-hidden`} onClick={handleMiniMapDrag}>
                {packedTasks.map((task) => {
                    if ((task as any).isGhost) return null;
                    const metrics = getBarMetrics(task.startMs, task.endMs);
                    const leftPct = (metrics.left / totalWidth) * 100;
                    const widthPct = (metrics.width / totalWidth) * 100;
                    const statusColor = STATUS_STYLES[task.status].header.replace('bg-', 'bg-');
                    return (
                        <div key={`mini-${task.id}`} className={`absolute h-2 top-2 rounded-full opacity-50 ${statusColor}`} style={{ left: `${leftPct}%`, width: `${Math.max(0.5, widthPct)}%`, top: `${(task.rowIndex * 4) + 2}px` }} />
                    )
                })}
                {scrollContainerRef.current && (
                    <div className="absolute top-0 bottom-0 border-2 border-yellow-400 bg-yellow-400/10 cursor-grab active:cursor-grabbing" style={{ left: `${(scrollContainerRef.current.scrollLeft / totalWidth) * 100}%`, width: `${(scrollContainerRef.current.clientWidth / totalWidth) * 100}%` }}></div>
                )}
            </div>
        </div>
    );
};
