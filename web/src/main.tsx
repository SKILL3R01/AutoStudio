import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureTypoFonts } from './render/typography';
import { mediaLimits } from './render/media';
import { PROFILE_SETTINGS, usePerf } from './lib/perf';
import './styles.css';

// Performance profile → image cache limits (preview size is read by the Preview component).
const applyProfile = () => {
  const s = PROFILE_SETTINGS[usePerf.getState().profile];
  mediaLimits.lru = s.lru;
  mediaLimits.maxDim = s.maxDim;
};
applyProfile();
usePerf.subscribe(applyProfile);
void usePerf.getState().init();

void ensureTypoFonts();
createRoot(document.getElementById('root')!).render(<App />);
