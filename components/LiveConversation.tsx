
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { getAiClient } from '../services/geminiService';
import { decode, decodeAudioData, encode } from '../utils/mediaHelpers';
import type { LiveSession, LiveServerMessage } from '@google/genai';
import { GoogleGenAI, Modality, Blob } from '@google/genai';
import { MicIcon, StopIcon } from './icons';

interface Transcription {
    user: string;
    model: string;
}

const LiveConversation: React.FC = () => {
    const [isActive, setIsActive] = useState(false);
    const [transcriptionHistory, setTranscriptionHistory] = useState<Transcription[]>([]);
    const [currentTranscription, setCurrentTranscription] = useState<Transcription>({ user: '', model: '' });
    const [error, setError] = useState<string | null>(null);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    
    const nextStartTimeRef = useRef(0);
    const audioSourcesRef = useRef(new Set<AudioBufferSourceNode>());

    const stopConversation = useCallback(() => {
        setIsActive(false);
        setError(null);
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            inputAudioContextRef.current.close();
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            outputAudioContextRef.current.close();
        }
        
        audioSourcesRef.current.forEach(source => source.stop());
        audioSourcesRef.current.clear();
        nextStartTimeRef.current = 0;

    }, []);

    const startConversation = async () => {
        if (isActive) {
            stopConversation();
            return;
        }

        setIsActive(true);
        setError(null);
        setTranscriptionHistory([]);
        setCurrentTranscription({ user: '', model: '' });

        try {
            // @ts-ignore
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            inputAudioContextRef.current = new AudioContext({ sampleRate: 16000 });
            outputAudioContextRef.current = new AudioContext({ sampleRate: 24000 });
            
            mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            const ai = getAiClient();
            
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                    },
                    systemInstruction: 'You are Tamur AI, a friendly and helpful assistant.',
                },
                callbacks: {
                    onopen: () => {
                        const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current!);
                        scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);

                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const l = inputData.length;
                            const int16 = new Int16Array(l);
                            for (let i = 0; i < l; i++) {
                                int16[i] = inputData[i] * 32768;
                            }
                            const pcmBlob: Blob = {
                                data: encode(new Uint8Array(int16.buffer)),
                                mimeType: 'audio/pcm;rate=16000',
                            };
                            
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            });
                        };
                        source.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                         if (message.serverContent?.inputTranscription) {
                            setCurrentTranscription(prev => ({ ...prev, user: prev.user + message.serverContent!.inputTranscription!.text }));
                         }
                         if (message.serverContent?.outputTranscription) {
                            setCurrentTranscription(prev => ({...prev, model: prev.model + message.serverContent!.outputTranscription!.text}));
                         }
                         if(message.serverContent?.turnComplete) {
                            setCurrentTranscription(prev => {
                                setTranscriptionHistory(hist => [...hist, prev]);
                                return {user: '', model: ''};
                            });
                         }

                        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData.data;
                        if (base64Audio && outputAudioContextRef.current) {
                            const outputCtx = outputAudioContextRef.current;
                            nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outputCtx.currentTime);
                            const audioBuffer = await decodeAudioData(decode(base64Audio), outputCtx, 24000, 1);
                            
                            const source = outputCtx.createBufferSource();
                            source.buffer = audioBuffer;
                            source.connect(outputCtx.destination);
                            
                            source.addEventListener('ended', () => {
                                audioSourcesRef.current.delete(source);
                            });

                            source.start(nextStartTimeRef.current);
                            nextStartTimeRef.current += audioBuffer.duration;
                            audioSourcesRef.current.add(source);
                        }

                        if (message.serverContent?.interrupted) {
                            audioSourcesRef.current.forEach(source => source.stop());
                            audioSourcesRef.current.clear();
                            nextStartTimeRef.current = 0;
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error('Live session error:', e);
                        setError('A connection error occurred.');
                        stopConversation();
                    },
                    onclose: () => {
                       // Handled by user action or error
                    },
                },
            });
        } catch (err) {
            console.error('Failed to start conversation:', err);
            setError('Could not access microphone or start session.');
            setIsActive(false);
        }
    };
    
    useEffect(() => {
      return () => {
          stopConversation();
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="p-4 bg-gray-800 rounded-lg shadow-inner h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-yellow-400">Live Conversation</h3>
                <button
                    onClick={startConversation}
                    className={`p-3 rounded-full transition-colors ${isActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
                >
                    {isActive ? <StopIcon className="w-6 h-6 text-white" /> : <MicIcon className="w-6 h-6 text-white" />}
                </button>
            </div>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            
            <div className="flex-grow bg-gray-900 rounded-lg p-3 overflow-y-auto">
                {transcriptionHistory.map((t, i) => (
                    <div key={i} className="mb-4">
                        <p className="text-blue-300 font-semibold">You:</p>
                        <p className="text-gray-300 ml-2">{t.user}</p>
                        <p className="text-cyan-300 font-semibold mt-2">Tamur AI:</p>
                        <p className="text-gray-300 ml-2">{t.model}</p>
                    </div>
                ))}
                {isActive && (
                    <div className="animate-pulse">
                        <p className="text-blue-300 font-semibold">You:</p>
                        <p className="text-gray-300 ml-2">{currentTranscription.user || '...'}</p>
                         <p className="text-cyan-300 font-semibold mt-2">Tamur AI:</p>
                        <p className="text-gray-300 ml-2">{currentTranscription.model || '...'}</p>
                    </div>
                )}
                {!isActive && transcriptionHistory.length === 0 && (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-500">Click the mic to start a conversation.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LiveConversation;

