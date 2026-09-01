'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/lib/contexts/auth-context'
import { useModal } from '@/lib/contexts/modal-context'
import { LogOut, BarChart3, ShoppingCart, Package, Coffee, UtensilsCrossed, Users, FileText, Settings, Home, Menu, X, ShieldOff, PieChart, Layers, CreditCard } from 'lucide-react'
import { useEffect, useState } from 'react'

const navItems = [
  { icon: Home, label: 'Dashboard', href: '/dashboard', roles: ['admin'] },
  { icon: ShoppingCart, label: 'POS Terminal', href: '/pos', roles: ['admin', 'cashier'] },
  { icon: Package, label: 'Inventory', href: '/inventory', roles: ['admin'] },
  { icon: Coffee, label: 'Menu', href: '/menu', roles: ['admin'] },
  { icon: Users, label: 'Customers', href: '/customers', roles: ['admin', 'cashier'] },
  { icon: UtensilsCrossed, label: 'Orders', href: '/orders', roles: ['admin', 'cashier', 'kds'] },
  { icon: FileText, label: 'Sales', href: '/sales', roles: ['admin'] },
  { icon: PieChart, label: 'Reports', href: '/reports', roles: ['admin', 'cashier'] },
  { icon: BarChart3, label: 'Sales by Item', href: '/reports/items', roles: ['admin'] },
  { icon: Layers, label: 'Sales by Category', href: '/reports/category', roles: ['admin'] },
  { icon: CreditCard, label: 'Sales by Payment', href: '/reports/payment', roles: ['admin'] },
  { icon: Settings, label: 'Settings', href: '/settings', roles: ['admin'] },
]

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { currentStaff, logout, isAuthenticated } = useAuth()
  const { showConfirmation, hideConfirmation } = useModal()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Redirect KDS away from non-orders pages
  useEffect(() => {
    if (currentStaff?.role === 'kds' && pathname !== '/orders') {
      router.push('/orders')
    }
  }, [currentStaff?.role, pathname, router])

  const isKds = currentStaff?.role === 'kds'
  const visibleNav = navItems.filter(item => !item.roles || item.roles.includes(currentStaff?.role || ''))

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Coffee className="w-8 h-8 text-accent mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  const handleLogout = () => {
    showConfirmation({
      title: 'Logout',
      description: 'Are you sure you want to logout? You will need to enter your PIN again.',
      confirmText: 'Yes, Logout',
      cancelText: 'Cancel',
      onConfirm: async () => {
        hideConfirmation()
        await logout()
        router.push('/login')
      },
      isDestructive: true,
    })
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-40 animate-slideInDown">
        <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-3 lg:py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <Coffee className="w-5 h-5 lg:w-6 lg:h-6 text-accent" />
            <h1 className="text-lg lg:text-xl font-semibold">Bean Brewyage</h1>
          </div>
          <div className="flex items-center gap-4 lg:gap-6">
            <div className="text-xs lg:text-sm text-right">
              <p className="font-medium truncate max-w-[120px] lg:max-w-none">{currentStaff?.name}</p>
              <p className="text-xs text-muted-foreground capitalize">{currentStaff?.role}</p>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg text-sm font-medium text-destructive hover:bg-destructive/10 transition-all duration-200 active:scale-95"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex relative">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-20 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } lg:translate-x-0 fixed lg:sticky left-0 top-[57px] lg:top-[73px] w-64 bg-card border-r border-border p-4 lg:p-6 h-[calc(100vh-57px)] lg:h-[calc(100vh-73px)] overflow-y-auto z-30 transition-transform duration-200 ease-in-out animate-slideInLeft`}
        >
          <nav className="space-y-1 lg:space-y-2">
            {visibleNav.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 lg:px-4 py-2.5 lg:py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-accent text-white shadow-md lg:scale-105'
                      : 'text-foreground hover:bg-muted lg:hover:translate-x-1'
                  }`}
                >
                  <item.icon className="w-4 h-4 lg:w-5 lg:h-5" />
                  <span className="font-medium text-sm lg:text-base">{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 lg:ml-0 animate-fadeIn">
          {isKds && pathname !== '/orders' ? (
            <div className="flex items-center justify-center h-full min-h-[60vh]">
              <div className="text-center">
                <ShieldOff className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">Access Restricted</h2>
                <p className="text-muted-foreground">KDS accounts can only access the Orders screen.</p>
              </div>
            </div>
          ) : children}
        </main>
      </div>
    </div>
  )
}
