/** Shared app-state types for the persisted workspace. */

export interface Pin {
  id: string;
  word: string;
  band: string; // tone class (tier or bucket colour) for the palette dot
  from: string; // the query it was found under
  at: number; // timestamp
}

export interface Family {
  id: string;
  name: string;
  words: string[];
  seed: string; // the search that produced it
  at: number;
}

export interface SchemeColumn {
  id: string;
  letter: string; // A / B / C ...
  query: string;
  words: string[]; // curated words for this rhyme family
}

export interface Scheme {
  id: string;
  name: string;
  columns: SchemeColumn[];
}
