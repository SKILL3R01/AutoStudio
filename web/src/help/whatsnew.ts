/** "What's new" cards, shown once after an update (newest version first). */
export interface NewsItem { title: string; text: string; tryIt?: { event: string; detail?: string } }
export const WHATS_NEW: { version: string; items: NewsItem[] }[] = [
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
