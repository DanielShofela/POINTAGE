import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global error handler to catch initialization errors
window.onerror = function(message, source, lineno, colno, error) {
  const root = document.getElementById('root');
  if (root && root.innerHTML === '') {
    root.innerHTML = `
      <div style="padding: 20px; color: red; font-family: sans-serif;">
        <h1>Erreur d'initialisation</h1>
        <p>${message}</p>
        <pre style="background: #eee; padding: 10px;">${error?.stack || ''}</pre>
        <button onclick="location.reload()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 5px; cursor: pointer;">Réessayer</button>
      </div>
    `;
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
