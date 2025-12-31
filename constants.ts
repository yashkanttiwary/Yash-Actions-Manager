
import { Status, Priority } from './types';

export const UNASSIGNED_GOAL_ID = 'unassigned';

export const COLUMN_STATUSES: Status[] = [
    'To Do',
    'In Progress',
    'Review',
    'Blocker',
    'Hold',
    "Won't Complete",
    'Done'
];

// K-Mode: Removed "glow" to reduce nervous system arousal. Colors are flat and functional.
export const PRIORITY_COLORS: { [key in Priority]: { bg: string; text: string; glow: string } } = {
    'Critical': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', glow: '' },
    'High': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', glow: '' },
    'Medium': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', glow: '' },
    'Low': { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-600 dark:text-gray-400', glow: '' }
};

// K-Mode: Shift from emotional pressure to chronological fact.
export const PRIORITY_LABELS: Record<Priority, string> = {
    'Critical': 'Immediate',
    'High': 'Necessary',
    'Medium': 'Normal',
    'Low': 'Low'
};

export const STATUS_STYLES: { [key in Status]: { header: string; body: string; cardBorder: string; } } = {
    'To Do': {
        header: 'bg-slate-500',
        body: 'bg-slate-200/50 dark:bg-slate-800/50',
        cardBorder: 'border-l-4 border-l-slate-500'
    },
    'In Progress': {
        header: 'bg-sky-500',
        body: 'bg-sky-200/50 dark:bg-sky-800/50',
        cardBorder: 'border-l-4 border-l-sky-500'
    },
    'Review': {
        header: 'bg-purple-500',
        body: 'bg-purple-200/50 dark:bg-purple-800/50',
        cardBorder: 'border-l-4 border-l-purple-500'
    },
    'Blocker': {
        header: 'bg-red-600',
        body: 'bg-red-200/50 dark:bg-red-800/50',
        cardBorder: 'border-l-4 border-l-red-600'
    },
    'Hold': {
        header: 'bg-amber-500',
        body: 'bg-amber-200/50 dark:bg-amber-800/50',
        cardBorder: 'border-l-4 border-l-amber-500'
    },
    "Won't Complete": {
        header: 'bg-stone-600',
        body: 'bg-stone-200/50 dark:bg-stone-800/50',
        cardBorder: 'border-l-4 border-l-stone-600'
    },
    'Done': {
        header: 'bg-green-600',
        body: 'bg-green-200/50 dark:bg-green-800/50',
        cardBorder: 'border-l-4 border-l-green-600'
    },
};

export const TAG_COLORS = [
    'bg-pink-500/80',
    'bg-purple-500/80',
    'bg-indigo-500/80',
    'bg-green-500/80',
    'bg-teal-500/80',
    'bg-cyan-500/80',
    'bg-red-500/80',
    'bg-orange-500/80',
    'bg-yellow-500/80',
    'bg-lime-500/80',
    'bg-sky-500/80',
    'bg-rose-500/80'
];
