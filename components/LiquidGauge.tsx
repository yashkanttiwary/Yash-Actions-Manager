
import React from 'react';

interface LiquidGaugeProps {
    value: number;
    max: number;
    label: string;
    type: 'fuel' | 'xp';
    subLabel?: string;
}

export const LiquidGauge: React.FC<LiquidGaugeProps> = ({ value, max, label, type, subLabel }) => {
    // In Krishnamurti mode, we simply observe the fact of time.
    // No "XP" gauges are rendered (if passed, we render null or empty).
    if (type === 'xp') return null;

    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    
    // We remove the "Overload" judgment. 
    // If tasks exceed the day, it is just a fact: "20 hours estimated". 
    // It is not a failure.
    
    return (
        <div className="flex flex-col w-full min-w-[120px] select-none group relative" title={`Estimated: ${value.toFixed(1)}h`}>
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider mb-1 px-1">
                <span className="text-gray-500">
                    <i className="far fa-clock mr-1"></i>
                    Time Fact
                </span>
                <span className="text-gray-600 dark:text-gray-400">
                    {value.toFixed(1)}h / {max}h
                </span>
            </div>
            
            <div className="relative h-6 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden border border-gray-300 dark:border-gray-700 shadow-inner">
                {/* Main Liquid - Neutral Blue/Slate */}
                <div 
                    className="absolute left-0 top-0 bottom-0 transition-all duration-1000 ease-out bg-slate-400 dark:bg-slate-600"
                    style={{ width: `${percentage}%` }}
                >
                    {/* Minimal Gloss */}
                    <div className="absolute top-1 left-2 right-2 h-1.5 bg-white/10 rounded-full"></div>
                </div>

                {/* Markers - Simple division of the day */}
                <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
                    <div className="w-px h-full bg-black dark:bg-white" style={{ left: '25%' }}></div>
                    <div className="w-px h-full bg-black dark:bg-white" style={{ left: '50%' }}></div>
                    <div className="w-px h-full bg-black dark:bg-white" style={{ left: '75%' }}></div>
                </div>
            </div>
            
            {/* "Overload" is removed. If you have more to do than time allows, you simply see the number. */}
        </div>
    );
};
