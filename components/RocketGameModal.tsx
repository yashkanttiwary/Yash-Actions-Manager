import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { storage } from '../utils/storage';
import { playRetroSound } from '../utils/audio';

interface RocketGameModalProps {
    onClose: () => void;
}

// --- GAME TYPES ---
type Entity = {
    x: number;
    y: number;
    w: number;
    h: number;
    vx: number;
    vy: number;
    type: 'player' | 'asteroid' | 'barrier' | 'bullet' | 'particle' | 'star';
    color: string;
    hp?: number;
    rotation?: number;
    life?: number;    // For particles
    maxLife?: number; // For fade out calculations
    scoreValue?: number;
};

export const RocketGameModal: React.FC<RocketGameModalProps> = ({ onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [gameState, setGameState] = useState<'start' | 'playing' | 'gameover'>('start');
    const [score, setScore] = useState(0);
    const [highScore, setHighScore] = useState(0);

    // --- GAME ENGINE REFS ---
    const requestRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0); // Delta time tracking
    const scoreRef = useRef(0);
    const gameSpeed = useRef(200); // Pixels per second (Base Speed)
    const shakeIntensity = useRef(0);
    
    // Entities
    const player = useRef<Entity>({ x: 100, y: 300, w: 40, h: 25, vx: 0, vy: 0, type: 'player', color: '#6366f1', rotation: 0 });
    const obstacles = useRef<Entity[]>([]);
    const bullets = useRef<Entity[]>([]);
    const particles = useRef<Entity[]>([]);
    const stars = useRef<Entity[]>([]);
    
    // Inputs
    const isThrusting = useRef(false);
    const timeSinceLastShot = useRef(0);
    const timeSinceSpawn = useRef(0);
    const timeSinceThrustParticle = useRef(0);

    // Config - Values are now "Per Second" or "Per millisecond" adjusted
    const CANVAS_WIDTH = 800;
    const CANVAS_HEIGHT = 500;
    const GRAVITY = 1500; // Pixels per second squared
    const THRUST_POWER = -2500; // Upward acceleration (px/s^2)
    const TERMINAL_VELOCITY = 600; // Max px/s
    const SHOOT_DELAY = 0.25; // Seconds
    const SPAWN_DELAY_BASE = 2.0; // Seconds
    
    // Load High Score
    useEffect(() => {
        const loadHighScore = async () => {
            const saved = await storage.get('rocket_run_highscore');
            if (saved) setHighScore(parseInt(saved));
        };
        loadHighScore();
    }, []);

    // --- GAME LOGIC ---

    const gameOver = () => {
        setGameState('gameover');
        shakeIntensity.current = 20; 
        playRetroSound('explosion');
        
        const finalScore = Math.floor(scoreRef.current);
        if (finalScore > highScore) {
            setHighScore(finalScore);
            storage.set('rocket_run_highscore', finalScore.toString());
        }
    };

    const initStars = () => {
        stars.current = [];
        for(let i=0; i<60; i++) {
            stars.current.push({
                x: Math.random() * CANVAS_WIDTH,
                y: Math.random() * CANVAS_HEIGHT,
                w: Math.random() * 2 + 1,
                h: Math.random() * 2 + 1,
                vx: (Math.random() * 50 + 10) * -1, // Parallax speed px/s
                vy: 0,
                type: 'star',
                color: Math.random() > 0.8 ? '#a5b4fc' : '#ffffff' // Occasional indigo star
            });
        }
    };

    const resetGame = () => {
        player.current = { x: 100, y: CANVAS_HEIGHT / 2, w: 40, h: 25, vx: 0, vy: 0, type: 'player', color: '#6366f1', rotation: 0 };
        obstacles.current = [];
        bullets.current = [];
        particles.current = [];
        
        lastTimeRef.current = performance.now();
        scoreRef.current = 0;
        setScore(0);
        gameSpeed.current = 200; // Initial speed
        shakeIntensity.current = 0;
        timeSinceLastShot.current = 0;
        timeSinceSpawn.current = 0;
        timeSinceThrustParticle.current = 0;
        
        initStars();
        setGameState('playing');
        playRetroSound('score'); // Start sound
    };

    const spawnObstacle = () => {
        const type = Math.random() > 0.4 ? 'asteroid' : 'barrier';
        
        if (type === 'asteroid') {
            // Destructible Asteroid
            const size = Math.random() * 30 + 30;
            obstacles.current.push({
                x: CANVAS_WIDTH + 50,
                y: Math.random() * (CANVAS_HEIGHT - size),
                w: size,
                h: size,
                vx: 0, // Moves with global speed
                vy: (Math.random() - 0.5) * 50, // Slight drift px/s
                type: 'asteroid',
                color: '#94a3b8',
                hp: Math.floor(size / 15),
                rotation: Math.random() * Math.PI,
                scoreValue: 50
            });
        } else {
            // Indestructible Electric Barrier
            const height = Math.random() * 200 + 100;
            const isTop = Math.random() > 0.5;
            obstacles.current.push({
                x: CANVAS_WIDTH + 50,
                y: isTop ? 0 : CANVAS_HEIGHT - height,
                w: 30,
                h: height,
                vx: 0,
                vy: 0,
                type: 'barrier',
                color: '#f43f5e',
                hp: 999,
                scoreValue: 0
            });
        }
    };

    const createExplosion = (x: number, y: number, color: string, count: number) => {
        for(let i=0; i<count; i++) {
            particles.current.push({
                x, y, 
                w: Math.random() * 4 + 2,
                h: Math.random() * 4 + 2,
                vx: (Math.random() - 0.5) * 300, // Velocity px/s
                vy: (Math.random() - 0.5) * 300,
                type: 'particle',
                color: color,
                life: 1.0,
                maxLife: 1.0
            });
        }
    };

    const update = (dt: number) => {
        // Difficulty scaling (Speed increases with score)
        gameSpeed.current = 200 + (scoreRef.current * 0.1); 

        // 1. Player Physics
        if (isThrusting.current) {
            player.current.vy += THRUST_POWER * dt;
            // Sound: Trigger thrust noise occasionally (every 100ms) to create rumble
            if (Math.random() > 0.5) playRetroSound('thrust');

            // Thrust Particles
            timeSinceThrustParticle.current += dt;
            if (timeSinceThrustParticle.current > 0.05) {
                 particles.current.push({
                    x: player.current.x,
                    y: player.current.y + player.current.h/2,
                    w: Math.random() * 6 + 4,
                    h: Math.random() * 6 + 4,
                    vx: -gameSpeed.current - Math.random() * 100,
                    vy: (Math.random() - 0.5) * 100,
                    type: 'particle',
                    color: '#facc15', // Yellow fire
                    life: 0.5,
                    maxLife: 0.5
                });
                timeSinceThrustParticle.current = 0;
            }
        } else {
            player.current.vy += GRAVITY * dt;
        }

        // Terminal Velocity & Bounds
        player.current.vy = Math.max(Math.min(player.current.vy, TERMINAL_VELOCITY), -TERMINAL_VELOCITY);
        player.current.y += player.current.vy * dt;
        
        // Rotation follows velocity
        player.current.rotation = player.current.vy * 0.001;

        // Floor/Ceiling Collision
        if (player.current.y < 0) {
            player.current.y = 0;
            player.current.vy = 0;
        }
        if (player.current.y + player.current.h > CANVAS_HEIGHT) {
            player.current.y = CANVAS_HEIGHT - player.current.h;
            // Bounce
            player.current.vy = -player.current.vy * 0.5;
        }

        // 2. Auto-Fire
        timeSinceLastShot.current += dt;
        if (timeSinceLastShot.current > SHOOT_DELAY) { 
            bullets.current.push({
                x: player.current.x + player.current.w,
                y: player.current.y + player.current.h/2 - 2,
                w: 12, h: 4, 
                vx: 600, // px/s
                vy: 0,
                type: 'bullet',
                color: '#38bdf8'
            });
            playRetroSound('shoot');
            timeSinceLastShot.current = 0;
        }

        // 3. Spawner
        timeSinceSpawn.current += dt;
        // Spawn faster as speed increases
        const spawnThreshold = Math.max(0.5, SPAWN_DELAY_BASE - (gameSpeed.current / 1000));
        if (timeSinceSpawn.current > spawnThreshold) {
             spawnObstacle();
             timeSinceSpawn.current = 0;
        }

        // 4. Update Bullets
        for (let i = bullets.current.length - 1; i >= 0; i--) {
            const b = bullets.current[i];
            b.x += b.vx * dt;
            if (b.x > CANVAS_WIDTH) bullets.current.splice(i, 1);
        }

        // 5. Update Obstacles
        for (let i = obstacles.current.length - 1; i >= 0; i--) {
            const obs = obstacles.current[i];
            obs.x -= gameSpeed.current * dt;
            obs.y += obs.vy * dt;

            // Collision: Bullet vs Asteroid
            if (obs.type === 'asteroid') {
                for (let j = bullets.current.length - 1; j >= 0; j--) {
                    const b = bullets.current[j];
                    if (
                        b.x < obs.x + obs.w &&
                        b.x + b.w > obs.x &&
                        b.y < obs.y + obs.h &&
                        b.y + b.h > obs.y
                    ) {
                        // Hit
                        bullets.current.splice(j, 1);
                        obs.hp = (obs.hp || 1) - 1;
                        createExplosion(b.x, b.y, '#ffffff', 3); // Spark
                        
                        if (obs.hp <= 0) {
                            playRetroSound('explosion');
                            createExplosion(obs.x + obs.w/2, obs.y + obs.h/2, '#94a3b8', 12); // Big Boom
                            scoreRef.current += obs.scoreValue || 10;
                            shakeIntensity.current = 10;
                            obstacles.current.splice(i, 1);
                        }
                        break;
                    }
                }
            }

            // Collision: Player vs Obstacle
            // Shrink hit box slightly for forgiveness
            const pBox = { 
                x: player.current.x + 5, 
                y: player.current.y + 5, 
                w: player.current.w - 10, 
                h: player.current.h - 10 
            };
            
            if (
                pBox.x < obs.x + obs.w &&
                pBox.x + pBox.w > obs.x &&
                pBox.y < obs.y + obs.h &&
                pBox.y + pBox.h > obs.y
            ) {
                gameOver();
            }

            // Cleanup
            if (obs.x + obs.w < 0) {
                // Check if index still valid (it might have been removed by bullet collision logic if we had overlap)
                if (obstacles.current[i] === obs) {
                    scoreRef.current += 10; // Point for passing
                    obstacles.current.splice(i, 1);
                }
            }
        }

        // 6. Update Particles
        for (let i = particles.current.length - 1; i >= 0; i--) {
            const p = particles.current[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life = (p.life || 1) - (1.0 * dt); // 1 second life
            if (p.life <= 0) particles.current.splice(i, 1);
        }

        // 7. Update Stars (Background)
        stars.current.forEach(star => {
            // Parallax factor based on star's own 'depth' stored in vx
            star.x += (star.vx - (gameSpeed.current * 0.1)) * dt; 
            if (star.x < 0) star.x = CANVAS_WIDTH;
        });

        // 8. Screenshake Decay
        if (shakeIntensity.current > 0) shakeIntensity.current -= 30 * dt;
        if (shakeIntensity.current < 0) shakeIntensity.current = 0;

        // Score Tick
        scoreRef.current += 10 * dt;
        setScore(Math.floor(scoreRef.current));
    };

    const draw = (ctx: CanvasRenderingContext2D) => {
        // Clear previous frame
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Handle Screenshake
        ctx.save();
        if (shakeIntensity.current > 0) {
            const dx = (Math.random() - 0.5) * shakeIntensity.current;
            const dy = (Math.random() - 0.5) * shakeIntensity.current;
            ctx.translate(dx, dy);
        }

        // 1. Background
        // Create gradient
        const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
        grad.addColorStop(0, '#0f172a'); // Slate 900
        grad.addColorStop(1, '#1e1b4b'); // Indigo 950
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 2. Stars
        stars.current.forEach(s => {
            ctx.fillStyle = s.color;
            ctx.globalAlpha = Math.random() * 0.5 + 0.3;
            ctx.fillRect(s.x, s.y, s.w, s.h);
        });
        ctx.globalAlpha = 1.0;

        // Grid Lines at bottom for retro feel
        ctx.strokeStyle = '#6366f133';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Shift grid based on score/time for movement illusion
        const gridOffset = (scoreRef.current * 2) % 50; 
        for(let x = 0; x < CANVAS_WIDTH + 50; x += 50) {
            ctx.moveTo(x - gridOffset, CANVAS_HEIGHT);
            ctx.lineTo((x - gridOffset) - 100, CANVAS_HEIGHT / 2 + 100);
        }
        ctx.stroke();

        // 3. Player
        if (gameState !== 'gameover') {
            ctx.save();
            ctx.translate(player.current.x + player.current.w/2, player.current.y + player.current.h/2);
            ctx.rotate(player.current.rotation);
            
            // Rocket Body
            ctx.fillStyle = player.current.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            
            // Cockpit
            ctx.fillStyle = '#bae6fd';
            ctx.beginPath();
            ctx.arc(5, -3, 6, 0, Math.PI * 2);
            ctx.fill();

            // Wing
            ctx.fillStyle = '#4338ca'; // Darker indigo
            ctx.beginPath();
            ctx.moveTo(-10, 2);
            ctx.lineTo(-20, 10);
            ctx.lineTo(0, 5);
            ctx.fill();

            ctx.restore();
        }

        // 4. Obstacles
        obstacles.current.forEach(obs => {
            if (obs.type === 'barrier') {
                // Glow effect
                ctx.shadowBlur = 10;
                ctx.shadowColor = obs.color;
                ctx.fillStyle = obs.color;
                ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
                
                // Internal stripes
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.5;
                const stripeOffset = (Date.now() / 20) % 20;
                for(let y = -20; y < obs.h; y+=20) {
                    ctx.fillRect(obs.x, obs.y + y + stripeOffset, obs.w, 5);
                }
                ctx.globalAlpha = 1.0;
                ctx.shadowBlur = 0;
            } else {
                // Asteroid
                ctx.save();
                ctx.translate(obs.x + obs.w/2, obs.y + obs.h/2);
                ctx.rotate(obs.rotation || 0);
                ctx.fillStyle = obs.color;
                
                // Draw jagged rock
                ctx.beginPath();
                const r = obs.w/2;
                ctx.moveTo(r, 0);
                for(let i=0; i<7; i++) {
                    const angle = (i/7) * Math.PI * 2;
                    const jaggedness = (i % 2 === 0) ? 1 : 0.7; // Simple repeatable jaggedness
                    ctx.lineTo(Math.cos(angle)*r*jaggedness, Math.sin(angle)*r*jaggedness);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            }
        });

        // 5. Bullets
        ctx.fillStyle = '#38bdf8';
        bullets.current.forEach(b => {
            ctx.fillRect(b.x, b.y, b.w, b.h);
        });

        // 6. Particles
        particles.current.forEach(p => {
            ctx.globalAlpha = p.life || 1;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x, p.y, p.w, p.h);
        });
        ctx.globalAlpha = 1.0;

        ctx.restore(); // Restore screenshake translation
    };

    // Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // --- HIGH DPI SCALING ---
        const dpr = window.devicePixelRatio || 1;
        canvas.width = CANVAS_WIDTH * dpr;
        canvas.height = CANVAS_HEIGHT * dpr;
        
        // Reset scale before applying
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        
        // Initialize time
        lastTimeRef.current = performance.now();

        const loop = (timestamp: number) => {
            // Delta Time Calculation (in seconds)
            const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.1); // Cap at 100ms lag
            lastTimeRef.current = timestamp;

            if (gameState === 'playing') update(dt);
            draw(ctx);
            requestRef.current = requestAnimationFrame(loop);
        };
        
        requestRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(requestRef.current);
    }, [gameState]);

    // Input Handling
    const startInput = useCallback(() => { isThrusting.current = true; }, []);
    const endInput = useCallback(() => { isThrusting.current = false; }, []);
    
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') {
            e.preventDefault();
            if (gameState === 'playing') startInput();
            if (gameState !== 'playing') resetGame();
        }
    }, [gameState, startInput]);

    const handleKeyUp = useCallback((e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'ArrowUp') endInput();
    }, [endInput]);

    const handleMouseDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault(); // Prevent scroll/selection
        if (gameState === 'playing') startInput();
        if (gameState !== 'playing') resetGame();
    }, [gameState, startInput]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [handleKeyDown, handleKeyUp]);

    // --- PORTAL RENDER ---
    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div 
                className="relative bg-gray-900 border-4 border-indigo-500 rounded-2xl shadow-2xl overflow-hidden flex flex-col w-full max-w-[800px]"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={handleMouseDown}
                onTouchStart={handleMouseDown}
                onTouchEnd={endInput}
                onMouseUp={endInput}
            >
                {/* HUD */}
                <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 pointer-events-none select-none">
                    <div className="flex flex-col">
                        <span className="text-gray-400 font-mono text-xs font-bold uppercase tracking-widest">Score</span>
                        <span className="text-white font-mono font-black text-3xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                            {score}
                        </span>
                    </div>
                    <div className="flex flex-col text-right">
                        <span className="text-gray-400 font-mono text-xs font-bold uppercase tracking-widest">Best</span>
                        <span className="text-yellow-400 font-mono font-black text-2xl drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                            {Math.max(score, highScore)}
                        </span>
                    </div>
                </div>

                {/* Close Button */}
                <button 
                    onClick={onClose}
                    className="absolute top-4 right-1/2 translate-x-1/2 w-8 h-8 flex items-center justify-center bg-gray-800/80 hover:bg-red-500/80 text-white rounded-full transition-colors z-20 border border-gray-600"
                >
                    <i className="fas fa-times"></i>
                </button>

                {/* Canvas */}
                <canvas 
                    ref={canvasRef} 
                    className="w-full h-auto block bg-slate-900 cursor-pointer touch-none"
                    style={{ aspectRatio: '8/5' }}
                />

                {/* Overlays */}
                {gameState === 'start' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 pointer-events-none backdrop-blur-[2px]">
                        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-300 mb-2 italic tracking-tighter" style={{ textShadow: '0 4px 15px rgba(99, 102, 241, 0.4)' }}>
                            ROCKET RUN
                        </h1>
                        <p className="text-gray-300 text-lg mb-6 font-mono">Hold <span className="text-white font-bold bg-indigo-600 px-2 rounded">SPACE</span> or <span className="text-white font-bold bg-indigo-600 px-2 rounded">CLICK</span> to Fly</p>
                        <div className="animate-bounce mt-4">
                            <i className="fas fa-chevron-down text-white text-2xl"></i>
                        </div>
                    </div>
                )}

                {gameState === 'gameover' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-900/40 backdrop-blur-sm pointer-events-none">
                        <h2 className="text-6xl font-black text-white mb-2 tracking-widest drop-shadow-[0_5px_5px_rgba(0,0,0,0.8)]">
                            CRASHED
                        </h2>
                        <div className="bg-gray-900/90 border border-indigo-500/30 p-6 rounded-xl text-center shadow-2xl transform scale-110">
                            <p className="text-gray-400 font-mono text-xs uppercase mb-1">Final Distance</p>
                            <p className="text-4xl font-bold text-white mb-0">{score}</p>
                        </div>
                        <p className="text-white/80 mt-8 animate-pulse font-bold bg-indigo-600 px-6 py-2 rounded-full shadow-lg">Tap to Restart</p>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};