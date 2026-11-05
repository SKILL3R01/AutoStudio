import { describe, expect, it } from 'vitest';
import { migrateCaptions, newProject, normalizeProject } from './project';

describe('subtitles and typography are independent layers (v1.10)', () => {
  const base = newProject().captions;
  it('migrates the old single mode', () => {
    expect(migrateCaptions({ ...base }, { mode: 'full', enabled: true })).toMatchObject({ enabled: true, typography: false });
    expect(migrateCaptions({ ...base }, { mode: 'keywords', enabled: true })).toMatchObject({ enabled: false, typography: true });
    expect(migrateCaptions({ ...base }, { mode: 'both', enabled: true })).toMatchObject({ enabled: true, typography: true });
  });
  it('keeps new settings untouched and defaults new projects to both layers', () => {
    expect(migrateCaptions({ ...base, typography: false }, { typography: false, enabled: true })).toMatchObject({ typography: false, enabled: true });
    expect(newProject().captions).toMatchObject({ enabled: true, typography: true });
    const old = newProject();
    (old.captions as { typography?: boolean }).typography = undefined;
    delete (old.captions as { typography?: boolean }).typography;
    old.captions.mode = 'keywords';
    expect(normalizeProject(old).captions).toMatchObject({ enabled: false, typography: true });
  });
});
