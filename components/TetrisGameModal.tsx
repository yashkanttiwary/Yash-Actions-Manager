
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { storage } from '../utils/storage';
import { playRetroSound } from '../utils/audio';

interface TetrisGameModalProps {
    onClose: () => void;
}

// --- CONFIGURATION ---
const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 28; // Slightly larger blocks
const PREVIEW_BLOCK_SIZE = 20;

// Standard Tetris Colors (Neon Palette)
const COLORS = [
    'transparent', 
    '#00f0f0', // I - Cyan
    '#f0f000', // O - Yellow
    '#a000f0', // T - Purple
    '#00f000', // S - Green
    '#f00000', // Z - Red
    '#0000f0', // J - Blue
    '#f0a000'  // L - Orange
];

const SHAPES = [
    [], 
    [[1, 1, 1, 1]], // I
    [[2, 2], [2, 2]], // O
    [[0, 3, 0], [3, 3, 3]], // T
    [[0, 4, 4], [4, 4, 0]], // S
    [[5, 5, 0], [0, 5, 5]], // Z
    [[6, 0, 0], [6, 6, 6]], // J
    [[0, 0, 7], [7, 7, 7]]  // L
];

// 7-Bag Randomizer Shuffle
const shuffle = (array: number[]) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

export const TetrisGameModal: React.FC<TetrisGameModalProps> = ({ onClose }) => {
    const mainCanvasRef = useRef<HTMLCanvasElement>(null);
    const nextCanvasRef = useRef<HTMLCanvasElement>(null);
    
    // React State for UI Updates (Score/Level)
    const [score, setScore] = useState(0);
    const [lines, setLines] = useState(0);
    const [level, setLevel] = useState(1);
    const [highScore, setHighScore] = useState(0);
    const [gameState, setGameState] = useState<'start' | 'playing' | 'paused' | 'gameover'>('start');

    // Mutable Game State (Refs for performance/loop)
    const board = useRef<number[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill(0)));
    const bag = useRef<number[]>([]);
    
    const piece = useRef<{ shape: number[][], x: number, y: number, colorIdx: number } | null>(null);
    const nextPiece = useRef<{ shape: number[][], colorIdx: number } | null>(null);
    
    const requestRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(0);
    const dropCounterRef = useRef<number>(0);
    const dropIntervalRef = useRef<number>(1000);

    // --- INITIALIZATION ---
    useEffect(() => {
        const loadHighScore = async () => {
            const saved = await storage.get('tetris_highscore');
            if (saved) setHighScore(parseInt(saved));
        };
        loadHighScore();
        
        // Initial draw to show empty grid
        draw(); 
    }, []);

    // --- ENGINE LOGIC ---

    const refillBag = () => {
        if (bag.current.length === 0) {
            bag.current = shuffle([1, 2, 3, 4, 5, 6, 7]);
        }
    };

    const getNextPieceFromBag = () => {
        if (bag.current.length === 0) refillBag();
        const typeId = bag.current.pop()!;
        return {
            shape: SHAPES[typeId],
            colorIdx: typeId
        };
    };

    const spawnPiece = () => {
        // If it's the very first spawn, fill nextPiece first
        if (!nextPiece.current) {
            refillBag();
            nextPiece.current = getNextPieceFromBag();
        }

        // Promote next to current
        const p = nextPiece.current!;
        piece.current = {
            shape: p.shape,
            colorIdx: p.colorIdx,
            x: Math.floor(COLS / 2) - Math.floor(p.shape[0].length / 2),
            y: 0
        };

        // Generate new next piece
        nextPiece.current = getNextPieceFromBag();
        drawNextPiece(); // Update preview UI

        // Game Over Check
        if (collide(board.current, piece.current)) {
            setGameState('gameover');
            playRetroSound('explosion');
            updateHighScore();
        }
    };

    const updateHighScore = () => {
        if (score > highScore) {
            setHighScore(score);
            storage.set('tetris_highscore', score.toString());
        }
    };

    const collide = (arena: number[][], p: { shape: number[][], x: number, y: number }) => {
        for (let y = 0; y < p.shape.length; ++y) {
            for (let x = 0; x < p.shape[y].length; ++x) {
                if (p.shape[y][x] !== 0 &&
                    (arena[y + p.y] && arena[y + p.y][x + p.x]) !== 0) {
                    return true;
                }
            }
        }
        return false;
    };

    const rotate = (matrix: number[][]) => {
        const N = matrix.length;
        return matrix.map((row, i) =>
            row.map((val, j) => matrix[N - 1 - j][i])
        );
    };

    const merge = (arena: number[][], p: { shape: number[][], x: number, y: number, colorIdx: number }) => {
        p.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    arena[y + p.y][x + p.x] = p.colorIdx;
                }
            });
        });
    };

    const arenaSweep = () => {
        let rowCount = 0;
        outer: for (let y = board.current.length - 1; y > 0; --y) {
            for (let x = 0; x < board.current[y].length; ++x) {
                if (board.current[y][x] === 0) {
                    continue outer;
                }
            }
            const row = board.current.splice(y, 1)[0].fill(0);
            board.current.unshift(row);
            ++y;
            rowCount++;
        }
        
        if (rowCount > 0) {
            playRetroSound('score');
            
            // Standard Scoring
            const lineScores = [0, 40, 100, 300, 1200];
            const points = lineScores[rowCount] * level;
            
            setScore(prev => prev + points);
            setLines(prev => {
                const newLines = prev + rowCount;
                // Level up every 10 lines
                const calculatedLevel = Math.floor(newLines / 10) + 1;
                if (calculatedLevel > level) {
                    setLevel(calculatedLevel);
                    // Speed curve: (0.8 - ((Level-1)*0.007))^(Level-1)
                    dropIntervalRef.current = Math.max(100, 1000 - (calculatedLevel * 50)); 
                }
                return newLines;
            });
        }
    };

    const playerDrop = () => {
        if (!piece.current) return;
        piece.current.y++;
        if (collide(board.current, piece.current)) {
            piece.current.y--;
            merge(board.current, piece.current!);
            playRetroSound('shoot'); // Lock sound
            spawnPiece();
            arenaSweep();
        }
        dropCounterRef.current = 0;
    };

    const playerMove = (dir: number) => {
        if (!piece.current || gameState !== 'playing') return;
        piece.current.x += dir;
        if (collide(board.current, piece.current)) {
            piece.current.x -= dir;
        }
    };

    const playerRotate = () => {
        if (!piece.current || gameState !== 'playing') return;
        const pos = piece.current.x;
        let offset = 1;
        const originalShape = piece.current.shape;
        piece.current.shape = rotate(piece.current.shape);
        
        // Basic Wall Kick
        while (collide(board.current, piece.current)) {
            piece.current.x += offset;
            offset = -(offset + (offset > 0 ? 1 : -1));
            if (offset > piece.current.shape[0].length + 5) {
                piece.current.shape = originalShape;
                piece.current.x = pos;
                return;
            }
        }
    };

    const playerHardDrop = () => {
        if (!piece.current || gameState !== 'playing') return;
        while (!collide(board.current, piece.current)) {
            piece.current.y++;
        }
        piece.current.y--;
        merge(board.current, piece.current);
        playRetroSound('shoot');
        
        // Bonus score for hard drop
        setScore(prev => prev + (2 * level));
        
        spawnPiece();
        arenaSweep();
        dropCounterRef.current = 0;
    };

    const resetGame = () => {
        board.current = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
        bag.current = [];
        nextPiece.current = null;
        piece.current = null;
        
        setScore(0);
        setLines(0);
        setLevel(1);
        dropIntervalRef.current = 1000;
        
        spawnPiece();
        setGameState('playing');
        playRetroSound('score'); // Start sound
    };

    // --- DRAWING ---

    const drawBlock = (ctx: CanvasRenderingContext2D, x: number, y: number, colorIdx: number, size: number, isGhost = false) => {
        const color = COLORS[colorIdx];
        
        if (isGhost) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.strokeRect(x * size, y * size, size, size);
            ctx.fillStyle = color + '20'; // 12% opacity
            ctx.fillRect(x * size + 2, y * size + 2, size - 4, size - 4);
            return;
        }

        // Gradient Fill
        const grad = ctx.createLinearGradient(x*size, y*size, x*size, y*size + size);
        grad.addColorStop(0, color);
        grad.addColorStop(1, adjustColor(color, -40)); // Darken bottom
        
        ctx.fillStyle = grad;
        ctx.fillRect(x * size, y * size, size, size);

        // Inner bevel (Top/Left Light)
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x * size, y * size, size, 2);
        ctx.fillRect(x * size, y * size, 2, size);

        // Inner bevel (Bottom/Right Dark)
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x * size, y * size + size - 2, size, 2);
        ctx.fillRect(x * size + size - 2, y * size, 2, size);
        
        // Center Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.fillRect(x * size + 4, y * size + 4, size - 8, size - 8);
    };

    // Helper to darken hex color
    const adjustColor = (color: string, amount: number) => {
        return '#' + color.replace(/^#/, '').replace(/../g, color => ('0'+Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2));
    }

    const drawNextPiece = () => {
        const canvas = nextCanvasRef.current;
        if (!canvas || !nextPiece.current) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#111827'; // match bg-gray-900
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const p = nextPiece.current;
        const shape = p.shape;
        
        // Center the piece in the preview window (4x4 grid max)
        const offsetX = (canvas.width / PREVIEW_BLOCK_SIZE - shape[0].length) / 2;
        const offsetY = (canvas.height / PREVIEW_BLOCK_SIZE - shape.length) / 2;

        shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    drawBlock(ctx, x + offsetX, y + offsetY, p.colorIdx, PREVIEW_BLOCK_SIZE);
                }
            });
        });
    };

    const draw = () => {
        const canvas = mainCanvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // 1. Background
        ctx.fillStyle = '#020617'; // Slate 950
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 2. Grid (Subtle)
        ctx.strokeStyle = '#1e293b'; // Slate 800
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= COLS; x++) {
            ctx.moveTo(x * BLOCK_SIZE, 0);
            ctx.lineTo(x * BLOCK_SIZE, ROWS * BLOCK_SIZE);
        }
        for (let y = 0; y <= ROWS; y++) {
            ctx.moveTo(0, y * BLOCK_SIZE);
            ctx.lineTo(COLS * BLOCK_SIZE, y * BLOCK_SIZE);
        }
        ctx.stroke();

        // 3. Board Blocks
        board.current.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value !== 0) {
                    drawBlock(ctx, x, y, value, BLOCK_SIZE);
                }
            });
        });

        // 4. Ghost Piece
        if (piece.current && gameState === 'playing') {
            let ghostY = piece.current.y;
            while (!collide(board.current, { ...piece.current, y: ghostY + 1 })) {
                ghostY++;
            }
            piece.current.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        drawBlock(ctx, x + piece.current!.x, y + ghostY, value, BLOCK_SIZE, true);
                    }
                });
            });

            // 5. Active Piece
            piece.current.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value !== 0) {
                        drawBlock(ctx, x + piece.current!.x, y + piece.current!.y, value, BLOCK_SIZE);
                    }
                });
            });
        }
    };

    // --- GAME LOOP ---
    useEffect(() => {
        const loop = (time: number) => {
            const deltaTime = time - lastTimeRef.current;
            lastTimeRef.current = time;

            if (gameState === 'playing') {
                dropCounterRef.current += deltaTime;
                if (dropCounterRef.current > dropIntervalRef.current) {
                    playerDrop();
                }
            }
            draw();
            requestRef.current = requestAnimationFrame(loop);
        };

        requestRef.current = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(requestRef.current);
    }, [gameState]); // Re-bind on state change only

    // --- INPUTS ---
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (gameState !== 'playing') {
                if (e.code === 'Space') {
                    if (gameState === 'start' || gameState === 'gameover') resetGame();
                }
                return;
            }
            
            switch (e.code) {
                case 'ArrowLeft': playerMove(-1); break;
                case 'ArrowRight': playerMove(1); break;
                case 'ArrowDown': playerDrop(); break;
                case 'ArrowUp': playerRotate(); break;
                case 'Space': 
                    e.preventDefault(); 
                    playerHardDrop(); 
                    break;
                case 'KeyP': setGameState(prev => prev === 'playing' ? 'paused' : prev); break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [gameState]);

    // Update next piece canvas when it changes
    useEffect(() => {
        drawNextPiece();
    }, [nextPiece.current]);

    // --- RENDER COMPONENT ---
    return createPortal(
        <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300"
            onClick={onClose}
        >
            <div 
                className="relative bg-gray-900 border-4 border-indigo-500/50 rounded-3xl shadow-[0_0_50px_rgba(79,70,229,0.3)] overflow-hidden flex flex-col md:flex-row max-w-[800px] w-full"
                onClick={(e) => e.stopPropagation()}
            >
                {/* --- LEFT PANEL (Stats) --- */}
                <div className="bg-gray-800/50 w-full md:w-48 p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-gray-700/50">
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 tracking-tighter mb-4">
                                TETRIS
                            </h2>
                        </div>
                        
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Score</p>
                            <p className="text-2xl font-mono text-white text-shadow-neon">{score}</p>
                        </div>
                        
                        <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">High Score</p>
                            <p className="text-xl font-mono text-yellow-400">{highScore}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Level</p>
                            <p className="text-2xl font-mono text-indigo-400">{level}</p>
                        </div>

                        <div className="space-y-1">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Lines</p>
                            <p className="text-xl font-mono text-emerald-400">{lines}</p>
                        </div>
                    </div>

                    <div className="hidden md:block">
                        <div className="p-3 bg-gray-900/50 rounded-xl border border-gray-700/50">
                            <p className="text-[10px] text-gray-400 font-bold mb-2 uppercase">Controls</p>
                            <div className="text-xs text-gray-300 space-y-1 font-mono">
                                <div className="flex justify-between"><span>Rotate</span> <span>↑</span></div>
                                <div className="flex justify-between"><span>Move</span> <span>← →</span></div>
                                <div className="flex justify-between"><span>Soft</span> <span>↓</span></div>
                                <div className="flex justify-between"><span>Hard</span> <span>Space</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- CENTER (Game) --- */}
                <div className="relative bg-gray-950 flex justify-center items-center p-4 md:p-6 border-r border-gray-700/50">
                    <div className="relative border-2 border-gray-700 shadow-2xl bg-black rounded-sm">
                        <canvas 
                            ref={mainCanvasRef}
                            width={COLS * BLOCK_SIZE}
                            height={ROWS * BLOCK_SIZE}
                            className="block"
                        />
                        
                        {/* Overlays */}
                        {gameState !== 'playing' && (
                            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center text-center p-4 backdrop-blur-sm">
                                {gameState === 'start' && (
                                    <>
                                        <h1 className="text-3xl font-black text-white mb-2">READY?</h1>
                                        <button onClick={resetGame} className="mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-full transition-all shadow-lg hover:shadow-indigo-500/50 animate-pulse">
                                            Start Game
                                        </button>
                                    </>
                                )}
                                {gameState === 'paused' && (
                                    <>
                                        <h2 className="text-2xl font-bold text-white mb-4">PAUSED</h2>
                                        <button onClick={() => setGameState('playing')} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-full">
                                            Resume
                                        </button>
                                    </>
                                )}
                                {gameState === 'gameover' && (
                                    <>
                                        <h2 className="text-4xl font-black text-red-500 mb-2">GAME OVER</h2>
                                        <p className="text-gray-300 mb-6 font-mono">Final Score: {score}</p>
                                        <button onClick={resetGame} className="px-6 py-2 bg-white text-gray-900 hover:bg-gray-200 font-bold rounded-full">
                                            Try Again
                                        </button>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* --- RIGHT PANEL (Preview) --- */}
                <div className="bg-gray-800/50 w-full md:w-40 p-6 flex flex-col items-center border-t md:border-t-0 border-gray-700/50">
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Next</p>
                    <div className="bg-gray-900 p-2 rounded-lg border-2 border-gray-700 shadow-inner mb-6">
                        <canvas 
                            ref={nextCanvasRef}
                            width={PREVIEW_BLOCK_SIZE * 5}
                            height={PREVIEW_BLOCK_SIZE * 4}
                            className="block"
                        />
                    </div>
                    
                    {/* Mobile Controls (Visible only on small screens) */}
                    <div className="md:hidden grid grid-cols-3 gap-2 w-full mt-auto">
                        <button className="bg-gray-700 p-3 rounded text-white" onClick={() => playerMove(-1)}>←</button>
                        <button className="bg-gray-700 p-3 rounded text-white" onClick={playerRotate}>↻</button>
                        <button className="bg-gray-700 p-3 rounded text-white" onClick={() => playerMove(1)}>→</button>
                        <button className="bg-gray-700 p-3 rounded text-white col-span-3" onClick={playerHardDrop}>DROP</button>
                    </div>
                </div>

                {/* Close Button */}
                <button 
                    onClick={onClose}
                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white bg-black/20 hover:bg-black/40 rounded-full transition-colors z-20"
                >
                    <i className="fas fa-times"></i>
                </button>
            </div>
        </div>,
        document.body
    );
};
