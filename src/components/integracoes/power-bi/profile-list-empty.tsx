/**
 * ProfileListEmpty — Server Component que renderiza o estado vazio
 * da lista de perfis Power BI.
 *
 * Visual: ícone Plug grande (opacity-30) + headline + texto + CTA
 * (NewProfileButton) centralizado. Mantém estética violet do projeto.
 */

import { Plug } from "lucide-react";
import { NewProfileButton } from "./new-profile-button";

interface Props {
  softCapReached?: boolean;
  softCap?: number;
}

export function ProfileListEmpty({ softCapReached, softCap }: Props) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-16 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-500/10">
        <Plug
          className="h-8 w-8 text-violet-500/40"
          aria-hidden="true"
          strokeWidth={1.5}
        />
      </div>
      <h3 className="text-base font-semibold text-foreground">
        Nenhum perfil cadastrado ainda
      </h3>
      <p className="mt-1.5 max-w-md text-sm text-muted-foreground">
        Crie seu primeiro perfil para liberar acesso Power BI ao banco
        Nexus Insights. Cada perfil tem usuário PostgreSQL próprio,
        senha rotacionável e whitelist de tabelas/colunas.
      </p>
      <div className="mt-5">
        <NewProfileButton
          softCapReached={softCapReached}
          softCap={softCap}
        />
      </div>
    </div>
  );
}
