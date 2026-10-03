// Pins the fits' numerics to numpy 2.5 on synthetic data: the folds come from
// the same random draws and the estimator lands on the same weights.
//
//   pnpm exec vitest run -c tools/cv/vitest.config.ts fit.check
import { expect, test } from 'vitest';

import { auc, fit, predict, pyFixed } from './logistic.mts';
import { Pcg64 } from './numpy-random.mts';

test('PCG64 draws as default_rng', () => {
  const g = new Pcg64(0);
  // np.random.default_rng(0).bit_generator.random_raw(4)
  expect([0, 1, 2, 3].map(() => g.next64())).toEqual([
    11749869230777074271n,
    4976686463289251617n,
    755828109848996024n,
    304881062738325533n,
  ]);
});

test('shuffle as Generator.shuffle on a list', () => {
  const range = (n: number) => [...Array(n).keys()];
  expect(new Pcg64(0).shuffle(range(5))).toEqual([2, 4, 3, 0, 1]);
  expect(new Pcg64(42).shuffle(range(5))).toEqual([4, 2, 3, 1, 0]);
  expect(new Pcg64(0).shuffle(range(31))).toEqual([
    2, 11, 25, 21, 10, 4, 29, 16, 23, 6, 18, 26, 3, 30, 8, 0, 19, 12, 20, 13, 7, 5, 17, 14, 27, 22,
    9, 28, 24, 1, 15,
  ]);
  expect(new Pcg64(1).shuffle(range(31))).toEqual([
    26, 28, 7, 1, 3, 29, 11, 17, 23, 21, 16, 30, 20, 24, 15, 2, 25, 12, 10, 4, 5, 8, 0, 9, 14, 18,
    22, 13, 27, 6, 19,
  ]);
});

test('Newton fit and AUC as fit_hole_filter.py', () => {
  const x = Array.from({ length: 24 }, (_, i) => [
    (i % 7) * 0.5 + 0.1 * (i % 3),
    ((i * 37) % 11) / 3.0 - 1.0,
  ]);
  const y = x.map(([a, b], i) => (a! - 0.8 * b! + 0.3 * (((i * 5) % 4) - 1.5) > 1.2 ? 1 : 0));
  const model = fit(x, y);
  const ref = { w: [3.9832129311223587, -3.5462385388119495], b: -4.791319573472598 };
  model.w.forEach((v, j) => expect(v).toBeCloseTo(ref.w[j]!, 10));
  expect(model.b).toBeCloseTo(ref.b, 10);
  const rounded = x.map((row) => Math.round(predict(model, row) * 10) / 10);
  expect(auc(rounded, y)).toBeCloseTo(0.9607142857142857, 12);
});

test('fixed-point text as Python formats it', () => {
  expect(
    [0.8625 * 100, 0.125, 0.375, -0.125, 1.005].map((v) => pyFixed(v, v > 50 ? 1 : 2)),
  ).toEqual(['86.2', '0.12', '0.38', '-0.12', '1.00']);
  expect([pyFixed(2.5, 0), pyFixed(3.5, 0)]).toEqual(['2', '4']);
});
