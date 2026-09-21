import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App';
import './styles/tailwind.css';
import 'leaflet/dist/leaflet.css';

const container = document.getElementById('root');

if (!container) {
  throw new Error("L'élément racine #root est introuvable dans index.html.");
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
