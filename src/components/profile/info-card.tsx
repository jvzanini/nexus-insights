import Link from "next/link";
import { Mail, Shield, Calendar, KeyRound, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin",
  admin: "Administrador",
  manager: "Gestor",
  viewer: "Visualizador",
};

interface InfoCardProps {
  email: string;
  platformRole: string;
  isOwner: boolean;
  createdAt: Date | string | null;
}

export function InfoCard({ email, platformRole, isOwner, createdAt }: InfoCardProps) {
  const createdDate = createdAt
    ? new Intl.DateTimeFormat("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      }).format(new Date(createdAt))
    : "—";

  const roleLabel = ROLE_LABELS[platformRole] ?? platformRole;

  return (
    <Card className="rounded-2xl border border-border bg-muted/30 p-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Shield className="h-4 w-4 text-violet-500" />
          Informações
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-3">
            <Mail className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                E-mail
              </p>
              <p className="truncate text-foreground">{email}</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Nível de acesso
              </p>
              <p className="flex items-center gap-1.5 text-foreground">
                {isOwner ? (
                  <Crown className="h-3.5 w-3.5 text-violet-400" />
                ) : null}
                {roleLabel}
                {isOwner ? (
                  <span className="text-xs text-violet-400">(owner)</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Membro desde
              </p>
              <p className="text-foreground">{createdDate}</p>
            </div>
          </div>
        </div>

        <Button
          render={<Link href="/perfil/trocar-senha" />}
          variant="outline"
          className="w-full cursor-pointer"
        >
          <KeyRound className="mr-1.5 h-4 w-4" />
          Trocar senha
        </Button>
      </CardContent>
    </Card>
  );
}
