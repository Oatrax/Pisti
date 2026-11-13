import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { unlockAudio } from './sound.js';

// Browsers (iOS especially) only start audio from a gesture: unlock on the first touch/click.
window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });

createRoot(document.getElementById('root')).render(<App />);
