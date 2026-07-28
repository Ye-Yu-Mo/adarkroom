/**
 * WS broadcast tests — M2-F5
 *
 * Tests player visibility calculation and enter/leave detection.
 */

import { describe, it, expect, beforeAll } from 'vitest';

describe('player visibility', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Visibility: any;

  beforeAll(async () => {
    const mod = await import('../../server/world/visibility');
    Visibility = mod.Visibility;
  });

  describe('inRange', () => {
    it('returns true for same position', () => {
      expect(Visibility.inRange(10, 10, 10, 10, 5)).toBe(true);
    });

    it('returns true for adjacent tile within radius', () => {
      expect(Visibility.inRange(10, 10, 11, 11, 5)).toBe(true);
    });

    it('returns false for tile outside radius', () => {
      expect(Visibility.inRange(10, 10, 20, 20, 5)).toBe(false);
    });

    it('uses Chebyshev distance (max of dx,dy)', () => {
      // radius=2: positions at (12,10) are dx=2, dy=0 → visible
      expect(Visibility.inRange(10, 10, 12, 10, 2)).toBe(true);
      // radius=2: positions at (12,13) are dx=2, dy=3 → NOT visible
      expect(Visibility.inRange(10, 10, 12, 13, 2)).toBe(false);
    });
  });

  describe('enter/leave detection', () => {
    it('detects new players entering range', () => {
      const oldIds = ['p1'];
      const newIds = ['p1', 'p2', 'p3'];
      const { entered, left } = Visibility.diffPlayers(oldIds, newIds);
      expect(entered).toEqual(['p2', 'p3']);
      expect(left).toEqual([]);
    });

    it('detects players leaving range', () => {
      const oldIds = ['p1', 'p2', 'p3'];
      const newIds = ['p1'];
      const { entered, left } = Visibility.diffPlayers(oldIds, newIds);
      expect(entered).toEqual([]);
      expect(left).toEqual(['p2', 'p3']);
    });

    it('detects both entering and leaving simultaneously', () => {
      const oldIds = ['p1', 'p2'];
      const newIds = ['p1', 'p3'];
      const { entered, left } = Visibility.diffPlayers(oldIds, newIds);
      expect(entered).toEqual(['p3']);
      expect(left).toEqual(['p2']);
    });

    it('returns empty when sets are identical', () => {
      const { entered, left } = Visibility.diffPlayers(['a', 'b'], ['b', 'a']);
      expect(entered).toEqual([]);
      expect(left).toEqual([]);
    });
  });
});
