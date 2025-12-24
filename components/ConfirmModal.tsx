
import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    isDestructive = false,
    onConfirm,
    onCancel
}) => {
    const confirmButtonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Focus confirm button for accessibility/quick action
            setTimeout(() => confirmButtonRef.current?.focus(), 50);
            
            const handleKeyDown = (e: KeyboardEvent) => {
                if (e.key === 'Escape') onCancel();
            };
            window.addEventListener('keydown', handleKeyDown);
            return () => window.removeEventListener('keydown', handleKeyDown);
        }
    }, [isOpen, onCancel]);

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn" onClick={onCancel}>
            <div 
                className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md overflow-hidden transform transition-all scale-100"
                onClick={e => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="confirm-title"
                aria-describedby="confirm-desc"
            >
                <div className="p-6">
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${isDestructive ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400'}`}>
                            <i className={`fas ${isDestructive ? 'fa-exclamation-triangle' : 'fa-info-circle'} text-lg`}></i>
                        </div>
                        <h3 id="confirm-title" className="text-xl font-bold text-gray-900 dark:text-white">
                            {title}
                        </h3>
                    </div>
                    <p id="confirm-desc" className="text-gray-600 dark:text-gray-300 ml-13">
                        {message}
                    </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 px-6 py-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors font-medium text-sm"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        ref={confirmButtonRef}
                        onClick={onConfirm}
                        className={`px-4 py-2 rounded-lg text-white font-bold shadow-md transition-colors text-sm flex items-center gap-2 ${
                            isDestructive 
                                ? 'bg-red-600 hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800' 
                                : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800'
                        }`}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};
