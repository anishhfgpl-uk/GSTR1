import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Gstr1App from './Gstr1App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><Gstr1App /></StrictMode>
);
