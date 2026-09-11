import { describe, expect, it } from 'vitest';
import { buildCalendarEvent, type CalendarEventInput } from './calendar';

function fixtureInput(overrides: Partial<CalendarEventInput> = {}): CalendarEventInput {
  return {
    competitionId: 9001,
    signupId: 55001,
    competitionName: 'Exempeltävlingen Precision C',
    city: 'Exempelstad',
    weaponGroup: 'spsf:C',
    patrolNumber: 2,
    lane: 3,
    startLocal: '2026-06-13 09:00:00',
    endLocal: '2026-06-13 10:50:00',
    competitionDate: '2026-06-13',
    ...overrides,
  };
}

describe('buildCalendarEvent', () => {
  it('is an all-day FREE marker while patrol times are unpublished', () => {
    // Entering a competition should show up in the diary immediately, but
    // it must not block the day in other people's eyes — the shooter does
    // not yet know which two hours of it they are busy.
    const event = buildCalendarEvent(
      fixtureInput({ startLocal: null, endLocal: null, patrolNumber: null }),
    );

    expect(event.allDay).toBe(true);
    expect(event.busy).toBe(false);
    // dateLocal, not startUtc: local midnight in Stockholm is 22:00Z on the
    // 12th, and an all-day event built from that instant shows a day early.
    expect(event.dateLocal).toBe('2026-06-13');
    expect(event.startUtc.slice(0, 10)).toBe('2026-06-12');
    expect(event.description).toContain('Skjutlag: ej lottad');
  });

  it('becomes a timed BUSY event once times exist, keeping the same UID', () => {
    // Same UID is the whole point: the all-day marker is updated in place
    // rather than leaving a duplicate behind.
    const unscheduled = buildCalendarEvent(
      fixtureInput({ startLocal: null, endLocal: null, patrolNumber: null }),
    );
    const scheduled = buildCalendarEvent(fixtureInput());

    expect(scheduled.uid).toBe(unscheduled.uid);
    expect(scheduled.allDay).toBe(false);
    expect(scheduled.busy).toBe(true);
  });

  it('builds the stable UID webshooter_{competition}-{signup}', () => {
    const event = buildCalendarEvent(fixtureInput());
    expect(event.uid).toBe('webshooter_9001-55001');
  });

  it('sets summary to the competition name and location to the city', () => {
    const event = buildCalendarEvent(fixtureInput());
    expect(event.summary).toBe('Exempeltävlingen Precision C');
    expect(event.location).toBe('Exempelstad');
  });

  it('description is the exact expected multi-line block (no venue supplied)', () => {
    const event = buildCalendarEvent(fixtureInput());
    expect(event.description).toBe(
      [
        'Exempeltävlingen Precision C',
        '2026-06-13',
        'Vapengrupp: spsf:C',
        'Skjutlag: 2',
        'Bana: 3',
        'https://webshooter.se/app/competitions/9001/information',
      ].join('\n'),
    );
  });

  it('the date line is the date only — not the full "YYYY-MM-DD HH:mm:ss" timestamp', () => {
    const event = buildCalendarEvent(fixtureInput());
    const lines = event.description.split('\n');
    expect(lines[1]).toBe('2026-06-13');
    expect(lines[1]).not.toContain('09:00:00');
  });

  it('folds an optional venue line into the exact description when supplied', () => {
    const event = buildCalendarEvent(fixtureInput({ venue: '25m-banan, Exempel skyttecentrum' }));
    expect(event.description).toBe(
      [
        'Exempeltävlingen Precision C',
        '2026-06-13',
        '25m-banan, Exempel skyttecentrum',
        'Vapengrupp: spsf:C',
        'Skjutlag: 2',
        'Bana: 3',
        'https://webshooter.se/app/competitions/9001/information',
      ].join('\n'),
    );
  });

  it('omits a venue line when not supplied', () => {
    const event = buildCalendarEvent(fixtureInput());
    const lines = event.description.split('\n');
    expect(lines).not.toContain('25m-banan, Exempel skyttecentrum');
  });

  it('localizes start/end to Stockholm and converts to UTC (summer fixture)', () => {
    const event = buildCalendarEvent(fixtureInput());
    expect(event.startUtc).toBe('2026-06-13T07:00:00.000Z');
    expect(event.endUtc).toBe('2026-06-13T08:50:00.000Z');
  });

  it('localizes start/end to Stockholm and converts to UTC (winter fixture)', () => {
    const event = buildCalendarEvent(
      fixtureInput({ startLocal: '2026-01-15 09:00:00', endLocal: '2026-01-15 10:50:00' }),
    );
    expect(event.startUtc).toBe('2026-01-15T08:00:00.000Z');
    expect(event.endUtc).toBe('2026-01-15T09:50:00.000Z');
  });

  it('re-tapping "Add to calendar" for the same signup yields the same UID (dedupable, matched by UID)', () => {
    const first = buildCalendarEvent(fixtureInput());
    const second = buildCalendarEvent(fixtureInput({ competitionName: 'Updated name' }));
    expect(first.uid).toBe(second.uid);
  });
});
