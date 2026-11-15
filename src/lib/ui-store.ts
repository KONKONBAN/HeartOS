import { create } from 'zustand';
import { signApproval, type ApprovalRecord } from '../state/services';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warning' | 'critical';
}

interface ApprovalReq {
  title: string;
  lines: string[];
  recipient: string;
  danger?: boolean;
  resolve: (r: ApprovalRecord | null) => void;
}

interface UiState {
  toasts: Toast[];
  approval: ApprovalReq | null;
}

export const useUi = create<UiState>(() => ({ toasts: [], approval: null }));

let tid = 0;
export function toast(text: string, tone: Toast['tone'] = 'info', ms = 3600) {
  const id = ++tid;
  useUi.setState((s) => ({ toasts: [...s.toasts.slice(-2), { id, text, tone }] }));
  setTimeout(() => useUi.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), ms);
}

export function requestApproval(title: string, lines: string[], recipient: string, danger = false): Promise<ApprovalRecord | null> {
  return new Promise((resolve) => {
    useUi.setState({
      approval: {
        title,
        lines,
        recipient,
        danger,
        resolve: async (r) => resolve(r),
      },
    });
  });
}

export async function confirmApproval() {
  const a = useUi.getState().approval;
  if (!a) return;
  useUi.setState({ approval: null });
  try {
    const rec = await signApproval([a.title, ...a.lines], a.recipient);
    a.resolve(rec);
  } catch {
    a.resolve(null);
  }
}

export function cancelApproval() {
  const a = useUi.getState().approval;
  useUi.setState({ approval: null });
  a?.resolve(null);
}
