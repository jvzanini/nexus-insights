# Nexus Insights — Implementation Plan (v2)

**Status:** v2 — pente-fino #1 aplicado sobre v1. Próximo: v3 final consolidada.

## Histórico de revisões
- **v1:** rascunho inicial, 9 fases.
- **v2 (este):** correções pontuais e duas regras supremas (uso de `ui-ux-pro-max` em UI; uso de `superpowers:subagent-driven-development` na execução).

## Mudanças sobre v1

### Cabeçalho — regras supremas adicionadas
Toda task que envolve UI/layout/componente: **invocar `ui-ux-pro-max:ui-ux-pro-max` ANTES de codar**. Regra inegociável.
A execução completa do plan é feita via **`superpowers:subagent-driven-development`**: um subagent fresh por task, revisão entre tasks. Cada task continua usando TDD onde aplicável.

### F0.1 — Cópia
Adicionar aviso explícito de PRESERVAR no target:
- `docs/discovery/` (existente).
- `docs/superpowers/specs/` (existente — v1, v2, v3 da spec).
- `docs/superpowers/plans/` (existente — v1, v2, v3 do plan).
- `CLAUDE.md` raiz (existente — atualizado).

Comando rsync precisa ter `--ignore-existing` em `docs/` ou listar exclusões dessas pastas:
```bash
rsync -av --progress \
  --exclude='.git' --exclude='node_modules' --exclude='.next' \
  --exclude='.env' --exclude='.env.local' --exclude='.env.production' \
  --exclude='src/generated' --exclude='dist' --exclude='build' \
  --exclude='coverage' --exclude='.DS_Store' \
  --exclude='docs/discovery' --exclude='docs/superpowers' --exclude='CLAUDE.md' \
  "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Projetos Internos/Roteador Webhook Meta/" \
  "/Users/joaovitorzanini/Developer/Claude Code/Nexus AI/Clientes/Matrix Fitness Group/Relatórios de Atendimento - Nexus Chat/"
```

### F0.2 — Limpeza
Adicionar lista do que **NÃO REMOVER** (vai ser reaproveitado integralmente):
- `src/components/ui/*` (todos os 40 primitivos).
- `src/components/providers/{session-provider,theme-provider}.tsx`.
- `src/components/layout/sidebar.tsx` (vai ser adaptado, não removido).
- `src/components/layout/breadcrumbs.tsx`.
- `src/components/login/{login-branding,login-content,login-form}.tsx` (textos serão ajustados).
- `src/lib/utils/cn.ts`, `slugify.ts`, etc.
- `src/lib/encryption.ts`, `theme.ts`, `prisma.ts`, `redis.ts`, `queue.ts`, `realtime.ts`, `audit.ts`.
- `src/auth.ts`, `auth.config.ts`, `middleware.ts`.
- `src/lib/auth-helpers.ts`.
- `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `components.json`, `tsconfig.json`, `jest.config.ts`, `eslint.config.mjs`.

### F0.6 — Auth helpers
Tornar explícito que `getCurrentUser()` faz dois `findMany` paralelos:
```typescript
const [accountAccess, teamAccess] = await Promise.all([
  prisma.userAccountAccess.findMany({ where: { userId: user.id }, select: { chatwootAccountId: true, chatwootAccountName: true } }),
  prisma.userTeamAccess.findMany({ where: { userId: user.id }, select: { chatwootAccountId: true, chatwootTeamId: true, chatwootTeamName: true } }),
]);
const accountIds = accountAccess.map(a => a.chatwootAccountId);
const teamIds = teamAccess.map(t => t.chatwootTeamId);
```

### F1.1 — Helper de fixtures de teste
Criar `src/__tests__/utils/fixtures.ts` exportando:
- `mockUser(overrides)` — base user.
- `mockOwner()` — `isOwner=true`, role=super_admin.
- `mockSuperAdmin()`, `mockAdmin(accountIds=[])`, `mockManager(accountIds=[], teamIds=[])`, `mockViewer(accountIds=[], teamIds=[])`.

Isso evita repetição em todos os testes.

### F2.5 — Worker pool dedicado
Worker tem **pool próprio** Chatwoot (`src/worker/shared/chatwoot-pool.ts`) — não compartilha com o app, evitando contenção em deploy do app.
Worker chama `withCache` apontando para o **mesmo Redis** do app (chave consistente), então pré-aquecimento popula o cache que o app vai consumir.

### F3.x — Cada relatório
Adicionar tasks comuns implícitas:
- Criar `loading.tsx` na rota.
- Criar `error.tsx` na rota.
- Criar testes da query (com pool mockado) e da server action.

### F8.2 — Stack ID
Comando completo de criação inicial:
```bash
# Carregar variáveis
source .env.production

# Construir payload
COMPOSE_CONTENT=$(jq -Rs . docker-compose.production.yml)
ENV_VARS=$(jq -n --arg dbpw "$DB_PASSWORD" --arg secret "$NEXTAUTH_SECRET" --arg key "$ENCRYPTION_KEY" '[
  {name:"DB_PASSWORD", value:$dbpw},
  {name:"NEXTAUTH_SECRET", value:$secret},
  {name:"ENCRYPTION_KEY", value:$key},
  ...
]')

# Criar stack
curl -fsSL -X POST "$PORTAINER_URL/api/stacks?type=2&method=string&endpointId=$PORTAINER_ENDPOINT_ID" \
  -H "X-API-Key: $PORTAINER_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"Name\":\"nexus-insights\",\"StackFileContent\":$COMPOSE_CONTENT,\"Env\":$ENV_VARS}"
# Capturar Id do response e gravar como secret PORTAINER_STACK_ID
```

### F9 — Limpeza pré-commit
Antes de qualquer push final, validar:
- `git status` não mostra `.env*` real.
- `docker-compose.production.yml` está em `.gitignore`.
- `git ls-files | grep -i 'env\|prod\|secret'` retorna apenas `.env.example` e arquivos seguros.

---

**Fim da v2.** Próximo: pente-fino #2 → v3 final consolidada.
