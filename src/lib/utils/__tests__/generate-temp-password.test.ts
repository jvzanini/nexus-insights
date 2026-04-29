import {
  generateTempPassword,
  TEMP_PASSWORD_FORBIDDEN,
} from "@/lib/utils/generate-temp-password";

describe("generateTempPassword", () => {
  it("gera 1000 senhas válidas de comprimento 8 sem caracteres confundíveis", () => {
    for (let i = 0; i < 1000; i++) {
      const pwd = generateTempPassword(8);
      expect(pwd).toHaveLength(8);
      for (const forbidden of TEMP_PASSWORD_FORBIDDEN) {
        expect(pwd.includes(forbidden)).toBe(false);
      }
      expect(/[a-zA-Z]/.test(pwd)).toBe(true);
      expect(/[0-9]/.test(pwd)).toBe(true);
    }
  });

  it("aceita length 4 e length 16", () => {
    const pwd4 = generateTempPassword(4);
    expect(pwd4).toHaveLength(4);
    expect(/[a-zA-Z]/.test(pwd4)).toBe(true);
    expect(/[0-9]/.test(pwd4)).toBe(true);

    const pwd16 = generateTempPassword(16);
    expect(pwd16).toHaveLength(16);
    expect(/[a-zA-Z]/.test(pwd16)).toBe(true);
    expect(/[0-9]/.test(pwd16)).toBe(true);
  });

  it("lança erro para length 3", () => {
    expect(() => generateTempPassword(3)).toThrow("length mínimo 4");
  });
});
