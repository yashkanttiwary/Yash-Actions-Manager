
import { Status, Priority } from './types';

export const UNASSIGNED_GOAL_ID = 'unassigned';

// L-02: Centralized AI Models - UPDATED to Gemini 3 Series
export const AI_MODELS = {
    // Best model for complex reasoning and JSON structure compliance
    SMART: "gemini-3-pro-preview", 
    // Faster model for simple summaries
    FAST: "gemini-3-flash-preview", 
};

export const COLUMN_STATUSES: Status[] = [
    'To Do',
    'In Progress',
    'Review',
    'Blocker',
    'Hold',
    "Won't Complete",
    'Done'
];

// K-Mode: "If the house is burning, you move. You do not paint the sign red."
// Colors are functional and factual, not emotional.
export const PRIORITY_COLORS: { [key in Priority]: { bg: string; text: string; glow: string } } = {
    'Critical': { bg: 'bg-neutral-900 dark:bg-white', text: 'text-white dark:text-black', glow: '' }, // High Contrast Fact
    'High': { bg: 'bg-neutral-200 dark:bg-neutral-700', text: 'text-neutral-800 dark:text-neutral-200', glow: '' },
    'Medium': { bg: 'bg-transparent border border-neutral-300 dark:border-neutral-600', text: 'text-neutral-600 dark:text-neutral-400', glow: '' },
    'Low': { bg: 'bg-transparent', text: 'text-neutral-400 dark:text-neutral-500', glow: '' }
};

// Centralized Priority Weights for sorting
export const PRIORITY_ORDER: Record<Priority, number> = {
    'Critical': 4,
    'High': 3,
    'Medium': 2,
    'Low': 1
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
        header: 'bg-sky-600', // Deep sky, clarity
        body: 'bg-sky-200/50 dark:bg-sky-800/50',
        cardBorder: 'border-l-4 border-l-sky-600'
    },
    'Review': {
        header: 'bg-indigo-500',
        body: 'bg-indigo-200/50 dark:bg-indigo-800/50',
        cardBorder: 'border-l-4 border-l-indigo-500'
    },
    'Blocker': {
        header: 'bg-stone-600', // A rock in the path. Factual. Not alarming red.
        body: 'bg-stone-200/50 dark:bg-stone-800/50',
        cardBorder: 'border-l-4 border-l-stone-600'
    },
    'Hold': {
        header: 'bg-neutral-500',
        body: 'bg-neutral-200/50 dark:bg-neutral-800/50',
        cardBorder: 'border-l-4 border-l-neutral-500'
    },
    "Won't Complete": {
        header: 'bg-gray-500',
        body: 'bg-gray-200/50 dark:bg-gray-800/50',
        cardBorder: 'border-l-4 border-l-gray-500'
    },
    'Done': {
        header: 'bg-emerald-600',
        body: 'bg-emerald-200/50 dark:bg-emerald-800/50',
        cardBorder: 'border-l-4 border-l-emerald-600'
    },
};

export const TAG_COLORS = [
    'bg-slate-500/80',
    'bg-zinc-500/80',
    'bg-neutral-500/80',
    'bg-stone-500/80',
    'bg-sky-600/80', // Keep one or two colors for differentiation, but muted
    'bg-emerald-600/80'
];
