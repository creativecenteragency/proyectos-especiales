import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './pages/Login'
import SetPassword from './pages/SetPassword'
import ProjectsList from './pages/ProjectsList'
import ProjectDetail from './pages/ProjectDetail'
import ProvidersPage from './pages/ProvidersPage'
import ReportPrint from './pages/ReportPrint'
import MarcaEnAccion from './pages/MarcaEnAccion'
import Conexiones from './pages/Conexiones'
import ProjectProposal from './pages/ProjectProposal'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading, passwordRecovery } = useAuth()

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-brand-gray">Cargando…</div>
  }
  if (!session) return <Navigate to="/login" replace />
  if (passwordRecovery) return <SetPassword />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <ProjectsList />
          </RequireAuth>
        }
      />
      <Route
        path="/proyecto/:slug"
        element={
          <RequireAuth>
            <ProjectDetail />
          </RequireAuth>
        }
      />
      <Route
        path="/proyecto/:slug/informe"
        element={
          <RequireAuth>
            <ReportPrint />
          </RequireAuth>
        }
      />
      <Route
        path="/proyecto/:slug/propuesta"
        element={
          <RequireAuth>
            <ProjectProposal />
          </RequireAuth>
        }
      />
      <Route
        path="/proyecto/:slug/marca-en-accion"
        element={
          <RequireAuth>
            <MarcaEnAccion />
          </RequireAuth>
        }
      />
      <Route
        path="/proveedores"
        element={
          <RequireAuth>
            <ProvidersPage />
          </RequireAuth>
        }
      />
      <Route
        path="/conexiones"
        element={
          <RequireAuth>
            <Conexiones />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
