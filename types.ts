
export type Status = 'To Do' | 'In Progress' | 'Review' | 'Blocker' | 'Hold' | "Won't Complete" | 'Done';
export type Priority = 'Critical' | 'High' | 'Medium' | 'Low';
export type SortOption = 'Default' | 'Priority' | 'Due Date' | 'Created Date';
export type SettingsTab = 'general' | 'ai' | 'api' | 'sheets' | 'calendar' | 'sounds';

export interface Goal {
    id: string;
    title: string;
    color: string; // Hex code
    description?: string;
    createdDate: string;
    progress?: number; // Calculated field (0-100)
}

export interface Subtask {
  id: string;
  title: string;
  isCompleted: boolean;
}

export interface Blocker {
  id: string;
  reason: string;
  createdDate: string;
  resolved: boolean;
  resolvedDate?: string;
}

export interface Task {
  id:string;
  title: string;
  description?: string;
  status: Status;
  priority: Priority;
  dueDate: string;
  tags?: string[];
  assignedTo?: string;
  timeEstimate?: number; // in hours
  createdDate: string;
  lastModified: string;
  subtasks?: Subtask[];
  // New fields for time awareness and gamification
  statusChangeDate: string;
  actualTimeSpent?: number; // in seconds
  completionDate?: string;
  xpAwarded?: boolean;
  scheduledStartDateTime?: string; // ISO String for calendar view
  // New fields for task dependencies
  dependencies?: string[]; // Array of task IDs this task depends on
  isBlockedByDependencies?: boolean; // True if any dependency is not 'Done'
  // Enhanced blocker tracking
  blockers?: Blocker[];
  // Fix HIGH-002: Persist timer state on the task itself
  currentSessionStartTime?: number | null; 
  // Strategic Goal Architecture
  goalId?: string;
  // Top 5 Focus Feature
  isPinned?: boolean;
}

// Added TaskDiff here to be shared
export interface TaskDiff {
    added: Partial<Task>[];
    updated: Partial<Task>[];
    deletedIds: string[];
    summary?: string;
}

export interface ColumnLayout {
  id: Status;
  x: number;
  y: number;
  w?: number; // Custom width
  h?: number; // Custom height
  zIndex: number;
}

export interface GamificationData {
  xp: number;
  level: number;
  streak: {
    current: number;
    longest: number;
    lastCompletionDate: string | null;
  };
  // Helper fields for UI (calculated on load/update)
  xpToNextLevel?: number;
  progressToNextLevel?: number; // 0-100
}

export interface AudioSettings {
    enabled: boolean;
    mode: 'brown_noise' | 'playlist';
    volume: number;
    loopMode: 'all' | 'one';
    playlist: string[]; // Array of File IDs
}

export interface Settings {
    dailyBudget: number;
    timezone: string;
    // New: User manual clock adjustment
    userTimeOffset: number; // in minutes (positive or negative)
    pomodoroFocus: number;
    pomodoroShortBreak: number;
    pomodoroLongBreak: number;
    showPomodoroTimer: boolean;
    
    // AI Settings
    geminiApiKey?: string; // Specific key for Gemini (AI Mode)

    // Integration Settings
    googleSheetId?: string; // Legacy/Advanced method
    googleAppsScriptUrl?: string; // New "Easy" method (No Client ID)
    googleCalendarId?: string;
    // Custom API Configuration (for manual setup)
    googleApiKey?: string; // GAPI Key (Drive/Calendar)
    googleClientId?: string; // GAPI Client ID (Drive/Calendar)
    // Audio
    audio: AudioSettings;
}

// New Interface for Connection Health
export interface ConnectionHealth {
    auth: { status: 'connected' | 'disconnected' | 'loading' | 'optional'; message?: string };
    sheet: { status: 'connected' | 'error' | 'pending'; message?: string; method?: 'script' | 'api' };
    calendar: { status: 'connected' | 'error' | 'pending'; message?: string };
    api: { status: 'configured' | 'missing'; message?: string };
}


// --- GOOGLE API & IDENTITY SERVICES TYPES ---
// These are minimal type definitions for the libraries loaded via CDN
declare global {
  const gapi: any;
  const google: any;

  interface Window {
      // Fix CRIT-001: Use persistent storage API
      storage: {
          get: (key: string) => Promise<string | null>;
          set: (key: string, value: string) => Promise<void>;
          remove: (key: string) => Promise<void>;
      };
  }
}
