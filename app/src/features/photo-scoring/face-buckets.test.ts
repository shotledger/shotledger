import { busiestBucket } from './face-buckets';

it('returns null when nothing has a key', () => {
  expect(busiestBucket([1, 2], () => undefined)).toBeNull();
  expect(busiestBucket([], (n: number) => String(n))).toBeNull();
});

it('picks the bucket with the most items', () => {
  const items = ['a1', 'b1', 'b2', 'a2', 'b3'];
  expect(busiestBucket(items, (s) => s[0])).toEqual({ key: 'b', items: ['b1', 'b2', 'b3'] });
});

it('breaks a tie to the first bucket seen and skips unkeyed items', () => {
  const items = ['x', 'a1', 'b1', 'b2', 'a2'];
  expect(busiestBucket(items, (s) => (s === 'x' ? undefined : s[0]))).toEqual({
    key: 'a',
    items: ['a1', 'a2'],
  });
});
