
import { Task, GamificationData } from '../types';

// KRISHNAMURTI MODE:
// There is no psychological accumulation. Action is immediate.
// We strip away the "Becoming" (XP, Levels, Bonuses).

export const calculateNextLevelXP = (level: number): number => {
    return 999999; // Unattainable, irrelevant.
};

export const calculateTaskXP = (task: Task): { xp: number, bonuses: string[] } => {
    // No reward for action. The action is its own end.
    return { xp: 0, bonuses: [] };
};

export const checkLevelUp = (currentData: GamificationData, gainedXp: number): GamificationData => {
    // You remain as you are. There is no 'higher' level of self to attain.
    return {
        xp: 0,
        level: 1,
        streak: { current: 0, longest: 0, lastCompletionDate: null },
        xpToNextLevel: 100,
        progressToNextLevel: 0
    };
};

export const calculateProgress = (totalXp: number, level: number) => {
    // There is no progress bar for life.
    return {
        percentage: 0,
        currentLevelXp: 0,
        levelWidth: 100,
        isLevelUp: false,
        newLevel: 1
    };
};
