import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensureTypoFonts } from './render/typography';
import './styles.css';

void ensureTypoFonts();
createRoot(document.getElementById('root')!).render(<App />);
