import { Camera, FileText, Image as ImageIcon, Lock, Mic, Plus, ShieldCheck, Square, Users, Volume2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Phone } from '../../components/Layouts';
import { Badge, Chips, Field, Header, KV, Row, Switch, TopBar, TraceView } from '../../components/ui';
import { summarizeStory } from '../../core/family/genai';
import type { TraceStep } from '../../core/sentinel/types';
import { dmy } from '../../lib/format';
import { compressImage, speak, useRecorder } from '../../lib/media';
import { toast } from '../../lib/ui-store';
import { addMemory, openMemory, setMemoryViewers } from '../../state/actions';
import { memberName, namesOf, useApp, useMe } from '../../state/store';

export function FMemories() {
  const me = useMe();
  const mems = useApp((s) => s.memories).filter((m) => m.narrator === me.id || m.viewers.includes(me.id) || me.role === 'admin');
  const [first, ...rest] = mems;
  return (
    <Phone tabs>
      <TopBar />
      <Header title="Ký Ức Số" sub="Ảnh và lời kể được gia đình chọn chia sẻ." />
      {first && (
        <Link to={`/f/memory/${first.id}`} className="hero peach" style={{ textDecoration: 'none' }}>
          <div className="img" style={{ backgroundImage: `url(${first.image ?? './media/grandma-album.jpg'})`, height: 150 }}>
            <span className="badge">ALBUM GIA ĐÌNH</span>
          </div>
          <div className="body">
            <h2>{first.title}</h2>
            <p>{memberName(first.narrator)} kể · {first.kind !== 'story' ? 'Ảnh' : first.audioKey ? 'Bản thu và lời chép' : 'Lời kể chép lại'}</p>
            <div className="cta">Mở ký ức <span>›</span></div>
          </div>
        </Link>
      )}
      <div className="grid2">
        <Link to="/f/memory-new" className="btn secondary"><Plus size={18} /> Thêm ký ức</Link>
        <Link to="/f/memory-new?mode=audio" className="btn secondary"><Mic size={18} /> Ghi âm</Link>
      </div>
      {rest.map((m) => (
        <Row
          key={m.id}
          icon={m.image ? <img src={m.image} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} /> : <Mic size={18} />}
          tileTone="white"
          title={m.title}
          meta={m.shared ? `Chia sẻ với ${namesOf(m.viewers)}` : 'Chỉ mình người kể'}
          badge={!m.shared ? <Badge tone="line">Riêng tư</Badge> : undefined}
          to={`/f/memory/${m.id}`}
        />
      ))}
    </Phone>
  );
}

export function FMemory() {
  const { id } = useParams();
  const me = useMe();
  const mem = useApp((s) => s.memories.find((m) => m.id === id));
  const members = useApp((s) => s.members);
  const [data, setData] = useState<{ transcript: string; caption: string } | null>(null);
  const [audio, setAudio] = useState<string>();
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [err, setErr] = useState('');
  const [showTrace, setShowTrace] = useState(false);
  const [viewers, setViewers] = useState<string[]>(mem?.viewers ?? []);
  const nav = useNavigate();
  useEffect(() => {
    if (!mem) return;
    void openMemory(mem.id, me.id).then((r) => {
      setTrace(r.trace);
      if (r.ok) {
        setData(r.data);
        setAudio(r.audioUrl);
        setErr('');
      } else {
        setErr(r.error);
        setData(null);
      }
    });
  }, [mem?.id, me.id, mem]);
  if (!mem) return null;
  const isOwner = mem.narrator === me.id;
  return (
    <Phone tabs>
      <TopBar back backTo="/f/memories" />
      <Header title={mem.title} sub={`${memberName(mem.narrator)} kể · ${mem.shared ? 'Chia sẻ với ' + namesOf(mem.viewers) : 'Riêng tư'}`} />
      {mem.image && (
        <div className="hero">
          <div className="img" style={{ backgroundImage: `url(${mem.image})`, height: 170 }}>
            <span className="badge">KÝ ỨC NHÀ AN</span>
          </div>
          <div className="body">
            <h2 style={{ fontSize: 17 }}>{data?.caption || mem.title}</h2>
            <p style={{ margin: 0 }}>Ảnh {dmy(mem.createdAt)}</p>
          </div>
        </div>
      )}
      {err && <Row tone="rose" icon={<Lock size={18} />} tileTone="white" title="Không mở được bản gốc" meta={err} />}
      {data && (
        <>
          {mem.audioKey ? (
            <div className="card tint">
              <h3>Bản thu gốc</h3>
              <p>{mem.durationSec ? `${String(Math.floor(mem.durationSec / 60)).padStart(2, '0')}:${String(mem.durationSec % 60).padStart(2, '0')} · ` : ''}Tiếng Việt</p>
              {audio ? <audio controls src={audio} style={{ width: '100%', marginTop: 8 }} /> : <p className="small" style={{ marginTop: 6 }}>Đang giải mã bản thu…</p>}
            </div>
          ) : mem.kind === 'story' && (data.transcript || data.caption) ? (
            <div className="card tint">
              <h3>Lời kể chép lại</h3>
              <p>Tiếng Việt · nghe bằng giọng đọc của máy</p>
              <button className="btn soft sm" style={{ marginTop: 8 }} onClick={() => speak(String(data.transcript || data.caption))}>
                <Volume2 size={18} /> Nghe lời chép
              </button>
            </div>
          ) : null}
          <div className="card">
            <div className="hstack">
              <h3 style={{ flex: 1 }}>Lời chép đã duyệt</h3>
              <Badge tone="line">Quyền xem theo bản gốc</Badge>
            </div>
            <p className="quote" style={{ marginTop: 6 }}>{data.transcript || 'Người kể chưa đồng ý tạo lời chép.'}</p>
          </div>
        </>
      )}
      <button className="btn xs ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setShowTrace((v) => !v)}>
        <ShieldCheck size={14} /> {showTrace ? 'Ẩn' : 'Xem'} đường mở qua Sentinel
      </button>
      {showTrace && <div className="card"><TraceView trace={trace} /></div>}
      <div className="card">
        <KV items={[['Người được xem', mem.shared ? namesOf(mem.viewers) : 'Chỉ người kể'], ['Hạn lưu bản gốc', mem.retention], ['Bản chép và bản dịch', mem.derivedAllowed ? 'Được tạo khi đồng ý' : 'Không tạo']]} />
      </div>
      {isOwner && (
        <div className="card stack">
          <div className="label">Người được xem (thay đổi sẽ thu hồi quyền ngay theo epoch)</div>
          <Chips options={members.filter((m) => m.id !== me.id && m.role !== 'carer').map((m) => ({ value: m.id, label: m.name }))} value={viewers} onChange={setViewers} />
          <button
            className="btn sm"
            disabled={JSON.stringify(viewers) === JSON.stringify(mem.viewers)}
            onClick={() => void setMemoryViewers(mem.id, viewers, me.id).then(() => toast('Đã cập nhật quyền xem ký ức.'))}
          >
            Lưu phạm vi
          </button>
        </div>
      )}
      <button className="btn secondary" onClick={() => nav('/f/memories')}>Về Ký Ức Số</button>
    </Phone>
  );
}

export function FMemoryNew() {
  const me = useMe();
  const [params] = useSearchParams();
  const members = useApp((s) => s.members);
  const rituals = useApp((s) => s.rituals);
  const nav = useNavigate();
  const rec = useRecorder();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'compose' | 'review'>('compose');
  const [image, setImage] = useState<string>();
  const [title, setTitle] = useState('Bữa cơm tháng 11');
  const [caption, setCaption] = useState('');
  const [transcript, setTranscript] = useState('');
  const [ritualId, setRitualId] = useState(params.get('ritual') ?? 'r-sunday');
  const [viewers, setViewers] = useState<string[]>(['u-lan', 'u-an', 'u-linh'].filter((x) => x !== me.id));
  const [derived, setDerived] = useState(true);
  const [retention, setRetention] = useState('Theo lựa chọn của người kể');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (params.get('mode') === 'audio' && rec.state === 'idle') void rec.start();
  }, []);
  const pick = async (f?: File) => {
    if (!f) return;
    try {
      setImage(await compressImage(f));
    } catch {
      toast('Không đọc được ảnh.', 'warning');
    }
  };
  const save = async (share: boolean) => {
    setBusy(true);
    const r = await addMemory({ by: me.id, title, kind: rec.blob ? 'story' : 'photo', transcript, caption: caption || title, image, audio: rec.blob ?? undefined, durationSec: rec.seconds || undefined, viewers, ritualId: ritualId || undefined, derivedAllowed: derived, retention, share });
    setBusy(false);
    if (r.ok) {
      toast(share ? 'Đã lưu và chia sẻ ký ức.' : 'Đã lưu riêng.');
      nav(`/f/memory/${r.id}`);
    } else toast(r.error ?? 'Không lưu được', 'warning');
  };
  if (step === 'review')
    return (
      <Phone tabs>
        <TopBar back />
        <Header title="Duyệt ký ức" sub="Chọn phạm vi trước khi lưu hoặc chia sẻ." />
        <div className="label">Người được xem</div>
        <Chips options={members.filter((m) => m.id !== me.id && m.role !== 'carer').map((m) => ({ value: m.id, label: m.name }))} value={viewers} onChange={setViewers} />
        <Field label="Hạn lưu bản gốc">
          <select className="input" value={retention} onChange={(e) => setRetention(e.target.value)}>
            <option>Theo lựa chọn của người kể</option>
            <option>1 năm</option>
            <option>5 năm</option>
            <option>Lâu dài</option>
          </select>
        </Field>
        <Row icon={<FileText size={18} />} title="Bản chép và bản dịch" meta="Chỉ tạo khi được đồng ý. Quyền bản dẫn xuất tối đa bằng bản gốc." chevron={false} right={<Switch label="Cho phép bản chép" checked={derived} onChange={setDerived} />} />
        <Row tone="tint" icon={<Lock size={18} />} tileTone="white" title="Mã hóa trên thiết bị" meta="Bản ghi âm mã hóa AES-256-GCM, khóa được bọc trong Core Vault của Sentinel; chỉ người được xem mở được." />
        <div className="btnrow">
          <button className="btn secondary" disabled={busy} onClick={() => void save(false)}>Lưu riêng</button>
          <button className="btn" disabled={busy || !viewers.length} onClick={() => void save(true)}>Duyệt chia sẻ</button>
        </div>
      </Phone>
    );
  return (
    <Phone tabs>
      <TopBar back backTo="/f/memories" />
      <Header title="Thêm ký ức" sub="Chọn ảnh, giọng nói hoặc câu chuyện." />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
      <div className="grid2">
        <button className="btn secondary" onClick={() => fileRef.current?.click()}><Camera size={18} /> {image ? 'Đổi ảnh' : 'Chọn ảnh'}</button>
        {rec.state === 'recording' ? (
          <button className="btn danger" onClick={rec.stop}><Square size={18} /> Dừng · {rec.seconds}s</button>
        ) : (
          <button className="btn secondary" onClick={() => (rec.state === 'done' ? rec.reset() : void rec.start())}><Mic size={18} /> {rec.state === 'done' ? 'Ghi lại' : 'Thu âm'}</button>
        )}
      </div>
      {rec.error && <div className="card rose"><p className="danger-text">{rec.error}</p></div>}
      {image && <img src={image} alt="" style={{ borderRadius: 16, maxHeight: 220, objectFit: 'cover', width: '100%' }} />}
      {rec.url && <audio controls src={rec.url} style={{ width: '100%' }} />}
      <Field label="Tiêu đề">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Lời kể / lời chép (tùy chọn)">
        <textarea className="input" placeholder="Ví dụ: Ngày đó, cả nhà quây quần bên bếp…" value={transcript} onChange={(e) => setTranscript(e.target.value)} />
      </Field>
      {transcript.length > 20 && (
        <button className="btn xs ghost" style={{ alignSelf: 'flex-start' }} onClick={() => { const s = summarizeStory(transcript); setCaption(s.summary); if (title === 'Bữa cơm tháng 11') setTitle(s.title); }}>
          Gợi ý tiêu đề và chú thích (trên thiết bị)
        </button>
      )}
      <Field label="Liên kết nghi thức">
        <select className="input" value={ritualId} onChange={(e) => setRitualId(e.target.value)}>
          <option value="">Không liên kết</option>
          {rituals.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </Field>
      <Row icon={<Users size={18} />} title="Quyền bản gốc" meta="Chỉ mình tôi · Chờ chọn người xem" chevron={false} />
      <button className="btn" disabled={!title.trim() || (!image && !rec.blob && !transcript.trim())} onClick={() => setStep('review')}>
        <ImageIcon size={18} /> Xem trước quyền và nội dung
      </button>
    </Phone>
  );
}
