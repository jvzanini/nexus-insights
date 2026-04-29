import { Hammer } from "lucide-react";

export function ComingSoon({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-muted/30 p-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-600/10">
        <Hammer className="h-6 w-6 text-violet-500" />
      </div>
      <div>
        <h2 className="text-base font-semibold">Em construção</h2>
        <p className="text-sm text-muted-foreground max-w-sm">
          {children ??
            "Esta tela está em desenvolvimento. Em breve você verá os dados aqui."}
        </p>
      </div>
    </div>
  );
}
