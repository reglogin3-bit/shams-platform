/** Mikrofon: 16 kHz mono PCM16 WAV + jimjitlikda avtomatik to'xtash (VAD). */

const SAMPLE_RATE = 16000;

export function microphoneAvailable() {
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };
  write(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return buffer;
}

export async function startSession({
  onLevel,
  silenceMs = 900,
  maxMs = 10000,
  threshold = 0.014,
  autoStop = true,
} = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const context = new Ctx({ sampleRate: SAMPLE_RATE });
  try {
    await context.resume();
  } catch (error) {
    /* e'tiborsiz */
  }
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const chunks = [];
  let hasSpeech = false;
  let lastVoiceAt = 0;
  let noiseFloor = 0.004;
  let active = true;
  let settle = null;
  const startedAt = Date.now();

  const cleanup = () => {
    active = false;
    try {
      processor.disconnect();
    } catch (error) {
      /* e'tiborsiz */
    }
    try {
      source.disconnect();
    } catch (error) {
      /* e'tiborsiz */
    }
    stream.getTracks().forEach((track) => track.stop());
    context.close().catch(() => {});
  };

  const finish = () => {
    if (!active) return;
    cleanup();
    if (settle) settle({ hasSpeech, chunks });
  };

  processor.onaudioprocess = (event) => {
    if (!active) return;
    const data = event.inputBuffer.getChannelData(0);
    chunks.push(new Float32Array(data));
    let sum = 0;
    for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
    const rms = Math.sqrt(sum / data.length);
    if (rms < Math.max(threshold * 1.4, noiseFloor * 2)) {
      noiseFloor = noiseFloor * 0.92 + rms * 0.08;
    }
    const gate = Math.max(threshold, noiseFloor * 2.4);
    if (onLevel) onLevel(rms);
    const now = Date.now();
    if (rms > gate) {
      hasSpeech = true;
      lastVoiceAt = now;
    }
    if (autoStop && hasSpeech && now - lastVoiceAt > silenceMs) finish();
    if (now - startedAt > maxMs) finish();
  };

  source.connect(processor);
  const mute = context.createGain();
  mute.gain.value = 0;
  processor.connect(mute);
  mute.connect(context.destination);

  const collected = new Promise((resolve) => {
    settle = resolve;
  });
  let finalResult = null;

  const stop = async () => {
    if (finalResult) return finalResult;
    finish();
    const result = await collected;
    if (!result.hasSpeech) {
      finalResult = { hasSpeech: false, blob: null };
      return finalResult;
    }
    const total = result.chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(total);
    let offset = 0;
    result.chunks.forEach((chunk) => {
      merged.set(chunk, offset);
      offset += chunk.length;
    });
    const wav = encodeWav(merged, SAMPLE_RATE);
    finalResult = { hasSpeech: true, blob: new Blob([wav], { type: 'audio/wav' }) };
    return finalResult;
  };

  const cancel = () => {
    cleanup();
    if (settle) settle({ hasSpeech: false, chunks: [] });
  };

  return { stop, cancel, isActive: () => active };
}
