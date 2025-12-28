
import React from 'react';

interface LiquidGaugeProps {
    value: number;
    max: number;
    label: string;
    type: 'fuel' | 'xp';
    subLabel?: string;
}

export const LiquidGauge: React.FC<LiquidGaugeProps> = ({ value, max, label, type, subLabel }) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100));
    const isOverflowing = value > max;
    const overflowPercentage = isOverflowing ? Math.min(100, ((value - max) / max) * 100) : 0;

    // Configuration based on Type
    const config = {
        fuel: {
            color: percentage > 85 ? 'bg-amber-500' : 'bg-indigo-500',
            icon: 'fas fa-gas-pump',
            bubbleColor: 'rgba(255,255,255,0.2)',
            textColor: isOverflowing ? 'text-red-500 animate-pulse' : 'text-gray-500 dark:text-gray-400',
            containerBg: 'bg-gray-200 dark:bg-gray-800'
        },
        xp: {
            color: 'bg-purple-600',
            icon: 'fas fa-bolt',
            bubbleColor: 'rgba(255, 215, 0, 0.3)', // Gold bubbles
            textColor: 'text-purple-600 dark:text-purple-400',
            containerBg: 'bg-gray-200 dark:bg-gray-800'
        }
    }[type];

    return (
        <div className="flex flex-col w-full min-w-[120px] select-none group relative" title={`${label}: ${value.toFixed(1)} / ${max}`}>
            <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-wider mb-1 px-1">
                <span className={type === 'xp' ? 'text-purple-500' : 'text-gray-500'}>
                    <i className={`${config.icon} mr-1`}></i>
                    {label}
                </span>
                <span className={config.textColor}>
                    {subLabel ? subLabel : `${Math.round(percentage)}%`}
                </span>
            </div>
            
            <div className={`relative h-6 ${config.containerBg} rounded-full overflow-visible border border-gray-300 dark:border-gray-700 shadow-inner`}>
                {/* Main Liquid */}
                <div 
                    className={`absolute left-0 top-0 bottom-0 rounded-full transition-all duration-1000 ease-out flex items-center justify-end px-2 overflow-hidden ${config.color} dark:opacity-90`}
                    style={{ width: `${percentage}%` }}
                >
                    {/* Bubbles Overlay */}
                    <div 
                        className="absolute inset-0 opacity-30 animate-[slide_4s_linear_infinite]"
                        style={{ 
                            backgroundImage: `radial-gradient(${config.bubbleColor} 1px, transparent 1px)`,
                            backgroundSize: '8px 8px'
                        }}
                    ></div>
                    
                    {/* Gloss Reflection */}
                    <div className="absolute top-1 left-2 right-2 h-1.5 bg-white/20 rounded-full"></div>
                    
                    {/* XP Sparkles */}
                    {type === 'xp' && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 text-yellow-300 text-[10px] animate-pulse">
                            ✨
                        </div>
                    )}
                </div>

                {/* Overflow Extension (Fuel Only) */}
                {type === 'fuel' && isOverflowing && (
                    <div 
                        className="absolute top-0 bottom-0 left-full h-full bg-red-500 rounded-r-full flex items-center justify-center animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)] z-10 origin-left transition-all duration-500"
                        style={{ width: `${Math.min(50, overflowPercentage)}px`, minWidth: '10px' }} 
                    >
                        <i className="fas fa-exclamation text-white text-[10px]"></i>
                    </div>
                )}
                
                {/* Markers */}
                <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
                    <div className="w-px h-full bg-black dark:bg-white" style={{ left: '25%' }}></div>
                    <div className="w-px h-full bg-black dark:bg-white" style={{ left: '50%' }}></div>
                    <div className="w-px h-full bg-black dark:bg-white" style={{ left: '75%' }}></div>
                </div>
            </div>
            
            {type === 'fuel' && isOverflowing && (
                <div className="absolute top-full left-0 right-0 text-center mt-1 z-20">
                    <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold border border-red-200 shadow-sm whitespace-nowrap">
                        OVERLOAD (+{(value - max).toFixed(1)}h)
                    </span>
                </div>
            )}
        </div>
    );
};
