import {
  resolvePostLoginRedirect,
  TROCAR_SENHA_PATH,
} from "../post-login-redirect";

describe("resolvePostLoginRedirect", () => {
  it("manda direto para trocar senha quando mustChangePassword=true (ignora callbackUrl)", () => {
    // Evita o hop /dashboard → middleware 302 → /perfil/trocar-senha, que
    // quebrava a navegação RSC do Server Action ("This page couldn't load").
    expect(
      resolvePostLoginRedirect({
        mustChangePassword: true,
        callbackUrl: "/dashboard",
      }),
    ).toBe(TROCAR_SENHA_PATH);
    expect(
      resolvePostLoginRedirect({
        mustChangePassword: true,
        callbackUrl: "/relatorios/visao-geral",
      }),
    ).toBe(TROCAR_SENHA_PATH);
  });

  it("usa o callbackUrl quando mustChangePassword=false", () => {
    expect(
      resolvePostLoginRedirect({
        mustChangePassword: false,
        callbackUrl: "/dashboard",
      }),
    ).toBe("/dashboard");
    expect(
      resolvePostLoginRedirect({
        mustChangePassword: false,
        callbackUrl: "/relatorios/equipe",
      }),
    ).toBe("/relatorios/equipe");
  });
});
