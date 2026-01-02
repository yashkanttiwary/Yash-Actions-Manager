import React, { useState, useCallback, useEffect } from 'react';
import { Task } from '../types';

interface BlockerModalProps {
    task: Task;
    onSetBlocker: (task: Task, reason: string) => void;
    onClose: () => void;
}

export const BlockerModal: React.FC<BlockerModalProps> = ({ task, onSetBlocker, onClose }) => {
    const [reason, setReason] = useState('');

    const handleConfirm = useCallback(() => {
        if (reason.trim()) {
            onSetBlocker(task, reason.trim());
        }
    }, [reason, onSetBlocker, task]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                handleConfirm();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleConfirm]);


    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800/80 border border-red-400 dark:border-red-500/50 rounded-2xl shadow-2xl w-full max-w-lg p-8" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-4 text-red-600 dark:text-red-400 flex items-center">
                    <i className="fas fa-exclamation-triangle mr-3"></i> Add New Blocker
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6">Specify the reason why the task <strong className="text-gray-800 dark:text-white">"{task.title}"</strong> is now blocked.</p>
                
                <textarea
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="e.g., Waiting for API key from external team..."
                    className="w-full p-3 bg-gray-100 dark:bg-gray-900/50 rounded-md border border-gray-300 dark:border-gray-600 h-28 focus:ring-2 focus:ring-red-500 focus:outline-none"
                    autoFocus
                ></textarea>

                <div className="mt-8 flex justify-end space-x-4">
                    <button onClick={onClose} className="px-6 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                    <button 
                        onClick={handleConfirm}
                        disabled={!reason.trim()}
                        className="px-6 py-2 rounded-lg bg-red-600 hover:bg-red-700 transition-colors font-semibold text-white disabled:bg-red-400 dark:disabled:bg-red-900/50 disabled:cursor-not-allowed"
                    >
                        Set Blocker
                    </button>
                </div>
            </div>
        </div>
    );
};
