import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initPwa } from './lib/pwa.js';
import './index.css';

// Captures the install prompt early and registers the service worker in production.
initPwa();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
