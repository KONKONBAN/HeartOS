import { useEffect, useRef, useState } from 'react';

export function speak(text: string, lang = 'vi-VN') {
  try {
    if (!('speechSynthesis' in window)) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang;
    u.rate = 0.92;
    const v = window.speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith(lang.slice(0, 2)));
    if (v) u.voice = v;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

export function voiceSupport() {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return { tts: 'speechSynthesis' in window, stt: !!(w.SpeechRecognition || w.webkitSpeechRecognition), voices: 'speechSynthesis' in window ? window.speechSynthesis.getVoices().filter((v) => v.lang?.startsWith('vi')).length : 0 };
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
  const start = () => {
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
    r.onerror = (e) => setError(e.error === 'not-allowed' ? 'Chưa cấp quyền micro.' : 'Lỗi nhận dạng: ' + e.error);
    r.onend = () => setListening(false);
    ref.current = r;
    setError('');
    setListening(true);
    r.start();
  };
  const stop = () => ref.current?.stop();
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
