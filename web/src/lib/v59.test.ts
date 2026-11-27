import { describe, expect, it } from 'vitest';
import { newProject } from './project';
import { findSfxCues } from '../audio/scriptsfx';
import { isCc0Page, parseBigSoundBank, parseFreesoundSearch, replaceAudioSound, searchMedia, searchPack } from '../audio/sfxsearch';
import { newAudioClip } from './audiotracks';
import { packSound, packUrl } from '../audio/pack';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = (n: string) => readFileSync(join(__dirname, 'fixtures', n), 'utf-8');

const cues = (text: string) => {
  const p = newProject();
  p.words = text.split(' ').map((w, i) => ({ text: w, start: i, end: i + 0.8 }));
  return findSfxCues(p).map((c) => `${c.rule}@${c.word}`);
};

describe('v5.9 script sounds follow the meaning', () => {
  it('doors: the action decides the sound, and it starts on the action word', () => {
    expect(cues('then the front door buzzing again')).toEqual(['buzzer@buzzing']);
    expect(cues('She opened the door slowly')).toEqual(['dooropen@opened']);
    expect(cues('the door closed behind him')).toEqual(['doorclose@closed']);
    expect(cues('the door slammed shut')).toEqual(['slam@slammed']);
    expect(cues('He slammed the door')).toEqual(['slam@slammed']);
    expect(cues('a knock at the door')).toEqual(['knock@knock']);
    expect(cues('the doorbell rang twice')).toEqual(['doorbell@doorbell']);
    expect(cues('someone rang the door bell')).toEqual(['doorbell@rang']);
    expect(cues('جرس الباب يرن')).toEqual(['doorbell@يرن']);
  });
  it('a bare anchor word makes no sound', () => {
    expect(cues('he stood at the door thinking')).toEqual([]);
    expect(cues('she looked at her phone again')).toEqual([]);
    expect(cues('it comes from the heart')).toEqual([]);
  });
  it('phones: ringing, buzzing and messages are different sounds', () => {
    expect(cues('then the phone rang')).toEqual(['ring@rang']);
    expect(cues('her phone buzzed on the table')).toEqual(['buzz@buzzed']);
    expect(cues('a new message arrived')).toEqual(['message@arrived']);
    expect(cues('the message is simple')).toEqual([]);
  });
  it('figures of speech are skipped', () => {
    expect(cues('how to run a business')).toEqual([]);
    expect(cues('follow these 3 simple steps')).toEqual([]);
    expect(cues('let me walk you through it')).toEqual([]);
    expect(cues('the stock market crash')).toEqual([]);
    expect(cues('a breath of fresh air')).toEqual([]);
    expect(cues('Seneca wrote about anger')).toEqual([]);
    expect(cues('visit our web page today')).toEqual([]);
  });
  it('real actions still work', () => {
    expect(cues('my heart was pounding')).toEqual(['heartbeat@pounding']);
    expect(cues('he ran to the station')).toEqual(['run@ran']);
    expect(cues('she walked home alone')).toEqual(['steps@walked']);
    expect(cues('she wrote it down')).toEqual(['pen@down']);
    expect(cues('he turned the page')).toEqual(['page@turned']);
  });
});

describe('v5.9 sound search and replace', () => {
  it('parses BigSoundBank and Freesound result pages', () => {
    const b = parseBigSoundBank(fixture('bsb-search.html'));
    expect(b[0]).toMatchObject({ kind: 'online', site: 'BigSoundBank', key: 'bsb:2365', mp3: 'https://bigsoundbank.com/UPLOAD/mp3/2365.mp3', duration: 7 });
    expect(b[0].title).toMatch(/Doorbell/);
    expect(b[0].kind === 'online' && b[0].page).toMatch(/^https:\/\/bigsoundbank\.com\/.+-s2365\.html$/);
    const f = parseFreesoundSearch(fixture('fs-search.html'));
    expect(f).toHaveLength(2);
    expect(f[0]).toMatchObject({ site: 'Freesound', title: 'Doorbell from Inside of the House' });
    expect(f[0].kind === 'online' && f[0].mp3).toMatch(/^https:\/\/cdn\.freesound\.org\/previews\/.+-hq\.mp3$/);
    expect(f[1].title).toBe('Doorbell ringing');
  });
  it('recordings renamed in 5.9 still resolve for older projects', () => {
    expect(packUrl('door_1')).toBe(packUrl('slam_1'));
    expect(packSound('door_2')?.rule).toBe('doorclose');
  });
  it('only CC0 pages pass the licence check', () => {
    expect(isCc0Page('BigSoundBank', "<h2>License</h2><p><strong>CC0 (public domain): Free and royalty-free (<a>more</a>)</strong></p>")).toBe(true);
    expect(isCc0Page('BigSoundBank', '<footer>Free, royalty-free sounds (CC0).</footer>')).toBe(false);
    expect(isCc0Page('Freesound', '<a href="https://creativecommons.org/publicdomain/zero/1.0/">')).toBe(true);
    expect(isCc0Page('Freesound', '<a href="https://creativecommons.org/licenses/by/4.0/">')).toBe(false);
  });
  it('searches the built-in recordings and your files by words', () => {
    expect(searchPack('door buzzer')[0]).toMatchObject({ kind: 'pack', sound: 'rec:buzzer_1' });
    expect(searchPack('doorbell')[0].key).toMatch(/^rec:doorbell_/);
    expect(searchPack('phone ringing')[0].key).toMatch(/^rec:ring_/);
    const p = newProject();
    p.assets = [{ id: 'a', kind: 'audio', name: 'Front door buzzer.wav', mime: '' }, { id: 'b', kind: 'audio', name: 'music.mp3', mime: '' }];
    expect(searchMedia(p, 'buzzer').map((h) => h.key)).toEqual(['a']);
  });
  it('replace sound keeps start, volume and fades, and never overlaps the next clip', () => {
    const p = newProject();
    p.audio = [newAudioClip('t', '', 5, 3, 'sfx', { id: 'x', sound: 'rec:doorclose_1', volume: 0.4, fadeOut: 0.3 }), newAudioClip('t', '', 6.5, 1, 'sfx', { id: 'y', sound: 'pop' })];
    replaceAudioSound(p, 'x', { sound: 'rec:buzzer_1', title: 'Intercom', duration: 4 });
    expect(p.audio[0]).toMatchObject({ sound: 'rec:buzzer_1', assetId: '', start: 5, volume: 0.4, fadeOut: 0.3 });
    expect(p.audio[0].duration).toBeCloseTo(1.45);
    replaceAudioSound(p, 'x', { assetId: 'file', title: 'buzz.wav', duration: 0.4 });
    expect(p.audio[0]).toMatchObject({ assetId: 'file', sound: undefined, duration: 0.4, fadeOut: 0.2 });
  });
});
