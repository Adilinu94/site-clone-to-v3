import { describe, it, expect } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { CLONE_V3_HOME, profilesPath, sourceAuthPath, researchPath } from '../../src/lib/paths.js';

describe('paths (Windows-compatible, no tilde)', () => {
  it('CLONE_V3_HOME uses os.homedir(), not ~', () => {
    expect(CLONE_V3_HOME).toBe(path.join(os.homedir(), '.clone-v3'));
    expect(CLONE_V3_HOME.startsWith('~')).toBe(false);
  });

  it('profilesPath is ~/.clone-v3/profiles.json', () => {
    expect(profilesPath()).toBe(path.join(os.homedir(), '.clone-v3', 'profiles.json'));
  });

  it('sourceAuthPath is ~/.clone-v3/source-auth.json', () => {
    expect(sourceAuthPath()).toBe(path.join(os.homedir(), '.clone-v3', 'source-auth.json'));
  });

  it('researchPath uses ./research/<hostname>', () => {
    expect(researchPath('stripe.com')).toBe(path.join('research', 'stripe.com'));
  });
});
