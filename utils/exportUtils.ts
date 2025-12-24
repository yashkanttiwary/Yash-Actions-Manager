
import { Task } from '../types';

export const exportTasksToCSV = (tasks: Task[]): boolean => {
    try {
        if (!tasks || tasks.length === 0) {
            alert("No tasks to export.");
            return false;
        }

        // Define headers
        const headers = [
            'ID', 
            'Title', 
            'Status', 
            'Priority', 
            'Due Date', 
            'Tags', 
            'Time Estimate (h)', 
            'Actual Time Spent (s)', 
            'Created Date', 
            'Last Modified', 
            'Description',
            'Subtasks (Completed/Total)',
            'Blocker Reason'
        ];

        const escapeCsvCell = (cell: any) => {
            if (cell === null || cell === undefined) return '';
            const scell = String(cell);
            // If cell contains comma, newline or double quote, wrap in double quotes and escape double quotes
            if (scell.includes(',') || scell.includes('\n') || scell.includes('"')) {
                return `"${scell.replace(/"/g, '""')}"`;
            }
            return scell;
        };

        const rows = tasks.map(task => {
            const activeBlocker = task.blockers?.find(b => !b.resolved)?.reason || '';
            const completedSubtasks = task.subtasks?.filter(s => s.isCompleted).length || 0;
            const totalSubtasks = task.subtasks?.length || 0;
            const subtaskSummary = totalSubtasks > 0 ? `${completedSubtasks}/${totalSubtasks}` : '';

            return [
                task.id,
                task.title,
                task.status,
                task.priority,
                task.dueDate,
                task.tags?.join(', ') || '',
                task.timeEstimate || 0,
                task.actualTimeSpent || 0,
                task.createdDate,
                task.lastModified,
                task.description || '',
                subtaskSummary,
                activeBlocker
            ];
        });

        // Combine headers and rows
        // Add BOM for Excel compatibility
        const BOM = "\uFEFF"; 
        const csvContent = BOM + [
            headers.map(escapeCsvCell).join(','),
            ...rows.map(row => row.map(escapeCsvCell).join(','))
        ].join('\n');

        // Create download link
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `task_manager_export_${dateStr}.csv`;
        
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        link.style.display = 'none'; // Use display none instead of visibility hidden
        
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);

        return true;
    } catch (e) {
        console.error("Export failed:", e);
        return false;
    }
};
