
import { useState, useRef, useEffect, useCallback } from 'react';

interface IWindow extends Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
}
declare const window: IWindow;

interface UseSpeechRecognitionProps {
    onResult?: (transcript: string) => void;
    onFinal?: (transcript: string) => void;
    continuous?: boolean;
}

export const useSpeechRecognition = (props?: UseSpeechRecognitionProps) => {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);
    const recognitionRef = useRef<any>(null);
    
    // Store accumulated final results here to prevent loss during pauses
    const finalTranscriptBuffer = useRef('');

    // Initialize only once
    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = props?.continuous ?? false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                setIsListening(true);
                setError(null);
                // Don't clear buffer on start to allow appending, 
                // but usually we want a fresh start. Let's clear in startListening.
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognition.onerror = (event: any) => {
                if (event.error !== 'no-speech') {
                    console.error("Speech Recognition Error:", event.error);
                    setError(event.error);
                }
                setIsListening(false);
            };

            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let newFinalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        newFinalTranscript += event.results[i][0].transcript + ' ';
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                // Accumulate final results
                if (newFinalTranscript) {
                    finalTranscriptBuffer.current += newFinalTranscript;
                }

                // Combine accumulated final + current interim
                const fullCurrentText = (finalTranscriptBuffer.current + interimTranscript).trim();
                
                setTranscript(fullCurrentText);
                
                if (props?.onResult) props.onResult(fullCurrentText);
            };

            recognitionRef.current = recognition;
        } else {
            setError("Browser not supported");
        }
    }, []); 

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening) {
            // Clear buffer on new session
            finalTranscriptBuffer.current = '';
            setTranscript('');
            
            if (props?.continuous !== undefined) {
                recognitionRef.current.continuous = props.continuous;
            }
            try {
                recognitionRef.current.start();
            } catch (e) {
                console.error("Failed to start recognition", e);
            }
        }
    }, [isListening, props?.continuous]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
        }
    }, [isListening]);

    const resetTranscript = useCallback(() => {
        finalTranscriptBuffer.current = '';
        setTranscript('');
    }, []);

    return { 
        isListening, 
        transcript, 
        error, 
        startListening, 
        stopListening, 
        resetTranscript 
    };
};
