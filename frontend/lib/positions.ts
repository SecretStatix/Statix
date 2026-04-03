/** NBA-style position codes from API / deployments */

const GUARD = new Set(['PG', 'SG', 'G']);
const FORWARD = new Set(['SF', 'PF', 'F']);
const CENTER = new Set(['C']);

export function isGuardPosition(position: string): boolean {
  return GUARD.has(position?.trim().toUpperCase());
}

export function isForwardPosition(position: string): boolean {
  return FORWARD.has(position?.trim().toUpperCase());
}

export function isCenterPosition(position: string): boolean {
  return CENTER.has(position?.trim().toUpperCase());
}
