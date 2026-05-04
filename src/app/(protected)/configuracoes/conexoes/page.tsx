import { redirect } from "next/navigation";

/**
 * Rota legada — `/configuracoes/conexoes` foi movida para `/bancos-de-dados`
 * na hotfix v0.39 (alinha com nome do menu na sidebar). Redirect 308 mantém
 * compatibilidade com bookmarks antigos do super_admin.
 */
export const dynamic = "force-dynamic";

export default function Page() {
  redirect("/bancos-de-dados");
}
