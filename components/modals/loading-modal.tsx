'use client'

import { useModal } from '@/lib/contexts/modal-context'

export function LoadingModal() {
  const { loading } = useModal()

  if (!loading.isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-card rounded-2xl p-8 flex flex-col items-center gap-4 animate-scaleIn">
        <div className="w-12 h-12 border-4 border-accent/20 border-t-accent rounded-full animate-spin" />
        <p className="text-sm font-medium text-foreground">{loading.message}</p>
      </div>
    </div>
  )
}
