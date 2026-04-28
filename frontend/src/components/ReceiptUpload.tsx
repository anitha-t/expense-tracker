import { useRef, useState, DragEvent, ChangeEvent } from 'react';
import { receiptsApi } from '@/services/api';

interface Props {
  value?: string;
  onChange: (url: string | undefined) => void;
}

type State = 'idle' | 'uploading' | 'done' | 'error';

const ACCEPTED = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_MB = 10;

function isImage(url: string) {
  return /\.(jpe?g|png|webp)$/i.test(url);
}

export function ReceiptUpload({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>(value ? 'done' : 'idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const upload = async (file: File) => {
    if (file.size > MAX_MB * 1024 * 1024) {
      setErrorMsg(`File must be under ${MAX_MB} MB`);
      setState('error');
      return;
    }

    setState('uploading');
    setProgress(0);
    setErrorMsg('');

    try {
      const { url } = await receiptsApi.upload(file, setProgress);
      onChange(url);
      setState('done');
    } catch {
      setErrorMsg('Upload failed — try again');
      setState('error');
    }
  };

  const handleFile = (file: File | undefined) => {
    if (file) upload(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    handleFile(e.target.files?.[0]);
    // Reset input so the same file can be re-selected after removal
    e.target.value = '';
  };

  const handleRemove = () => {
    onChange(undefined);
    setState('idle');
    setProgress(0);
  };

  // ── Idle / Error: show drop zone ──────────────────────────────
  if (state === 'idle' || state === 'error') {
    return (
      <div>
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          style={{
            border: `2px dashed ${isDragOver ? '#2563eb' : '#d1d5db'}`,
            borderRadius: 8,
            padding: '28px 16px',
            textAlign: 'center',
            cursor: 'pointer',
            background: isDragOver ? '#eff6ff' : '#fafafa',
            transition: 'border-color 0.15s, background 0.15s',
          }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: '#374151' }}>
            Drop receipt here or <span style={{ color: '#2563eb' }}>browse</span>
          </p>
          <p style={{ margin: 0, fontSize: 12, color: '#9ca3af' }}>
            JPEG, PNG, WebP or PDF — max {MAX_MB} MB
          </p>
        </div>
        {state === 'error' && (
          <p style={{ color: '#dc2626', fontSize: 12, marginTop: 4 }}>{errorMsg}</p>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          style={{ display: 'none' }}
          onChange={handleChange}
        />
      </div>
    );
  }

  // ── Uploading: show progress bar ──────────────────────────────
  if (state === 'uploading') {
    return (
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: '#6b7280' }}>Uploading…</p>
        <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${progress}%`,
              background: '#2563eb',
              borderRadius: 4,
              transition: 'width 0.2s',
            }}
          />
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 12, color: '#9ca3af', textAlign: 'right' }}>
          {progress}%
        </p>
      </div>
    );
  }

  // ── Done: show preview ────────────────────────────────────────
  return (
    <div
      style={{
        border: '1px solid #d1fae5',
        borderRadius: 8,
        background: '#f0fdf4',
        padding: 12,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {value && isImage(value) ? (
        <a href={value} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
          <img
            src={value}
            alt="Receipt preview"
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #d1d5db', display: 'block' }}
          />
        </a>
      ) : (
        <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: 36, textDecoration: 'none' }}>
          📄
        </a>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 500, color: '#065f46' }}>
          Receipt attached ✓
        </p>
        <p style={{ margin: 0, fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value}
        </p>
      </div>

      <button
        type="button"
        onClick={handleRemove}
        title="Remove receipt"
        style={{
          background: 'none', border: '1px solid #d1d5db', borderRadius: 6,
          padding: '4px 8px', cursor: 'pointer', fontSize: 12, color: '#6b7280', flexShrink: 0,
        }}
      >
        Remove
      </button>
    </div>
  );
}
