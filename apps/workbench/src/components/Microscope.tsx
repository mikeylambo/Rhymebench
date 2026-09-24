import { isVowel, syllabify, type Pron } from '@rhyme/engine';

/**
 * The "sound microscope": renders a word's phonemes as individually
 * selectable blocks, grouped into syllables, with the stressed vowel marked.
 * The parent owns the selection mask (which phonemes are locked / to vary).
 */
export function Microscope({
  pron,
  selected,
  mode,
  onToggle,
}: {
  pron: Pron;
  selected: boolean[];
  mode: 'lock' | 'subst';
  onToggle: (index: number) => void;
}) {
  // Map each phoneme to its flat index so clicks map back to the mask.
  const sylls = syllabify(pron.phones);
  let flat = 0;
  const groups = sylls.map((s) => {
    const items: { arp: string; idx: number; role: string; vowel: boolean }[] = [];
    for (const p of s.onset) items.push({ arp: p, idx: flat++, role: 'onset', vowel: false });
    if (s.nucleus) items.push({ arp: s.nucleus, idx: flat++, role: 'vowel', vowel: true });
    for (const p of s.coda) items.push({ arp: p, idx: flat++, role: 'coda', vowel: false });
    return { stress: s.stress, items };
  });

  return (
    <div className="phoneme-strip">
      {groups.map((g, gi) => (
        <div key={gi} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {gi > 0 && <span className="faint" style={{ margin: '0 1px' }}>·</span>}
          {g.items.map((it) => {
            const on = selected[it.idx];
            const cls = [
              'pblock',
              it.vowel ? 'vowel' : '',
              on && mode === 'lock' ? 'locked' : '',
              on && mode === 'subst' ? 'subst' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button key={it.idx} className={cls} onClick={() => onToggle(it.idx)} aria-pressed={!!on} aria-label={`${it.arp}, ${it.vowel && g.stress === 1 ? 'stressed vowel' : it.role}${on ? (mode === 'lock' ? ', locked' : ', substituting') : ''}`} title={`${it.role}${g.stress === 1 && it.vowel ? ' · primary stress' : ''}`}>
                {on && mode === 'lock' && <span className="lockicon">🔒</span>}
                <span className="arp">{it.arp}</span>
                <span className="role">{it.vowel && g.stress === 1 ? 'stress' : it.role}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/** Human-readable phoneme string, e.g. "P AH0 Z IH1 SH AH0 N". */
export function phoneString(pron: Pron): string {
  return pron.phones.join(' ');
}

export { isVowel };
