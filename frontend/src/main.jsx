import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './hooks/useAuth.jsx';
import {AppearanceProvider} from './hooks/useAppearance.jsx';
import './styles/index.css';
import './styles/appearance.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppearanceProvider><App /></AppearanceProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
