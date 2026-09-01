'use client'

import { useState } from 'react'
import { useModal } from '@/lib/contexts/modal-context'
import { AlertCircle } from 'lucide-react'

export function ConfirmationModal() {
  const { confirmation, hideConfirmation } = useModal()
  const [isProcessing, setIsProcessing] = useState(false)

  if (!confirmation.isOpen) return null

  const handleConfirm = async () => {
    setIsProcessing(true)
    try {
      await confirmation.onConfirm()
    } finally {
      setIsProcessing(false)
    }
    // ponytail: caller manages closing via showConfirmation replacing this one
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fadeIn">
      <div className="bg-card rounded-2xl max-w-md w-full p-6 animate-scaleIn">
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          {confirmation.isDestructive && (
            <div className="p-2 bg-destructive/10 rounded-lg mt-0.5">
              <AlertCircle className="w-5 h-5 text-destructive" />
            </div>
          )}
          <div className="flex-1">
            <h2 className="text-lg font-semibold">{confirmation.title}</h2>
          </div>
        </div>

        {/* Description */}
        <p className="text-sm text-muted-foreground mb-6">{confirmation.description}</p>

        {/* Buttons */}
        <div className="flex gap-3 justify-end">
          {confirmation.cancelText && (
            <button
              onClick={hideConfirmation}
              disabled={isProcessing}
              className="px-4 py-2 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {confirmation.cancelText}
            </button>
          )}
          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className={`px-4 py-2 rounded-lg text-white font-medium transition-colors disabled:opacity-50 ${
              confirmation.isDestructive
                ? 'bg-destructive hover:bg-destructive/90'
                : 'bg-accent hover:bg-accent/90'
            }`}
          >
            {isProcessing ? 'Processing...' : confirmation.confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
