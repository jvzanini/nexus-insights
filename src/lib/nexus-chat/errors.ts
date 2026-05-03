/**
 * Erros customizados do domínio multi-tenant Nexus Chat.
 *
 * Cada erro carrega contexto suficiente para audit log e UX (mensagens
 * amigáveis ao super_admin). Nunca expõem secrets.
 */

export class ConnectionUnavailableError extends Error {
  constructor(
    public readonly connectionId: string,
    public readonly status: string | null,
  ) {
    super(
      `Nexus Chat connection ${connectionId} unavailable (status=${status ?? "missing"})`,
    );
    this.name = "ConnectionUnavailableError";
  }
}

export class NoActiveBindingError extends Error {
  constructor(public readonly accountId: number) {
    super(
      `No active company_chat_binding for chatwoot_account_id=${accountId}`,
    );
    this.name = "NoActiveBindingError";
  }
}

export class AmbiguousBindingError extends Error {
  constructor(
    public readonly accountId: number,
    public readonly connectionIds: string[],
  ) {
    super(
      `Ambiguous: chatwoot_account_id=${accountId} maps to ${connectionIds.length} connections (${connectionIds.join(", ")})`,
    );
    this.name = "AmbiguousBindingError";
  }
}
