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
    ...overrides,
  };
}

describe('buildCalendarEvent', () => {
  it('builds the stable UID webshooter_{competition}-{signup}', () => {
    const event = buildCalendarEvent(fixtureInput());
    expect(event.uid).toBe('webshooter_9001-55001');
  });

  it('sets summary to the competition name and location to the city', () => {
    const event = buildCalendarEvent(fixtureInput());
    expect(event.summary).toBe('Exempeltävlingen Precision C');
    expect(event.location).toBe('Exempelstad');
  });

  it('description includes name, date, weapon group, patrol, lane, and the information link', () => {
    const event = buildCalendarEvent(fixtureInput());
    expect(event.description).toContain('Exempeltävlingen Precision C');
    expect(event.description).toContain('2026-06-13');
    expect(event.description).toContain('Vapengrupp: spsf:C');
    expect(event.description).toContain('Skjutlag: 2');
    expect(event.description).toContain('Bana: 3');
    expect(event.description).toContain('https://webshooter.se/app/competitions/9001/information');
  });

  it('folds an optional venue line into the description when supplied', () => {
    const event = buildCalendarEvent(fixtureInput({ venue: '25m-banan, Exempel skyttecentrum' }));
    expect(event.description).toContain('25m-banan, Exempel skyttecentrum');
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
