
import React, { useState } from 'react';
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
    onTaskSizeChange?: () => void; // New prop for robust line recalculation
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ status, tasks, allTasks, onTaskMove, onEditTask, onAddTask, isCollapsed, onToggleCollapse, sortOption, onSortChange, onMouseDown, activeTaskTimer, onToggleTimer, onOpenContextMenu, onDeleteTask, isCompactMode, onTaskSizeChange }) => {
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const statusStyle = STATUS_STYLES[status] || STATUS_STYLES['To Do'];

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

    return (
        <div className={`flex-shrink-0 ${statusStyle.body} rounded-xl shadow-lg h-full flex flex-col transition-all duration-300 ease-in-out ${isCollapsed ? 'w-20' : 'w-80'}`}>
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
                        className={`flex-grow p-1 space-y-1 overflow-y-auto min-h-[200px] column-drop-zone ${isDraggingOver ? 'column-drop-zone-active' : ''}`}
                        style={{ maxHeight: 'calc(100vh - 450px)' }}
                    >
                        {tasks.map((task) => (
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
                        ))}
                    </div>
                    <div className="p-1 mt-auto border-t border-gray-300 dark:border-gray-700">
                        <button
                            onClick={() => onAddTask(status)}
                            className="w-full text-left p-2 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-300/60 dark:hover:bg-gray-700/60 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                        >
                            <i className="fas fa-plus mr-2"></i> Add a task
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};
