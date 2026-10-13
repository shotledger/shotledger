// The instant a met requirement lapses is the first one at which it is no
// longer met (shared/src/compliance/lapse.ts). The screen names the last day it
// is still met, so a session logged on that day keeps it met (#795).
export function nextSessionDeadline(lapseIso: string): Date {
  return new Date(Date.parse(lapseIso) - 1);
}
