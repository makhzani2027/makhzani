import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import App from './App';
import { AuthProvider } from './lib/auth';
import { DialogHost, Toaster } from './ui';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '') || '/'}>
      <AuthProvider>
        <App />
        <Toaster />
        <DialogHost />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
