/** "What's new" cards, shown once after an update (newest version first). */
export interface NewsItem { title: string; text: string; tryIt?: { event: string; detail?: string } }
export const WHATS_NEW: { version: string; items: NewsItem[] }[] = [
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
