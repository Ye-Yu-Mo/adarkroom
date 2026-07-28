/**
 * Player visibility calculations for WS broadcasting.
 *
 * Uses Chebyshev distance (max of dx, dy) to match the game's
 * square-tile world where diagonal movement costs the same as orthogonal.
 */

export const Visibility = {
  /** Check if two positions are within Chebyshev distance `radius`. */
  inRange(x1: number, y1: number, x2: number, y2: number, radius: number): boolean {
    return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) <= radius;
  },

  /** Compute entered and left player IDs between two sets. */
  diffPlayers(oldIds: string[], newIds: string[]): { entered: string[]; left: string[] } {
    const oldSet = new Set(oldIds);
    const newSet = new Set(newIds);
    const entered = newIds.filter((id) => !oldSet.has(id));
    const left = oldIds.filter((id) => !newSet.has(id));
    return { entered, left };
  },
};
