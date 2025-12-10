export interface SpotState {
  image: File | null;
  imageUrl: string | null;
  isAnalyzing: boolean;
  isGeneratingVoice: boolean;
  isRewriting: boolean;
  analysisData: AnalysisResult | null;
  script: string;
  voiceUrl: string | null;
  audioBuffer: AudioBuffer | null;
  musicBuffer: AudioBuffer | null;
  musicFileName: string | null;
  voiceProfile: string;
  voiceStyle: string;
  musicVolume: number;
  duration: number; // in seconds
}

export interface AnalysisResult {
  headline: string;
  brandColors: string[];
  mood: string;
  detectedProducts: string[];
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female';
  geminiName: string;
}

export interface VoiceStyle {
  id: string;
  name: string;
  instruction: string;
}