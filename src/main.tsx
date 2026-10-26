import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './style.css';
import { installKeyboardViewport } from './keyboard-viewport';

installKeyboardViewport();

const base = import.meta.env.BASE_URL.replace(/\/$/, '') || '/inventory';
createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={base}>
    <App />
  </BrowserRouter>
);

if (!window.TitanInventory && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => {});
}
