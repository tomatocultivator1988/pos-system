'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import type { Staff, AuthContextType } from '@/lib/types'
import { offlineStore } from '@/lib/offline/store'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me')
      const json = await res.json()
      if (mountedRef.current) {
        if (json.user) {
          setCurrentStaff(json.user)
          setIsAuthenticated(true)
          offlineStore.setSession(json.user)
        } else {
          setCurrentStaff(null)
          setIsAuthenticated(false)
          offlineStore.setSession(null)
        }
      }
    } catch {
      // Offline: fall back to the cached session so the cashier stays logged in.
      const cached = offlineStore.getSession()
      if (mountedRef.current) {
        if (cached) {
          setCurrentStaff(cached as Staff)
          setIsAuthenticated(true)
        } else {
          setCurrentStaff(null)
          setIsAuthenticated(false)
        }
      }
    }
  }, [])

  const mountedRef = useRef(true)
  useEffect(() => {
    fetchUser()
    return () => { mountedRef.current = false }
  }, [fetchUser])

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Invalid credentials')
    setCurrentStaff(json)
    setIsAuthenticated(true)
    offlineStore.setSession(json)
  }, [])

  const logout = useCallback(async () => {
    const res = await fetch('/api/auth/logout', { method: 'POST' })
    if (res.ok) {
      setCurrentStaff(null)
      setIsAuthenticated(false)
      offlineStore.setSession(null)
    }
  }, [])

  return (
    <AuthContext.Provider value={{ currentStaff, isAuthenticated, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
