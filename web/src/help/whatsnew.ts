/** "What's new" cards, shown once after an update (newest version first). */
export interface NewsItem { title: string; text: string; tryIt?: { event: string; detail?: string } }
export const WHATS_NEW: { version: string; items: NewsItem[] }[] = [
  {
    version: '6.0.0',
    items: [
      { title: 'Effects with your colours', text: '50 effects in groups with animated tiles — 25 new (teal & orange, duotone, colour pop, lens flare, halftone, comic, old film, petals, bubbles, fireflies, rain on glass, neon edges, shake…). Every effect has colours, size, speed, blend and area (top, bottom, behind or on the subject). Save your own as My effects.' },
      { title: '3D depth without damage', text: 'Depth edges now follow the picture, the move is limited automatically (no stretching, no smeared borders), drawing is sharp at 2K / 4K, and each clip has its own strength. Layers mode moves the cut-out subject over a filled-in background. Optional detailed depth model.' },
    ],
  },
  {
    version: '5.9.0',
    items: [
      { title: 'Sounds that follow the story', text: 'Sounds from the script now read the words around each sound word: “the front door buzzing” plays a door buzzer, “she opened the door” a door opening, “the phone rang” a ringing phone. A bare “door”, “run a business” or “3 simple steps” make no sound.' },
      { title: 'Search any sound', text: 'Change… on a suggestion, right-click a sound → Replace sound…, or SFX → Search sounds…: built-in recordings, your files, and free CC0 sounds from BigSoundBank and Freesound (desktop app), straight onto the timeline.' },
    ],
  },
  {
    version: '5.8.1',
    items: [
      { title: 'Real sounds from the script', text: 'Sounds from the script now play real recordings (38 CC0 sounds: keyboard, footsteps, running, breathing, sighs, screams, knocks, doors, heartbeat, rain, thunder, wind, phone, laughter, applause…). The keyboard sound is a real keyboard.' },
      { title: 'Real recordings in the SFX tab', text: 'SFX → Real recordings: listen and add any of them at the playhead.' },
    ],
  },
  {
    version: '5.8.0',
    items: [
      { title: 'Media only', text: 'Import media → Media only keeps files in Media until you need them, or add them at the end. A date in a file name can no longer stretch a clip over minutes.' },
      { title: 'Insert without stretching', text: 'A file dropped on a clip goes in at the nearest cut and the later clips move along; after the end you get a visible blank section.' },
      { title: 'Replace with…', text: 'Right-click any picture or video clip → Replace with…: pick from Media or upload. It keeps the place, length, motion and transition; the old file stays in Media.' },
      { title: 'Sounds from the script', text: 'Audio → Sound effects → Find sounds: footsteps, breathing, knocks, rain, thunder… on the spoken word. Your own sound files (by name) are used first.' },
    ],
  },
  {
    version: '5.7.0',
    items: [
      { title: 'Calmer living illustrations', text: 'One wind and one sea per image: pieces move together as a gust across the picture. Remove it from one image or from all images in one click.' },
      { title: 'Auto levels', text: 'Export → Auto levels: music exactly −6 dB under the voice, effects at or below, no ducking, one gain to −14 LUFS and a −1 dB limiter.' },
      { title: '2K and 4K export', text: 'Export → Resolution: 2K · 1440p and 4K · 2160p.' },
    ],
  },
  {
    version: '5.6.0',
    items: [
      { title: 'Living illustration', text: 'Select an image clip → Properties → “Bring this image to life”: ships rock, sails billow, oars row, whales glide, water flows — slightly, in a perfect loop. Moods: Calm, Stormy, Underwater, Dreamy.' },
    ],
  },
  {
    version: '5.5.0',
    items: [
      { title: 'Your voiceover drives the story', text: 'Story Studio → Script → Use my voiceover: upload the audio and its subtitles (ElevenLabs / TurboScribe .srt, adverts removed) or transcribe on this PC.', tryIt: { event: 'autostudio:dialog', detail: 'story' } },
      { title: 'Scene list', text: 'Storyboard → List: every scene in order with editable words, add scene, paste a scene list, delete. “Send all scenes in one message” for long stories.' },
      { title: 'Zoom the preview', text: 'Ctrl+scroll on the preview to zoom up to 400 %, Space+drag to move, Fit to go back.' },
      { title: 'Copy you can trust', text: '“Copied ✓” only shows when it really copied — otherwise the message opens selected for Ctrl+C. Draft voices now run on the processor by default (no more strange noises).' },
    ],
  },
  {
    version: '5.4.0',
    items: [
      { title: 'Music that follows your story', text: 'Story Studio → Polish: four music styles made by the app (free to use) — calm while you explain, a short stop before each reveal, a lift at the end, ducking under your voice. Press ▶ to listen first.', tryIt: { event: 'autostudio:dialog', detail: 'story' } },
      { title: 'Sound kits per style', text: 'Effects now match the style: paper and pen for Documentary, pops for Explainer, low hits and footsteps for Stick figure, boings and ta-das for Cartoon.' },
    ],
  },
  {
    version: '5.3.0',
    items: [
      { title: 'Cartoon style', text: 'Bean-head cartoon characters with big eyes, ink outlines and bright painted sets — same 18 scene designs, poses and talking as Stick figure. Try the “Max and the 3,000 coffees” sample.', tryIt: { event: 'autostudio:dialog', detail: 'story' } },
      { title: 'Smart layers for gameplay', text: 'The app finds the game HUD and your facecam, then adds hype alerts, a kill counter, round tabs and a facecam frame — never over the HUD or the action.', tryIt: { event: 'autostudio:tab', detail: 'mgfx' } },
    ],
  },
  {
    version: '5.2.0',
    items: [
      { title: 'Stick figure story', text: 'A new style with characters that act out your story — 13 poses, 7 faces, blinking, talking with your voice, 7 sets and props. Try the “Sam and the one-hour rule” sample.', tryIt: { event: 'autostudio:dialog', detail: 'story' } },
      { title: 'Characters in Add elements', text: 'Drag a character, a speech bubble, a set or a prop onto any video, then pick its pose and face from the tiles.', tryIt: { event: 'autostudio:tab', detail: 'mgfx' } },
    ],
  },
  {
    version: '5.1.0',
    items: [
      { title: 'Smart layers on your video', text: 'Talking head or podcast: the app finds faces and empty space on this PC, then places name tags, numbers, quotes and topic tabs from what is said — never over a face.', tryIt: { event: 'autostudio:tab', detail: 'mgfx' } },
      { title: 'Show zones', text: 'See the faces (green) and the free space (blue) the placement uses, right on the preview.' },
    ],
  },
  {
    version: '5.0.0',
    items: [
      { title: 'Story Studio', text: 'Script → Style → Storyboard → Make it → Polish. Pick a style from animated cards and every scene is built at once.', tryIt: { event: 'autostudio:dialog', detail: 'story' } },
      { title: 'Clear copy & paste with the AI', text: 'Four numbered steps for Claude / ChatGPT / Gemini — or “Do it for me” with your own assistant.' },
      { title: 'Edit on the preview', text: 'Double-click any text to type in place, snapping guides, Alt-click for layers underneath, drag elements from the Add panel.' },
      { title: 'Help everywhere', text: 'Every panel has a ? card with steps and tips; tours show you the real buttons.', tryIt: { event: 'autostudio:help' } },
    ],
  },
];
