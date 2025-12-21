import React from 'react';

interface LineCoordinate {
  start: { x: number; y: number };
  end: { x: number; y: number };
  isBlocked: boolean;
}

interface DependencyLinesProps {
  lines: LineCoordinate[];
}

// Function to calculate a smooth S-curve path for the line
const getCurvePath = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const dx = end.x - start.x;
    // Control points for a smooth cubic bezier curve
    const cp1x = start.x + dx * 0.3;
    const cp1y = start.y;
    const cp2x = end.x - dx * 0.3;
    const cp2y = end.y;

    return `M ${start.x} ${start.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${end.x} ${end.y}`;
};


export const DependencyLines: React.FC<DependencyLinesProps> = ({ lines }) => {
  return (
    <svg 
      className="absolute top-0 left-0 w-full h-full pointer-events-none" 
      style={{ overflow: 'visible', zIndex: 1 }}
    >
      <defs>
        {/* Glow Filter */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gradients */}
        <linearGradient id="gradient-blocked" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: '#f97316' }} /> {/* orange-500 */}
          <stop offset="100%" style={{ stopColor: '#fb923c' }} /> {/* orange-400 */}
        </linearGradient>
        <linearGradient id="gradient-done" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" style={{ stopColor: '#059669' }} /> {/* emerald-600 */}
          <stop offset="100%" style={{ stopColor: '#10b981' }} /> {/* emerald-500 */}
        </linearGradient>

        {/* Markers (Endpoints) */}
        <marker
          id="arrow-blocked"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <circle cx="5" cy="5" r="4" fill="url(#gradient-blocked)" />
        </marker>
        <marker
          id="arrow-done"
          viewBox="0 0 10 10"
          refX="5"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <circle cx="5" cy="5" r="4" fill="url(#gradient-done)" />
        </marker>
      </defs>
      <g filter="url(#glow)">
        {lines.map((line, index) => {
          const pathData = getCurvePath(line.start, line.end);
          const strokeUrl = line.isBlocked ? 'url(#gradient-blocked)' : 'url(#gradient-done)';
          const markerUrl = line.isBlocked ? 'url(#arrow-blocked)' : 'url(#arrow-done)';
          const animationClass = line.isBlocked ? 'dependency-line-flow-blocked' : 'dependency-line-flow-done';

          return (
            <g key={index}>
              <path
                d={pathData}
                className={`fill-none transition-all duration-300 ${animationClass}`}
                stroke={strokeUrl}
                strokeWidth="2.5"
                strokeOpacity="0.8"
                markerEnd={markerUrl}
              />
            </g>
          );
        })}
      </g>
    </svg>
  );
};