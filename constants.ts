
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

export const PRIORITY_COLORS: { [key in Priority]: { bg: string; text: string; glow: string } } = {
    'Critical': { bg: 'bg-red-500/20', text: 'text-red-400', glow: 'hover:shadow-red-500/40' },
    'High': { bg: 'bg-orange-500/20', text: 'text-orange-400', glow: 'hover:shadow-orange-500/40' },
    'Medium': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', glow: 'hover:shadow-yellow-500/40' },
    'Low': { bg: 'bg-blue-500/20', text: 'text-blue-400', glow: 'hover:shadow-blue-500/40' }
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
