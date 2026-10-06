import { faceAnswerFor, forgetFaceAnswers, rememberFaceAnswer } from './face-answers';

afterEach(forgetFaceAnswers);

it('has no answer for a session that was never asked', () => {
  expect(faceAnswerFor('s1')).toBeUndefined();
});

it('remembers an answer per session', () => {
  rememberFaceAnswer('s1', 'milsnabb');
  rememberFaceAnswer('s2', 'precision');
  expect(faceAnswerFor('s1')).toBe('milsnabb');
  expect(faceAnswerFor('s2')).toBe('precision');
});
