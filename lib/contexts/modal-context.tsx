'use client'

import React, { createContext, useContext, useState, ReactNode } from 'react'

interface LoadingModalState {
  isOpen: boolean
  message: string
}

interface ConfirmationModalState {
  isOpen: boolean
  title: string
  description: string
  confirmText: string
  cancelText: string
  onConfirm: () => void | Promise<void>
  isDestructive: boolean
}

interface ModalContextType {
  loading: LoadingModalState
  confirmation: ConfirmationModalState
  showLoading: (message: string) => void
  hideLoading: () => void
  showConfirmation: (options: Omit<ConfirmationModalState, 'isOpen'>) => void
  hideConfirmation: () => void
}

const ModalContext = createContext<ModalContextType | undefined>(undefined)

export function ModalProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState<LoadingModalState>({
    isOpen: false,
    message: 'Loading...',
  })

  const [confirmation, setConfirmation] = useState<ConfirmationModalState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    onConfirm: () => {},
    isDestructive: false,
  })

  const showLoading = (message: string) => {
    setLoading({ isOpen: true, message })
  }

  const hideLoading = () => {
    setLoading({ isOpen: false, message: '' })
  }

  const showConfirmation = (options: Omit<ConfirmationModalState, 'isOpen'>) => {
    setConfirmation({ ...options, isOpen: true })
  }

  const hideConfirmation = () => {
    setConfirmation((prev) => ({ ...prev, isOpen: false }))
  }

  return (
    <ModalContext.Provider value={{ loading, confirmation, showLoading, hideLoading, showConfirmation, hideConfirmation }}>
      {children}
    </ModalContext.Provider>
  )
}

export function useModal() {
  const context = useContext(ModalContext)
  if (!context) {
    throw new Error('useModal must be used within ModalProvider')
  }
  return context
}
