import { Camera, Check, Clock, HeartHandshake, Keyboard, Mic, PhoneCall, Radar, Send, Siren, Square, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { addressOf, forSpeech, interpretReply, isStop, type Address, type Reply } from '../core/family/carewatch';
import { canListen, listenOnce, speakAsync, speechTrouble, stopListening, stopSpeaking } from '../lib/media';
import { toast } from '../lib/ui-store';
import { sendSOS } from '../state/actions';
import { approveAction, askAssistant, dismissAction, useAiLive } from '../state/assistant';
import { markDose } from '../state/butler';
import { closeCheckIn, closeVoice, noteNav, noteOk, openVoice, startCareWatch, useCare, voiceAllowed, type CheckIn } from '../state/carewatch';
import { assess, POSTURE_TEXT, voiceCues, type VisionVerdict } from '../core/guardian/verify';
import { cameraCheck } from '../state/guardianVerify';
import { getHome, useHome } from '../state/services';
import { getApp, useApp, useMe } from '../state/store';
import type { ChatMsg, Member } from '../state/types';

type Phase = 'speaking' | 'listening' | 'thinking' | 'idle';

type CheckState = 'wait' | 'ok' | 'bad' | 'skip';
interface VerifyRow {
  id: 'voice' | 'motion' | 'camera';
  label: string;
  state: CheckState;
  note: string;
}

const EMERGENCY = /(cứu|cấp cứu|\bsos\b|ngã rồi|té rồi|bị ngã|bị té|khó thở|đau ngực|tức ngực|ngất|chóng mặt quá)/i;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function actorOf(me: Member) {
  return { id: me.id, name: me.name, role: me.role };
}

function Orb({ phase, onClick, big }: { phase: Phase; onClick?: () => void; big?: boolean }) {
  const label = phase === 'speaking' ? 'Đang nói, chạm để ngắt lời' : phase === 'listening' ? 'Đang nghe, chạm khi nói xong' : phase === 'thinking' ? 'Đang nghĩ' : 'Chạm để nói';
  return (
    <button className={`voice-orb ${phase}${big ? ' big' : ''}`} aria-label={label} onClick={onClick} disabled={phase === 'thinking'}>
      <span className="ring" />
      <span className="ring r2" />
      {phase === 'listening' ? <Mic size={big ? 40 : 30} /> : phase === 'thinking' ? <span className="dots"><i /><i /><i /></span> : <HeartHandshake size={big ? 40 : 30} />}
    </button>
  );
}

function CheckInSheet({ c, me }: { c: CheckIn; me: Member }) {
  const nav = useNavigate();
  const lang = useApp((s) => s.prefs.voiceLang);
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const answered = useRef(false);
  const live = useRef(true);
  const askedAt = useRef(Date.now());
  const round = useRef(0);
  const [checks, setChecks] = useState<VerifyRow[] | null>(null);
  const a: Address = addressOf(me);
  const You = cap(a.you);

  const say = async (text: string) => {
    if (!voiceAllowed(c.kind)) return;
    setPhase('speaking');
    await speakAsync(forSpeech(text), lang);
    if (live.current) setPhase('idle');
  };

  const finish = (fn?: () => void) => {
    answered.current = true;
    fn?.();
    speechTrouble.mute = false;
    closeCheckIn();
  };

  const escalate = async (why: string) => {
    answered.current = true;
    const home = getHome();
    if (c.incidentId && home.incident(c.incidentId)?.status === 'closed') {
      finish(() => toast('Người nhà đã xác nhận an toàn cho ca này.'));
      return;
    }
    if (c.incidentId) home.verifyFall(c.incidentId, 'needs_help', actorOf(me));
    try {
      const inc = await sendSOS(me.id, c.incidentId ? ((home.incident(c.incidentId)?.room as 'living' | 'bedroom') ?? 'living') : 'living');
      toast(why, 'critical', 6000);
      finish();
      if (me.mode === 'simple') nav(`/s/sos/${inc.id}`);
    } catch (e) {
      toast('Chưa gửi được SOS: ' + (e as Error).message, 'critical');
      finish();
    }
  };

  const setRow = (id: VerifyRow['id'], patch: Partial<VerifyRow>) => setChecks((rows) => (rows ? rows.map((r) => (r.id === id ? { ...r, ...patch } : r)) : rows));

  const verifyFallOk = async (text: string, latencyMs: number, pressed = false) => {
    answered.current = true;
    stopListening();
    const home = getHome();
    const inc = c.incidentId ? home.incident(c.incidentId) : undefined;
    if (!inc) return finish();
    const room = inc.room;
    const radarHere = home.s.devices.some((d) => (d.kind === 'radar' || d.kind === 'thermal') && d.room === room && d.online);
    const cue = voiceCues(text, latencyMs);
    setChecks([
      { id: 'voice', label: pressed ? 'Câu trả lời' : 'Giọng nói', state: cue.pain || cue.hedge || cue.slow ? 'bad' : 'ok', note: `${pressed ? 'Bấm nút Tôi không sao' : `"${text}"`}${cue.cues.length ? `, ${cue.cues.join(', ')}` : `, sau ${Math.max(1, Math.round(latencyMs / 1000))} giây`}` },
      { id: 'motion', label: 'Cử động (radar)', state: radarHere ? 'wait' : 'skip', note: radarHere ? `Chờ ${a.you} đứng dậy hoặc đi vài bước` : 'Phòng không có radar' },
      { id: 'camera', label: 'Camera (AI xem ảnh)', state: 'wait', note: 'Đang kiểm tra' },
    ]);
    home.addEvidence(inc.id, { kind: pressed ? 'human' : 'voice', at: Date.now(), summary: `${me.name} ${pressed ? 'bấm nút Tôi không sao' : `trả lời "${text}"`} sau ${Math.max(1, Math.round(latencyMs / 1000))} giây${cue.cues.length ? `, ${cue.cues.join(', ')}` : ''}`, ref: me.id });
    const cam = cameraCheck(room);
    void cam.then((res) => {
      if (!live.current) return;
      if (res.status === 'done') setRow('camera', { state: res.verdict.posture === 'lying_on_floor' || res.verdict.fallen_likely >= 0.6 ? 'bad' : 'ok', note: `${res.camera}: ${res.verdict.person_visible ? `thấy người đang ${POSTURE_TEXT[res.verdict.posture]}` : 'không thấy người'}` });
      else setRow('camera', { state: 'skip', note: res.reason });
    });
    await say(`Dạ, ${a.you} thử đứng dậy hoặc đi lại vài bước giúp ${a.me} nhé. ${cap(a.me)} xem ${a.you} có ổn thật không ạ.`);
    const start = Date.now();
    let moved = false;
    for (let s = 0; s < 25 && live.current && radarHere; s++) {
      await new Promise((r) => setTimeout(r, 1000));
      if (home.movedSince(room, start - 500)) {
        moved = true;
        break;
      }
    }
    if (!live.current) return;
    if (radarHere) setRow('motion', moved ? { state: 'ok', note: 'Radar thấy cử động sau khi trả lời' } : { state: 'bad', note: home.stillLying(room) ? 'Vẫn nằm yên, chưa thấy cử động' : 'Chưa thấy cử động rõ' });
    const camRes = await cam;
    if (!live.current) return;
    let vision: VisionVerdict | null = null;
    if (camRes.status === 'done') {
      vision = camRes.verdict;
      const bad = vision.posture === 'lying_on_floor' || vision.fallen_likely >= 0.6;
      setRow('camera', { state: bad ? 'bad' : 'ok', note: `${camRes.camera}: ${vision.person_visible ? `thấy người đang ${POSTURE_TEXT[vision.posture]}` : 'không thấy người'}${vision.notes ? `. ${vision.notes}` : ''}` });
      home.addEvidence(inc.id, { kind: 'camera', at: Date.now(), summary: `AI xem ảnh ${camRes.camera}: ${vision.person_visible ? POSTURE_TEXT[vision.posture] : 'không thấy người'}, khả năng ngã ${Math.round(vision.fallen_likely * 100)}%`, ref: 'camera-snapshot' });
    } else setRow('camera', { state: 'skip', note: camRes.reason });
    if (radarHere) home.addEvidence(inc.id, { kind: 'radar', at: Date.now(), summary: moved ? 'Có cử động sau khi người nhà trả lời ổn' : 'Không thấy cử động sau khi người nhà trả lời ổn', ref: `verify-${room}` });
    const r = assess({ voice: 'ok', text, latencyMs, moved: radarHere ? moved : null, stillLying: radarHere ? home.stillLying(room) : null, vision });
    if (r.verdict === 'safe') {
      await say(`Dạ, ${a.me} thấy ${a.you} ổn rồi ạ. Có gì ${a.you} cứ gọi ${a.me} nhé.`);
      home.verifyFall(inc.id, 'false_alarm', actorOf(me), `Đã xác minh: ${r.reasons.join(', ')}`);
      return finish(() => toast('Đã xác minh: không có sự cố.'));
    }
    if (r.verdict === 'danger' || round.current >= 1) {
      await say(`${You} ơi, ${a.me} chưa yên tâm. ${cap(a.me)} báo người nhà tới với ${a.you} ngay nhé.`);
      home.addEvidence(inc.id, { kind: 'human', at: Date.now(), summary: `Guardian chưa tin câu trả lời ổn: ${r.reasons.join(', ')}`, ref: 'verify' });
      return escalate(`Chưa xác minh được ${me.name} an toàn. Đã báo người nhà.`);
    }
    round.current += 1;
    answered.current = false;
    setChecks(null);
    await say(`${You} ơi, ${a.me} chưa chắc ${a.you} ổn. ${You} có đứng dậy được không ạ? ${offerShort}`);
    askedAt.current = Date.now();
    if (live.current) await listen();
  };
  const offerShort = `${cap(a.me)} có thể giúp được gì không ạ?`;

  const fine = async () => {
    if (c.kind === 'fall' && c.incidentId) return verifyFallOk('tôi không sao', Date.now() - askedAt.current, true);
    answered.current = true;
    noteOk(c.kind);
    stopListening();
    await say(`Dạ vâng ạ. Có gì ${a.you} cứ gọi ${a.me} nhé.`);
    finish();
  };

  const taken = async () => {
    answered.current = true;
    if (c.dose) markDose(c.dose.med, c.dose.due, 'taken', me.id);
    stopListening();
    await say(`Dạ, ${a.me} ghi lại rồi ạ. ${You} giỏi quá.`);
    finish(() => toast(`Đã ghi ${c.dose?.med.name ?? 'thuốc'} lúc ${c.dose?.time ?? ''}.`));
  };

  const help = (first?: string) => {
    answered.current = true;
    stopListening();
    stopSpeaking();
    if (c.kind === 'fall' || (c.kind === 'sos-idle' && first && /sos|cấp cứu|đau|ngã|té|khó thở|cứu/i.test(first))) {
      void escalate(`Đã gửi SOS cho người nhà của ${me.name}.`);
      return;
    }
    openVoice({ from: 'checkin', first, intro: first ? undefined : c.kind === 'sos-idle' ? `Dạ, ${a.you} muốn ${a.me} gọi cho ai ạ?` : `Dạ, ${a.you} cần ${a.me} giúp gì ạ?` });
  };

  const handle = async (r: Reply, text: string, latencyMs = 0) => {
    if (!live.current || answered.current) return;
    if (r === 'no' && c.kind === 'fall') return verifyFallOk(text, latencyMs);
    if (r === 'no') return fine();
    if (r === 'taken') return taken();
    if (r === 'notyet' && c.dose) {
      await say(`Dạ, ${a.you} uống ${c.dose.med.name}, ${c.dose.med.dose} nhé. Uống xong ${a.you} bấm nút Đã uống giúp ${a.me} ạ.`);
      return;
    }
    if (r === 'yes') return help();
    if (r === 'request') return help(text);
    if (r === 'silent' && c.kind === 'fall' && round.current >= 1) return escalate(`${me.name} không trả lời khi được hỏi lại. Đã báo người nhà.`);
  };

  const listen = async () => {
    if (!canListen() || answered.current) return;
    stopSpeaking();
    setPhase('listening');
    setHeard('');
    const startedAt = askedAt.current;
    const r = await listenOnce(lang, setHeard, 8000);
    if (!live.current || answered.current) return;
    setPhase('idle');
    if (r.error === 'denied') toast('Chưa cấp quyền micro. Bấm nút trên màn hình để trả lời.', 'warning');
    await handle(interpretReply(r.text, c.kind), r.text, Date.now() - startedAt);
  };

  const homeLive = useHome();
  const incStatus = c.incidentId ? homeLive.incident(c.incidentId)?.status : undefined;
  useEffect(() => {
    if (!c.incidentId || incStatus !== 'closed' || answered.current) return;
    answered.current = true;
    stopListening();
    stopSpeaking();
    finish(() => toast('Người nhà đã xác nhận an toàn cho ca này.'));
  }, [incStatus]);

  useEffect(() => {
    live.current = true;
    answered.current = false;
    speechTrouble.mute = true;
    void (async () => {
      if (voiceAllowed(c.kind)) {
        setPhase('speaking');
        await speakAsync(forSpeech(c.say), lang);
        askedAt.current = Date.now();
        if (!live.current || answered.current) return;
        await listen();
      }
    })();
    const urgent = c.kind === 'fall';
    const timer = window.setTimeout(() => {
      if (!live.current || answered.current) return;
      if (urgent) void escalate(`${me.name} chưa trả lời sau khi nghi ngã. Đã báo người nhà.`);
      else finish();
    }, urgent ? 60_000 : 120_000);
    return () => {
      live.current = false;
      window.clearTimeout(timer);
      stopListening();
      speechTrouble.mute = false;
    };
  }, [c.id]);

  return (
    <div className="checkin-wrap" role="dialog" aria-modal="true" aria-labelledby="checkin-title">
      <div className={'checkin' + (me.mode === 'simple' ? ' big' : '') + (c.kind === 'fall' ? ' urgent' : '')} data-kind={c.kind}>
        {c.kind !== 'fall' && (
          <button className="iconbtn checkin-x" aria-label="Đóng" onClick={() => void fine()}>
            <X size={18} />
          </button>
        )}
        <Orb phase={phase} onClick={phase === 'speaking' ? () => stopSpeaking() : phase === 'listening' ? () => stopListening() : () => void listen()} />
        <h2 id="checkin-title">{c.title}</h2>
        <p className="checkin-sub">{c.sub}</p>
        {heard && <p className="checkin-heard">"{heard}"</p>}
        {checks && (
          <div className="verify" aria-live="polite">
            <b className="verify-title">Đang xác minh câu trả lời</b>
            {checks.map((r) => (
              <div key={r.id} className={'verify-row ' + r.state}>
                <span className="verify-ic">{r.id === 'voice' ? <Mic size={16} /> : r.id === 'motion' ? <Radar size={16} /> : <Camera size={16} />}</span>
                <span className="verify-text"><b>{r.label}</b><small>{r.note}</small></span>
                <span className="verify-state">{r.state === 'wait' ? <span className="dots"><i /><i /><i /></span> : r.state === 'ok' ? <Check size={16} /> : r.state === 'bad' ? <X size={16} /> : 'Bỏ qua'}</span>
              </div>
            ))}
          </div>
        )}
        <p className="checkin-state" aria-live="polite">{phase === 'listening' ? `${cap(a.me)} đang nghe ${a.you} nói` : phase === 'speaking' ? `${cap(a.me)} đang hỏi thăm` : canListen() ? `Chạm vòng tròn để nói với ${a.me}` : ''}</p>
        <div className="checkin-acts">
          {c.kind === 'fall' && (
            <>
              <button className="btn danger" onClick={() => void escalate(`Đã gửi SOS cho người nhà của ${me.name}.`)}>
                <Siren size={20} /> Gọi người nhà giúp tôi
              </button>
              {!checks && (
                <button className="btn secondary" onClick={() => void fine()}>
                  <Check size={20} /> Tôi không sao
                </button>
              )}
            </>
          )}
          {c.kind === 'sos-idle' && (
            <>
              <button className="btn danger" onClick={() => void escalate(`Đã gửi SOS cho người nhà của ${me.name}.`)}>
                <Siren size={20} /> Gửi SOS ngay
              </button>
              <button className="btn" onClick={() => finish(() => nav('/s/call'))}>
                <PhoneCall size={20} /> Gọi cho con cháu
              </button>
              <button className="btn secondary" onClick={() => void fine()}>
                Tôi ổn, cảm ơn
              </button>
            </>
          )}
          {c.kind === 'med-missed' && (
            <>
              <button className="btn" onClick={() => void taken()}>
                <Check size={20} /> Đã uống rồi
              </button>
              <button className="btn secondary" onClick={() => help()}>
                <HeartHandshake size={20} /> Có, giúp tôi
              </button>
              <button className="btn ghost" onClick={() => finish()}>
                <Clock size={18} /> Để lát nữa
              </button>
            </>
          )}
          {c.kind !== 'fall' && c.kind !== 'sos-idle' && c.kind !== 'med-missed' && (
            <>
              <button className="btn" onClick={() => help()}>
                <HeartHandshake size={20} /> Có, giúp tôi
              </button>
              <button className="btn secondary" onClick={() => void fine()}>
                Tôi ổn, cảm ơn
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface Turn {
  who: 'me' | 'ai';
  text: string;
}

function latestReply(meId: string, since: number): ChatMsg | undefined {
  const chat = getApp().chat;
  for (let i = chat.length - 1; i >= 0; i--) {
    const m = chat[i];
    if (m.at < since - 1000) break;
    if (m.from === 'assistant' && (!m.by || m.by === meId)) return m;
  }
  return undefined;
}

function VoiceSession({ me, intro, first }: { me: Member; intro?: string; first?: string }) {
  const nav = useNavigate();
  const lang = useApp((s) => s.prefs.voiceLang);
  const [phase, setPhase] = useState<Phase>('idle');
  const [heard, setHeard] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [note, setNote] = useState('');
  const [typing, setTypingState] = useState(!canListen());
  const typingRef = useRef(!canListen());
  const setTyping = (v: boolean) => {
    typingRef.current = v;
    setTypingState(v);
  };
  const [draft, setDraft] = useState('');
  const live = useRef(true);
  const typed = useRef<((t: string) => void) | null>(null);
  const a = addressOf(me);
  const You = cap(a.you);
  const simple = me.mode === 'simple';

  const say = async (text: string) => {
    if (!live.current) return;
    setPhase('speaking');
    await speakAsync(forSpeech(text), lang);
  };

  const hear = async (): Promise<string | null> => {
    if (!live.current) return null;
    setHeard('');
    if (typingRef.current || !canListen()) {
      setPhase('idle');
      return new Promise((resolve) => {
        typed.current = (t) => {
          typed.current = null;
          resolve(t);
        };
      });
    }
    setPhase('listening');
    const r = await listenOnce(lang, setHeard, 12_000);
    if (typingRef.current && !r.text.trim()) return hear();
    if (r.error === 'denied' || r.error === 'unsupported') {
      setNote(r.error === 'denied' ? 'Chưa cấp quyền micro, bạn có thể gõ bên dưới.' : 'Máy này chưa nghe được giọng nói, bạn có thể gõ bên dưới.');
      setTyping(true);
      setPhase('idle');
      return new Promise((resolve) => {
        typed.current = (t) => {
          typed.current = null;
          resolve(t);
        };
      });
    }
    return r.text;
  };

  const end = (bye?: string) => {
    void (async () => {
      if (bye) await say(bye);
      live.current = false;
      stopListening();
      stopSpeaking();
      speechTrouble.mute = false;
      closeVoice();
    })();
  };

  useEffect(() => {
    live.current = true;
    speechTrouble.mute = true;
    void (async () => {
      if (intro) await say(intro);
      let pending = first;
      let silent = 0;
      let lastMsg: ChatMsg | undefined;
      while (live.current) {
        const said = pending ?? (await hear());
        pending = undefined;
        if (!live.current || said === null) break;
        if (!said.trim()) {
          silent += 1;
          if (silent >= 2) {
            end(`Dạ, ${a.me} tạm nghỉ nhé. Cần gì ${a.you} cứ gọi ${a.me} ạ.`);
            break;
          }
          await say(`Dạ, ${a.me} đang nghe ${a.you} đây ạ.`);
          continue;
        }
        silent = 0;
        setHeard('');
        setTurns((t) => [...t, { who: 'me' as const, text: said }].slice(-6));
        const pendingAction = lastMsg?.actions?.find((x) => x.status === 'pending');
        if (pendingAction && lastMsg) {
          const r = interpretReply(said);
          if (r === 'yes' || /đồng ý|làm đi|được rồi|ok/i.test(said)) {
            await approveAction(lastMsg.id, pendingAction.id, me.id, (to) => nav(to));
            const after = getApp().chat.find((m) => m.id === lastMsg!.id)?.actions?.find((x) => x.id === pendingAction.id);
            const ok = after?.status === 'done';
            const msg = ok ? `Dạ, ${a.me} làm xong rồi ạ. ${after?.note ?? ''}`.trim() : `Dạ, ${a.me} chưa làm được. ${after?.note ?? ''}`.trim();
            setTurns((t) => [...t, { who: 'ai' as const, text: msg }].slice(-6));
            lastMsg = undefined;
            if (pendingAction.kind === 'route' || pendingAction.kind === 'open' || pendingAction.kind === 'invite' || pendingAction.kind === 'call') {
              end(msg);
              break;
            }
            await say(msg);
            continue;
          }
          if (r === 'no') {
            dismissAction(lastMsg.id, pendingAction.id);
            lastMsg = undefined;
            const msg = `Dạ vâng, ${a.me} bỏ qua ạ.`;
            setTurns((t) => [...t, { who: 'ai' as const, text: msg }].slice(-6));
            await say(msg);
            continue;
          }
        }
        if (isStop(said)) {
          end(`Dạ, ${a.me} chào ${a.you}. Cần gì ${a.you} cứ gọi ${a.me} nhé.`);
          break;
        }
        if (EMERGENCY.test(said)) {
          const q = `Dạ, ${a.you} có muốn ${a.me} gửi SOS cho người nhà ngay không ạ?`;
          setTurns((t) => [...t, { who: 'ai' as const, text: q }].slice(-6));
          await say(q);
          const ans = await hear();
          if (!live.current || ans === null) break;
          const r = interpretReply(ans);
          if (r === 'no') {
            const msg = `Dạ vâng. ${You} ngồi nghỉ một chút, cần gì ${a.you} cứ nói ${a.me} nhé.`;
            setTurns((t) => [...t, { who: 'me' as const, text: ans }, { who: 'ai' as const, text: msg }].slice(-6));
            await say(msg);
            continue;
          }
          const msg = r === 'silent' ? `${cap(a.me)} chưa nghe ${a.you} trả lời, ${a.me} gửi SOS cho người nhà ngay ạ.` : `Dạ, ${a.me} gửi SOS cho người nhà ngay ạ. ${You} cứ ở yên đó nhé.`;
          setTurns((t) => [...t, ...(ans ? [{ who: 'me' as const, text: ans }] : []), { who: 'ai' as const, text: msg }].slice(-6));
          try {
            const inc = await sendSOS(me.id, 'living');
            end(msg);
            nav(simple ? `/s/sos/${inc.id}` : `/f/incident/${inc.id}`);
          } catch (e) {
            toast('Chưa gửi được SOS: ' + (e as Error).message, 'critical');
            end();
          }
          break;
        }
        setPhase('thinking');
        const since = Date.now();
        await askAssistant(said, me.id, { simple, quiet: true, voice: true });
        if (!live.current) break;
        const reply = latestReply(me.id, since);
        lastMsg = reply;
        const text = reply ? forSpeech(reply.text) : `Dạ, ${a.me} chưa trả lời được, ${a.you} nói lại giúp ${a.me} nhé.`;
        setTurns((t) => [...t, { who: 'ai' as const, text }].slice(-6));
        const hasCard = reply?.actions?.some((x) => x.status === 'pending');
        await say(hasCard ? `${text} ${You} nói đồng ý, hoặc bấm nút trên màn hình, ${a.me} làm ngay ạ.` : text);
      }
    })();
    return () => {
      live.current = false;
      stopListening();
      stopSpeaking();
      speechTrouble.mute = false;
    };
  }, []);

  const busy = useAiLive((s) => s.busy);
  const tapOrb = () => {
    if (phase === 'speaking') stopSpeaking();
    else if (phase === 'listening') stopListening();
  };
  const sendTyped = () => {
    const t = draft.trim();
    if (!t || !typed.current) return;
    setDraft('');
    typed.current(t);
  };
  const lastPending = (() => {
    const chat = getApp().chat;
    for (let i = chat.length - 1; i >= 0; i--) if (chat[i].from === 'assistant' && chat[i].by === me.id) return chat[i].actions?.some((x) => x.status === 'pending') ? chat[i] : undefined;
    return undefined;
  })();

  return (
    <div className="voice-wrap" role="dialog" aria-modal="true" aria-label="Trò chuyện bằng giọng nói">
      <div className={'voice' + (simple ? ' big' : '')}>
        <div className="voice-top">
          <span className="voice-title">Trò chuyện với trợ lý</span>
          <button className="iconbtn" aria-label="Kết thúc trò chuyện" onClick={() => end()}>
            <X size={20} />
          </button>
        </div>
        <div className="voice-log" aria-live="polite">
          {turns.length === 0 && <p className="voice-hint">{intro ?? `${You} cứ nói tự nhiên, ${a.me} nghe và trả lời bằng giọng nói. Nói "thôi" hoặc "tạm biệt" để kết thúc.`}</p>}
          {turns.map((t, i) => (
            <p key={i} className={'voice-turn ' + t.who}>
              {t.text}
            </p>
          ))}
          {heard && <p className="voice-turn me live">{heard}</p>}
        </div>
        <Orb phase={busy && phase === 'thinking' ? 'thinking' : phase} onClick={tapOrb} big />
        <p className="voice-state" aria-live="polite">
          {phase === 'listening' ? `${cap(a.me)} đang nghe` : phase === 'thinking' ? `${cap(a.me)} đang nghĩ` : phase === 'speaking' ? 'Chạm vòng tròn để ngắt lời' : typing ? 'Gõ câu hỏi bên dưới' : ''}
        </p>
        {note && <p className="small muted" style={{ margin: 0, textAlign: 'center' }}>{note}</p>}
        {lastPending?.actions?.filter((x) => x.status === 'pending').slice(0, 1).map((x) => (
          <div key={x.id} className="voice-card">
            <b>{x.title}</b>
            <div className="hstack">
              <button className="btn sm" onClick={() => typed.current ? typed.current('đồng ý') : void approveAction(lastPending.id, x.id, me.id, (to) => nav(to))}>
                <Check size={16} /> Đồng ý
              </button>
              <button className="btn sm ghost" onClick={() => typed.current ? typed.current('không') : dismissAction(lastPending.id, x.id)}>
                Bỏ qua
              </button>
            </div>
          </div>
        ))}
        {typing ? (
          <div className="composer">
            <input className="composer-input" placeholder="Gõ câu hỏi" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendTyped()} aria-label="Gõ câu hỏi cho trợ lý" />
            <button className="iconbtn round dark" aria-label="Gửi" disabled={!draft.trim() || !typed.current} onClick={sendTyped}>
              <Send size={18} />
            </button>
          </div>
        ) : (
          <div className="voice-acts">
            <button className="btn ghost sm" onClick={() => { setTyping(true); stopListening(); }}>
              <Keyboard size={16} /> Gõ chữ
            </button>
            <button className="btn danger sm" onClick={() => end()}>
              <Square size={16} /> Kết thúc
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function CareLayer() {
  const loc = useLocation();
  const checkin = useCare((s) => s.checkin);
  const voice = useCare((s) => s.voice);
  const signedIn = useApp((s) => s.session.signedIn && !!s.session.mode);
  const me = useMe();
  useEffect(() => startCareWatch(), []);
  useEffect(() => noteNav(loc.pathname), [loc.pathname]);
  if (!signedIn || !me.id) return null;
  if (voice) return <VoiceSession key={`${voice.intro ?? ''}|${voice.first ?? ''}`} me={me} intro={voice.intro} first={voice.first} />;
  if (checkin && checkin.memberId === me.id) return <CheckInSheet key={checkin.id} c={checkin} me={me} />;
  return null;
}
