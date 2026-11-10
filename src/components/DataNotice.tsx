import type { ReactNode } from 'react'
import { AlertCircle, FlaskConical, Inbox, Loader2 } from 'lucide-react'

type NoticeKind = 'demo' | 'error' | 'empty' | 'loading'

const config: Record<
  NoticeKind,
  { icon: ReactNode; background: string; border: string; color: string }
> = {
  demo: {
    icon: <FlaskConical size={18} />,
    background: '#fffbeb',
    border: '#fcd34d',
    color: '#92400e',
  },
  error: {
    icon: <AlertCircle size={18} />,
    background: '#fef2f2',
    border: '#fca5a5',
    color: '#991b1b',
  },
  empty: {
    icon: <Inbox size={18} />,
    background: '#f8fafc',
    border: '#cbd5e1',
    color: '#475569',
  },
  loading: {
    icon: <Loader2 size={18} />,
    background: '#eff6ff',
    border: '#bfdbfe',
    color: '#1e40af',
  },
}

export function DataNotice({ kind, children }: { kind: NoticeKind; children: ReactNode }) {
  const { icon, background, border, color } = config[kind]
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.6rem',
        padding: '0.85rem 1.1rem',
        marginBottom: '1rem',
        borderRadius: '0.65rem',
        background,
        border: `1px solid ${border}`,
        color,
        fontSize: '0.9rem',
        fontWeight: 500,
        lineHeight: 1.5,
      }}
    >
      <span style={{ display: 'flex', marginTop: '0.1rem' }}>{icon}</span>
      <span>{children}</span>
    </div>
  )
}
