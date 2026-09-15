import { createRoot } from 'react-dom/client'
import './index.css'
import 'goey-toast/styles.css'
import { BrowserRouter } from 'react-router-dom'
import App from './App.tsx'
// import { ThemeProvider } from "./components/theme-provider"

createRoot(document.getElementById('root')!).render(
//   <StrictMode>
//     <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <BrowserRouter>
        <App />
      </BrowserRouter>
//     </ThemeProvider>
//   </StrictMode>,
)
