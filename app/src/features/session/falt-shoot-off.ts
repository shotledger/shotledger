// Once a shoot-off starts, every station after it is a shoot-off station, as a
// final is in a ring session (#715). The last station decides.
export function nextStationIsShootOff(stations: readonly { isShootOff: number }[]): boolean {
  return stations[stations.length - 1]?.isShootOff === 1;
}

/** Start Shoot-off is offered once there is a station and no shoot-off yet. */
export function canStartShootOff(stations: readonly { isShootOff: number }[]): boolean {
  return stations.length > 0 && !nextStationIsShootOff(stations);
}
