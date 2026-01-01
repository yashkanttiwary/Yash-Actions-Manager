
import React from 'react';
import { Task } from '../types';

interface TrashModalProps {
    deletedTasks: Task[];
    onRestore: (taskId: string) => void;
    onDeleteForever: (taskId: string) => void;
    onEmptyTrash: () => void;
    onClose: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ 
    deletedTasks, 
    onRestore, 
    onDeleteForever, 
    onEmptyTrash, 
    onClose 
}) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div 
                className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col overflow-hidden border border-gray-200 dark:border-gray-700 animate-fadeIn" 
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <i className="fas fa-trash-alt text-red-500"></i> Trash
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Items are safe here until you permanently delete them.
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <i className="fas fa-times text-gray-500 dark:text-gray-400"></i>
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-100/50 dark:bg-black/20">
                    {deletedTasks.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 dark:text-gray-500 opacity-70">
                            <i className="fas fa-trash-restore text-4xl mb-4"></i>
                            <p>Trash is empty</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {deletedTasks.map(task => (
                                <div key={task.id} className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors">
                                    <div className="min-w-0">
                                        <h3 className="font-bold text-gray-800 dark:text-gray-200 truncate line-through decoration-red-500/50 decoration-2">
                                            {task.title}
                                        </h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                                            <span className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">{task.status}</span>
                                            <span>Deleted: {new Date(task.lastModified).toLocaleDateString()}</span>
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                        <button 
                                            onClick={() => onRestore(task.id)}
                                            className="px-3 py-1.5 text-xs font-bold bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex items-center gap-1"
                                        >
                                            <i className="fas fa-undo"></i> Restore
                                        </button>
                                        <button 
                                            onClick={() => onDeleteForever(task.id)}
                                            className="px-3 py-1.5 text-xs font-bold bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors flex items-center gap-1"
                                        >
                                            <i className="fas fa-times"></i> Forever
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {deletedTasks.length > 0 && (
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex justify-end">
                        <button 
                            onClick={() => {
                                if(confirm("Are you sure? This cannot be undone.")) onEmptyTrash();
                            }}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-lg transition-colors shadow-md flex items-center gap-2"
                        >
                            <i className="fas fa-fire"></i> Empty Trash ({deletedTasks.length})
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};