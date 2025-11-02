
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { BotIcon, UserIcon, SendIcon, PaperclipIcon, MicIcon, SparklesIcon } from './components/icons';
import { ActiveFeature, ChatMessage, ChatMessageRole, Media, Source } from './types';
import { createChatSession, streamChat } from './services/geminiService';
import type { Chat, GenerateContentResponse } from '@google/genai';
import { ImageGeneratorPanel, VideoGeneratorPanel, ImageEditorPanel } from './components/FeaturePanels';
import LiveConversation from './components/LiveConversation';

// This is a mock implementation for a more complex markdown parser
const SimpleMarkdown: React.FC<{ text: string, onSourceClick: (id: string) => void }> = ({ text, onSourceClick }) => {
    const parts = text.split(/(\[S\d+\])/g);
    return (
        <p className="whitespace-pre-wrap">
            {parts.map((part, index) => {
                const match = part.match(/\[S(\d+)\]/);
                if (match) {
                    const sourceId = `S${match[1]}`;
                    return (
                        <button key={index} onClick={() => onSourceClick(sourceId)} className="inline-block bg-blue-800 text-blue-200 text-xs font-bold px-2 py-0.5 rounded-full mx-1 hover:bg-blue-700 transition-colors">
                            {sourceId}
                        </button>
                    );
                }
                return <span key={index}>{part}</span>;
            })}
        </p>
    );
};

const Message: React.FC<{ message: ChatMessage, onSourceClick: (id: string) => void }> = ({ message, onSourceClick }) => {
    const isUser = message.role === ChatMessageRole.USER;
    const Icon = isUser ? UserIcon : BotIcon;

    return (
        <div className={`flex items-start gap-4 p-4 ${isUser ? '' : 'bg-gray-800/50'}`}>
            <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-indigo-500' : 'bg-teal-500'}`}>
                <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-grow pt-1">
                <div className="prose prose-invert max-w-none">
                   <SimpleMarkdown text={message.text} onSourceClick={onSourceClick} />
                   {message.isLoading && <span className="inline-block w-3 h-3 bg-white rounded-full ml-2 animate-pulse"></span>}
                </div>
                {message.media && message.media.length > 0 && (
                     <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {message.media.map((media, index) => (
                            <div key={index} className="bg-gray-700 p-2 rounded-lg">
                                {media.type === 'image' && <img src={media.url} alt={media.prompt || 'Generated image'} className="rounded-md w-full" />}
                                {media.type === 'video' && <video src={media.url} controls className="rounded-md w-full" />}
                                {media.type === 'audio' && <audio src={media.url} controls className="w-full" />}
                                {media.prompt && <p className="text-xs text-gray-400 mt-2 italic">Prompt: "{media.prompt}"</p>}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};


export default function App() {
    const [activeFeature, setActiveFeature] = useState<ActiveFeature>('chat');
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [sources, setSources] = useState<Source[]>([]);
    const [activeSource, setActiveSource] = useState<Source | null>(null);
    const chatSession = useRef<Chat | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    
    useEffect(() => {
        chatSession.current = createChatSession();
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const handleSendMessage = async (userPrompt: string) => {
        if (isLoading || !userPrompt.trim()) return;

        setIsLoading(true);
        const newUserMessage: ChatMessage = { id: Date.now().toString(), role: ChatMessageRole.USER, text: userPrompt };
        setMessages(prev => [...prev, newUserMessage]);
        setPrompt('');

        const modelMessageId = (Date.now() + 1).toString();
        const initialModelMessage: ChatMessage = { id: modelMessageId, role: ChatMessageRole.MODEL, text: '', isLoading: true };
        setMessages(prev => [...prev, initialModelMessage]);

        try {
            if (!chatSession.current) throw new Error("Chat session not initialized.");
            const stream = await streamChat(chatSession.current, userPrompt);
            let fullText = '';
            let currentSources: Source[] = [];

            for await (const chunk of stream) {
                fullText += chunk.text;
                
                const groundingMetadata = chunk.candidates?.[0]?.groundingMetadata;
                if(groundingMetadata?.groundingChunks){
                    const newSources = groundingMetadata.groundingChunks
                    .filter(c => c.web)
                    .map((c: any, i: number) => ({
                        id: `S${i+1}`,
                        url: c.web.uri,
                        title: c.web.title,
                        domain: new URL(c.web.uri).hostname,
                    }));
                    currentSources = newSources;
                    setSources(newSources); // update sources panel live
                }

                setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: fullText, sources: currentSources } : msg));
            }

            setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, isLoading: false } : msg));

        } catch (error) {
            console.error("Error streaming chat:", error);
            setMessages(prev => prev.map(msg => msg.id === modelMessageId ? { ...msg, text: "Sorry, I encountered an error. Please try again.", isLoading: false } : msg));
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleFeatureSelect = (feature: ActiveFeature) => {
        setActiveFeature(feature);
    };

    const addMediaMessage = useCallback((media: Media[], text: string) => {
        const newMessage: ChatMessage = {
            id: Date.now().toString(),
            role: ChatMessageRole.MODEL,
            text,
            media,
        };
        setMessages(prev => [...prev, newMessage]);
        setActiveFeature('chat');
    }, []);
    
    const renderFeaturePanel = () => {
        switch (activeFeature) {
            case 'image-gen':
                return <ImageGeneratorPanel onGenerationComplete={(url, prompt) => addMediaMessage([{ type: 'image', url, prompt }], "Here is the image I generated for you:")} />;
            case 'image-edit':
                 return <ImageEditorPanel onEditComplete={(url, originalUrl, prompt) => addMediaMessage([{type: 'image', url: originalUrl}, { type: 'image', url, prompt }], `I've applied the edit: "${prompt}"`)} />;
            case 'video-gen':
                return <VideoGeneratorPanel onGenerationComplete={(url, prompt, thumbUrl) => addMediaMessage([{ type: 'video', url, prompt }], `Here is the video I generated based on your image and prompt: "${prompt}"`)} />;
            case 'live':
                return <LiveConversation />;
            case 'chat':
            default:
                return null;
        }
    };

    return (
        <div className="h-screen w-screen bg-gray-900 text-white flex flex-col md:flex-row font-sans">
            {/* Sidebar */}
            <div className="w-full md:w-16 bg-gray-900 border-b md:border-r border-gray-700 flex md:flex-col items-center justify-center p-2 gap-4">
                <button onClick={() => handleFeatureSelect('chat')} className={`p-3 rounded-lg ${activeFeature === 'chat' ? 'bg-blue-600' : 'bg-gray-800 hover:bg-blue-600'}`} title="Unified Chat">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                </button>
                 <button onClick={() => handleFeatureSelect('live')} className={`p-3 rounded-lg ${activeFeature === 'live' ? 'bg-yellow-600' : 'bg-gray-800 hover:bg-yellow-600'}`} title="Live Conversation">
                    <MicIcon className="w-6 h-6" />
                </button>
                <button onClick={() => handleFeatureSelect('image-gen')} className={`p-3 rounded-lg ${activeFeature === 'image-gen' ? 'bg-cyan-600' : 'bg-gray-800 hover:bg-cyan-600'}`} title="Generate Image">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </button>
                <button onClick={() => handleFeatureSelect('image-edit')} className={`p-3 rounded-lg ${activeFeature === 'image-edit' ? 'bg-purple-600' : 'bg-gray-800 hover:bg-purple-600'}`} title="Edit Image">
                    <SparklesIcon className="w-6 h-6" />
                </button>
                <button onClick={() => handleFeatureSelect('video-gen')} className={`p-3 rounded-lg ${activeFeature === 'video-gen' ? 'bg-green-600' : 'bg-gray-800 hover:bg-green-600'}`} title="Generate Video">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
            </div>
            
            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-0">
                <header className="flex-shrink-0 bg-gray-800 p-4 border-b border-gray-700 flex items-center justify-between">
                    <h1 className="text-xl font-bold">Tamur AI</h1>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-400">Guest</span>
                        <UserIcon className="w-8 h-8 p-1 bg-gray-700 rounded-full" />
                    </div>
                </header>
                
                <div className="flex-1 flex min-h-0">
                    <div className="flex-1 flex flex-col bg-gray-900">
                      {activeFeature !== 'chat' ? 
                          <div className="p-4 flex-1">{renderFeaturePanel()}</div> 
                          :
                          <>
                            <div className="flex-1 overflow-y-auto">
                                {messages.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                        <BotIcon className="w-24 h-24 mb-4" />
                                        <h2 className="text-2xl">How can I help you today?</h2>
                                    </div>
                                )}
                                {messages.map(msg => <Message key={msg.id} message={msg} onSourceClick={(id) => setActiveSource(sources.find(s => s.id === id) || null)} />)}
                                <div ref={messagesEndRef} />
                            </div>
                            <div className="p-4 border-t border-gray-700">
                                <div className="bg-gray-800 rounded-lg flex items-center p-2">
                                    <textarea
                                        value={prompt}
                                        onChange={e => setPrompt(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(prompt); } }}
                                        placeholder="Ask Tamur AI anything..."
                                        className="flex-1 bg-transparent focus:outline-none resize-none max-h-32"
                                        rows={1}
                                        disabled={isLoading}
                                    />
                                    <button onClick={() => handleSendMessage(prompt)} disabled={isLoading || !prompt.trim()} className="p-2 rounded-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 transition-colors">
                                        <SendIcon className="w-5 h-5 text-white" />
                                    </button>
                                </div>
                            </div>
                          </>
                      }
                    </div>

                    {activeFeature === 'chat' && sources.length > 0 && (
                         <aside className="w-full md:w-80 bg-gray-800 border-l border-gray-700 flex-col overflow-y-auto p-4 hidden lg:flex">
                           <h2 className="text-lg font-semibold mb-4 text-blue-300">Sources</h2>
                            <div className="space-y-3">
                                {sources.map(source => (
                                    <a key={source.id} href={source.url} target="_blank" rel="noopener noreferrer" className="block bg-gray-700 p-3 rounded-lg hover:bg-gray-600 transition-colors">
                                        <p className="font-bold text-sm text-blue-200 truncate">{source.title}</p>
                                        <p className="text-xs text-gray-400">{source.domain}</p>
                                    </a>
                                ))}
                            </div>
                        </aside>
                    )}
                </div>
            </main>
        </div>
    );
}
