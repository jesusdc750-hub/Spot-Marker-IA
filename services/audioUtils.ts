let sharedAudioContext: AudioContext | null = null;

const getSharedAudioContext = () => {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

// Helper to convert raw PCM (Int16) to AudioBuffer
export const pcmToAudioBuffer = (buffer: ArrayBuffer, sampleRate: number = 24000): AudioBuffer => {
  const byteLength = buffer.byteLength;
  const evenByteLength = byteLength - (byteLength % 2);
  const int16Array = new Int16Array(buffer, 0, evenByteLength / 2);
  
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }

  const ctx = getSharedAudioContext();
  const audioBuffer = ctx.createBuffer(1, float32Array.length, sampleRate);
  audioBuffer.getChannelData(0).set(float32Array);
  return audioBuffer;
};

// Decodes an ArrayBuffer (mp3/wav) into an AudioBuffer
export const decodeAudioFile = async (fileBuffer: ArrayBuffer): Promise<AudioBuffer> => {
    const ctx = getSharedAudioContext();
    return await ctx.decodeAudioData(fileBuffer);
};

// Helper to play a buffer (used for previews)
export const playPreview = (buffer: AudioBuffer, onEnded?: () => void): () => void => {
  const ctx = getSharedAudioContext();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  
  source.onended = () => {
    if (onEnded) onEnded();
  };
  
  source.start(0);
  
  return () => {
    try {
      source.stop();
      source.disconnect();
    } catch(e) {}
  };
};

// Mixes Voice and Music using OfflineAudioContext and returns a WAV Blob
export const mixAudioAndExport = async (
    voiceBuffer: AudioBuffer, 
    musicBuffer: AudioBuffer | null, 
    volume: number
): Promise<Blob> => {
    // 1. Setup Offline Context
    const duration = voiceBuffer.duration; // The mix usually matches voice length
    const sampleRate = 44100;
    const offlineCtx = new OfflineAudioContext(2, sampleRate * duration, sampleRate);

    // 2. Setup Voice Source
    const voiceSource = offlineCtx.createBufferSource();
    voiceSource.buffer = voiceBuffer;
    voiceSource.connect(offlineCtx.destination);
    voiceSource.start(0);

    // 3. Setup Music Source (if exists)
    if (musicBuffer) {
        const musicSource = offlineCtx.createBufferSource();
        musicSource.buffer = musicBuffer;
        musicSource.loop = true;
        
        const gainNode = offlineCtx.createGain();
        gainNode.gain.value = volume;

        musicSource.connect(gainNode);
        gainNode.connect(offlineCtx.destination);
        musicSource.start(0);
    }

    // 4. Render
    const renderedBuffer = await offlineCtx.startRendering();

    // 5. Convert to WAV
    return bufferToWav(renderedBuffer);
};

// Encodes AudioBuffer to WAV format
function bufferToWav(abuffer: AudioBuffer) {
    const numOfChan = abuffer.numberOfChannels;
    const length = abuffer.length * numOfChan * 2 + 44;
    const buffer = new ArrayBuffer(length);
    const view = new DataView(buffer);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;
  
    // write WAVE header
    setUint32(0x46464952); // "RIFF"
    setUint32(length - 8); // file length - 8
    setUint32(0x45564157); // "WAVE"
  
    setUint32(0x20746d66); // "fmt " chunk
    setUint32(16); // length = 16
    setUint16(1); // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(abuffer.sampleRate);
    setUint32(abuffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
    setUint16(numOfChan * 2); // block-align
    setUint16(16); // 16-bit (hardcoded in this simple encoder)
  
    setUint32(0x61746164); // "data" - chunk
    setUint32(length - pos - 4); // chunk length
  
    // write interleaved data
    for(i = 0; i < abuffer.numberOfChannels; i++)
      channels.push(abuffer.getChannelData(i));
  
    while(pos < abuffer.length) {
      for(i = 0; i < numOfChan; i++) {             // interleave channels
        sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
        view.setInt16(offset, sample, true);          // write 16-bit sample
        offset += 2;
      }
      pos++;
    }
  
    return new Blob([buffer], { type: "audio/wav" });
  
    function setUint16(data: number) {
      view.setUint16(offset, data, true);
      offset += 2;
    }
  
    function setUint32(data: number) {
      view.setUint32(offset, data, true);
      offset += 4;
    }
}