import React, { useEffect, useRef, useState } from 'react';
import { Play, Pause, Download, MonitorPlay } from 'lucide-react';
import { AnalysisResult } from '../types';

interface VideoPreviewProps {
  imageUrl: string | null;
  audioBuffer: AudioBuffer | null;
  musicBuffer: AudioBuffer | null;
  musicVolume: number;
  musicFileName: string | null;
  analysis: AnalysisResult | null;
  script: string;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({ 
  imageUrl, 
  audioBuffer, 
  musicBuffer,
  musicVolume,
  musicFileName,
  analysis, 
  script 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const musicSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const musicGainNodeRef = useRef<GainNode | null>(null);
  const animationFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0);
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);

  // Load image object
  useEffect(() => {
    if (imageUrl) {
      const img = new Image();
      img.src = imageUrl;
      img.onload = () => setImageElement(img);
    }
  }, [imageUrl]);

  // Initial Draw
  useEffect(() => {
    if (canvasRef.current && imageElement) {
      drawFrame(0);
    }
  }, [imageElement, analysis]);

  // Stop playback if buffers change (e.g. new generation)
  useEffect(() => {
    stop();
  }, [audioBuffer, musicBuffer]);

  // Real-time Volume Adjustment
  useEffect(() => {
    if (musicGainNodeRef.current) {
        musicGainNodeRef.current.gain.value = musicVolume;
    }
  }, [musicVolume]);

  const togglePlay = async () => {
    if (isPlaying) {
      stop();
    } else {
      await play();
    }
  };

  const play = async () => {
    if (!audioBuffer || !imageElement) return;

    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    if (audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    const ctx = audioContextRef.current;
    
    // 1. Play Voice
    const voiceSource = ctx.createBufferSource();
    voiceSource.buffer = audioBuffer;
    voiceSource.connect(ctx.destination);
    voiceSource.onended = () => stop();
    
    voiceSourceRef.current = voiceSource;
    voiceSource.start(0);

    // 2. Play Music (if available)
    if (musicBuffer) {
      const musicSource = ctx.createBufferSource();
      musicSource.buffer = musicBuffer;
      musicSource.loop = true; // Loop music if short
      
      const gainNode = ctx.createGain();
      gainNode.gain.value = musicVolume;
      
      musicSource.connect(gainNode);
      gainNode.connect(ctx.destination);
      musicSource.start(0);
      
      musicSourceRef.current = musicSource;
      musicGainNodeRef.current = gainNode;
    }

    startTimeRef.current = performance.now();
    setIsPlaying(true);

    animate();
  };

  const stop = () => {
    if (voiceSourceRef.current) {
      try {
        voiceSourceRef.current.stop();
        voiceSourceRef.current.disconnect();
      } catch (e) { /* ignore */ }
      voiceSourceRef.current = null;
    }

    if (musicSourceRef.current) {
      try {
        musicSourceRef.current.stop();
        musicSourceRef.current.disconnect();
      } catch (e) { /* ignore */ }
      musicSourceRef.current = null;
    }
    
    if (musicGainNodeRef.current) {
        try {
            musicGainNodeRef.current.disconnect();
        } catch(e) { /* ignore */ }
        musicGainNodeRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsPlaying(false);
    drawFrame(0); // Reset to start
  };

  const animate = () => {
    const elapsed = (performance.now() - startTimeRef.current) / 1000;
    const duration = audioBuffer ? audioBuffer.duration : 10;
    
    if (elapsed > duration + 0.5) { // Small buffer
      stop();
      return;
    }

    drawFrame(elapsed);
    animationFrameRef.current = requestAnimationFrame(animate);
  };

  const drawFrame = (time: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !imageElement) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    // KEN BURNS EFFECT
    // Zoom from 1.0 to 1.15 over the duration
    const duration = audioBuffer ? audioBuffer.duration : 10;
    const progress = Math.min(time / duration, 1);
    const scale = 1.0 + (progress * 0.15); // 15% zoom
    
    // Pan slightly to the right
    const panX = (width * 0.05) * progress; 
    
    // Calculate centered source rectangle
    const iRatio = imageElement.width / imageElement.height;
    const cRatio = width / height;
    
    let sWidth, sHeight, sx, sy;

    // Cover logic
    if (iRatio > cRatio) {
      sHeight = imageElement.height;
      sWidth = imageElement.height * cRatio;
      sx = (imageElement.width - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = imageElement.width;
      sHeight = imageElement.width / cRatio;
      sx = 0;
      sy = (imageElement.height - sHeight) / 2;
    }

    // Apply scale to source rect (inverse scale)
    const activeSWidth = sWidth / scale;
    const activeSHeight = sHeight / scale;
    const activeSx = sx + ((sWidth - activeSWidth) / 2) + (panX * (imageElement.width / width));
    const activeSy = sy + ((sHeight - activeSHeight) / 2);

    ctx.drawImage(
      imageElement, 
      activeSx, activeSy, activeSWidth, activeSHeight, 
      0, 0, width, height
    );

    // OVERLAY
    // Darken slightly for text readability
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(0, 0, width, height);

    // TEXT ANIMATIONS
    if (analysis) {
      // Dynamic Captioning logic
      ctx.textAlign = 'center';
      
      // Headline (Always visible but fades out slightly or moves)
      ctx.font = 'bold 32px Inter';
      ctx.fillStyle = analysis.brandColors?.[0] || '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.8)';
      ctx.shadowBlur = 10;
      
      // Animate headline entrance
      const headY = 80 + (progress < 0.1 ? (1 - progress/0.1) * -50 : 0);
      ctx.globalAlpha = Math.min(progress * 2, 1);
      ctx.fillText(analysis.headline.substring(0, 30) + (analysis.headline.length > 30 ? '...' : ''), width / 2, headY);
      
      // Script Captions (Simple chunking)
      const words = script.split(' ');
      const wordsPerScreen = 8;
      const totalScreens = Math.ceil(words.length / wordsPerScreen);
      const currentScreen = Math.floor(progress * totalScreens);
      
      const startWord = currentScreen * wordsPerScreen;
      const visibleWords = words.slice(startWord, startWord + wordsPerScreen).join(' ');

      if (visibleWords) {
        ctx.font = '500 24px Inter';
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 1;
        
        // Wrap text
        const maxWidth = width - 80;
        const lineHeight = 35;
        const x = width / 2;
        let y = height - 120;
        
        wrapText(ctx, visibleWords, x, y, maxWidth, lineHeight);
      }
    }
  };

  const wrapText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) => {
    const words = text.split(' ');
    let line = '';

    for(let n = 0; n < words.length; n++) {
      const testLine = line + words[n] + ' ';
      const metrics = ctx.measureText(testLine);
      const testWidth = metrics.width;
      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y);
        line = words[n] + ' ';
        y += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, y);
  };

  const handleExport = () => {
    if (!canvasRef.current || !audioBuffer || !audioContextRef.current) return;
    alert("Iniciando renderizado 1080p...\n(Esta función descargaría el archivo .webm compuesto)");
  };

  return (
    <div className="flex flex-col items-center bg-gray-900 rounded-xl p-4 shadow-2xl border border-gray-800">
      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4 shadow-lg ring-1 ring-white/10">
        <canvas 
          ref={canvasRef} 
          width={1280} 
          height={720} 
          className="w-full h-full object-cover"
        />
        {!imageUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-gray-500">
            <span className="flex items-center gap-2"><MonitorPlay className="w-6 h-6"/> Vista Previa</span>
          </div>
        )}
      </div>

      <div className="flex w-full justify-between items-center px-2">
        <div className="flex gap-2">
          <button 
            onClick={togglePlay}
            disabled={!audioBuffer}
            className={`flex items-center gap-2 px-6 py-2 rounded-full font-semibold transition-all ${
              !audioBuffer 
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-500/30'
            }`}
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {isPlaying ? 'Pausar' : 'Reproducir Spot'}
          </button>
        </div>

        <button 
          onClick={handleExport}
          disabled={!audioBuffer}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
             !audioBuffer ? 'text-gray-600' : 'text-gray-300 hover:text-white hover:bg-white/10'
          }`}
        >
          <Download className="w-4 h-4" /> Exportar MP4
        </button>
      </div>
      
      {!audioBuffer && imageUrl && analysis && (
         <p className="mt-3 text-xs text-yellow-500 animate-pulse">
           ⚠ Genera el spot para escuchar la música y voz.
         </p>
      )}
      
      {musicFileName && (
          <p className="mt-2 text-xs text-indigo-400">
             ♫ Música cargada: {musicFileName}
          </p>
      )}
    </div>
  );
};