// The shooter's answer to "Precision or milsnabb face?", per session, for as
// long as the app runs. Kept in memory: the question costs one tap, and
// persisting it would need a schema change for no real gain.
import type { FaceAnswer } from './precision-guards';

const answers = new Map<string, FaceAnswer>();

export function faceAnswerFor(sessionId: string): FaceAnswer | undefined {
  return answers.get(sessionId);
}

export function rememberFaceAnswer(sessionId: string, answer: FaceAnswer): void {
  answers.set(sessionId, answer);
}

/** For tests. */
export function forgetFaceAnswers(): void {
  answers.clear();
}
