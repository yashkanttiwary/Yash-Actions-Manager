
import { Task, GamificationData } from '../types';

const XP_TABLE = {
    BASE_PER_TASK: 10,
    PER_PRIORITY: {
        'Critical': 150,
        'High': 80,
        'Medium': 40,
        'Low': 15
    },
    PER_HOUR_ESTIMATE: 20, // 20 XP per estimated hour
    EFFICIENCY_BONUS_MULTIPLIER: 0.2 // 20% bonus if actual time < estimated time
};

export const calculateNextLevelXP = (level: number): number => {
    // Simple linear scaling for now: Level 1 = 100xp, Level 2 = 200xp needed, etc.
    // Total XP needed for level N = (N * (N-1) / 2) * 100 + (N * 100) ? 
    // Let's keep it simple: Threshold for Level N is N * 100.
    // Wait, standard RPG is accumulative. 
    // Level 1: 0-100
    // Level 2: 100-300 (needs 200)
    // Level 3: 300-600 (needs 300)
    
    // Let's stick to the previous simple model: Next Level Threshold = Level * 100 relative to previous?
    // The previous app used `level * 100`. Let's stick to that for consistency but make it robust.
    return level * 100; 
};

export const calculateTaskXP = (task: Task): { xp: number, bonuses: string[] } => {
    let xp = XP_TABLE.BASE_PER_TASK;
    const bonuses: string[] = [];

    // 1. Priority Bonus
    const priorityXP = XP_TABLE.PER_PRIORITY[task.priority] || 0;
    xp += priorityXP;
    if (priorityXP > 0) bonuses.push(`${task.priority} Priority`);

    // 2. Size Bonus (Time Estimate)
    if (task.timeEstimate && task.timeEstimate > 0) {
        const sizeXP = Math.round(task.timeEstimate * XP_TABLE.PER_HOUR_ESTIMATE);
        xp += sizeXP;
        bonuses.push(`Size (${task.timeEstimate}h)`);
    }

    // 3. Efficiency Bonus
    // Only applies if we have valid tracking data
    if (task.timeEstimate && task.actualTimeSpent && task.actualTimeSpent > 0) {
        const actualHours = task.actualTimeSpent / 3600;
        // Buffer: If within 10% of estimate, still count as efficient
        if (actualHours <= task.timeEstimate * 1.1) {
            const bonus = Math.round(xp * XP_TABLE.EFFICIENCY_BONUS_MULTIPLIER);
            xp += bonus;
            bonuses.push("Efficiency Bonus ⚡");
        }
    }

    return { xp, bonuses };
};

export const checkLevelUp = (currentData: GamificationData, gainedXp: number): GamificationData => {
    let { xp, level, streak } = currentData;
    xp += gainedXp;

    let xpNeeded = calculateNextLevelXP(level);
    
    // While loop to handle multi-level jumps (rare but possible with big tasks)
    while (xp >= xpNeeded) {
        xp -= xpNeeded;
        level++;
        xpNeeded = calculateNextLevelXP(level);
    }

    // Calculate progress for UI
    const progressToNextLevel = (xp / xpNeeded) * 100;

    return {
        xp, // This is now "Current XP in this level" effectively, or total? 
        // Standard RPGs usually track Total XP. 
        // But for the previous logic `newXp >= xpForNextLevel`, it implied Total XP.
        // Let's refactor to Total XP model to avoid data loss.
        // REVISION: The previous code was:
        // const newXp = prev.xp + earnedXp;
        // let xpForNextLevel = newLevel * 100;
        // if (newXp >= xpForNextLevel) level++...
        
        // This implies XP does NOT reset. It is cumulative total.
        // So Level 2 is at 100 total XP. Level 3 is at 200 total XP? That's too easy.
        // Let's make it: Level N requires N * 100 XP *cumulative*.
        // Lvl 1->2: 100xp. Total 100.
        // Lvl 2->3: 200xp. Total 300.
        // Formula: Total XP for Level L = 100 * (L * (L-1) / 2) ?
        // Let's stick to a simpler curve: Threshold = Level^2 * 100.
        
        level,
        streak,
        xpToNextLevel: xpNeeded, // For display
        progressToNextLevel
    };
};

// Helper to get raw progress based on TOTAL XP model
export const calculateProgress = (totalXp: number, level: number) => {
    // Previous threshold (Level L-1)
    const prevThreshold = (level - 1) * 100; // Simple linear as per old app?
    // Let's adhere to the User's "keep it simple" request initially but make it robust.
    
    // To preserve compatibility, let's assume:
    // Level 1: 0-100 XP
    // Level 2: 100-300 XP (Width 200)
    // Level 3: 300-600 XP (Width 300)
    
    // Calculate lower bound of current level
    let lowerBound = 0;
    for(let i=1; i<level; i++) {
        lowerBound += i * 100;
    }
    
    // Calculate upper bound of current level
    const upperBound = lowerBound + (level * 100);
    
    const currentLevelXp = totalXp - lowerBound;
    const levelWidth = upperBound - lowerBound;
    
    const percentage = Math.min(100, Math.max(0, (currentLevelXp / levelWidth) * 100));
    
    return {
        percentage,
        currentLevelXp,
        levelWidth,
        isLevelUp: totalXp >= upperBound,
        newLevel: totalXp >= upperBound ? level + 1 : level
    };
};
