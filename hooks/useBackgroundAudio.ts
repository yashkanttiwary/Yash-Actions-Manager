
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
        audio.onended = handleTrackEnd;
        audioRef.current = audio;
        return () => {
            audio.pause();
            audio.src = '';
        };
    }, []);

    const handleTrackEnd = () => {
        // We need the *latest* settings here, but event listeners close over stale state.
        // We will rely on a ref or updated dependency effect. 
        // Actually, easiest to check the ref directly inside the effect that binds it, 
        // but 'settings' changes frequently.
        // We'll dispatch a custom event or use state logic.
        playNextTrack(true);
    };

    // Helper to play next track
    const playNextTrack = useCallback(async (auto: boolean) => {
        if (settings.loopMode === 'one' && auto) {
            // Replay current
            if (audioRef.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play();
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
            
            brownNoiseRef.current.play(settings.volume);
            setIsPlaying(true);
        } else {
            brownNoiseRef.current.stop();
            // We don't set isPlaying false here because Custom mode might take over
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
                            audioRef.current.play().catch(e => {
                                console.log("Autoplay blocked, waiting for interaction", e);
                                setIsPlaying(false); // UI should reflect stopped state until user clicks
                            });
                            setIsPlaying(true);
                        }
                    }
                } catch (e) {
                    console.error("Error loading track", e);
                }
            } else {
                if (audioRef.current) audioRef.current.pause();
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

    // Listener for 'ended' needs to be refreshed when dependencies change (like loop mode)
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio) return;

        const onEnded = () => playNextTrack(true);
        audio.addEventListener('ended', onEnded);
        
        return () => audio.removeEventListener('ended', onEnded);
    }, [playNextTrack]);

    const togglePlay = () => {
        // This simply toggles the global 'enabled' setting passed in props
        // The parent component handles the state update
    };

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
        isPlaying: settings.enabled && isPlaying, // Simplified view state
        skipNext,
        skipPrev
    };
};
