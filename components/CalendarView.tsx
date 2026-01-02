
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Task, Status } from '../types';
import { PRIORITY_COLORS, STATUS_STYLES, COLUMN_STATUSES } from '../constants';

const HOUR_HEIGHT = 60; // pixels per hour
const MIN_TASK_HEIGHT = HOUR_HEIGHT / 2; // min 30 minutes
const SNAP_MINUTES = 15;

// --- DATE UTILS ---
const getStartOfWeek = (date: Date, timeZone: string) => {
    const d = new Date(date.toLocaleString('en-US', { timeZone }));
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

const addDays = (date: Date, days: number) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

const areDatesEqualInZone = (d1: Date, d2: Date, timeZone: string) => {
    if (!d1 || !d2) return false;
    try {
        const formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
        return formatter.format(d1) === formatter.format(d2);
    } catch (e) {
        console.error("Invalid timezone for date comparison:", timeZone, e);
        // Fallback to UTC comparison
        return d1.getUTCFullYear() === d2.getUTCFullYear() && d1.getUTCMonth() === d2.getUTCMonth() && d1.getUTCDate() === d2.getUTCDate();
    }
};


const getDaysInMonth = (date: Date, timeZone: string) => {
    const d = new Date(date.toLocaleString('en-US', { timeZone }));
    const year = d.getFullYear();
    const month = d.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    for (let i = 1; i <= lastDay.getDate(); i++) {
        days.push(new Date(year, month, i));
    }
    const startingDayOfWeek = firstDay.getDay(); // 0 = Sun, 1 = Mon, ...
    const blanks = Array(startingDayOfWeek === 0 ? 6 : startingDayOfWeek - 1).fill(null);
    return [...blanks, ...days];
};


// --- DRAGGABLE UNSCHEDULED TASK ---
const UnscheduledTask: React.FC<{ task: Task; onEditTask: (task: Task) => void }> = ({ task, onEditTask }) => {
    const priorityClasses = PRIORITY_COLORS[task.priority];

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        e.dataTransfer.setData('taskId', task.id);
        e.currentTarget.style.opacity = '0.5';
    };
    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.style.opacity = '1';
    };

    return (
        <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onClick={() => onEditTask(task)}
            className="p-2 bg-white dark:bg-gray-800 rounded-md shadow mb-2 cursor-grab"
        >
            <h4 className="font-bold text-sm text-gray-800 dark:text-gray-100 truncate">{task.title}</h4>
            <div className="flex justify-between items-center mt-1 text-xs">
                <span className={`font-semibold px-2 py-0.5 rounded-full text-xs ${priorityClasses.bg} ${priorityClasses.text}`}>
                    {task.priority}
                </span>
                <span className="text-gray-500 dark:text-gray-400">
                    <i className="far fa-clock mr-1"></i>
                    {task.timeEstimate ? `${task.timeEstimate}h` : 'N/A'}
                </span>
            </div>
        </div>
    );
};

// --- SCHEDULED EVENT ON THE CALENDAR ---
const ScheduledEvent: React.FC<{
    task: Task;
    onUpdateTask: (task: Task) => void;
    onEditTask: (task: Task) => void;
    onContextMenu: (e: React.MouseEvent, task: Task) => void;
}> = ({ task, onUpdateTask, onEditTask, onContextMenu }) => {
    const eventRef = useRef<HTMLDivElement>(null);
    const resizeInfo = useRef<{ startY: number, originalHeight: number, originalTime: number } | null>(null);

    if (!task.scheduledStartDateTime) return null;
    const startDate = new Date(task.scheduledStartDateTime);
    
    const top = (startDate.getUTCHours() + startDate.getUTCMinutes() / 60) * HOUR_HEIGHT;
    const height = Math.max((task.timeEstimate || 1) * HOUR_HEIGHT, MIN_TASK_HEIGHT);

    const statusStyle = STATUS_STYLES[task.status] || STATUS_STYLES['To Do'];
    const isDone = task.status === 'Done';
    
    const handleMouseUp = useCallback(() => {
        resizeInfo.current = null;
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
        document.body.style.userSelect = 'auto';
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (resizeInfo.current) {
            const dy = e.clientY - resizeInfo.current.startY;
            let newHeight = resizeInfo.current.originalHeight + dy;
            newHeight = Math.max(newHeight, MIN_TASK_HEIGHT);
            
            const newTimeEstimate = Math.round((newHeight / HOUR_HEIGHT) * 4) / 4; // Round to nearest 0.25h

            if (eventRef.current) {
                eventRef.current.style.height = `${newHeight}px`;
            }
            onUpdateTask({ ...task, timeEstimate: newTimeEstimate });
        }
    }, [onUpdateTask, task]);


    const onResizeStart = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        resizeInfo.current = { startY: e.clientY, originalHeight: eventRef.current?.offsetHeight || 0, originalTime: task.timeEstimate || 1 };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    };

    const handleDragStart = (e: React.DragEvent) => {
        e.dataTransfer.setData('taskId', task.id);
        e.dataTransfer.effectAllowed = 'move';
        // Need to allow propagation for the parent column to potentially see it, but we also want to start drag.
        // Actually, preventing default on drop targets is key.
    };

    return (
        <div
            ref={eventRef}
            style={{ top, height }}
            onClick={(e) => { e.stopPropagation(); onEditTask(task); }}
            onContextMenu={(e) => onContextMenu(e, task)}
            draggable={true}
            onDragStart={handleDragStart}
            // IMPORTANT: Allow dropping on the event itself (to bubble up to column) or prevent it?
            // If we don't preventDefault in dragOver, it won't be a drop target.
            // But we WANT the underlying column to receive the drop.
            // By default, events bubble. So if we do nothing, dragOver bubbles to column.
            className={`absolute left-0 right-1 ${statusStyle.header} ${statusStyle.cardBorder} p-2 rounded-r-lg overflow-hidden cursor-pointer group hover:opacity-90 transition-opacity z-10 text-white ${isDone ? 'line-through opacity-70' : ''}`}
        >
            <h5 className="font-bold text-sm truncate">{task.title}</h5>
            <p className="text-xs opacity-80 truncate">{task.description}</p>
            
            {/* Drag Handle Icon */}
            <div className="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-white/50 cursor-move">
                <i className="fas fa-grip-vertical"></i>
            </div>
            
            <div 
                onMouseDown={onResizeStart}
                className="absolute bottom-0 left-0 w-full h-2 cursor-ns-resize opacity-0 group-hover:opacity-100" 
            />
        </div>
    );
};


// --- MAIN CALENDAR VIEW ---
interface CalendarViewProps {
    tasks: Task[];
    onUpdateTask: (task: Task) => void;
    onEditTask: (task: Task) => void;
    onAddTask: (status: Status, scheduledDateTime?: string) => void;
    timezone: string;
}

export const CalendarView: React.FC<CalendarViewProps> = ({ tasks, onUpdateTask, onEditTask, onAddTask, timezone }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState<'day' | 'week' | 'month'>('week');
    const [searchTerm, setSearchTerm] = useState('');
    const [isDroppingOnSidebar, setIsDroppingOnSidebar] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; task: Task } | null>(null);

    useEffect(() => {
        const timerId = setInterval(() => setCurrentTime(new Date()), 60000); // Update every minute
        const handleClickOutside = () => setContextMenu(null);
        window.addEventListener('click', handleClickOutside);
        return () => {
            clearInterval(timerId);
            window.removeEventListener('click', handleClickOutside);
        };
    }, []);
    
    const timeIndicatorPosition = useMemo(() => {
        try {
            const formatter = new Intl.DateTimeFormat('en-US', {
              timeZone: timezone,
              hour: 'numeric',
              minute: 'numeric',
              hour12: false
            });
            const parts = formatter.formatToParts(currentTime);
            const hourPart = parts.find(p => p.type === 'hour');
            const minutePart = parts.find(p => p.type === 'minute');
            const hours = hourPart ? parseInt(hourPart.value) % 24 : 0;
            const minutes = minutePart ? parseInt(minutePart.value) : 0;
            return (hours + minutes / 60) * HOUR_HEIGHT;
        } catch (e) {
            console.error("Invalid timezone for indicator:", timezone, e);
            return -1; // Hide if timezone is invalid
        }
    }, [currentTime, timezone]);

    const unscheduledTasks = useMemo(() =>
        tasks
            .filter(t => !t.scheduledStartDateTime)
            .filter(t => t.title.toLowerCase().includes(searchTerm.toLowerCase()))
    , [tasks, searchTerm]);
    
    const scheduledTasks = useMemo(() => tasks.filter(t => !!t.scheduledStartDateTime), [tasks]);

    const weekDays = useMemo(() => {
        const start = getStartOfWeek(currentDate, timezone);
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }, [currentDate, timezone]);
    
    const monthDays = useMemo(() => getDaysInMonth(currentDate, timezone), [currentDate, timezone]);

    const handleDropOnCalendar = (e: React.DragEvent<HTMLDivElement>, date: Date, hour?: number) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('taskId');
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        
        // Calculate drop time
        const rect = e.currentTarget.getBoundingClientRect();
        const dropY = e.clientY - rect.top;
        const hourFraction = dropY / HOUR_HEIGHT;
        const droppedHour = hour ?? Math.floor(hourFraction);
        const minute = Math.floor((hourFraction % 1) * 4) * SNAP_MINUTES;

        // Construct new date in UTC
        const newStartDate = new Date(Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            droppedHour,
            minute,
            0
        ));

        onUpdateTask({ 
            ...task,
            dueDate: newStartDate.toISOString().split('T')[0],
            scheduledStartDateTime: newStartDate.toISOString() 
        });
    };
    
    const handleUnscheduleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('taskId');
        const task = tasks.find(t => t.id === taskId);
        if (task && task.scheduledStartDateTime) {
            onUpdateTask({ ...task, scheduledStartDateTime: undefined });
        }
        setIsDroppingOnSidebar(false);
    };

    const handleNewTask = (date: Date, hour: number) => {
        const newStartDate = new Date(Date.UTC(
            date.getFullYear(),
            date.getMonth(),
            date.getDate(),
            hour, 0, 0
        ));
        onAddTask('To Do', newStartDate.toISOString());
    };

    const changeDate = (amount: number) => {
        setCurrentDate(prevDate => {
            const newDate = new Date(prevDate);
            if (view === 'day') {
                newDate.setDate(newDate.getDate() + amount);
            } else if (view === 'week') {
                newDate.setDate(newDate.getDate() + (amount * 7));
            } else if (view === 'month') {
                newDate.setMonth(newDate.getMonth() + amount);
            }
            return newDate;
        });
    };
    
     const handleContextMenu = (e: React.MouseEvent, task: Task) => {
        e.preventDefault();
        e.stopPropagation();
        setContextMenu({ x: e.clientX, y: e.clientY, task });
    };

    const handleChangeStatus = (task: Task, newStatus: Status) => {
        onUpdateTask({ ...task, status: newStatus });
        setContextMenu(null);
    };

    const getHeaderText = () => {
        const options: Intl.DateTimeFormatOptions = { timeZone: timezone };
        try {
            if (view === 'day') {
                options.weekday = 'long';
                options.year = 'numeric';
                options.month = 'long';
                options.day = 'numeric';
                return new Intl.DateTimeFormat('default', options).format(currentDate);
            }
            if (view === 'week') {
                const start = getStartOfWeek(currentDate, timezone);
                const end = addDays(start, 6);
                return `${start.toLocaleDateString('default', { month: 'short', day: 'numeric', timeZone: timezone })} - ${end.toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timezone })}`;
            }
            options.month = 'long';
            options.year = 'numeric';
            return new Intl.DateTimeFormat('default', options).format(currentDate);
        } catch(e) {
            return "Invalid Timezone";
        }
    };

    const timelineHours = Array.from({ length: 24 }, (_, i) => i);

    const renderDayColumn = (day: Date) => {
        const isToday = areDatesEqualInZone(day, currentTime, timezone);
        return (
            <div 
                key={day.toISOString()}
                className="relative border-r border-gray-300 dark:border-gray-700 h-full"
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                onDrop={(e) => handleDropOnCalendar(e, day)}
                onDoubleClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const hour = Math.floor(y / HOUR_HEIGHT);
                    handleNewTask(day, hour);
                }}
            >
                {timelineHours.map(hour => (
                    <div key={hour} className="h-[60px] border-b border-gray-300/50 dark:border-gray-700/50 pointer-events-none"></div>
                ))}
                {isToday && timeIndicatorPosition !== -1 && (
                    <div 
                        className="absolute left-0 right-0 h-0.5 bg-red-500 z-20 pointer-events-none"
                        style={{ top: `${timeIndicatorPosition}px` }}
                    >
                        <div className="absolute -left-1.5 -top-1.5 w-3 h-3 bg-red-500 rounded-full"></div>
                    </div>
                )}
                {scheduledTasks
                    .filter(t => areDatesEqualInZone(new Date(t.scheduledStartDateTime!), day, timezone))
                    .map(task => (
                        <ScheduledEvent key={task.id} task={task} onUpdateTask={onUpdateTask} onEditTask={onEditTask} onContextMenu={handleContextMenu}/>
                    ))}
            </div>
        );
    };

    const renderTimeGrid = (days: Date[]) => (
         <div className="flex-grow flex border-t border-gray-300 dark:border-gray-700 h-full">
            <div className="w-16 border-r border-gray-300 dark:border-gray-700 flex-shrink-0 bg-white dark:bg-gray-800 z-10">
                {timelineHours.map(hour => (
                    <div key={hour} className="h-[60px] text-right pr-2 text-xs text-gray-500 dark:text-gray-400 relative -top-2">
                        {hour > 0 ? (hour >= 12 ? `${hour === 12 ? 12 : hour - 12} PM` : `${hour} AM`) : ''}
                    </div>
                ))}
            </div>
            <div className={`flex-grow grid grid-cols-${days.length} min-w-[300px]`}>
                {days.map(day => renderDayColumn(day))}
            </div>
        </div>
    );
    
    const renderMonthView = () => (
        <div className="flex-grow grid grid-cols-7 grid-rows-6 border-t border-l border-gray-300 dark:border-gray-700">
            {monthDays.map((day, index) => (
                <div 
                    key={day ? day.toISOString() : `blank-${index}`} 
                    className="border-b border-r border-gray-300 dark:border-gray-700 p-1 overflow-y-auto min-h-[100px]"
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                    onDrop={day ? (e) => handleDropOnCalendar(e, day, 9) : undefined}
                >
                    {day && (
                        <>
                            <span className={`text-xs ${areDatesEqualInZone(day, currentTime, timezone) ? 'font-bold text-indigo-500' : ''}`}>{day.getDate()}</span>
                            <div className="mt-1 space-y-1">
                                {scheduledTasks
                                    .filter(t => areDatesEqualInZone(new Date(t.scheduledStartDateTime!), day, timezone))
                                    .map(task => (
                                        <div key={task.id} onClick={() => onEditTask(task)} className={`text-xs p-1 rounded ${STATUS_STYLES[task.status].header} text-white cursor-pointer truncate ${task.status === 'Done' ? 'line-through' : ''}`}>{task.title}</div>
                                    ))}
                            </div>
                        </>
                    )}
                </div>
            ))}
        </div>
    );

    return (
        <div className="flex h-full bg-white/30 dark:bg-gray-800/30 rounded-lg shadow-inner overflow-hidden">
            {contextMenu && (
                <div
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    className="absolute z-30 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg py-1"
                >
                    <div className="px-3 py-1 text-sm font-bold border-b border-gray-200 dark:border-gray-700 mb-1 truncate max-w-xs">{contextMenu.task.title}</div>
                    <p className="px-3 pb-2 text-xs text-gray-500 dark:text-gray-400">Move to:</p>
                    {COLUMN_STATUSES.map(status => (
                        <button
                            key={status}
                            onClick={() => handleChangeStatus(contextMenu.task, status)}
                            className="block w-full text-left px-3 py-1 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                            disabled={contextMenu.task.status === status}
                        >
                            {status}
                        </button>
                    ))}
                </div>
            )}
            <div 
                className={`w-1/3 max-w-xs xl:w-1/4 border-r border-gray-300 dark:border-gray-700 flex flex-col transition-colors ${isDroppingOnSidebar ? 'bg-indigo-500/20' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDroppingOnSidebar(true); }}
                onDragLeave={() => setIsDroppingOnSidebar(false)}
                onDrop={handleUnscheduleDrop}
            >
                <div className="p-4 border-b border-gray-300 dark:border-gray-700 flex-shrink-0">
                    <h3 className="text-lg font-bold">Unscheduled ({unscheduledTasks.length})</h3>
                    {isDroppingOnSidebar && <p className="text-sm font-semibold text-indigo-500 text-center mt-1">Drop to unschedule task</p>}
                </div>
                <div className="p-2 border-b border-gray-300 dark:border-gray-700">
                    <input 
                        type="text" 
                        placeholder="Search tasks..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full p-2 bg-gray-100 dark:bg-gray-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                    />
                </div>
                <div className="p-2 overflow-y-auto">
                    {unscheduledTasks.length > 0 ? (
                        unscheduledTasks.map(task => <UnscheduledTask key={task.id} task={task} onEditTask={onEditTask} />)
                    ) : (
                         <div className="text-center text-gray-500 dark:text-gray-400 mt-8 p-4">
                            <i className="fas fa-check-circle text-3xl mb-2 text-green-500"></i>
                            <p>No unscheduled tasks found!</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="w-2/3 xl:w-3/4 flex flex-col">
                <div className="p-2 border-b border-gray-300 dark:border-gray-700 flex-shrink-0 flex items-center justify-between">
                     <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm rounded-md border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">Today</button>
                        <button onClick={() => changeDate(-1)} className="px-2 py-1 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">&lt;</button>
                        <button onClick={() => changeDate(1)} className="px-2 py-1 text-sm rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">&gt;</button>
                        <h2 className="text-lg font-bold ml-4">{getHeaderText()}</h2>
                    </div>
                    <div className="bg-gray-200 dark:bg-gray-700 p-0.5 rounded-lg flex items-center">
                        <button onClick={() => setView('day')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${view === 'day' ? 'bg-white dark:bg-gray-800 shadow' : 'text-gray-600 dark:text-gray-400'}`}>Day</button>
                        <button onClick={() => setView('week')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${view === 'week' ? 'bg-white dark:bg-gray-800 shadow' : 'text-gray-600 dark:text-gray-400'}`}>Week</button>
                        <button onClick={() => setView('month')} className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${view === 'month' ? 'bg-white dark:bg-gray-800 shadow' : 'text-gray-600 dark:text-gray-400'}`}>Month</button>
                    </div>
                </div>

                <div className="flex flex-col flex-grow overflow-hidden">
                    {view !== 'month' && (
                        <>
                            <div className="flex flex-shrink-0">
                                <div className="w-16 border-r border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"></div>
                                <div className={`flex-grow grid ${view === 'week' ? 'grid-cols-7' : 'grid-cols-1'}`}>
                                    {(view === 'week' ? weekDays : [currentDate]).map(day => (
                                        <div key={day.toISOString()} className="text-center p-2 border-r border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800">
                                            <div className="text-xs">{day.toLocaleDateString('default', { weekday: 'short', timeZone: timezone })}</div>
                                            <div className={`text-xl font-bold ${areDatesEqualInZone(day, currentTime, timezone) ? 'text-indigo-500' : ''}`}>{day.getDate()}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="flex-grow overflow-y-auto">
                                {renderTimeGrid(view === 'week' ? weekDays : [currentDate])}
                            </div>
                        </>
                    )}
                    
                    {view === 'month' && (
                        <div className="flex flex-col flex-grow overflow-auto">
                             <div className="grid grid-cols-7 sticky top-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm z-10 border-b border-gray-300 dark:border-gray-700">
                               {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                                    <div key={day} className="text-center font-bold text-sm p-2">{day}</div>
                               ))}
                             </div>
                             {renderMonthView()}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
