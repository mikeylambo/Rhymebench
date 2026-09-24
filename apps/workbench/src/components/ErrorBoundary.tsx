import { Component, type ErrorInfo, type ReactNode } from 'react';
import { clearAppData, dateStamp, downloadText, exportAllData, suspendPersistence } from '../lib/storage.js';

/**
 * Error boundary — ported from Barsmith. Without it, any render-time exception
 * unmounts the tree and leaves a black screen, with every pin, family, scheme and
 * bar still intact in localStorage but no UI left to get them out.
 *
 * So this screen's job is to guarantee the work gets out: the backup reads storage
 * directly and touches no React state, so it works even when the tree that crashed
 * was holding corrupt data. Reset exists for the one failure a reload can't fix
 * (bad stored data crashing every render), clears only this app's keys, and only
 * after the confirm text says to take a backup first.
 */
interface State {
  error: Error | null;
  savedBackup: boolean;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null, savedBackup: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // No telemetry endpoint by design — nothing leaves the device. The console trace is
    // what a writer can copy into a bug report.
    console.error('[Rhyme Workbench] Unrecoverable render error:', error, info.componentStack);
  }

  backup = () => {
    try {
      downloadText(`rhyme-workbench-rescue-${dateStamp()}.json`, exportAllData());
      this.setState({ savedBackup: true });
    } catch {
      this.setState({ savedBackup: false });
    }
  };

  reset = () => {
    const ok = window.confirm(
      'Reset Rhyme Workbench?\n\nThis erases every pin, family, scheme, chain and Pad note on this device. ' +
        'Download a backup first if you have not already — this cannot be undone.',
    );
    if (!ok) return;
    suspendPersistence();
    clearAppData();
    location.reload();
  };

  render() {
    const { error, savedBackup } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <div className="crash-card">
          <p className="crash-kicker">Something broke</p>
          <h1>Your work is safe</h1>
          <p className="muted">
            Rhyme Workbench hit an error it could not recover from. Nothing has been deleted — your pins,
            families, schemes, chain and Pad are still stored on this device. Download a backup, then reload.
          </p>
          <button className={`btn big ${savedBackup ? 'done' : 'primary'}`} onClick={this.backup}>
            {savedBackup ? '✓ Backup downloaded' : 'Download backup'}
          </button>
          <button className="btn big" onClick={() => location.reload()}>Reload</button>
          <button className="btn ghost small-danger" onClick={this.reset}>Reload keeps crashing — reset app data</button>
          <details>
            <summary>Technical details</summary>
            <pre>{String(error.stack || error.message || error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}

/** Render this to exercise the boundary (reachable at #crash-test; inert otherwise). */
export function CrashTest(): ReactNode {
  throw new Error('Crash test — triggered from #crash-test');
}
