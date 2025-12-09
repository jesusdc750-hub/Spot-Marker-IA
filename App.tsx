import React, { useState, useEffect, useRef } from 'react';
import { Upload, Wand2, Music, Mic, Settings2, Loader2, PlayCircle, Image as ImageIcon, Volume2, Download, FileAudio, Clock, Play, Square, ChevronDown, Check } from 'lucide-react';
import { geminiService } from './services/geminiService';
import { pcmToAudioBuffer, decodeAudioFile, mixAudioAndExport, playPreview } from './services/audioUtils';
import { VideoPreview } from './components/VideoPreview';
import { VOICES, INITIAL_SCRIPT_PLACEHOLDER } from './constants';
import { SpotState, VoiceOption } from './types';

// Helper to determine friendly error messages
const getErrorMessage = (error: any) => {
    const isQuota = error?.status === 429 || error?.code === 429 || error?.message?.includes('429') || error?.message?.includes('quota');
    if (isQuota) {
        return "⚠️ Has excedido tu cuota de uso de la API (Error 429). El sistema intentó reintentar pero los servidores están saturados. Por favor espera unos momentos e intenta de nuevo.";
    }
    return "Ocurrió un error inesperado. Por favor intenta de nuevo.";
};

const App: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExportingAudio, setIsExportingAudio] = useState(false);
  
  // Voice Dropdown State
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  
  const stopPreviewRef = useRef<(() => void) | null>(null);

  const [state, setState] = useState<SpotState>({
    image: null,
    imageUrl: null,
    isAnalyzing: false,
    isGeneratingVoice: false,
    isRewriting: false,
    analysisData: null,
    script: '',
    voiceUrl: null,
    audioBuffer: null,
    musicBuffer: null,
    musicFileName: null,
    voiceProfile: VOICES[0].id,
    musicVolume: 0.25, // Default ~ Medium intensity
    duration: 15
  });

  // Stop any active preview if component unmounts or state changes
  useEffect(() => {
    return () => {
      if (stopPreviewRef.current) stopPreviewRef.current();
    };
  }, []);

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    setState(prev => ({ 
      ...prev, 
      image: file, 
      imageUrl: url, 
      isAnalyzing: true,
      analysisData: null,
      script: 'Analizando imagen y generando guion creativo...',
      audioBuffer: null,
      musicBuffer: null,
      musicFileName: null
    }));

    try {
      // Pass the current duration preference to the analysis
      const { analysis, script } = await geminiService.analyzeImage(file, state.duration);
      setState(prev => ({
        ...prev,
        isAnalyzing: false,
        analysisData: analysis,
        script: script
      }));
    } catch (error) {
      console.error("Analysis failed", error);
      setState(prev => ({ 
        ...prev, 
        isAnalyzing: false, 
        script: getErrorMessage(error)
      }));
    }
  };

  const handleDurationChange = async (newDuration: number) => {
    setState(prev => ({ ...prev, duration: newDuration }));

    // If we have analysis data, regenerate the script immediately
    if (state.analysisData) {
        setState(prev => ({ ...prev, isRewriting: true }));
        try {
            const newScript = await geminiService.rewriteScript(state.analysisData, newDuration);
            setState(prev => ({ 
                ...prev, 
                script: newScript, 
                isRewriting: false,
                audioBuffer: null
            }));
        } catch (error) {
            console.error("Rewrite failed", error);
            setState(prev => ({ ...prev, isRewriting: false }));
            alert(getErrorMessage(error));
        }
    }
  };

  const handleMusicUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await decodeAudioFile(arrayBuffer);
      
      setState(prev => ({
        ...prev,
        musicBuffer: decodedBuffer,
        musicFileName: file.name
      }));
    } catch (error) {
      console.error("Error loading music file", error);
      alert("Error al cargar el archivo de audio. Asegúrate que sea un formato válido (MP3/WAV).");
    }
  };

  const handleDownloadAudio = async () => {
    if (!state.audioBuffer) return;
    
    setIsExportingAudio(true);
    try {
      const blob = await mixAudioAndExport(state.audioBuffer, state.musicBuffer, state.musicVolume);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `spot_audio_${Date.now()}.wav`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("Error exportando el audio.");
    } finally {
      setIsExportingAudio(false);
    }
  };

  const handlePreviewVoice = async (e: React.MouseEvent, voice: VoiceOption) => {
    e.stopPropagation();
    
    // Stop any current preview
    if (stopPreviewRef.current) {
      stopPreviewRef.current();
      stopPreviewRef.current = null;
    }

    // Toggle off if clicking same
    if (previewingVoiceId === voice.id) {
        setPreviewingVoiceId(null);
        return;
    }

    setPreviewingVoiceId(voice.id);

    try {
        const pcmBuffer = await geminiService.generateSpeech(
            "Esta es mi voz para spot publicitario en español.", 
            voice.geminiName
        );
        
        const audioBuffer = pcmToAudioBuffer(pcmBuffer, 24000);
        
        stopPreviewRef.current = playPreview(audioBuffer, () => {
             setPreviewingVoiceId(current => current === voice.id ? null : current);
        });

    } catch (error) {
        console.error(error);
        setPreviewingVoiceId(null);
        alert(getErrorMessage(error));
    }
  };

  const selectVoice = (voiceId: string) => {
    setState(prev => ({ ...prev, voiceProfile: voiceId, audioBuffer: null }));
    setIsVoiceDropdownOpen(false);
  };

  const generateSpot = async () => {
    if (!state.script) return;

    setState(prev => ({ ...prev, isGeneratingVoice: true }));
    try {
      const selectedVoice = VOICES.find(v => v.id === state.voiceProfile);
      if (!selectedVoice) throw new Error("Voice not found");

      // 1. Generate Voice (Gemini API)
      const audioBufferData = await geminiService.generateSpeech(state.script, selectedVoice.geminiName);
      const decodedVoiceBuffer = pcmToAudioBuffer(audioBufferData, 24000);

      // 2. Music is already loaded in state.musicBuffer (if uploaded)

      setState(prev => ({
        ...prev,
        isGeneratingVoice: false,
        audioBuffer: decodedVoiceBuffer,
      }));
    } catch (error) {
      console.error("Spot generation failed", error);
      setState(prev => ({ ...prev, isGeneratingVoice: false }));
      alert(getErrorMessage(error));
    }
  };

  // Check API Key
  const hasApiKey = !!process.env.API_KEY;
  const selectedVoiceOption = VOICES.find(v => v.id === state.voiceProfile);

  const closeDropdowns = () => {
    setIsVoiceDropdownOpen(false);
  };

  if (!hasApiKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white p-4">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-3xl font-bold text-red-500">API Key Faltante</h1>
          <p>Esta aplicación requiere una API Key de Google Gemini para funcionar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-200 font-sans selection:bg-indigo-500 selection:text-white" onClick={closeDropdowns}>
      {/* Header */}
      <header className="border-b border-slate-800 bg-[#0f172a]/95 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Wand2 className="text-white w-6 h-6" />
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              SpotMaker AI
            </span>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-400">
            <span className="hidden md:inline">Generador de Spots Publicitarios</span>
            <div className="h-4 w-px bg-slate-700"></div>
            <span className="text-indigo-400 font-medium">v1.2.0</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 lg:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Controls & Input */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* 1. Upload Section */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50 transition-all hover:border-indigo-500/30">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-indigo-400" />
                1. Sube tu Diseño
              </h2>
              
              <div className="relative group cursor-pointer">
                <input 
                  type="file" 
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="absolute inset-0 w-full h-full opacity-0 z-10 cursor-pointer"
                />
                <div className={`
                  border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all
                  ${state.imageUrl ? 'border-indigo-500/50 bg-indigo-500/5' : 'border-slate-600 hover:border-slate-500 hover:bg-slate-700/30'}
                `}>
                  {state.imageUrl ? (
                    <div className="relative w-full aspect-[16/9] rounded-lg overflow-hidden shadow-lg">
                      <img src={state.imageUrl} alt="Uploaded" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-white font-medium flex items-center gap-2"><Upload className="w-4 h-4"/> Cambiar Imagen</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center mb-3 text-slate-400 group-hover:text-white transition-colors">
                        <Upload className="w-6 h-6" />
                      </div>
                      <p className="text-slate-300 font-medium">Arrastra o haz click para subir</p>
                      <p className="text-xs text-slate-500 mt-1">Flyers, Posters, Banners (JPG, PNG)</p>
                    </>
                  )}
                </div>
              </div>

              {state.isAnalyzing && (
                <div className="mt-4 flex items-center gap-3 text-indigo-400 bg-indigo-950/30 p-3 rounded-lg border border-indigo-900/50">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Analizando imagen y colores...</span>
                </div>
              )}
            </div>

            {/* 2. Script & Voice */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700/50">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-indigo-400" />
                2. Configuración del Spot
              </h2>

              <div className="space-y-4">
                
                {/* Duration Buttons */}
                <div>
                   <label className="block text-xs font-medium text-slate-400 mb-2 uppercase tracking-wider flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Duración Objetivo
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                        {[10, 15, 30].map(duration => (
                            <button
                                key={duration}
                                onClick={() => handleDurationChange(duration)}
                                className={`py-2 rounded-lg text-sm font-semibold transition-all border ${
                                    state.duration === duration 
                                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-lg shadow-indigo-500/20' 
                                    : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-500 hover:text-slate-200'
                                }`}
                            >
                                {duration}s
                            </button>
                        ))}
                    </div>
                </div>

                {/* Script Editor */}
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">Guion Generado (Editable)</label>
                  <textarea
                    value={state.script}
                    onChange={(e) => setState(prev => ({ ...prev, script: e.target.value, audioBuffer: null, musicBuffer: null }))}
                    rows={4}
                    placeholder={INITIAL_SCRIPT_PLACEHOLDER}
                    className={`w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-slate-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none leading-relaxed transition-opacity ${state.isRewriting ? 'opacity-50' : 'opacity-100'}`}
                  />
                  {state.isRewriting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-lg backdrop-blur-[1px]">
                          <div className="bg-slate-900/90 text-indigo-400 px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 border border-slate-700 shadow-xl">
                              <Loader2 className="w-3 h-3 animate-spin" />
                              Reescribiendo guion ({state.duration}s)...
                          </div>
                      </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Voice Selector Custom Dropdown */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                      <Mic className="w-3 h-3" /> Voz IA
                    </label>
                    <div 
                        onClick={(e) => { e.stopPropagation(); setIsVoiceDropdownOpen(!isVoiceDropdownOpen); }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-sm text-white focus:ring-2 focus:ring-indigo-500 cursor-pointer flex items-center justify-between hover:bg-slate-800 transition-colors"
                    >
                        <span className="truncate">{selectedVoiceOption?.name || 'Seleccionar voz'}</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isVoiceDropdownOpen ? 'rotate-180' : ''}`} />
                    </div>
                    
                    {isVoiceDropdownOpen && (
                        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl max-h-60 overflow-y-auto">
                            {VOICES.map(voice => (
                                <div 
                                    key={voice.id} 
                                    onClick={(e) => { e.stopPropagation(); selectVoice(voice.id); }}
                                    className={`px-3 py-2 text-sm flex items-center justify-between hover:bg-indigo-600/20 cursor-pointer transition-colors ${state.voiceProfile === voice.id ? 'bg-indigo-600/10 text-indigo-300' : 'text-slate-200'}`}
                                >
                                    <span>{voice.name}</span>
                                    <button 
                                        onClick={(e) => handlePreviewVoice(e, voice)}
                                        className="p-1.5 rounded-full hover:bg-indigo-500 text-slate-400 hover:text-white transition-all ml-2"
                                        title="Escuchar demo"
                                    >
                                        {previewingVoiceId === voice.id 
                                            ? <Square className="w-3 h-3 fill-current" /> 
                                            : <Play className="w-3 h-3 fill-current" />
                                        }
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                  </div>

                  {/* Music Upload (Replacing Selector) */}
                  <div className="relative">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider flex items-center gap-1">
                      <Music className="w-3 h-3" /> Música de Fondo
                    </label>
                    <div className="w-full">
                        <input 
                            type="file" 
                            ref={fileInputRef}
                            onChange={handleMusicUpload}
                            accept="audio/*" 
                            className="hidden" 
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            className={`w-full flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm transition-all truncate ${
                                state.musicBuffer 
                                ? 'bg-indigo-600/10 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/20' 
                                : 'bg-slate-900 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                            }`}
                        >
                            {state.musicBuffer ? (
                                <>
                                    <Check className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{state.musicFileName || 'Cargada'}</span>
                                </>
                            ) : (
                                <>
                                    <Upload className="w-3 h-3 flex-shrink-0" />
                                    <span>Subir Música</span>
                                </>
                            )}
                        </button>
                    </div>
                  </div>
                </div>

                {/* Volume Slider */}
                <div>
                    <div className="flex justify-between items-end mb-1.5">
                        <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center gap-1">
                            <Volume2 className="w-3 h-3" /> Volumen de Música
                        </label>
                        <span className="text-xs text-indigo-400 font-medium">
                            {Math.round(state.musicVolume * 100)}%
                        </span>
                    </div>
                    
                    <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={state.musicVolume}
                            onChange={(e) => setState(prev => ({ ...prev, musicVolume: parseFloat(e.target.value) }))}
                            className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <div className="flex justify-between text-[10px] text-slate-500 mt-2 font-mono">
                            <span>Silencio</span>
                            <span>Medio</span>
                            <span>Máximo</span>
                        </div>
                    </div>
                </div>

                {/* Generate Button */}
                <button
                  onClick={generateSpot}
                  disabled={state.isGeneratingVoice || !state.script || state.isAnalyzing || state.isRewriting}
                  className={`w-full py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all shadow-lg ${
                    state.isGeneratingVoice || !state.script || state.isRewriting
                      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white shadow-indigo-500/25 active:scale-[0.98]'
                  }`}
                >
                  {state.isGeneratingVoice ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Produciendo Spot...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-5 h-5" />
                      3. Generar Spot Completo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Preview */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="bg-slate-800/50 rounded-2xl p-1 border border-slate-700/50 shadow-xl overflow-hidden sticky top-24">
              <div className="bg-[#000] rounded-xl overflow-hidden">
                <VideoPreview 
                  imageUrl={state.imageUrl}
                  audioBuffer={state.audioBuffer}
                  musicBuffer={state.musicBuffer}
                  musicVolume={state.musicVolume}
                  musicFileName={state.musicFileName}
                  analysis={state.analysisData}
                  script={state.script}
                />
              </div>
              
              {/* Toolbar */}
              <div className="p-4 flex justify-between items-center border-t border-slate-700/50 mt-1 bg-slate-800/80">
                 <div className="flex gap-4 text-xs font-mono text-slate-400">
                    <div>
                        <span className="block text-slate-500 uppercase tracking-wider text-[10px]">Duración Real</span>
                        <span className="text-white">{state.audioBuffer ? `${Math.round(state.audioBuffer.duration)}s` : '--'}</span>
                    </div>
                    <div>
                        <span className="block text-slate-500 uppercase tracking-wider text-[10px]">Estilo</span>
                        <span className="text-white capitalize">
                            {state.musicBuffer ? 'Personalizado' : (state.analysisData?.mood || 'Neutro')}
                        </span>
                    </div>
                 </div>

                 <button
                    onClick={handleDownloadAudio}
                    disabled={!state.audioBuffer || isExportingAudio}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border border-slate-600 ${
                        !state.audioBuffer 
                        ? 'opacity-50 cursor-not-allowed text-slate-500' 
                        : 'text-white hover:bg-white/10 hover:border-slate-400'
                    }`}
                 >
                    {isExportingAudio ? <Loader2 className="w-4 h-4 animate-spin"/> : <FileAudio className="w-4 h-4 text-green-400" />}
                    Exportar Audio
                 </button>
              </div>
            </div>

            {/* Info Cards */}
            {state.analysisData && (
              <div className="grid grid-cols-2 gap-4 animate-fade-in-up">
                <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/30">
                   <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Colores Detectados</h3>
                   <div className="flex gap-2">
                      {state.analysisData.brandColors.map((color, i) => (
                        <div key={i} className="w-8 h-8 rounded-full border-2 border-slate-600 shadow-sm" style={{backgroundColor: color}} title={color}></div>
                      ))}
                      {state.analysisData.brandColors.length === 0 && <span className="text-sm text-slate-500">N/A</span>}
                   </div>
                </div>
                <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/30">
                   <h3 className="text-xs font-bold text-slate-400 uppercase mb-2">Productos Visibles</h3>
                   <div className="flex flex-wrap gap-2">
                      {state.analysisData.detectedProducts.map((prod, i) => (
                        <span key={i} className="px-2 py-1 bg-indigo-900/40 text-indigo-300 text-xs rounded-md border border-indigo-500/20">{prod}</span>
                      ))}
                      {state.analysisData.detectedProducts.length === 0 && <span className="text-sm text-slate-500">Ninguno específico</span>}
                   </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;