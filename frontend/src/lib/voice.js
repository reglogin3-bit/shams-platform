/** Ovoz: serverdagi OpenAI (STT/TTS) + brauzer ovozi zaxira varianti. */

import { kioskApi } from './api.js';

let current = null;

export function stopSpeaking() {
  if (current) {
    try {
      current.pause();
      current.src = '';
    } catch (error) {
      /* e'tiborsiz */
    }
    current = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function browserSpeak(text) {
  if (!('speechSynthesis' in window)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices() || [];
    const uz = voices.find((voice) => String(voice.lang).toLowerCase().startsWith('uz'));
    const ru = voices.find((voice) => String(voice.lang).toLowerCase().startsWith('ru'));
    if (uz) utterance.voice = uz;
    utterance.lang = uz ? uz.lang : ru ? ru.lang : 'ru-RU';
    utterance.rate = 0.98;
    utterance.onend = () => resolve(true);
    utterance.onerror = () => resolve(false);
    synth.speak(utterance);
  });
}

/** Matnni ovozga aylantirib qaytaradi (server TTS, bo'lmasa brauzer ovozi). */
export async function speak(text) {
  const clean = String(text || '').trim();
  if (!clean) return false;
  stopSpeaking();
  try {
    const response = await kioskApi('/api/kiosk/voice/tts', { method: 'POST', body: { text: clean } });
    const blob = await response.blob();
    if (!blob.size) throw new Error('empty');
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    current = audio;
    await new Promise((resolve, reject) => {
      audio.onended = resolve;
      audio.onerror = reject;
      audio.play().catch(reject);
    });
    URL.revokeObjectURL(url);
    current = null;
    return true;
  } catch (error) {
    return browserSpeak(clean);
  }
}

export async function transcribe(blob) {
  const form = new FormData();
  form.append('audio', blob, 'voice.wav');
  const result = await kioskApi('/api/kiosk/voice/stt', { method: 'POST', form });
  return (result.text || '').trim();
}

export async function chat(messages, groupId) {
  return kioskApi('/api/kiosk/voice/chat', {
    method: 'POST',
    body: { messages, groupId: groupId || null },
  });
}
