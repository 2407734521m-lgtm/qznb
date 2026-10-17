import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './auth';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HashRouter><AuthProvider><App /></AuthProvider></HashRouter></React.StrictMode>
);
