
export interface Scene {
  id: string;
  startTime: number;
  endTime: number;
  voiceover: string;
  visualPrompt: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  audioDuration?: number;
  isGeneratingVisual?: boolean;
  isGeneratingAudio?: boolean;
}

export enum GenerationMode {
  IMAGE = 'IMAGE',
  VIDEO = 'VIDEO'
}

export interface ScriptParsingResult {
  scenes: Scene[];
}
