
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { TaskCard } from './TaskCard';
import { Task, Status, SortOption, Goal } from '../types';
import { STATUS_STYLES } from '../constants';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';

interface KanbanColumnProps {
    status: Status;
    tasks: Task[]; // Tasks for this specific column (potentially sorted)
    allTasks: Task[]; // All tasks for context (e.g., dependencies)
    goals?: Goal[]; // New Prop
    onTaskMove: (taskId: string, newStatus: Status, newIndex: number) => void;
    onEditTask: (task: Task) => void;
    onAddTask: (status: Status) => void;
    onQuickAddTask: (title: string) => void; 
    onSmartAddTask: (transcript: string) => Promise<void>;
    onUpdateTask: (task: Task) => void; // Passed down
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    sortOption: SortOption;
    onSortChange: (status: Status, option: SortOption) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    activeTaskTimer: {taskId: string, startTime: number} | null;
    onToggleTimer: (taskId: string) => void;
    onOpenContextMenu: (e: React.MouseEvent, task: Task) => void;
    onDeleteTask: (taskId: string) => void;
    onSubtaskToggle: (taskId: string, subtaskId: string) => void; 
    onBreakDownTask?: (taskId: string) => Promise<void>; 
    isCompactMode: boolean;
    onTaskSizeChange?: () => void; 
    width?: number; 
    height?: number; 
    onResize?: (width: number, height: number) => void;
    zoomLevel?: number;
    isSpaceMode?: boolean; 
}

// Define specific tints for Space Mode to retain color identity while keeping the space aesthetic
const SPACE_TINTS: Record<Status, { body: string, header: string, border: string }> = {
    'To Do': { body: 'bg-slate-900/60', header: 'bg-slate-800/80', border: 'border-slate-500/30' },
    'In Progress': { body: 'bg-sky-900/60', header: 'bg-sky-800/80', border: 'border-sky-500/30' },
    'Review': { body: 'bg-purple-900/60', header: 'bg-purple-800/80', border: 'border-purple-500/30' },
    'Blocker': { body: 'bg-red-900/60', header: 'bg-red-800/80', border: 'border-red-500/30' },
    'Hold': { body: 'bg-amber-900/60', header: 'bg-amber-800/80', border: 'border-amber-500/30' },
    "Won't Complete": { body: 'bg-stone-900/60', header: 'bg-stone-800/80', border: 'border-stone-500/30' },
    'Done': { body: 'bg-green-900/60', header: 'bg-green-800/80', border: 'border-green-500/30' },
};

// Thresholds for accumulation warnings
const LIMIT_IN_PROGRESS = 3;
const LIMIT_DEFAULT = 5;

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
    status, tasks, allTasks, goals, onTaskMove, onEditTask, onAddTask, onQuickAddTask, onSmartAddTask, onUpdateTask,
    isCollapsed, onToggleCollapse, sortOption, onSortChange, onMouseDown, 
    activeTaskTimer, onToggleTimer, onOpenContextMenu, onDeleteTask, onSubtaskToggle, onBreakDownTask,
    isCompactMode, onTaskSizeChange, width, height, onResize, zoomLevel = 1, isSpaceMode = false
}) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const [quickAddTitle, setQuickAddTitle] = useState('');
    const [showScrollIndicator, setShowScrollIndicator] = useState(false);
    const [showTopScrollIndicator, setShowTopScrollIndicator] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    
    const statusStyle = STATUS_STYLES[status] || STATUS_STYLES['To Do'];
    const spaceTint = SPACE_TINTS[status] || SPACE_TINTS['To Do'];

    const colRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const resizeStartRef = useRef<{ x: number, y: number, w: number, h: number } | null>(null);

    // K-Teaching: Accumulation Check
    // "In Progress" stays strict (3). All others trigger warning at 5.
    const limit = status === 'In Progress' ? LIMIT_IN_PROGRESS : LIMIT_DEFAULT;
    const isOverloaded = tasks.length > limit;

    const getOverloadMessage = (s: Status): string => {
        if (s === 'In Progress') return "Fragmentation creates fatigue. One thing at a time.";
        
        switch (s) {
            case 'To Do': return "The accumulation of the future prevents action in the now.";
            case 'Review': return "To observe without judgment is the highest form of intelligence.";
            case 'Blocker': return "Conflict arises when we resist 'what is'.";
            case 'Hold': return "Psychological time is the enemy of clarity.";
            case "Won't Complete": return "Negation of the unessential is the beginning of wisdom.";
            case 'Done': return "Die to the past every moment. Do not carry the burden of achievement.";
            default: return "Accumulation clouds perception.";
        }
    };

    const overloadMessage = getOverloadMessage(status);

    // Dynamic styles based on Space Mode
    const containerClasses = isSpaceMode 
        ? `${spaceTint.body} backdrop-blur-md border ${spaceTint.border} shadow-2xl`
        : `${statusStyle.body} shadow-lg`;
    
    const headerClasses = isSpaceMode
        ? `${spaceTint.header} backdrop-blur-lg border-b ${spaceTint.border}`
        : `${statusStyle.header} border-b border-black/10 dark:border-white/10`;

    const { 
        isListening, 
        transcript, 
        startListening, 
        stopListening, 
        resetTranscript
    } = useSpeechRecognition({
        continuous: true // Allow continuous input without auto-stop
    });

    // Update the input field as you speak
    useEffect(() => {
        if (isListening) {
            setQuickAddTitle(transcript);
        }
    }, [transcript, isListening]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuickAddTitle(e.target.value);
    };

    // MANUAL TOGGLE: Mic -> Pause -> Stop & Process
    const toggleVoiceInput = async () => {
        if (isListening) {
            // STOP ACTION
            stopListening();
            
            const textToProcess = quickAddTitle.trim();
            
            if (textToProcess) {
                setIsProcessing(true);
                try {
                    // Send text to App.tsx for AI parsing & modal opening
                    await onSmartAddTask(textToProcess);
                    setQuickAddTitle(''); // Clear input on success
                    resetTranscript();    // Reset hook state
                } catch (e) {
                    console.error("Smart add failed", e);
                } finally {
                    setIsProcessing(false);
                }
            } else {
                // Empty speech, just stop
                resetTranscript();
                setQuickAddTitle('');
            }
        } else {
            // START ACTION
            setQuickAddTitle(''); // Clear previous text
            resetTranscript();    // Ensure hook is clean
            startListening();
        }
    };

    const handleQuickAddSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (isProcessing) return;
        
        if (quickAddTitle.trim()) {
            onQuickAddTask(quickAddTitle.trim());
            setQuickAddTitle('');
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (!isCollapsed) {
            setIsDraggingOver(true);
        }
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        setIsDraggingOver(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        if (isCollapsed) return;

        setIsDraggingOver(false);
        const taskId = e.dataTransfer.getData('taskId');
        
        const dropY = e.clientY;
        const cards = Array.from(e.currentTarget.querySelectorAll('.task-card'));
        
        // Find visual index based on Y position
        let visualDropIndex = cards.findIndex(card => {
            const rect = (card as HTMLElement).getBoundingClientRect();
            return dropY < rect.top + rect.height / 2;
        });

        if (visualDropIndex === -1) {
            visualDropIndex = tasks.length;
        }

        let logicalIndex = visualDropIndex;

        if (sortOption !== 'Default') {
            if (visualDropIndex < tasks.length) {
                const targetTask = tasks[visualDropIndex];
                const unsortedColumnTasks = allTasks.filter(t => t.status === status);
                const targetIndexInMaster = unsortedColumnTasks.findIndex(t => t.id === targetTask.id);
                
                if (targetIndexInMaster !== -1) {
                    logicalIndex = targetIndexInMaster;
                }
            } else {
                const unsortedColumnTasks = allTasks.filter(t => t.status === status);
                logicalIndex = unsortedColumnTasks.length;
            }
        }

        onTaskMove(taskId, status, logicalIndex);
    };
    
    const handleResizeStart = (e: React.MouseEvent) => {
        if (!onResize || !colRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        
        setIsResizing(true);
        resizeStartRef.current = {
            x: e.clientX,
            y: e.clientY,
            w: colRef.current.offsetWidth,
            h: colRef.current.offsetHeight
        };
        
        document.addEventListener('mousemove', handleResizeMove);
        document.addEventListener('mouseup', handleResizeEnd);
    };

    const handleResizeMove = (e: MouseEvent) => {
        if (!resizeStartRef.current || !onResize) return;
        
        const dx = (e.clientX - resizeStartRef.current.x) / zoomLevel;
        const dy = (e.clientY - resizeStartRef.current.y) / zoomLevel;
        
        const newW = Math.max(200, resizeStartRef.current.w + dx);
        const newH = Math.max(100, resizeStartRef.current.h + dy);
        
        onResize(newW, newH);
    };

    const handleResizeEnd = () => {
        setIsResizing(false);
        resizeStartRef.current = null;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        if(onTaskSizeChange) onTaskSizeChange();
    };

    const checkScrollIndicator = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        
        const hasOverflow = el.scrollHeight > el.clientHeight;
        const isAtBottom = Math.abs(el.scrollHeight - el.clientHeight - el.scrollTop) < 5;
        const isAtTop = el.scrollTop < 5;
        
        setShowScrollIndicator(hasOverflow && !isAtBottom);
        setShowTopScrollIndicator(hasOverflow && !isAtTop);
    }, []);

    useEffect(() => {
        checkScrollIndicator();
    }, [tasks, height, isCollapsed, checkScrollIndicator, isCompactMode]);

    const handleScroll = () => {
        checkScrollIndicator();
    };
    
    const currentWidth = isCollapsed ? 80 : (width || 320);
    const currentHeight = height ? height : 'auto';
    const isCustomHeight = !!height;
    
    return (
        <div 
            ref={colRef}
            className={`flex-shrink-0 rounded-xl flex flex-col ${containerClasses} ${isResizing ? 'transition-none select-none' : 'transition-all duration-300 ease-in-out'} relative`}
            style={{ 
                width: `${currentWidth}px`, 
                height: typeof currentHeight === 'number' ? `${currentHeight}px` : undefined,
            }}
        >
            <div 
                className={`p-2 flex justify-between items-center sticky top-0 rounded-t-xl z-10 ${headerClasses}`}
                onMouseDown={onMouseDown}
            >
                <h2
                    className="font-bold text-lg cursor-grab select-none text-white"
                    style={{ 
                        writingMode: isCollapsed ? 'vertical-rl' : 'initial', 
                        transform: isCollapsed ? 'rotate(180deg)' : 'none',
                        padding: isCollapsed ? '10px 0' : '0'
                    }}
                >
                    {status}
                </h2>
                <div className="flex items-center gap-2" onMouseDown={(e) => e.stopPropagation()}>
                    <span className={`text-white text-sm font-semibold px-2.5 py-1 rounded-full ${isOverloaded ? 'bg-red-500 animate-pulse' : 'bg-black/20'}`}>
                        {tasks.length}
                    </span>
                    <button onClick={onToggleCollapse} className="text-white/70 hover:text-white transition-colors w-6 h-6 flex items-center justify-center">
                        <i className={`fas fa-chevron-up transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}></i>
                    </button>
                </div>
            </div>
            {!isCollapsed && (
                <>
                    {/* Accumulation Warning - Now applies to ALL columns with specific messages */}
                    {isOverloaded && (
                        <div className="p-3 bg-red-100 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 text-xs italic font-serif">
                            "{overloadMessage}"
                        </div>
                    )}

                    {!isOverloaded && (
                        <div className={`p-2 border-b ${isSpaceMode ? `border-white/10 ${spaceTint.border}` : 'border-gray-300 dark:border-gray-700 bg-white/20 dark:bg-black/10'}`}>
                            <form onSubmit={handleQuickAddSubmit} className="flex gap-2">
                                <div className="relative flex-1">
                                    <input 
                                        type="text" 
                                        value={quickAddTitle}
                                        onChange={handleInputChange}
                                        placeholder={isProcessing ? "AI Thinking..." : isListening ? "Listening... (Click Stop to Process)" : "Add quick task..."}
                                        className={`w-full px-3 py-1.5 pr-8 text-sm rounded-md border transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                                            ${isListening 
                                                ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-900 dark:text-red-200 ring-2 ring-red-500/50' 
                                                : isProcessing
                                                    ? 'border-purple-500 bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-200 cursor-wait'
                                                    : isSpaceMode 
                                                        ? 'border-white/20 bg-black/20 text-white placeholder-white/50 focus:bg-black/40' 
                                                        : 'border-gray-300 dark:border-gray-600 bg-white/90 dark:bg-gray-800 text-gray-800 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400'
                                            }
                                        `}
                                        disabled={isProcessing}
                                    />
                                    {isProcessing && (
                                        <div className="absolute right-8 top-1/2 -translate-y-1/2">
                                            <i className="fas fa-spinner fa-spin text-purple-500 text-xs"></i>
                                        </div>
                                    )}
                                    <button
                                        type="button"
                                        onClick={toggleVoiceInput}
                                        className={`absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full transition-all ${isListening ? 'bg-red-500 text-white animate-pulse' : isProcessing ? 'text-purple-500 animate-spin' : isSpaceMode ? 'text-white/60 hover:text-white' : 'text-gray-400 hover:text-indigo-500'}`}
                                        title={isListening ? "Stop & Think" : "Voice Add (AI Powered)"}
                                        disabled={isProcessing}
                                    >
                                        <i className={`fas ${isListening ? 'fa-pause' : isProcessing ? 'fa-brain' : 'fa-microphone'}`}></i>
                                    </button>
                                </div>
                                
                                <button
                                    type="button"
                                    onClick={() => onAddTask(status)}
                                    className={`px-3 py-1.5 rounded-md transition-colors border shadow-sm flex items-center gap-1.5 whitespace-nowrap text-xs font-bold disabled:opacity-50 ${
                                        isSpaceMode 
                                            ? 'bg-white/10 hover:bg-white/20 text-white border-white/20'
                                            : 'bg-white/50 dark:bg-gray-700/50 hover:bg-white dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600'
                                    }`}
                                    title="Open full task creator"
                                    disabled={isProcessing}
                                >
                                    <i className="fas fa-pen-to-square"></i>
                                </button>
                            </form>
                        </div>
                    )}

                    <div className={`p-2 border-b ${isSpaceMode ? `border-white/10 ${spaceTint.border}` : 'border-gray-300 dark:border-gray-700'}`}>
                        <label htmlFor={`sort-${status}`} className="sr-only">Sort tasks by</label>
                        <select
                            id={`sort-${status}`}
                            value={sortOption}
                            onChange={(e) => onSortChange(status, e.target.value as SortOption)}
                            className={`w-full rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                isSpaceMode 
                                    ? 'bg-black/20 text-white border border-white/20 option-black'
                                    : 'bg-gray-300/50 dark:bg-gray-700/50 text-gray-800 dark:text-gray-300 placeholder-gray-500 dark:placeholder-gray-400'
                            }`}
                        >
                            <option value="Default" className="text-black">Sort: Default</option>
                            <option value="Priority" className="text-black">Sort: Priority</option>
                            <option value="Due Date" className="text-black">Sort: Due Date</option>
                            <option value="Created Date" className="text-black">Sort: Created Date</option>
                        </select>
                    </div>
                    <div
                        ref={scrollContainerRef}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        onScroll={handleScroll}
                        className={`flex-grow p-1 space-y-1 min-h-[200px] column-drop-zone ${isDraggingOver ? 'column-drop-zone-active' : ''} ${isCustomHeight ? 'overflow-y-auto' : ''}`}
                    >
                        {/* Top Scroll Indicator - Liquid Glass Style */}
                        <div 
                            className={`sticky top-0 left-0 right-0 h-8 pointer-events-none transition-all duration-500 z-20 -mb-8 -mx-1 ${showTopScrollIndicator ? 'opacity-100' : 'opacity-0'}`}
                            style={{
                                background: isSpaceMode 
                                    ? 'linear-gradient(to bottom, rgba(165, 243, 252, 0.2) 0%, rgba(165, 243, 252, 0) 100%)' 
                                    : 'linear-gradient(to bottom, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 100%)',
                                backdropFilter: 'blur(4px)',
                                maskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, black 40%, transparent 100%)'
                            }}
                        >
                             {/* Intricate Highlight Line */}
                             <div className={`w-full h-[1px] ${isSpaceMode ? 'bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent' : 'bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent'}`}></div>
                        </div>

                        {tasks.length === 0 ? (
                            <div className={`h-full flex flex-col items-center justify-center opacity-50 p-4 select-none min-h-[150px] ${isSpaceMode ? 'text-white/60' : 'text-gray-400 dark:text-gray-500'}`}>
                                <i className="far fa-folder-open text-3xl mb-2"></i>
                                <span className="text-sm font-medium">No Tasks</span>
                            </div>
                        ) : (
                            tasks.map((task) => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    allTasks={allTasks}
                                    goals={goals} // Pass goals down
                                    onEditTask={onEditTask}
                                    onUpdateTask={onUpdateTask}
                                    activeTaskTimer={activeTaskTimer}
                                    onToggleTimer={onToggleTimer}
                                    onOpenContextMenu={onOpenContextMenu}
                                    onDeleteTask={onDeleteTask}
                                    onSubtaskToggle={onSubtaskToggle}
                                    onBreakDownTask={onBreakDownTask}
                                    isCompactMode={isCompactMode}
                                    onTaskSizeChange={onTaskSizeChange}
                                />
                            ))
                        )}
                    </div>
                    
                    {/* Bottom Scroll Indicator - Liquid Glass Style */}
                    <div 
                        className={`absolute bottom-0 left-0 right-0 h-10 pointer-events-none transition-all duration-500 rounded-b-xl z-20 ${showScrollIndicator ? 'opacity-100' : 'opacity-0'}`}
                        style={{
                            background: isSpaceMode 
                                ? 'linear-gradient(to top, rgba(165, 243, 252, 0.2) 0%, rgba(165, 243, 252, 0) 100%)' 
                                : 'linear-gradient(to top, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 100%)',
                            backdropFilter: 'blur(4px)',
                            maskImage: 'linear-gradient(to top, black 40%, transparent 100%)',
                            WebkitMaskImage: 'linear-gradient(to top, black 40%, transparent 100%)'
                        }}
                    >
                        {/* Intricate Highlight Line */}
                        <div className={`absolute bottom-0 left-0 right-0 h-[1px] ${isSpaceMode ? 'bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent' : 'bg-gradient-to-r from-transparent via-indigo-300/40 to-transparent'}`}></div>
                    </div>

                    {onResize && (
                        <div 
                            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center resize-handle opacity-50 hover:opacity-100 z-30"
                            onMouseDown={handleResizeStart}
                            title="Drag to resize"
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={isSpaceMode ? 'text-white/50' : 'text-gray-500 dark:text-gray-400'}>
                                <path d="M10 10L10 0L0 10H10Z" fill="currentColor"/>
                            </svg>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
