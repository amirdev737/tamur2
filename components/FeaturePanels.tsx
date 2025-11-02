
import React, { useState, useRef, useCallback } from 'react';
import { generateImage, editImage, generateVideo, checkVideoStatus } from '../services/geminiService';
import { fileToBase64 } from '../utils/mediaHelpers';
import type { Operation, GenerateVideosResponse } from '@google/genai';

interface ImageGeneratorPanelProps {
  onGenerationComplete: (url: string, prompt: string) => void;
}

export const ImageGeneratorPanel: React.FC<ImageGeneratorPanelProps> = ({ onGenerationComplete }) => {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGenerate = async () => {
    if (!prompt) {
      setError('Please enter a prompt.');
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const imageUrl = await generateImage(prompt, aspectRatio);
      onGenerationComplete(imageUrl, prompt);
    } catch (e) {
      console.error(e);
      setError('Failed to generate image. Please check the console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 bg-gray-800 rounded-lg shadow-inner h-full flex flex-col">
      <h3 className="text-lg font-semibold mb-4 text-cyan-400">Generate Image with Imagen 4</h3>
      <textarea
        className="w-full bg-gray-700 text-white p-2 rounded-md mb-4 flex-grow resize-none"
        placeholder="e.g., A robot holding a red skateboard."
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        disabled={isLoading}
      />
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
        <select
          className="w-full bg-gray-700 text-white p-2 rounded-md"
          value={aspectRatio}
          onChange={(e) => setAspectRatio(e.target.value)}
          disabled={isLoading}
        >
          <option value="1:1">1:1 (Square)</option>
          <option value="16:9">16:9 (Landscape)</option>
          <option value="9:16">9:16 (Portrait)</option>
          <option value="4:3">4:3</option>
          <option value="3:4">3:4</option>
        </select>
      </div>
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <button
        onClick={handleGenerate}
        disabled={isLoading}
        className="w-full bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
      >
        {isLoading ? 'Generating...' : 'Generate'}
      </button>
    </div>
  );
};


interface ImageEditorPanelProps {
  onEditComplete: (url: string, originalUrl: string, prompt: string) => void;
}

export const ImageEditorPanel: React.FC<ImageEditorPanelProps> = ({ onEditComplete }) => {
    const [prompt, setPrompt] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleEdit = async () => {
        if (!prompt || !imageFile) {
            setError('Please provide an image and a prompt.');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const base64Data = await fileToBase64(imageFile);
            const editedUrl = await editImage(prompt, { data: base64Data, mimeType: imageFile.type });
            onEditComplete(editedUrl, previewUrl!, prompt);
        } catch (e) {
            console.error(e);
            setError('Failed to edit image.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="p-4 bg-gray-800 rounded-lg shadow-inner h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-4 text-purple-400">Edit Image with Gemini</h3>
             <div 
                className="w-full h-48 bg-gray-700 rounded-md mb-4 flex items-center justify-center cursor-pointer border-2 border-dashed border-gray-600 hover:border-purple-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
            >
                {previewUrl ? <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" /> : <p className="text-gray-400">Click to upload image</p>}
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </div>
            <textarea
                className="w-full bg-gray-700 text-white p-2 rounded-md mb-4 flex-grow resize-none"
                placeholder="e.g., Add a retro filter. Remove the person in the background."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
            />
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            <button
                onClick={handleEdit}
                disabled={isLoading || !imageFile}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
                {isLoading ? 'Editing...' : 'Apply Edit'}
            </button>
        </div>
    );
};


interface VideoGeneratorPanelProps {
  onGenerationComplete: (url: string, prompt: string, thumbUrl: string) => void;
}

export const VideoGeneratorPanel: React.FC<VideoGeneratorPanelProps> = ({ onGenerationComplete }) => {
    const [prompt, setPrompt] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
    const [isLoading, setIsLoading] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('');
    const [error, setError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const checkApiKey = useCallback(async () => {
        // @ts-ignore
        if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
            // @ts-ignore
            await window.aistudio.openSelectKey();
        }
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setImageFile(file);
            setPreviewUrl(URL.createObjectURL(file));
        }
    };

    const handleGenerate = async () => {
        if (!prompt || !imageFile) {
            setError('Please provide an image and a prompt.');
            return;
        }
        
        setIsLoading(true);
        setError('');
        setLoadingMessage('Checking API key...');
        
        try {
            await checkApiKey();
            setLoadingMessage('Uploading image and starting generation...');
            const base64Data = await fileToBase64(imageFile);
            let operation = await generateVideo(prompt, { data: base64Data, mimeType: imageFile.type }, aspectRatio);

            setLoadingMessage('Video generation in progress... this can take a few minutes. Checking status every 10 seconds.');
            
            while (!operation.done) {
                await new Promise(resolve => setTimeout(resolve, 10000));
                setLoadingMessage('Still processing... Please wait.');
                operation = await checkVideoStatus(operation);
            }
            
            const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
            if (downloadLink) {
                 const videoUrl = `${downloadLink}&key=${process.env.API_KEY}`;
                 onGenerationComplete(videoUrl, prompt, previewUrl!);
            } else {
                 throw new Error('Video generation finished but no URI was returned.');
            }

        } catch (e: any) {
            console.error(e);
            let errorMessage = 'Failed to generate video. Please check the console.';
            if (e.message?.includes('Requested entity was not found')) {
                errorMessage = 'API Key is invalid or not found. Please select a valid key and try again.';
            }
            setError(errorMessage);
        } finally {
            setIsLoading(false);
            setLoadingMessage('');
        }
    };

    return (
        <div className="p-4 bg-gray-800 rounded-lg shadow-inner h-full flex flex-col">
            <h3 className="text-lg font-semibold mb-4 text-green-400">Generate Video with Veo</h3>
            <div 
                className="w-full h-48 bg-gray-700 rounded-md mb-4 flex items-center justify-center cursor-pointer border-2 border-dashed border-gray-600 hover:border-green-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
            >
                {previewUrl ? <img src={previewUrl} alt="Preview" className="max-h-full max-w-full object-contain" /> : <p className="text-gray-400">Click to upload starting image</p>}
                <input type="file" accept="image/*" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </div>
            <textarea
                className="w-full bg-gray-700 text-white p-2 rounded-md mb-4 flex-grow resize-none"
                placeholder="e.g., A neon hologram of a cat driving at top speed."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
            />
             <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">Aspect Ratio</label>
                <select
                className="w-full bg-gray-700 text-white p-2 rounded-md"
                value={aspectRatio}
                onChange={(e) => setAspectRatio(e.target.value as '16:9' | '9:16')}
                disabled={isLoading}
                >
                <option value="16:9">16:9 (Landscape)</option>
                <option value="9:16">9:16 (Portrait)</option>
                </select>
            </div>
            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
            {isLoading && <p className="text-blue-300 text-sm mb-4 animate-pulse">{loadingMessage}</p>}
            <button
                onClick={handleGenerate}
                disabled={isLoading || !imageFile || !prompt}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors"
            >
                {isLoading ? 'Generating...' : 'Generate Video'}
            </button>
             <p className="text-xs text-gray-400 mt-2">Note: Video generation can take several minutes. Please ensure you have a valid API key with billing enabled. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline hover:text-green-400">Learn more about billing.</a></p>
        </div>
    );
};
