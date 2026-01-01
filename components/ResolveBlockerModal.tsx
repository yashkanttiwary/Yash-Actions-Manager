
import React, { useCallback, useEffect } from 'react';
import { Task } from '../types';

interface ResolveBlockerModalProps {
    task: Task;
    onResolve: (task: Task) => void;
    onClose: () => void;
}

export const ResolveBlockerModal: React.FC<ResolveBlockerModalProps> = ({ task, onResolve, onClose }) => {
    
    const activeBlocker = task.blockers?.find(b => !b.resolved);

    const handleResolve = useCallback(() => {
        onResolve(task);
    }, [onResolve, task]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleResolve();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleResolve]);

    if (!activeBlocker) {
        // This should not happen if the modal is triggered correctly, but it's a safe fallback.
        onClose();
        return null;
    }

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800/80 border border-green-400 dark:border-green-500/50 rounded-2xl shadow-2xl w-full max-w-lg p-8" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4 text-green-600 dark:text-green-400 flex items-center">
                    <i className="fas fa-check-circle mr-3"></i> Resolve Blocker
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-2">You are moving the task <strong className="text-gray-800 dark:text-white">"{task.title}"</strong> out of the 'Blocker' column.</p>
                <p className="text-gray-600 dark:text-gray-300 mb-6">Please confirm that the following blocker has been resolved:</p>
                
                <div className="p-4 bg-gray-100 dark:bg-gray-900/50 rounded-lg border border-gray-300 dark:border-gray-600">
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{activeBlocker.reason}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Created on {new Date(activeBlocker.createdDate).toLocaleDateString()}</p>
                </div>

                <div className="mt-8 flex justify-end space-x-4">
                    <button onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel Move</button>
                    <button 
                        onClick={handleResolve}
                        className="px-6 py-2 rounded-lg bg-green-600 hover:bg-green-700 transition-colors font-semibold text-white"
                    >
                        Resolve Blocker & Move
                    </button>
                </div>
            </div>
        </div>
    );
};
