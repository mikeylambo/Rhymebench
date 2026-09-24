import { useRef, useState, type ChangeEvent } from 'react';
import { useFocusTrap } from '../lib/useFocusTrap.js';
import {
  clearRescue,
  currentSummary,
  dateStamp,
  downloadText,
  exportAllData,
  importAllData,
  loadRescue,
  parseBackup,
  summarize,
  suspendPersistence,
  undoRestore,
  type DataSummary,
} from '../lib/storage.js';

const REPO = 'https://github.com/mikeylambo/Rhymebench';

function describe(s: DataSummary): string {
  const parts = [
    `${s.pins} pinned`,
    `${s.families} ${s.families === 1 ? 'family' : 'families'}`,
    `${s.schemes} ${s.schemes === 1 ? 'scheme' : 'schemes'}`,
    `${s.chain} chain ${s.chain === 1 ? 'line' : 'lines'}`,
    `${s.padLines} Pad ${s.padLines === 1 ? 'line' : 'lines'}`,
  ];
  return parts.join(' · ');
}

/**
 * Data & about: backup, validated restore with a before/after summary, undo for
 * the last restore, and the app's version, privacy policy and licences.
 */
export function DataDialog({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [rescue, setRescue] = useState(loadRescue);
  const current = currentSummary();

  const backup = () => {
    downloadText(`rhyme-workbench-backup-${dateStamp()}.json`, exportAllData());
    setMessage({ tone: 'ok', text: 'Backup downloaded.' });
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be picked again
    if (!file) return;
    const text = await file.text();
    const parsed = parseBackup(text);
    if (!parsed.ok) {
      setMessage({ tone: 'error', text: parsed.error });
      return;
    }
    const incoming = summarize(parsed.data);
    const ok = window.confirm(
      `Restore this backup?\n\nIt replaces what's on this device now:\n  now:    ${describe(current)}\n  backup: ${describe(incoming)}\n\n` +
        'Your current data is kept aside, so you can undo this restore afterwards.',
    );
    if (!ok) return;
    const res = importAllData(text);
    if (!res.ok) {
      setMessage({ tone: 'error', text: res.error });
      return;
    }
    suspendPersistence(); // stop mounted screens re-saving their old state on the way out
    location.reload();
  };

  const undo = () => {
    const res = undoRestore();
    if (!res.ok) {
      setMessage({ tone: 'error', text: res.error });
      return;
    }
    suspendPersistence();
    location.reload();
  };

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-labelledby="data-title">
        <div className="row between">
          <h2 id="data-title">Your data</h2>
          <button className="btn tiny ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="muted small">
          Everything lives on this device only — nothing is sent anywhere. Back it up to move it or keep it safe.
        </p>
        <p className="hint">On this device: {describe(current)}</p>

        <div className="actions-2">
          <button className="btn primary" onClick={backup}>Download backup</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>Restore from file…</button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} aria-label="Backup file to restore" />

        {rescue && (
          <div className="rescue">
            <p className="small">
              A restore on {new Date(rescue.savedAt).toLocaleString()} replaced: {describe(rescue.summary)}.
            </p>
            <div className="row wrap">
              <button className="btn tiny" onClick={undo}>Undo that restore</button>
              <button className="btn tiny ghost" onClick={() => { clearRescue(); setRescue(null); }}>Keep the restore</button>
            </div>
          </div>
        )}

        {message && (
          <p className={`dialog-msg ${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>
            {message.text}
          </p>
        )}

        <hr />
        <p className="small muted">
          Rhyme Workbench <b>v{__APP_VERSION__}</b> · engine v{__ENGINE_VERSION__}
        </p>
        <p className="small links">
          <a href="./privacy.html" target="_blank" rel="noopener">Privacy</a>
          <a href="./licenses.txt" target="_blank" rel="noopener">Data &amp; font licences</a>
          <a href={`${REPO}/blob/main/RELEASE_NOTES.md`} target="_blank" rel="noopener">Release notes</a>
        </p>
      </div>
    </div>
  );
}
