
import React, { useMemo } from 'react';

interface DayContainerProps {
    dailyBudget: number; // in hours
    usedBudget: number; // in hours
}

export const DayContainer: React.FC<DayContainerProps> = ({ dailyBudget, usedBudget }) => {
    const percentage = Math.min(100, (usedBudget / dailyBudget) * 100);
    const isOverflowing = usedBudget > dailyBudget;
    const overflowPercentage = isOverflowing ? Math.min(100, ((usedBudget - dailyBudget) / dailyBudget) * 100) : 0;

    const liquidColor = percentage > 85 ? 'bg-amber-500' : 'bg-indigo-500';
    
    // Bubble animation styles handled via standard CSS/Tailwind where possible, or inline styles for dynamic vals
    
    return (
        <div className="flex flex-col w-full max-w-[200px] select-none group relative" title={`Time Budget: ${usedBudget.toFixed(1)}h / ${dailyBudget}h`}>
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1 px-1">
                <span>Fuel</span>
                <span className={`${isOverflowing ? 'text-red-500 animate-pulse' : ''}`}>{Math.round(percentage)}%</span>
            </div>
            
            <div className="relative h-6 bg-gray-200 dark:bg-gray-800 rounded-full overflow-visible border border-gray-300 dark:border-gray-700 shadow-inner">
                {/* Main Liquid */}
                <div 
                    className={`absolute left-0 top-0 bottom-0 rounded-full transition-all duration-1000 ease-out flex items-center justify-end px-2 overflow-hidden ${liquidColor} dark:opacity-80`}
                    style={{ width: `${percentage}%` }}
                >
                    {/* Bubbles Overlay (Simulated via simple gradient/opacity) */}
                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxjaXJjbGUgY3g9IjQiIGN5PSI0IiByPSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMikiLz48L3N2Zz4=')] opacity-30 animate-[slide_4s_linear_infinite]"></div>
                    
                    {/* Gloss */}
                    <div className="absolute top-1 left-2 right-2 h-1.5 bg-white/20 rounded-full"></div>
                </div>

                {/* Overflow Extension */}
                {isOverflowing && (
                    <div 
                        className="absolute top-0 bottom-0 left-full h-full bg-red-500 rounded-r-full flex items-center justify-center animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)] z-10 origin-left transition-all duration-500"
                        style={{ width: `${Math.min(50, overflowPercentage)}px`, minWidth: '10px' }} // Cap visual overflow
                    >
                        <i className="fas fa-exclamation text-white text-[10px]"></i>
                    </div>
                )}
                
                {/* Markers */}
                <div className="absolute inset-0 flex justify-between px-2 pointer-events-none">
                    <div className="w-px h-full bg-black/10 dark:bg-white/10" style={{ left: '25%' }}></div>
                    <div className="w-px h-full bg-black/10 dark:bg-white/10" style={{ left: '50%' }}></div>
                    <div className="w-px h-full bg-black/10 dark:bg-white/10" style={{ left: '75%' }}></div>
                </div>
            </div>
            
            {isOverflowing && (
                <div className="absolute top-full left-0 right-0 text-center mt-1">
                    <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold border border-red-200">
                        OVERLOAD (+{(usedBudget - dailyBudget).toFixed(1)}h)
                    </span>
                </div>
            )}
        </div>
    );
};
