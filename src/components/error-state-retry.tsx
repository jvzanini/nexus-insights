"use client"

import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

interface ErrorStateRetryProps {
  title?: string
  message?: string
  retry: () => void
  retryLabel?: string
}

export function ErrorStateRetry({
  title = "Erro ao carregar",
  message = "Algo deu errado. Tente novamente em instantes.",
  retry,
  retryLabel = "Tentar novamente",
}: ErrorStateRetryProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
        <AlertCircle className="h-8 w-8 text-red-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
      <p className="mb-4 max-w-md text-sm text-muted-foreground">{message}</p>
      <Button onClick={retry} variant="outline">
        {retryLabel}
      </Button>
    </div>
  )
}
