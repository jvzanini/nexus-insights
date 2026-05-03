import {
  ConnectionUnavailableError,
  NoActiveBindingError,
  AmbiguousBindingError,
} from "../errors";

describe("nexus-chat errors", () => {
  describe("ConnectionUnavailableError", () => {
    it("carrega connectionId e status", () => {
      const err = new ConnectionUnavailableError("uuid-123", "paused");
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("ConnectionUnavailableError");
      expect(err.connectionId).toBe("uuid-123");
      expect(err.status).toBe("paused");
      expect(err.message).toContain("uuid-123");
      expect(err.message).toContain("paused");
    });

    it("aceita status null quando connection não existe", () => {
      const err = new ConnectionUnavailableError("uuid-x", null);
      expect(err.status).toBeNull();
      expect(err.message).toContain("missing");
    });
  });

  describe("NoActiveBindingError", () => {
    it("carrega accountId no message e na propriedade", () => {
      const err = new NoActiveBindingError(42);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("NoActiveBindingError");
      expect(err.accountId).toBe(42);
      expect(err.message).toContain("42");
    });
  });

  describe("AmbiguousBindingError", () => {
    it("lista connectionIds conflitantes", () => {
      const err = new AmbiguousBindingError(7, ["a", "b"]);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe("AmbiguousBindingError");
      expect(err.accountId).toBe(7);
      expect(err.connectionIds).toEqual(["a", "b"]);
      expect(err.message).toContain("7");
      expect(err.message).toContain("a");
      expect(err.message).toContain("b");
    });
  });
});
