import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/Login'
import TodayPage from './pages/Today'
import HistoryPage from './pages/History'
import DebtPage from './pages/Debt'
import PlayersPage from './pages/Players'
import SettingsPage from './pages/Settings'
import BookingManagerPage from './pages/BookingManager'
import { useAuth } from './hooks/useAuth'

function Protected({ children }) {
  const { user, loading } = useAuth()

  if (loading) return <div className="p-4">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <Protected>
            <Routes>
              <Route path="/" element={<TodayPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/bookings" element={<BookingManagerPage />} />
              <Route path="/debt" element={<DebtPage />} />
              <Route path="/players" element={<PlayersPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </Protected>
        }
      />
    </Routes>
  )
}
