
import React from 'react';

interface ShortcutsModalProps {
    onClose: () => void;
}

const shortcuts = [
    { keys: ['N'], description: 'Add a new task to "To Do"' },
    { keys: ['A'], description: 'Alias for adding a new task' },
    { keys: ['I'], description: 'Open AI Assistant' },
    { keys: ['M'], description: 'Alias for opening AI Assistant' },
    { keys: ['T'], description: 'Toggle "Today" view' },
    { keys: ['V'], description: 'Switch between Board and Calendar view' },
    { keys: ['?'], description: 'Show this shortcuts guide' },
    { keys: ['Esc'], description: 'Close any open modal or dialog' },
    { keys: ['Cmd/Ctrl', '+', 'S'], description: 'Save changes in the task editor' },
    { keys: ['Cmd/Ctrl', '+', 'Enter'], description: 'Submit action in modals (e.g., AI command)' },
];

export const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ onClose }) => {
    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[100] p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800/80 rounded-2xl shadow-2xl w-full max-w-lg p-6 sm:p-8" onClick={e => e.stopPropagation()}>
                <h2 className="text-2xl font-bold mb-6 text-gray-900 dark:text-gray-100 flex items-center">
                    <i className="far fa-keyboard mr-3"></i> Keyboard Shortcuts
                </h2>
                <ul className="space-y-3">
                    {shortcuts.map(({ keys, description }) => (
                        <li key={description} className="flex items-center justify-between p-2 rounded-md bg-gray-100 dark:bg-gray-900/50">
                            <span className="text-gray-600 dark:text-gray-300">{description}</span>
                            <div className="flex items-center gap-1">
                                {keys.map((key, index) => (
                                    <React.Fragment key={key}>
                                        {index > 0 && <span className="text-gray-400">+</span>}
                                        <kbd className="px-2 py-1 text-sm font-semibold text-gray-800 bg-gray-200 border border-gray-300 rounded-md dark:bg-gray-700 dark:text-gray-200 dark:border-gray-500">
                                            {key}
                                        </kbd>
                                    </React.Fragment>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>
                 <div className="mt-8 flex justify-end">
                    <button onClick={onClose} className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 transition-colors font-semibold text-white">Got it!</button>
                </div>
            </div>
        </div>
    );
};
