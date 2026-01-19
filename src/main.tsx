import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
// import { ThemeProvider } from "./components/theme-provider"

console.log("DEBUG: Main.tsx executing...");

createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <BrowserRouter>
        <App />
      </BrowserRouter>
//     </ThemeProvider>
//   </StrictMode>,
)
