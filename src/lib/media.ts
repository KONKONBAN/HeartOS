import { useEffect, useRef, useState } from 'react';
import { toast } from './ui-store';

const isNative = () => !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

const NO_VOICE = 'Điện thoại chưa có giọng đọc cho ngôn ngữ này. Vào Cài đặt, Ngôn ngữ, Chuyển văn bản thành giọng nói để cài thêm giọng tiếng Việt.';
let noVoiceAt = 0;
const warnNoVoice = () => {
  if (Date.now() - noVoiceAt < 120_000) return;
  noVoiceAt = Date.now();
  toast(NO_VOICE, 'warning', 7000);
};

export function speak(text: string, lang = 'vi-VN') {
  if (!text.trim()) return false;
  if (isNative()) {
    void import('@capacitor-community/text-to-speech')
      .then(async ({ TextToSpeech }) => {
        await TextToSpeech.stop().catch(() => undefined);
        await TextToSpeech.speak({ text, lang, rate: 0.92 });
      })
      .catch(warnNoVoice);
    return true;
  }
  try {
    if (!('speechSynthesis' in window)) {
      toast('Trình duyệt này chưa hỗ trợ đọc to.', 'warning');
      return false;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.92;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    toast('Không đọc to được trên thiết bị này.', 'warning');
    return false;
  }
}

export function speakAsync(text: string, lang = 'vi-VN'): Promise<void> {
  if (!text.trim()) return Promise.resolve();
  if (isNative()) {
    return import('@capacitor-community/text-to-speech')
      .then(async ({ TextToSpeech }) => {
        await TextToSpeech.stop().catch(() => undefined);
        await TextToSpeech.speak({ text, lang, rate: 0.92 });
      })
      .catch(warnNoVoice);
  }
  return new Promise((resolve) => {
    try {
      if (!('speechSynthesis' in window)) return resolve();
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = 0.92;
      const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
      if (v) u.voice = v;
      const done = () => resolve();
      u.onend = done;
      u.onerror = done;
      setTimeout(done, Math.min(30_000, 1500 + text.length * 90));
      window.speechSynthesis.speak(u);
    } catch {
      resolve();
    }
  });
}

export const speechTrouble = { count: 0, last: 0, fails: [] as number[], mute: false };

export function noteSpeechFail() {
  if (speechTrouble.mute) return;
  const now = Date.now();
  speechTrouble.count = now - speechTrouble.last < 120_000 ? speechTrouble.count + 1 : 1;
  speechTrouble.last = now;
  speechTrouble.fails = [...speechTrouble.fails.filter((t) => now - t < 300_000), now];
}

export function stopSpeaking() {
  if (isNative()) {
    void import('@capacitor-community/text-to-speech').then(({ TextToSpeech }) => TextToSpeech.stop()).catch(() => undefined);
    return;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* empty */
  }
}

let current: Recog | null = null;

export function stopListening() {
  if (isNative()) {
    void import('@capacitor-community/speech-recognition').then(({ SpeechRecognition }) => SpeechRecognition.stop()).catch(() => undefined);
    return;
  }
  current?.stop();
}

export function canListen() {
  if (isNative()) return true;
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return !!(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface ListenResult {
  text: string;
  error?: 'denied' | 'unsupported' | 'failed';
}

export async function listenOnce(lang: string, onPartial?: (t: string) => void, maxMs = 12_000): Promise<ListenResult> {
  if (isNative()) {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      const { available } = await SpeechRecognition.available();
      if (!available) return { text: '', error: 'unsupported' };
      const perm = await SpeechRecognition.checkPermissions().catch(() => ({ speechRecognition: 'prompt' }));
      if (perm.speechRecognition !== 'granted') {
        const asked = await SpeechRecognition.requestPermissions();
        if (asked.speechRecognition !== 'granted') return { text: '', error: 'denied' };
      }
      await SpeechRecognition.removeAllListeners();
      return await new Promise<ListenResult>((resolve) => {
        let done = false;
        const finish = (r: ListenResult) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve(r);
        };
        const timer = setTimeout(() => {
          void SpeechRecognition.stop().catch(() => undefined);
          finish({ text: '' });
        }, maxMs);
        SpeechRecognition.start({ language: lang, maxResults: 1, partialResults: false, popup: false })
          .then((r) => {
            const text = r?.matches?.[0] ?? '';
            if (text) onPartial?.(text);
            finish({ text });
          })
          .catch((e: Error) => finish({ text: '', error: /permission/i.test(e?.message ?? '') ? 'denied' : undefined }));
      });
    } catch {
      return { text: '', error: 'failed' };
    }
  }
  const w = window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog };
  const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!C) return { text: '', error: 'unsupported' };
  return new Promise<ListenResult>((resolve) => {
    let text = '';
    let error: ListenResult['error'];
    let done = false;
    const r = new C();
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (current === r) current = null;
      resolve({ text: text.trim(), error });
    };
    const timer = setTimeout(() => {
      try {
        r.stop();
      } catch {
        /* empty */
      }
      setTimeout(finish, 800);
    }, maxMs);
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let s = '';
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      text = s;
      onPartial?.(s);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') error = 'denied';
      else if (e.error !== 'no-speech' && e.error !== 'aborted') error = 'failed';
    };
    r.onend = finish;
    current = r;
    try {
      r.start();
    } catch {
      error = 'failed';
      finish();
    }
  });
}

export function useVoiceSupport(lang: string) {
  const [state, setState] = useState<{ tts: boolean | null; stt: boolean | null; voice: boolean | null }>({ tts: null, stt: null, voice: null });
  useEffect(() => {
    let live = true;
    void (async () => {
      if (isNative()) {
        const [{ TextToSpeech }, { SpeechRecognition }] = await Promise.all([import('@capacitor-community/text-to-speech'), import('@capacitor-community/speech-recognition')]);
        const voice = await TextToSpeech.isLanguageSupported({ lang }).then((r) => r.supported).catch(() => false);
        const stt = await SpeechRecognition.available().then((r) => r.available).catch(() => false);
        if (live) setState({ tts: true, stt, voice });
        return;
      }
      const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
      const tts = 'speechSynthesis' in window;
      const voices = () => (tts ? window.speechSynthesis.getVoices().some((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2))) : false);
      if (live) setState({ tts, stt: !!(w.SpeechRecognition || w.webkitSpeechRecognition), voice: voices() });
      if (tts) window.speechSynthesis.onvoiceschanged = () => live && setState((s) => ({ ...s, voice: voices() }));
    })();
    return () => {
      live = false;
    };
  }, [lang]);
  return state;
}

interface Recog {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void;
  onerror: (e: { error: string }) => void;
  onend: () => void;
}

export function useSpeechInput(lang: string) {
  const [text, setText] = useState('');
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<Recog | null>(null);
  useEffect(() => () => {
    if (isNative()) void import('@capacitor-community/speech-recognition').then(({ SpeechRecognition }) => SpeechRecognition.removeAllListeners()).catch(() => undefined);
    else ref.current?.stop();
  }, []);
  const startNative = async () => {
    try {
      const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
      const { available } = await SpeechRecognition.available();
      if (!available) {
        setError('Điện thoại chưa có dịch vụ nhận dạng giọng nói. Bạn có thể nhập bằng bàn phím.');
        return;
      }
      const perm = await SpeechRecognition.requestPermissions();
      if (perm.speechRecognition !== 'granted') {
        setError('Chưa cấp quyền micro. Bật quyền micro cho HeartOS trong Cài đặt của điện thoại.');
        return;
      }
      await SpeechRecognition.removeAllListeners();
      await SpeechRecognition.addListener('partialResults', (d) => {
        if (d.matches?.[0]) setText(d.matches[0]);
      });
      await SpeechRecognition.addListener('listeningState', (d) => {
        if (d.status === 'stopped') setListening(false);
      });
      setError('');
      setListening(true);
      const r = await SpeechRecognition.start({ language: lang, maxResults: 1, partialResults: true, popup: false });
      if (r?.matches?.[0]) setText(r.matches[0]);
    } catch (e) {
      setListening(false);
      if (!/permission/i.test((e as Error).message || '')) noteSpeechFail();
      setError('Lỗi nhận dạng: ' + ((e as Error).message || 'không rõ'));
    }
  };
  const start = () => {
    if (isNative()) {
      void startNative();
      return;
    }
    const w = window as unknown as { SpeechRecognition?: new () => Recog; webkitSpeechRecognition?: new () => Recog };
    const C = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!C) {
      setError('Trình duyệt này chưa hỗ trợ nhận dạng giọng nói. Bạn có thể nhập bằng bàn phím.');
      return;
    }
    const r = new C();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let s = '';
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(s);
    };
    r.onerror = (e) => {
      if (e.error !== 'not-allowed' && e.error !== 'aborted') noteSpeechFail();
      setError(e.error === 'not-allowed' ? 'Chưa cấp quyền micro.' : e.error === 'no-speech' ? 'Chưa nghe thấy tiếng nói.' : 'Lỗi nhận dạng: ' + e.error);
    };
    r.onend = () => setListening(false);
    ref.current = r;
    setError('');
    setListening(true);
    r.start();
  };
  const stop = () => {
    if (isNative()) void import('@capacitor-community/speech-recognition').then(({ SpeechRecognition }) => SpeechRecognition.stop()).catch(() => undefined);
    else ref.current?.stop();
  };
  return { text, setText, listening, error, start, stop };
}

export function useRecorder() {
  const [state, setState] = useState<'idle' | 'recording' | 'done' | 'error'>('idle');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    window.clearInterval(timer.current);
    rec.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      mr.onstop = () => {
        const b = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setState('done');
        stream.getTracks().forEach((t) => t.stop());
      };
      rec.current = mr;
      mr.start();
      setSeconds(0);
      setState('recording');
      timer.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      setError((e as Error).name === 'NotAllowedError' ? 'Chưa cấp quyền micro. Bà có thể cấp trong cài đặt của trình duyệt.' : 'Thiết bị không ghi âm được: ' + (e as Error).message);
      setState('error');
    }
  };
  const stop = () => {
    window.clearInterval(timer.current);
    rec.current?.stop();
  };
  const reset = () => {
    setBlob(null);
    setUrl('');
    setSeconds(0);
    setState('idle');
  };
  return { state, blob, url, seconds, error, start, stop, reset };
}

export function compressImage(file: File, max = 960): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.8));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

export async function systemNotify(title: string, body: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: './icon-192.png', badge: './icon-192.png', tag: title });
    else new Notification(title, { body, icon: './icon-192.png' });
  } catch {
    return;
  }
}
