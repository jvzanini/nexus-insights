import { AlertCircle } from "lucide-react"

interface ErrorStateProps {
  title?: string
  message?: string
}

export function ErrorState({
  title = "Erro ao carregar",
  message = "Algo deu errado. Tente novamente em instantes.",
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-500/10">
        <AlertCircle className="h-8 w-8 text-red-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">{title}</h3>
      <p className="max-w-md text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
