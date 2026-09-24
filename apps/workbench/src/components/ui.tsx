import type { ReactNode } from 'react';
import type { RhymeResult } from '@rhyme/engine';
import { useStore } from '../lib/store.js';

/** Spoken names for the colour classes, so tier isn't conveyed by colour alone. */
const TONE_NAME: Record<string, string> = {
  perfect: 'perfect rhyme',
  multi: 'multi',
  slant: 'slant rhyme',
  assonance: 'assonance',
  strong: 'strong match',
  loose: 'loose match',
  experimental: 'experimental match',
  homophones: 'homophone',
};

export function BandDot({ band }: { band: string }) {
  return <span className={`band-dot ${band}`} aria-hidden="true" />;
}

/** A result word: tier colour (and spoken tier), source tag, keyboard-reachable action and pin. */
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
  const tone = TONE_NAME[band];
  return (
    <span className={`rword ${pinned ? 'pinned' : ''}`} title={title}>
      <BandDot band={band} />
      {onClick ? (
        <button type="button" className="rword-word" onClick={() => onClick(word)} aria-label={tone ? `${word}, ${tone}` : word}>
          {word}
        </button>
      ) : (
        <span className="rword-word">
          {word}
          {tone && <span className="sr-only">, {tone}</span>}
        </span>
      )}
      {source && source !== 'cmu' && <span className={`src ${source}`}>{source}</span>}
      <button
        type="button"
        className="pin"
        aria-pressed={pinned}
        aria-label={pinned ? `Unpin ${word}` : `Pin ${word} to palette`}
        title={pinned ? 'Unpin from palette' : 'Pin to palette'}
        onClick={() => togglePin(word, band, from)}
      >
        <span aria-hidden="true">{pinned ? '★' : '☆'}</span>
      </button>
    </span>
  );
}

export function TierHeader({ label, count, color }: { label: string; count: number; color?: string }) {
  return (
    <div className="tier-header" role="heading" aria-level={3}>
      {color && <BandDot band={color} />}
      <span>{label}</span>
      <span className="count">
        <span className="sr-only">(</span>
        {count}
        <span className="sr-only"> results)</span>
      </span>
      <span className="bar" aria-hidden="true" />
    </div>
  );
}

export function EmptyState({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="big" aria-hidden="true">{icon}</div>
      <div>{children}</div>
    </div>
  );
}

export function Spinner() {
  return <span className="spin" role="progressbar" aria-label="Working…" />;
}
