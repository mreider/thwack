// CI gate: assigned pen names + avatars.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADJECTIVES, ANIMALS, COLOR_WORDS, colorWord, hashSeed, identityFor, emojiFor, avatarColor,
} from '../worker/src/lib/pure/identity.mjs';

test('deterministic: same seed, same identity', () => {
  assert.deepEqual(identityFor('google-sub-123'), identityFor('google-sub-123'));
});

test('handle is "Adjective ColorWord Animal" and parts are consistent', () => {
  const id = identityFor('someone@sub');
  const [adj, color, animal] = id.handle.split(' ');
  assert.ok(ADJECTIVES.includes(adj), adj);
  assert.equal(color, colorWord(id.hue));
  assert.equal(animal, id.animal);
  assert.ok(ANIMALS.some(([name, emoji]) => name === id.animal && emoji === id.emoji));
  assert.ok(id.hue >= 0 && id.hue < 360);
});

test('the namespace is large (three words)', () => {
  assert.ok(ADJECTIVES.length >= 60, String(ADJECTIVES.length));
  assert.ok(ADJECTIVES.length * COLOR_WORDS.length * ANIMALS.length >= 60000);
  assert.equal(new Set(ADJECTIVES).size, ADJECTIVES.length, 'no duplicate adjectives');
});

test('collision avoidance walks to a free handle', () => {
  const first = identityFor('seed-x');
  const second = identityFor('seed-x', (h) => h === first.handle);
  assert.notEqual(second.handle, first.handle);
});

test('exhausted namespace falls back to numbered handles', () => {
  const id = identityFor('seed-y', (h) => !/ \d+$/.test(h));
  assert.match(id.handle, / \d+$/);
});

test('24 color words cover the wheel in 15° buckets', () => {
  assert.equal(COLOR_WORDS.length, 24);
  assert.equal(colorWord(0), 'Crimson');
  assert.equal(colorWord(14), 'Crimson');
  assert.equal(colorWord(15), 'Vermilion');
  assert.equal(colorWord(359), 'Carmine');
  assert.equal(colorWord(360), 'Crimson');
  assert.equal(colorWord(-15), 'Carmine');
});

test('many seeds spread across the space without errors', () => {
  const handles = new Set();
  for (let i = 0; i < 500; i++) handles.add(identityFor('seed-' + i).handle);
  assert.ok(handles.size > 480, `only ${handles.size} distinct handles from 500 seeds`);
});

test('hash and avatar helpers behave', () => {
  assert.equal(hashSeed('a') === hashSeed('a'), true);
  assert.notEqual(hashSeed('a'), hashSeed('b'));
  assert.equal(avatarColor(210), 'hsl(210, 48%, 86%)');
  assert.equal(avatarColor(-30), 'hsl(330, 48%, 86%)');
  assert.equal(emojiFor('Otter'), '🦦');
  assert.equal(emojiFor('NotAnAnimal'), '🪶');
});
