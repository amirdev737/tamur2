
export enum ChatMessageRole {
  USER = 'user',
  MODEL = 'model',
}

export interface Source {
  id: string;
  url: string;
  title: string;
  domain: string;
}

export interface Media {
  type: 'image' | 'video' | 'audio';
  url: string;
  prompt?: string;
  mimeType?: string;
  base64Data?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatMessageRole;
  text: string;
  sources?: Source[];
  media?: Media[];
  isLoading?: boolean;
}

export type ActiveFeature = 'chat' | 'image-gen' | 'video-gen' | 'image-edit' | 'live';
