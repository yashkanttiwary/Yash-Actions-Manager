
import React, { useMemo } from 'react';

export const StarField: React.FC = () => {
    const stars = useMemo(() => {
        return Array.from({ length: 150 }).map((_, i) => ({
            id: i,
            top: Math.random() * 100 + '%',
            left: Math.random() * 100 + '%',
            size: Math.random() * 3 + 1 + 'px',
            delay: Math.random() * 5 + 's',
            duration: Math.random() * 3 + 2 + 's',
            opacity: Math.random() * 0.7 + 0.3
        }));
    }, []);

    return (
        <div className="fixed inset-0 bg-slate-950 z-0 overflow-hidden animate-in fade-in duration-1000 pointer-events-none">
            <style>
                {`
                @keyframes twinkle {
                    0%, 100% { opacity: 0.2; transform: scale(0.8); }
                    50% { opacity: 1; transform: scale(1.2); }
                }
                .star-twinkle {
                    animation-name: twinkle;
                    animation-iteration-count: infinite;
                    animation-timing-function: ease-in-out;
                }
                `}
            </style>
            {/* Deep Space Gradient Overlay */}
            <div className="absolute inset-0 bg-gradient-to-b from-indigo-950/50 to-black/80"></div>
            
            {stars.map(s => (
                <div 
                    key={s.id}
                    className="absolute bg-white rounded-full star-twinkle shadow-[0_0_4px_white]"
                    style={{
                        top: s.top,
                        left: s.left,
                        width: s.size,
                        height: s.size,
                        animationDelay: s.delay,
                        animationDuration: s.duration,
                        opacity: s.opacity
                    }}
                />
            ))}
        </div>
    );
};
