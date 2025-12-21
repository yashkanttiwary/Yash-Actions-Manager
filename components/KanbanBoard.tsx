
import React, { useState, useRef, useLayoutEffect } from 'react';
import { KanbanColumn } from './KanbanColumn';
import { DependencyLines } from './DependencyLines';
import { Task, Status, SortOption, Priority, ColumnLayout } from '../types';

interface KanbanBoardProps {
    tasks: Task[];
    columns: Status[];
    columnLayouts: ColumnLayout[];
    getTasksByStatus: (status: Status) => Task[];
    onTaskMove: (taskId: string, newStatus: Status, newIndex: number) => void;
    onEditTask: (task: Task) => void;
    onAddTask: (status: Status) => void;
    onUpdateColumnLayout: (id: Status, newLayout: Omit<ColumnLayout, 'id'>) => void;
    activeTaskTimer: {taskId: string, startTime: number} | null;
    onToggleTimer: (taskId: string) => void;
    onOpenContextMenu: (e: React.MouseEvent, task: Task) => void;
    focusMode: Status | 'None';
    onDeleteTask: (taskId: string) => void;
}

interface LineCoordinate {
  start: { x: number; y: number };
  end: { x: number; y: number };
  isBlocked: boolean;
}

const priorityOrder: Record<Priority, number> = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };

const sortTasks = (tasks: Task[], option: SortOption): Task[] => {
    const tasksToSort = [...tasks];
    switch (option) {
        case 'Priority':
            return tasksToSort.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));
        case 'Due Date':
            return tasksToSort.sort((a, b) => {
                if (a.dueDate && b.dueDate) return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
                if (a.dueDate) return -1;
                if (b.dueDate) return 1;
                return 0;
            });
        case 'Created Date':
            return tasksToSort.sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
        case 'Default':
        default:
            return tasksToSort;
    }
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, columns, columnLayouts, getTasksByStatus, onTaskMove, onEditTask, onAddTask, onUpdateColumnLayout, activeTaskTimer, onToggleTimer, onOpenContextMenu, focusMode, onDeleteTask }) => {
    const [collapsedColumns, setCollapsedColumns] = useState<Set<Status>>(new Set());
    const [sortOptions, setSortOptions] = useState<Record<Status, SortOption>>(
        columns.reduce((acc, status) => ({...acc, [status]: 'Default'}), {}) as Record<Status, SortOption>
    );

    const [draggedColumn, setDraggedColumn] = useState<{id: Status, offset: {x: number, y: number}} | null>(null);
    const [lineCoordinates, setLineCoordinates] = useState<LineCoordinate[]>([]);
    const boardRef = useRef<HTMLDivElement>(null);
    const mainContainerRef = useRef<HTMLElement | null>(null);

    // Calculate dependency lines positions
    useLayoutEffect(() => {
        if (!boardRef.current) return;
        mainContainerRef.current = document.querySelector('main');
        
        const calculateLines = () => {
            // Do not calculate lines if in Focus Mode, as other columns are hidden
            if (focusMode !== 'None') {
                setLineCoordinates([]);
                return;
            }

            const newLines: LineCoordinate[] = [];
            const boardRect = boardRef.current!.getBoundingClientRect();
            
            tasks.forEach(task => {
                if (task.dependencies && task.dependencies.length > 0) {
                    const endElement = document.querySelector(`[data-task-id="${task.id}"]`) as HTMLElement;
                    if (!endElement) return;

                    const endRect = endElement.getBoundingClientRect();
                    const end = {
                        x: endRect.left - boardRect.left,
                        y: endRect.top + endRect.height / 2 - boardRect.top
                    };

                    task.dependencies.forEach(depId => {
                        const startElement = document.querySelector(`[data-task-id="${depId}"]`) as HTMLElement;
                        const depTask = tasks.find(t => t.id === depId);
                        if (!startElement || !depTask) return;

                        const startRect = startElement.getBoundingClientRect();
                        const start = {
                            x: startRect.right - boardRect.left,
                            y: startRect.top + startRect.height / 2 - boardRect.top
                        };
                        
                        newLines.push({ start, end, isBlocked: depTask.status !== 'Done' });
                    });
                }
            });
            setLineCoordinates(newLines);
        };
        
        calculateLines();
        
        const container = mainContainerRef.current;
        container?.addEventListener('scroll', calculateLines);
        window.addEventListener('resize', calculateLines);
        
        // Use MutationObserver to detect when tasks are added/removed/moved
        const observer = new MutationObserver(calculateLines);
        observer.observe(boardRef.current, { childList: true, subtree: true });

        return () => {
            container?.removeEventListener('scroll', calculateLines);
            window.removeEventListener('resize', calculateLines);
            observer.disconnect();
        };

    }, [tasks, columnLayouts, collapsedColumns, focusMode]);


    const handleSortChange = (status: Status, option: SortOption) => {
        setSortOptions(prev => ({ ...prev, [status]: option }));
    };
    
    const handleTaskMoveWithSortReset = (taskId: string, newStatus: Status, newIndex: number) => {
        onTaskMove(taskId, newStatus, newIndex);
        if (sortOptions[newStatus] !== 'Default') {
            handleSortChange(newStatus, 'Default');
        }
    };

    const toggleColumnCollapse = (status: Status) => {
        setCollapsedColumns(prev => {
            const newSet = new Set(prev);
            if (newSet.has(status)) {
                newSet.delete(status);
            } else {
                newSet.add(status);
            }
            return newSet;
        });
    };

    const handleColumnMouseDown = (e: React.MouseEvent, columnId: Status) => {
        // Disable column dragging in focus mode
        if (focusMode !== 'None') return;

        const layout = columnLayouts.find(c => c.id === columnId);
        if (!layout || !boardRef.current) return;
        
        onUpdateColumnLayout(columnId, { ...layout, zIndex: 50 }); // Bring to front

        setDraggedColumn({
            id: columnId,
            offset: {
                x: e.clientX - layout.x,
                y: e.clientY - layout.y,
            }
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!draggedColumn || !boardRef.current) return;
        e.preventDefault();

        const layout = columnLayouts.find(c => c.id === draggedColumn.id);
        if (!layout) return;

        const newX = e.clientX - draggedColumn.offset.x;
        const newY = e.clientY - draggedColumn.offset.y;
        
        onUpdateColumnLayout(draggedColumn.id, { ...layout, x: newX, y: newY });
    };

    const handleMouseUp = () => {
        if (draggedColumn) {
            const layout = columnLayouts.find(c => c.id === draggedColumn.id);
            if(layout) {
                onUpdateColumnLayout(draggedColumn.id, { ...layout, zIndex: 10 }); // Reset z-index
            }
        }
        setDraggedColumn(null);
    };
    
    // Focus Mode Render
    if (focusMode !== 'None') {
        const tasksForColumn = getTasksByStatus(focusMode);
        const sortedTasks = sortTasks(tasksForColumn, sortOptions[focusMode] || 'Default');

        return (
            <div 
                className="w-full h-full flex justify-center items-start pt-8"
                ref={boardRef}
            >
                 {/* No dependency lines in focus mode */}
                 <div className="h-full">
                    <KanbanColumn
                        status={focusMode}
                        tasks={sortedTasks}
                        allTasks={tasks}
                        onTaskMove={handleTaskMoveWithSortReset}
                        onEditTask={onEditTask}
                        onAddTask={onAddTask}
                        isCollapsed={false} // Force expanded in focus mode
                        onToggleCollapse={() => {}} // Disable collapse
                        sortOption={sortOptions[focusMode] || 'Default'}
                        onSortChange={handleSortChange}
                        onMouseDown={(e) => {}} // Disable column move
                        activeTaskTimer={activeTaskTimer}
                        onToggleTimer={onToggleTimer}
                        onOpenContextMenu={onOpenContextMenu}
                        onDeleteTask={onDeleteTask}
                    />
                 </div>
            </div>
        );
    }

    // Default Render
    return (
        <div 
            ref={boardRef}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="w-full h-full relative"
        >
            <DependencyLines lines={lineCoordinates} />
            {columnLayouts.map(layout => {
                const status = layout.id;
                const tasksForColumn = getTasksByStatus(status);
                const sortedTasks = sortTasks(tasksForColumn, sortOptions[status] || 'Default');
                
                return (
                    <div
                        key={status}
                        className="absolute transition-transform duration-75 ease-linear"
                        style={{
                            transform: `translate(${layout.x}px, ${layout.y}px)`,
                            zIndex: layout.zIndex
                        }}
                    >
                        <KanbanColumn
                            status={status}
                            tasks={sortedTasks}
                            allTasks={tasks}
                            onTaskMove={handleTaskMoveWithSortReset}
                            onEditTask={onEditTask}
                            onAddTask={onAddTask}
                            isCollapsed={collapsedColumns.has(status)}
                            onToggleCollapse={() => toggleColumnCollapse(status)}
                            sortOption={sortOptions[status] || 'Default'}
                            onSortChange={handleSortChange}
                            onMouseDown={(e) => handleColumnMouseDown(e, status)}
                            activeTaskTimer={activeTaskTimer}
                            onToggleTimer={onToggleTimer}
                            onOpenContextMenu={onOpenContextMenu}
                            onDeleteTask={onDeleteTask}
                        />
                    </div>
                );
            })}
        </div>
    );
};
