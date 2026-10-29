import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { App } from './app/App';

const container = document.getElementById('root');
if (!container) throw new Error('Root container missing');

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
