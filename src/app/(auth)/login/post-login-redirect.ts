/**
 * Destino canônico para quem precisa trocar a senha no primeiro acesso.
 * Mesmo path verificado pelo middleware (`src/middleware.ts`).
 */
export const TROCAR_SENHA_PATH = "/perfil/trocar-senha";

/**
 * Resolve para onde o login deve redirecionar JÁ no `signIn`, evitando o hop
 * `/dashboard` → middleware 302 → `/perfil/trocar-senha`. Esse hop encadeado,
 * disparado dentro da navegação RSC de um Server Action, é o que produzia a
 * tela crua "This page couldn't load" para usuários com `mustChangePassword`.
 * Apontando o `redirectTo` direto para o destino final, o fluxo passa a se
 * comportar como o login normal (que já funciona).
 */
export function resolvePostLoginRedirect(params: {
  mustChangePassword: boolean;
  callbackUrl: string;
}): string {
  return params.mustChangePassword ? TROCAR_SENHA_PATH : params.callbackUrl;
}
