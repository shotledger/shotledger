// A `namespace:value` tag is bookkeeping the app wrote, not a label the
// shooter chose — `shotlog:review`, `shotledger:level=forening`. An import
// puts two or three on every session it creates, which on a list row crowds
// out the shooter's own tags entirely (#348).
//
// The namespace is matched conservatively: lowercase letters, digits,
// `_` and `-`, then a colon. A shooter's own tag with a colon in it
// ("9mm: match load") keeps a space or a capital and stays their tag.
const MACHINE_TAG = /^[a-z][a-z0-9_-]*:/u;

/** True for a `namespace:value` tag the app wrote for itself. */
export function isMachineTag(name: string): boolean {
  return MACHINE_TAG.test(name);
}

export interface PartitionedTags {
  /** The shooter's own tags, in the order given. */
  own: string[];
  /** `namespace:value` bookkeeping tags, in the order given. */
  machine: string[];
}

/** Splits tag names into the shooter's own and the app's own. */
export function partitionTags(names: readonly string[]): PartitionedTags {
  const own: string[] = [];
  const machine: string[] = [];
  for (const name of names) (isMachineTag(name) ? machine : own).push(name);
  return { own, machine };
}
