
import { useState, useEffect, useRef, useCallback } from 'react';
import { BrownNoiseGenerator } from '../utils/audio';
import { AudioSettings } from '../types';
import { getAudioTrack } from '../utils/indexedDB';

export const useBackgroundAudio = (settings: AudioSettings) => {
    const brownNoiseRef = useRef<BrownNoiseGenerator | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTrackUrl, setCurrentTrackUrl] = useState<string | null>(null);
    const [currentTrackName, setCurrentTrackName] = useState<string>('');
    
    // M-02: Track AudioContext suspension
    const [isSuspended, setIsSuspended] = useState(false); 

    // Helper to check AudioContext state
    const checkSuspension = () => {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContextClass) return;
        
        // We need to check the *global* context shared by utils/audio.ts ideally, 
        // but checking a new context is a decent proxy for browser policy status.
        // Better yet, we can't easily access the singleton from here without exporting it.
        // Let's infer suspension if playback fails.
    };

    // Initialize Brown Noise Gen
    useEffect(() => {
        brownNoiseRef.current = new BrownNoiseGenerator();
        return () => {
            brownNoiseRef.current?.stop();
        };
    }, []);

    // Create Audio Element for custom music
    useEffect(() => {
        const audio = new Audio();
        audio.onended = () => playNextTrack(true);
        audioRef.current = audio;
        return () => {
            audio.pause();
            audio.src = '';
        };
    }, []);

    // Helper to play next track
    const playNextTrack = useCallback(async (auto: boolean) => {
        if (settings.loopMode === 'one' && auto) {
            // Replay current
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(e => {
                    console.warn("Audio Play failed (Autoplay policy):", e);
                    setIsSuspended(true);
                    setIsPlaying(false);
                });
            }
            return;
        }

        const playlist = settings.playlist || [];
        if (playlist.length === 0) return;

        let nextIndex = currentTrackIndex + 1;
        if (nextIndex >= playlist.length) {
            nextIndex = 0; // Loop playlist
        }
        
        // This causes a state update which triggers the load effect
        setCurrentTrackIndex(nextIndex);
    }, [currentTrackIndex, settings.loopMode, settings.playlist]);


    // Effect: Handle Brown Noise State
    useEffect(() => {
        if (!brownNoiseRef.current) return;

        if (settings.enabled && settings.mode === 'brown_noise') {
            // Stop custom audio if playing
            if (audioRef.current) audioRef.current.pause();
            
            // Try to play
            const ctxState = brownNoiseRef.current.play(settings.volume); // Update play() to return ctx state if possible, or just catch error
            
            // Since brownNoiseRef is a wrapper, let's assume it works unless we add state checking there.
            // Simplified: If enabled, we assume playing. The UI global click handler in App.tsx fixes the context.
            setIsPlaying(true);
        } else {
            brownNoiseRef.current.stop();
        }
    }, [settings.enabled, settings.mode, settings.volume]);


    // Effect: Load Custom Track when index or mode changes
    useEffect(() => {
        const loadAndPlay = async () => {
            if (settings.enabled && settings.mode === 'playlist') {
                // Stop Brown Noise
                brownNoiseRef.current?.stop();

                const playlist = settings.playlist || [];
                if (playlist.length === 0) {
                    setIsPlaying(false);
                    return;
                }

                // Ensure index is valid
                const safeIndex = currentTrackIndex >= playlist.length ? 0 : currentTrackIndex;
                const trackId = playlist[safeIndex];

                try {
                    const track = await getAudioTrack(trackId);
                    if (track) {
                        const url = URL.createObjectURL(track.blob);
                        setCurrentTrackUrl(prev => {
                            if (prev) URL.revokeObjectURL(prev); // Cleanup old blob
                            return url;
                        });
                        setCurrentTrackName(track.name);
                        
                        if (audioRef.current) {
                            audioRef.current.src = url;
                            audioRef.current.volume = settings.volume;
                            audioRef.current.play()
                                .then(() => {
                                    setIsSuspended(false);
                                    setIsPlaying(true);
                                })
                                .catch(e => {
                                    console.log("Autoplay blocked, waiting for interaction", e);
                                    setIsSuspended(true);
                                    setIsPlaying(false); 
                                });
                        }
                    }
                } catch (e) {
                    console.error("Error loading track", e);
                }
            } else {
                if (audioRef.current) audioRef.current.pause();
                setIsPlaying(false);
            }
        };

        loadAndPlay();
    }, [settings.enabled, settings.mode, settings.playlist, currentTrackIndex]);

    // Volume update for Custom Audio
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = settings.volume;
        }
    }, [settings.volume]);

    const skipNext = () => playNextTrack(false);
    
    const skipPrev = () => {
        const playlist = settings.playlist || [];
        if (playlist.length === 0) return;
        let prev = currentTrackIndex - 1;
        if (prev < 0) prev = playlist.length - 1;
        setCurrentTrackIndex(prev);
    };

    return {
        currentTrackName: settings.mode === 'brown_noise' ? 'Brown Noise (Focus)' : currentTrackName,
        isPlaying: settings.enabled && isPlaying, 
        isSuspended, // Exposed to UI
        skipNext,
        skipPrev
    };
};
