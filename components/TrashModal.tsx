
import React from 'react';
import { Task } from '../types';

interface TrashModalProps {
    deletedTasks: Task[];
    onRestore: (taskId: string) => void;
    onDeleteForever: (taskId: string) => void;
    onEmptyTrash: () => void;
    onClose: () => void;
}

export const TrashModal: React.FC<TrashModalProps> = ({ deletedTasks, onRestore, onDeleteForever, onEmptyTrash, onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4 animate-fadeIn" onClick={onClose}>
            <div 
                className="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-700 flex flex-col max-h-[80vh]" 
                onClick={e => e.stopPropagation()}
            >
                <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                    <div>
                        <h3 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <i className="fas fa-trash-alt text-red-500"></i> Trash
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Items are hidden from the board but synced as "deleted".
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
                        <i className="fas fa-times text-gray-500"></i>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {deletedTasks.length === 0 ? (
                        <div className="text-center py-10 opacity-50">
                            <i className="fas fa-wind text-4xl mb-3 text-gray-300"></i>
                            <p>Trash is empty.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {deletedTasks.map(task => (
                                <div key={task.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-100 dark:border-gray-700/50 group">
                                    <div className="min-w-0">
                                        <h4 className="font-bold text-sm text-gray-800 dark:text-gray-200 truncate">{task.title}</h4>
                                        <p className="text-xs text-gray-500">Deleted: {new Date(task.lastModified).toLocaleDateString()}</p>
                                    </div>
                                    <div className="flex gap-2 opacity-60 group-hover:opacity-100 transition-opacity">
                                        <button 
                                            onClick={() => onRestore(task.id)}
                                            className="p-2 hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 rounded transition-colors"
                                            title="Restore"
                                        >
                                            <i className="fas fa-undo"></i>
                                        </button>
                                        <button 
                                            onClick={() => onDeleteForever(task.id)}
                                            className="p-2 hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 rounded transition-colors"
                                            title="Delete Forever"
                                        >
                                            <i className="fas fa-times"></i>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {deletedTasks.length > 0 && (
                    <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
                        <button 
                            onClick={() => {
                                if(window.confirm("Permanently delete all items? This cannot be undone.")) {
                                    onEmptyTrash();
                                }
                            }}
                            className="text-xs font-bold text-red-600 hover:bg-red-50 px-3 py-2 rounded transition-colors"
                        >
                            Empty Trash
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
