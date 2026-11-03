import { useState } from 'react';
import { useYt, DAILY_QUOTA } from '../lib/youtube';
import { SetupTab } from './SetupTab';
import { KeywordsTab } from './KeywordsTab';
import { OutliersTab } from './OutliersTab';
import { CompetitorsTab } from './CompetitorsTab';
import { NichesTab } from './NichesTab';
import { ChannelTab } from './ChannelTab';
import { OptimizerTab } from './OptimizerTab';
import { ReadinessTab } from './ReadinessTab';

export type GrowthTab = 'setup' | 'keywords' | 'outliers' | 'competitors' | 'niches' | 'channel' | 'optimizer' | 'readiness';
const TABS: [GrowthTab, string][] = [
  ['keywords', 'Keywords'], ['outliers', 'Outliers'], ['competitors', 'Competitors'], ['niches', 'Niches'],
  ['channel', 'My channel'], ['optimizer', 'Optimizer'], ['readiness', 'Readiness'], ['setup', 'Setup'],
];

/** vidIQ-style growth tools: research with a YouTube API key, your own channel with Google sign-in. */
export function Growth({ tab: initial }: { tab?: GrowthTab }) {
  const key = useYt((s) => s.key);
  const used = useYt((s) => s.used);
  const [tab, setTabState] = useState<GrowthTab>(initial ?? (key ? 'keywords' : 'setup'));
  const [seed, setSeed] = useState<string>();
  const setTab = (t: GrowthTab, s?: string) => {
    setSeed(s);
    setTabState(t);
    history.replaceState(null, '', `#growth/${t}`);
  };
  const setup = () => setTab('setup');
  return (
    <main className="page growth">
      <div className="row between">
        <div>
          <h1>Growth</h1>
          <p className="hint">Find what to make, learn from competitors, and get your channel monetized.</p>
        </div>
        {key && <span className="chip" title="YouTube API quota used today">{used.toLocaleString()} / {DAILY_QUOTA.toLocaleString()} units today</span>}
      </div>
      <nav className="tabs">
        {TABS.map(([id, label]) => <button key={id} className={tab === id ? 'on' : ''} onClick={() => setTab(id)}>{label}</button>)}
      </nav>
      {tab === 'setup' && <SetupTab />}
      {tab === 'keywords' && <KeywordsTab key={seed} seed={seed} onSetup={setup} />}
      {tab === 'outliers' && <OutliersTab key={seed} seed={seed} onSetup={setup} />}
      {tab === 'competitors' && <CompetitorsTab onSetup={setup} />}
      {tab === 'niches' && <NichesTab onResearch={(q) => setTab('keywords', q)} onOutliers={(q) => setTab('outliers', q)} />}
      {tab === 'channel' && <ChannelTab onSetup={setup} />}
      {tab === 'optimizer' && <OptimizerTab onSetup={setup} />}
      {tab === 'readiness' && <ReadinessTab />}
    </main>
  );
}
