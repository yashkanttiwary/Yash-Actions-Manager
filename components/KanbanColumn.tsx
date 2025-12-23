
import React, { useState, useRef, useEffect } from 'react';
import { TaskCard } from './TaskCard';
import { Task, Status, SortOption } from '../types';
import { STATUS_STYLES } from '../constants';

interface KanbanColumnProps {
    status: Status;
    tasks: Task[]; // Tasks for this specific column
    allTasks: Task[]; // All tasks for context (e.g., dependencies)
    onTaskMove: (taskId: string, newStatus: Status, newIndex: number) => void;
    onEditTask: (task: Task) => void;
    onAddTask: (status: Status) => void;
    isCollapsed: boolean;
    onToggleCollapse: () => void;
    sortOption: SortOption;
    onSortChange: (status: Status, option: SortOption) => void;
    onMouseDown: (e: React.MouseEvent) => void;
    activeTaskTimer: {taskId: string, startTime: number} | null;
    onToggleTimer: (taskId: string) => void;
    onOpenContextMenu: (e: React.MouseEvent, task: Task) => void;
    onDeleteTask: (taskId: string) => void;
    isCompactMode: boolean;
    onTaskSizeChange?: () => void; 
    width?: number; // Custom width
    height?: number; // Custom height
    onResize?: (width: number, height: number) => void;
    zoomLevel?: number; // Needed for correct resizing math
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
    status, tasks, allTasks, onTaskMove, onEditTask, onAddTask, 
    isCollapsed, onToggleCollapse, sortOption, onSortChange, onMouseDown, 
    activeTaskTimer, onToggleTimer, onOpenContextMenu, onDeleteTask, 
    isCompactMode, onTaskSizeChange, width, height, onResize, zoomLevel = 1 
}) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const statusStyle = STATUS_STYLES[status] || STATUS_STYLES['To Do'];
    const colRef = useRef<HTMLDivElement>(null);
    const resizeStartRef = useRef<{ x: number, y: number, w: number, h: number } | null>(null);

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
        const dropIndex = cards.findIndex(card => {
            const rect = (card as HTMLElement).getBoundingClientRect();
            return dropY < rect.top + rect.height / 2;
        });

        onTaskMove(taskId, status, dropIndex === -1 ? tasks.length : dropIndex);
    };
    
    const handleResizeStart = (e: React.MouseEvent) => {
        if (!onResize || !colRef.current) return;
        e.preventDefault();
        e.stopPropagation(); // Prevent column drag
        
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
        
        // Calculate deltas, adjusting for zoom level
        const dx = (e.clientX - resizeStartRef.current.x) / zoomLevel;
        const dy = (e.clientY - resizeStartRef.current.y) / zoomLevel;
        
        const newW = Math.max(200, resizeStartRef.current.w + dx); // Min width 200
        const newH = Math.max(100, resizeStartRef.current.h + dy); // Min height 100
        
        onResize(newW, newH);
    };

    const handleResizeEnd = () => {
        setIsResizing(false);
        resizeStartRef.current = null;
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        if(onTaskSizeChange) onTaskSizeChange(); // Update board layout/lines
    };
    
    // Determine dimensions
    // Default width: 80 (collapsed) or 320 (expanded)
    // Default height: undefined (auto)
    const currentWidth = isCollapsed ? 80 : (width || 320);
    const currentHeight = height ? height : 'auto';
    const isCustomHeight = !!height;
    
    // Auto-height behavior: remove h-full class if auto, otherwise apply fixed height style
    
    return (
        <div 
            ref={colRef}
            className={`flex-shrink-0 ${statusStyle.body} rounded-xl shadow-lg flex flex-col ${isResizing ? 'transition-none select-none' : 'transition-all duration-300 ease-in-out'} relative`}
            style={{ 
                width: `${currentWidth}px`, 
                height: typeof currentHeight === 'number' ? `${currentHeight}px` : undefined,
                // If height is auto, we let it grow. If fixed, we set it.
                // We removed 'h-full' class from original code to allow auto-height.
            }}
        >
            <div 
                className={`p-2 border-b border-black/10 dark:border-white/10 flex justify-between items-center sticky top-0 backdrop-blur-sm rounded-t-xl z-10 ${statusStyle.header}`}
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
                    <span className="bg-black/20 text-white text-sm font-semibold px-2.5 py-1 rounded-full">{tasks.length}</span>
                    <button onClick={onToggleCollapse} className="text-white/70 hover:text-white transition-colors w-6 h-6 flex items-center justify-center">
                        <i className={`fas fa-chevron-up transition-transform duration-300 ${isCollapsed ? 'rotate-180' : ''}`}></i>
                    </button>
                </div>
            </div>
            {!isCollapsed && (
                <>
                    <div className="p-2 border-b border-gray-300 dark:border-gray-700">
                        <label htmlFor={`sort-${status}`} className="sr-only">Sort tasks by</label>
                        <select
                            id={`sort-${status}`}
                            value={sortOption}
                            onChange={(e) => onSortChange(status, e.target.value as SortOption)}
                            className="w-full bg-gray-300/50 dark:bg-gray-700/50 rounded-md px-3 py-1.5 text-sm text-gray-800 dark:text-gray-300 placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="Default">Sort: Default</option>
                            <option value="Priority">Sort: Priority</option>
                            <option value="Due Date">Sort: Due Date</option>
                            <option value="Created Date">Sort: Created Date</option>
                        </select>
                    </div>
                    <div
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`flex-grow p-1 space-y-1 min-h-[200px] column-drop-zone ${isDraggingOver ? 'column-drop-zone-active' : ''} ${isCustomHeight ? 'overflow-y-auto' : ''}`}
                        style={{ 
                            // Removed max-height constraint to allow auto-grow "algorithm"
                        }}
                    >
                        {tasks.length === 0 ? (
                            // Fix LOW-001: Empty State
                            <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-50 p-4 select-none min-h-[150px]">
                                <i className="far fa-folder-open text-3xl mb-2"></i>
                                <span className="text-sm font-medium">No Tasks</span>
                            </div>
                        ) : (
                            tasks.map((task) => (
                                <TaskCard
                                    key={task.id}
                                    task={task}
                                    allTasks={allTasks}
                                    onEditTask={onEditTask}
                                    activeTaskTimer={activeTaskTimer}
                                    onToggleTimer={onToggleTimer}
                                    onOpenContextMenu={onOpenContextMenu}
                                    onDeleteTask={onDeleteTask}
                                    isCompactMode={isCompactMode}
                                    onTaskSizeChange={onTaskSizeChange}
                                />
                            ))
                        )}
                    </div>
                    <div className="p-1 mt-auto border-t border-gray-300 dark:border-gray-700">
                        <button
                            onClick={() => onAddTask(status)}
                            className="w-full text-left p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-300/60 dark:hover:bg-gray-700/60 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        >
                            <i className="fas fa-plus mr-2"></i> Add a task
                        </button>
                    </div>

                    {/* Resize Handle */}
                    {onResize && (
                        <div 
                            className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center resize-handle opacity-50 hover:opacity-100 z-20"
                            onMouseDown={handleResizeStart}
                            title="Drag to resize"
                        >
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-gray-500 dark:text-gray-400">
                                <path d="M10 10L10 0L0 10H10Z" fill="currentColor"/>
                            </svg>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
