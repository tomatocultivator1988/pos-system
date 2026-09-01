import { Geist } from 'next/font/google'
import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/lib/contexts/auth-context'
import { CartProvider } from '@/lib/contexts/cart-context'
import { ModalProvider } from '@/lib/contexts/modal-context'
import { OrdersProvider } from '@/lib/contexts/orders-context'
import { LoadingModal } from '@/components/modals/loading-modal'
import { ConfirmationModal } from '@/components/modals/confirmation-modal'
import { InstallPrompt } from '@/components/install-prompt'
import './globals.css'

const geist = Geist({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bean Brewyage - POS System',
  description: 'Point of sale system for Bean Brewyage',
  generator: 'v0.app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bean Brewyage',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9fafb' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="bg-background">
          <body className={`${geist.className} antialiased bg-background text-foreground`}>
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        ` }} />
        <ModalProvider>
          <AuthProvider>
            <CartProvider>
              <OrdersProvider>
                {children}
                <LoadingModal />
                <ConfirmationModal />
                <InstallPrompt />
              </OrdersProvider>
            </CartProvider>
          </AuthProvider>
        </ModalProvider>
      </body>
    </html>
  )
}
