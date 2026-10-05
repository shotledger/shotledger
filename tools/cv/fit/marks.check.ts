// The marks file and its pre-labelled lines: a `?` line is never read as a
// human's marks, and a photo with any line is never pre-labelled again.
//
//   pnpm exec vitest run -c tools/cv/vitest.config.ts marks.check
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'vitest';

import { namesInMarks, parseMarks, prelabelLine } from './marks.mts';
import { parseThreshold } from './prelabel';
import { readMarks } from './score-stages';

const FILE = ['a 450,320 512,377', '?b 100,200', '', '  c  ', '?d'].join('\n');

test('a pre-labelled line is not a mark', () => {
  expect([...parseMarks(FILE)]).toEqual([
    [
      'a',
      [
        [450, 320],
        [512, 377],
      ],
    ],
    ['c', []],
  ]);
});

test('confirming a line is deleting its marker', () => {
  expect(parseMarks(FILE.replace('?b', 'b')).get('b')).toEqual([[100, 200]]);
});

test('every photo with a line counts as marked, pre-labelled or not', () => {
  expect([...namesInMarks(FILE)].sort()).toEqual(['a', 'b', 'c', 'd']);
});

test('a pre-labelled line rounds to whole label px and round-trips once confirmed', () => {
  const line = prelabelLine('e', [
    [450.4, 319.6],
    [12, 7.5],
  ]);
  expect(line).toBe('?e 450,320 12,8');
  expect(parseMarks(line).size).toBe(0);
  expect(parseMarks(line.slice(1)).get('e')).toEqual([
    [450, 320],
    [12, 8],
  ]);
  expect(prelabelLine('f', [])).toBe('?f');
});

test('the scorers read a marks file without its pre-labels', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'marks-')), 'marks.txt');
  writeFileSync(path, FILE);
  expect([...readMarks(path).keys()]).toEqual(['a', 'c']);
});

test('the pre-label threshold is a probability', () => {
  expect(parseThreshold('0.3', 'X')).toBe(0.3);
  for (const bad of ['0', '1', 'abc', '-0.2']) {
    expect(() => parseThreshold(bad, 'X')).toThrow(`X=${bad} (a probability, e.g. 0.3)`);
  }
});
