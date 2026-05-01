import { generateIntegrationPassword, getPasswordLast4, INTEGRATION_PWD_CHARSET } from "../password-generator";

describe("generateIntegrationPassword", () => {
  it("retorna 32 chars por default", () => {
    expect(generateIntegrationPassword()).toHaveLength(32);
  });

  it("respeita length custom", () => {
    expect(generateIntegrationPassword(16)).toHaveLength(16);
    expect(generateIntegrationPassword(64)).toHaveLength(64);
  });

  it("usa apenas chars do INTEGRATION_PWD_CHARSET", () => {
    const pwd = generateIntegrationPassword();
    for (const c of pwd) {
      expect(INTEGRATION_PWD_CHARSET).toContain(c);
    }
  });

  it("não contém chars ambíguos (0/O/I/l/1)", () => {
    for (let i = 0; i < 100; i++) {
      const pwd = generateIntegrationPassword();
      expect(pwd).not.toMatch(/[0OIl1]/);
    }
  });

  it("sem duplicatas em 1000 calls", () => {
    const set = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      set.add(generateIntegrationPassword());
    }
    expect(set.size).toBe(1000);
  });
});

describe("getPasswordLast4", () => {
  it("retorna últimos 4 chars", () => {
    expect(getPasswordLast4("abcdefghijkl")).toBe("ijkl");
  });

  it("retorna o próprio valor se < 4 chars", () => {
    expect(getPasswordLast4("abc")).toBe("abc");
  });
});

describe("INTEGRATION_PWD_CHARSET", () => {
  it("não contém chars ambíguos", () => {
    expect(INTEGRATION_PWD_CHARSET).not.toMatch(/[0OIl1]/);
  });

  it("contém letras maiúsculas, minúsculas, dígitos e símbolos", () => {
    expect(INTEGRATION_PWD_CHARSET).toMatch(/[A-Z]/);
    expect(INTEGRATION_PWD_CHARSET).toMatch(/[a-z]/);
    expect(INTEGRATION_PWD_CHARSET).toMatch(/[2-9]/);
    expect(INTEGRATION_PWD_CHARSET).toMatch(/[!@#$%]/);
  });
});
