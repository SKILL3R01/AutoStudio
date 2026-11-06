import { describe, expect, it } from 'vitest';
import { addSnapshot, MAX_SNAPSHOTS, MIN_INTERVAL } from './history';
import { newProject } from './project';

describe('version history', () => {
  it('throttles, skips unchanged projects, keeps newest first and prunes', () => {
    const p = newProject('A');
    let list = addSnapshot([], p, 'Auto-save', 1000)!;
    expect(list).toHaveLength(1);
    expect(addSnapshot(list, { ...p, name: 'B' }, 'Auto-save', 1000 + MIN_INTERVAL - 1)).toBeNull();
    expect(addSnapshot(list, p, 'Auto-save', 1000 + MIN_INTERVAL)).toBeNull();
    list = addSnapshot(list, { ...p, name: 'B' }, 'Auto-save', 1000 + MIN_INTERVAL)!;
    expect(list.map((s) => s.project.name)).toEqual(['B', 'A']);
    expect(addSnapshot(list, { ...p, name: 'C' }, 'Before restore', 1000 + MIN_INTERVAL + 5, true)![0].label).toBe('Before restore');
    for (let i = 0; i < 40; i++) list = addSnapshot(list, { ...p, name: `n${i}` }, 'Auto-save', 10_000_000 + i * MIN_INTERVAL)!;
    expect(list).toHaveLength(MAX_SNAPSHOTS);
    expect(list[0].project.name).toBe('n39');
  });
});
