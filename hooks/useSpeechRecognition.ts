
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
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognition.onerror = (event: any) => {
                // Ignore 'no-speech' errors as they are common and often not critical
                if (event.error !== 'no-speech') {
                    console.error("Speech Recognition Error:", event.error);
                    setError(event.error);
                }
                setIsListening(false);
            };

            recognition.onresult = (event: any) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                const currentText = finalTranscript || interimTranscript;
                setTranscript(currentText);
                
                if (props?.onResult) props.onResult(currentText);
                if (finalTranscript && props?.onFinal) props.onFinal(finalTranscript);
            };

            recognitionRef.current = recognition;
        } else {
            setError("Browser not supported");
        }
    }, []); // Empty dependency array to ensure single initialization

    const startListening = useCallback(() => {
        if (recognitionRef.current && !isListening) {
            // Update continuous setting if it changed
            if (props?.continuous !== undefined) {
                recognitionRef.current.continuous = props.continuous;
            }
            setTranscript('');
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
