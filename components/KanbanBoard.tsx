
import React, { useState, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
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
    onQuickAddTask: (title: string, status: Status) => void; 
    onUpdateColumnLayout: (id: Status, newLayout: Omit<ColumnLayout, 'id'>) => void;
    activeTaskTimer: {taskId: string, startTime: number} | null;
    onToggleTimer: (taskId: string) => void;
    onOpenContextMenu: (e: React.MouseEvent, task: Task) => void;
    focusMode: Status | 'None';
    onDeleteTask: (taskId: string) => void;
    isCompactMode: boolean;
    isFitToScreen: boolean; 
    zoomLevel: number; 
}

interface LineCoordinate {
  start: { x: number; y: number };
  end: { x: number; y: number };
  isBlocked: boolean;
}

const priorityOrder: Record<Priority, number> = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };

const getValidDate = (dateStr: string): number => {
    const d = new Date(dateStr).getTime();
    return isNaN(d) ? 0 : d;
};

const sortTasks = (tasks: Task[], option: SortOption): Task[] => {
    const tasksToSort = [...tasks];
    switch (option) {
        case 'Priority':
            return tasksToSort.sort((a, b) => (priorityOrder[b.priority] || 0) - (priorityOrder[a.priority] || 0));
        case 'Due Date':
            return tasksToSort.sort((a, b) => {
                const dateA = getValidDate(a.dueDate);
                const dateB = getValidDate(b.dueDate);
                // Zero dates (invalid) go to bottom
                if (dateA === 0) return 1;
                if (dateB === 0) return -1;
                return dateA - dateB;
            });
        case 'Created Date':
            return tasksToSort.sort((a, b) => getValidDate(b.createdDate) - getValidDate(a.createdDate));
        case 'Default':
        default:
            return tasksToSort;
    }
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({ tasks, columns, columnLayouts, getTasksByStatus, onTaskMove, onEditTask, onAddTask, onQuickAddTask, onUpdateColumnLayout, activeTaskTimer, onToggleTimer, onOpenContextMenu, focusMode, onDeleteTask, isCompactMode, isFitToScreen, zoomLevel }) => {
    const [collapsedColumns, setCollapsedColumns] = useState<Set<Status>>(new Set());
    const [sortOptions, setSortOptions] = useState<Record<Status, SortOption>>(
        columns.reduce((acc, status) => ({...acc, [status]: 'Default'}), {}) as Record<Status, SortOption>
    );

    const [draggedColumn, setDraggedColumn] = useState<{id: Status, offset: {x: number, y: number}} | null>(null);
    const [lineCoordinates, setLineCoordinates] = useState<LineCoordinate[]>([]);
    
    const [layoutTick, setLayoutTick] = useState(0); 
    
    const triggerLayoutUpdate = useCallback(() => setLayoutTick(t => t + 1), []);
    
    const boardRef = useRef<HTMLDivElement>(null);
    const mainContainerRef = useRef<HTMLElement | null>(null);

    // Optimized Dependency Line Calculation (Batch Read -> Batch Write)
    useLayoutEffect(() => {
        if (!boardRef.current) return;
        mainContainerRef.current = document.querySelector('main');
        let animationFrameId: number;
        let lastCalcTime = 0;
        const THROTTLE_MS = 32; 
        
        const calculateLines = () => {
            const now = performance.now();
            if (now - lastCalcTime < THROTTLE_MS) {
                animationFrameId = requestAnimationFrame(calculateLines);
                return;
            }
            lastCalcTime = now;

            if (focusMode !== 'None' || isFitToScreen) {
                setLineCoordinates([]);
                return;
            }

            const dependentTasks = tasks.filter(t => t.dependencies && t.dependencies.length > 0);
            if (dependentTasks.length === 0) {
                 setLineCoordinates(prev => prev.length === 0 ? prev : []);
                 return;
            }

            const boardRect = boardRef.current!.getBoundingClientRect();
            const newLines: LineCoordinate[] = [];
            const taskMap = new Map<string, Task>(tasks.map(t => [t.id, t]));

            // Batch Read: Collect all necessary element IDs first
            const neededElementIds = new Set<string>();
            dependentTasks.forEach(t => {
                neededElementIds.add(t.id);
                t.dependencies!.forEach(depId => neededElementIds.add(depId));
            });

            // Batch Read: Query all Rects in one go (reduce layout thrashing)
            // We use a Map to store rects by TaskID
            const rectMap = new Map<string, DOMRect>();
            neededElementIds.forEach(id => {
                const el = document.querySelector(`[data-task-id="${id}"]`);
                if (el) rectMap.set(id, el.getBoundingClientRect());
            });

            // Calculation Pass
            dependentTasks.forEach(task => {
                const endRect = rectMap.get(task.id);
                if (!endRect) return;

                const end = {
                    x: (endRect.left - boardRect.left) / zoomLevel,
                    y: (endRect.top + endRect.height / 2 - boardRect.top) / zoomLevel
                };

                task.dependencies!.forEach(depId => {
                    const depTask = taskMap.get(depId);
                    const startRect = rectMap.get(depId);
                    if (!startRect || !depTask) return;

                    const start = {
                        x: (startRect.right - boardRect.left) / zoomLevel,
                        y: (startRect.top + startRect.height / 2 - boardRect.top) / zoomLevel
                    };
                    
                    newLines.push({ start, end, isBlocked: depTask.status !== 'Done' });
                });
            });
            
            // Optimization: Deep compare
            setLineCoordinates(prevLines => {
                if (prevLines.length !== newLines.length) return newLines;
                const isSame = prevLines.every((l, i) => 
                    l.start.x === newLines[i].start.x && 
                    l.start.y === newLines[i].start.y &&
                    l.end.x === newLines[i].end.x &&
                    l.end.y === newLines[i].end.y &&
                    l.isBlocked === newLines[i].isBlocked
                );
                return isSame ? prevLines : newLines;
            });
        };
        
        const onScrollOrResize = () => {
             if (animationFrameId) cancelAnimationFrame(animationFrameId);
             animationFrameId = requestAnimationFrame(calculateLines);
        };

        calculateLines();
        
        const container = mainContainerRef.current;
        container?.addEventListener('scroll', onScrollOrResize, { passive: true });
        window.addEventListener('resize', onScrollOrResize, { passive: true });
        
        const observer = new MutationObserver(onScrollOrResize);
        observer.observe(boardRef.current, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });

        return () => {
            container?.removeEventListener('scroll', onScrollOrResize);
            window.removeEventListener('resize', onScrollOrResize);
            observer.disconnect();
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
        };

    }, [tasks, columnLayouts, collapsedColumns, focusMode, isCompactMode, layoutTick, zoomLevel, isFitToScreen]);


    const handleSortChange = (status: Status, option: SortOption) => {
        setSortOptions(prev => ({ ...prev, [status]: option }));
    };
    
    const handleTaskMoveWithSortReset = (taskId: string, newStatus: Status, newIndex: number) => {
        onTaskMove(taskId, newStatus, newIndex);
        // We only reset sort if dropping into a new column to allow custom ordering,
        // but if it's already sorted, custom order doesn't apply anyway.
        // Keeping reset for consistency or maybe remove it? Audit didn't complain about reset specifically.
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
        if (focusMode !== 'None' || isFitToScreen) return;
        if ((e.target as HTMLElement).closest('.resize-handle')) return;

        const layout = columnLayouts.find(c => c.id === columnId);
        if (!layout || !boardRef.current) return;
        
        onUpdateColumnLayout(columnId, { ...layout, zIndex: 50 }); 

        setDraggedColumn({
            id: columnId,
            offset: {
                x: e.clientX - (layout.x * zoomLevel),
                y: e.clientY - (layout.y * zoomLevel),
            }
        });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!draggedColumn || !boardRef.current) return;
        e.preventDefault();

        const layout = columnLayouts.find(c => c.id === draggedColumn.id);
        if (!layout) return;

        const newX = (e.clientX - draggedColumn.offset.x) / zoomLevel;
        const newY = (e.clientY - draggedColumn.offset.y) / zoomLevel;
        
        onUpdateColumnLayout(draggedColumn.id, { ...layout, x: newX, y: newY });
    };

    const handleMouseUp = () => {
        if (draggedColumn) {
            const layout = columnLayouts.find(c => c.id === draggedColumn.id);
            if(layout) {
                onUpdateColumnLayout(draggedColumn.id, { ...layout, zIndex: 10 }); 
            }
        }
        setDraggedColumn(null);
    };

    const handleColumnResize = (id: Status, newW: number, newH: number) => {
        const layout = columnLayouts.find(c => c.id === id);
        if (layout) {
            onUpdateColumnLayout(id, { ...layout, w: newW, h: newH });
        }
    };
    
    const boardContentWidth = useMemo(() => {
        let maxRight = 0;
        columnLayouts.forEach(layout => {
            const width = collapsedColumns.has(layout.id) ? 80 : (layout.w || 320); 
            const right = layout.x + width;
            if (right > maxRight) maxRight = right;
        });
        return maxRight + 100;
    }, [columnLayouts, collapsedColumns]);

    if (focusMode !== 'None') {
        const tasksForColumn = getTasksByStatus(focusMode);
        const sortedTasks = sortTasks(tasksForColumn, sortOptions[focusMode] || 'Default');

        return (
            <div 
                className="w-full h-full flex justify-center items-start pt-8"
                ref={boardRef}
                style={{ 
                    transform: `scale(${zoomLevel})`, 
                    transformOrigin: 'top center' 
                }}
            >
                 <div className="h-full">
                    <KanbanColumn
                        status={focusMode}
                        tasks={sortedTasks}
                        allTasks={tasks}
                        onTaskMove={handleTaskMoveWithSortReset}
                        onEditTask={onEditTask}
                        onAddTask={onAddTask}
                        onQuickAddTask={(title) => onQuickAddTask(title, focusMode)}
                        isCollapsed={false}
                        onToggleCollapse={() => {}}
                        sortOption={sortOptions[focusMode] || 'Default'}
                        onSortChange={handleSortChange}
                        onMouseDown={(e) => {}}
                        activeTaskTimer={activeTaskTimer}
                        onToggleTimer={onToggleTimer}
                        onOpenContextMenu={onOpenContextMenu}
                        onDeleteTask={onDeleteTask}
                        isCompactMode={isCompactMode}
                        onTaskSizeChange={triggerLayoutUpdate}
                        width={undefined} 
                        height={undefined}
                        onResize={() => {}}
                        zoomLevel={zoomLevel}
                    />
                 </div>
            </div>
        );
    }
    
    if (isFitToScreen) {
        const INVERSE_WIDTH = 100 / Math.max(0.1, zoomLevel);

        return (
             <div 
                ref={boardRef}
                className="w-full h-full overflow-y-auto overflow-x-hidden bg-gray-50/50 dark:bg-black/10"
            >
                 <div
                    style={{
                        transform: `scale(${zoomLevel})`,
                        transformOrigin: 'top left',
                        width: `${INVERSE_WIDTH}%`,
                        minHeight: '100%' 
                    }}
                    className="flex flex-wrap justify-center items-start content-start p-8 gap-8"
                >
                 {columns.map(status => {
                     const tasksForColumn = getTasksByStatus(status);
                     const sortedTasks = sortTasks(tasksForColumn, sortOptions[status] || 'Default');
                     
                     const layout = columnLayouts.find(c => c.id === status);
                     const width = layout?.w || 320;
                     const height = layout?.h || 350;

                     return (
                         <div key={status} className="flex-shrink-0 mb-4">
                             <KanbanColumn
                                status={status}
                                tasks={sortedTasks}
                                allTasks={tasks}
                                onTaskMove={handleTaskMoveWithSortReset}
                                onEditTask={onEditTask}
                                onAddTask={onAddTask}
                                onQuickAddTask={(title) => onQuickAddTask(title, status)}
                                isCollapsed={collapsedColumns.has(status)}
                                onToggleCollapse={() => toggleColumnCollapse(status)}
                                sortOption={sortOptions[status] || 'Default'}
                                onSortChange={handleSortChange}
                                onMouseDown={(e) => e.preventDefault()}
                                activeTaskTimer={activeTaskTimer}
                                onToggleTimer={onToggleTimer}
                                onOpenContextMenu={onOpenContextMenu}
                                onDeleteTask={onDeleteTask}
                                isCompactMode={isCompactMode}
                                onTaskSizeChange={triggerLayoutUpdate}
                                width={width} 
                                height={height}
                                onResize={(w, h) => handleColumnResize(status, w, h)}
                                zoomLevel={zoomLevel}
                            />
                         </div>
                     )
                 })}
                </div>
            </div>
        )
    }

    return (
        <div 
            className="w-full h-full relative"
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ 
                minWidth: '100%', 
                minHeight: '100%' 
            }}
        >
            <div
                ref={boardRef}
                className="relative"
                style={{
                    transform: `scale(${zoomLevel})`,
                    transformOrigin: '0 0',
                    width: `${boardContentWidth}px`, 
                    minWidth: zoomLevel < 1 ? `${100 / zoomLevel}%` : '100%',
                    height: zoomLevel < 1 ? `${100 / zoomLevel}%` : '100%',
                }}
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
                                onQuickAddTask={(title) => onQuickAddTask(title, status)}
                                isCollapsed={collapsedColumns.has(status)}
                                onToggleCollapse={() => toggleColumnCollapse(status)}
                                sortOption={sortOptions[status] || 'Default'}
                                onSortChange={handleSortChange}
                                onMouseDown={(e) => handleColumnMouseDown(e, status)}
                                activeTaskTimer={activeTaskTimer}
                                onToggleTimer={onToggleTimer}
                                onOpenContextMenu={onOpenContextMenu}
                                onDeleteTask={onDeleteTask}
                                isCompactMode={isCompactMode}
                                onTaskSizeChange={triggerLayoutUpdate}
                                width={layout.w}
                                height={layout.h}
                                onResize={(w, h) => handleColumnResize(status, w, h)}
                                zoomLevel={zoomLevel}
                            />
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
