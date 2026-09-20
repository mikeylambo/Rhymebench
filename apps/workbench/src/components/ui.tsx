import type { ReactNode } from 'react';
import type { RhymeResult } from '@rhyme/engine';
import { useStore } from '../lib/store.js';

export function BandDot({ band }: { band: string }) {
  return <span className={`band-dot ${band}`} />;
}

/** A result word: band colour, source tag, click-to-pin. */
export function WordChip({
  word,
  band,
  source,
  from,
  onClick,
  title,
}: {
  word: string;
  band: string; // tone class: a tier (perfect/multi/slant/assonance) or bucket colour
  source?: RhymeResult['source'];
  from: string;
  onClick?: (word: string) => void;
  title?: string;
}) {
  const { isPinned, togglePin } = useStore();
  const pinned = isPinned(word);
  return (
    <span className={`rword ${pinned ? 'pinned' : ''}`} title={title}>
      <BandDot band={band} />
      <span
        onClick={() => onClick?.(word)}
        style={{ cursor: onClick ? 'pointer' : 'default' }}
      >
        {word}
      </span>
      {source && source !== 'cmu' && <span className={`src ${source}`}>{source}</span>}
      <button
        className="pin"
        title={pinned ? 'Unpin from palette' : 'Pin to palette'}
        onClick={() => togglePin(word, band, from)}
      >
        {pinned ? '★' : '☆'}
      </button>
    </span>
  );
}

export function TierHeader({ label, count, color }: { label: string; count: number; color?: string }) {
  return (
    <div className="tier-header">
      {color && <BandDot band={color} />}
      <span>{label}</span>
      <span className="count">{count}</span>
      <span className="bar" />
    </div>
  );
}

export function EmptyState({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="big">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="spin" />;
}
