
import { useEffect } from 'react';
import { Status } from '../types';

interface ShortcutsProps {
    isSheetConfigured: boolean;
    handleOpenAddTaskModal: (status: Status) => void;
    setShowAIModal: (show: boolean) => void;
    setIsTodayView: (value: boolean | ((prev: boolean) => boolean)) => void;
    setViewMode: (value: 'kanban' | 'calendar' | ((prev: 'kanban' | 'calendar') => 'kanban' | 'calendar')) => void;
    setShowShortcutsModal: (show: boolean) => void;
    setZoomLevel: (value: number | ((prev: number) => number)) => void;
    
    // Modal State Setters for closing on Escape
    closeAllModals: () => void;
    
    // Check if any modal is open
    isAnyModalOpen: boolean;
}

export const useKeyboardShortcuts = ({
    isSheetConfigured,
    handleOpenAddTaskModal,
    setShowAIModal,
    setIsTodayView,
    setViewMode,
    setShowShortcutsModal,
    setZoomLevel,
    closeAllModals,
    isAnyModalOpen
}: ShortcutsProps) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isEditing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
    
            if (e.key === 'Escape') {
                if (isAnyModalOpen) {
                    closeAllModals();
                }
                return;
            }
    
            if (isEditing) return;
            if (!isSheetConfigured) return;

            switch (e.key.toLowerCase()) {
                case 'n':
                case 'a':
                    e.preventDefault();
                    handleOpenAddTaskModal('To Do');
                    break;
                case 'i':
                case 'm':
                    e.preventDefault();
                    setShowAIModal(true);
                    break;
                case 't':
                    e.preventDefault();
                    setIsTodayView((prev) => !prev);
                    break;
                case 'v':
                    e.preventDefault();
                    setViewMode((prev) => (prev === 'kanban' ? 'calendar' : 'kanban'));
                    break;
                case '?':
                    e.preventDefault();
                    setShowShortcutsModal(true);
                    break;
                case '-':
                    if (e.ctrlKey || e.metaKey) return; 
                    e.preventDefault();
                    setZoomLevel((prev) => Math.max(0.1, prev - 0.1));
                    break;
                case '=':
                case '+':
                    if (e.ctrlKey || e.metaKey) return; 
                    e.preventDefault();
                    setZoomLevel((prev) => Math.min(1.5, prev + 0.1));
                    break;
                case '0':
                     if (e.ctrlKey || e.metaKey) return;
                     setZoomLevel(1);
                     break;
                default:
                    break;
            }
        };
    
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [
        isSheetConfigured,
        handleOpenAddTaskModal, setShowAIModal, setIsTodayView, setViewMode, setShowShortcutsModal, setZoomLevel,
        closeAllModals, isAnyModalOpen
    ]);
};
