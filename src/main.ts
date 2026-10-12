import './styles/game.css';
import './styles/ai-panel.css';
import { initAI } from './ai';
import './app/game.js';

// The game module wires itself to the DOM on import and calls connectGame() from ./ai
// to receive the active AI sampler. initAI() builds the settings panel and picks a provider.
initAI();
