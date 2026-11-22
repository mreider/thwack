// Assigned anonymous identities: a pen name (adjective + color word +
// animal, e.g. "Restless Cobalt Otter") and an avatar (animal emoji in a
// pastel circle). The hue is continuous 0–360, so avatar colors are
// effectively infinite; the name's color word comes from the hue's 15°
// bucket. ~65k names before the numbered fallback. Deterministic per seed.

export const ADJECTIVES = [
  'Quiet', 'Wandering', 'Restless', 'Gentle', 'Hollow', 'Drifting', 'Lucid', 'Velvet',
  'Paper', 'Ember', 'Winter', 'Summer', 'Autumn', 'Vernal', 'Midnight', 'Morning',
  'Dusky', 'Luminous', 'Shadowed', 'Silent', 'Humming', 'Sleepless', 'Dreaming', 'Mossy',
  'Thorny', 'Feathered', 'Inky', 'Fabled', 'Storied', 'Wistful', 'Earnest', 'Sly',
  'Bold', 'Brave', 'Curious', 'Patient', 'Solemn', 'Merry', 'Weathered', 'Ancient',
  'Nimble', 'Errant', 'Roaming', 'Distant', 'Northern', 'Southern', 'Eastern', 'Western',
  'Coastal', 'Alpine', 'Thundering', 'Whispering', 'Wayward', 'Hidden', 'Crooked', 'Honest',
  'Clever', 'Daring', 'Tender', 'Rugged', 'Serene', 'Feral', 'Hushed', 'Rambling',
];

export const ANIMALS = [
  ['Fox', '🦊'], ['Owl', '🦉'], ['Otter', '🦦'], ['Wolf', '🐺'], ['Bear', '🐻'],
  ['Koala', '🐨'], ['Panda', '🐼'], ['Tiger', '🐯'], ['Lion', '🦁'], ['Rabbit', '🐰'],
  ['Frog', '🐸'], ['Octopus', '🐙'], ['Whale', '🐋'], ['Dolphin', '🐬'], ['Seal', '🦭'],
  ['Penguin', '🐧'], ['Duck', '🦆'], ['Swan', '🦢'], ['Flamingo', '🦩'], ['Parrot', '🦜'],
  ['Peacock', '🦚'], ['Eagle', '🦅'], ['Dove', '🕊️'], ['Turtle', '🐢'], ['Snail', '🐌'],
  ['Bee', '🐝'], ['Butterfly', '🦋'], ['Ladybird', '🐞'], ['Hedgehog', '🦔'], ['Squirrel', '🐿️'],
  ['Beaver', '🦫'], ['Sloth', '🦥'], ['Bat', '🦇'], ['Deer', '🦌'], ['Horse', '🐴'],
  ['Camel', '🐪'], ['Elephant', '🐘'], ['Giraffe', '🦒'], ['Zebra', '🦓'], ['Kangaroo', '🦘'],
  ['Badger', '🦡'], ['Lizard', '🦎'], ['Crab', '🦀'], ['Lobster', '🦞'], ['Shark', '🦈'],
];

// 24 color words, one per 15° of hue.
export const COLOR_WORDS = [
  'Crimson', 'Vermilion', 'Amber', 'Gold', 'Citron', 'Chartreuse',
  'Fern', 'Moss', 'Emerald', 'Jade', 'Viridian', 'Teal',
  'Cyan', 'Cerulean', 'Azure', 'Cobalt', 'Indigo', 'Violet',
  'Amethyst', 'Mauve', 'Magenta', 'Fuchsia', 'Rose', 'Carmine',
];

export function colorWord(hue) {
  return COLOR_WORDS[Math.floor((((hue % 360) + 360) % 360) / 15)];
}

/** FNV-1a over a string → unsigned 32-bit. */
export function hashSeed(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Generate an identity for a seed, avoiding handles `isTaken` rejects.
 * Walks adjectives, then animals, then hue buckets, until the name is free.
 * @param {string} seed e.g. the Google subject id, or a random UUID for rerolls
 * @param {(handle: string) => boolean} [isTaken]
 * @returns {{handle: string, hue: number, animal: string, emoji: string}}
 */
export function identityFor(seed, isTaken = () => false) {
  const h = hashSeed(seed);
  const baseAdj = h % ADJECTIVES.length;
  const h2 = Math.floor(h / ADJECTIVES.length);
  const baseAnimal = h2 % ANIMALS.length;
  const baseHue = (Math.floor(h2 / ANIMALS.length) + h) % 360;
  for (let b = 0; b < 24; b++) {
    for (let a = 0; a < ANIMALS.length; a++) {
      const [animal, emoji] = ANIMALS[(baseAnimal + a) % ANIMALS.length];
      const hue = (baseHue + b * 15) % 360;
      for (let j = 0; j < ADJECTIVES.length; j++) {
        const adj = ADJECTIVES[(baseAdj + j) % ADJECTIVES.length];
        const handle = `${adj} ${colorWord(hue)} ${animal}`;
        if (!isTaken(handle)) return { handle, hue, animal, emoji };
      }
    }
  }
  // All ~65k combinations taken: disambiguate with a numeral.
  const [animal, emoji] = ANIMALS[baseAnimal];
  const base = `${ADJECTIVES[baseAdj]} ${colorWord(baseHue)} ${animal}`;
  let n = 2;
  while (isTaken(`${base} ${n}`)) n++;
  return { handle: `${base} ${n}`, hue: baseHue, animal, emoji };
}

export function emojiFor(animal) {
  const row = ANIMALS.find(([name]) => name === animal);
  return row ? row[1] : '🪶';
}

/** Pastel avatar background for a hue — composed by us, safe for inline style. */
export function avatarColor(hue) {
  return `hsl(${(((hue ?? 0) % 360) + 360) % 360}, 48%, 86%)`;
}
