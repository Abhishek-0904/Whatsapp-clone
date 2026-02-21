import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

import { CallProvider } from './context/CallContext.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <CallProvider>
      <App />
    </CallProvider>
  </StrictMode>,
)
