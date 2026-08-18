import { describe, expect, it } from 'vitest';
import { BUILD_INFO } from '@/domain/build-info';

describe('BUILD_INFO', () => {
  it('always reports a stage and a short commit, even with no env set', () => {
    expect(BUILD_INFO.stage).toBeTruthy();
    expect(BUILD_INFO.commit.length).toBeLessThanOrEqual(7);
  });
});
