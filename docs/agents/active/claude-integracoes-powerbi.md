---
agent: claude-integracoes-powerbi
started_at: 2026-05-01T20:40-03:00
target_version: v0.17.0
status: in_progress
---

## Tópico
Novo menu "Integrações" (super_admin only) com primeira integração Power BI — ponte para que clientes integrem o banco do Nexus Chat ao Power BI. Configuração robusta de credenciais read-only dedicadas, whitelist de tabelas/colunas liberadas, perfis de autorização múltiplos, geração de connection-string + script M / DirectQuery, controle total nas mãos do super_admin.

## Arquivos que provavelmente vou tocar (criação)
- `src/app/(protected)/integracoes/page.tsx` (hub das integrações)
- `src/app/(protected)/integracoes/power-bi/page.tsx` (sub-tela Power BI)
- `src/app/(protected)/integracoes/power-bi/perfis/[id]/page.tsx` (detalhe perfil)
- `src/components/integracoes/*` (cards, forms, dialogs, table-picker, role-builder, snippet-viewer)
- `src/lib/actions/integrations.ts` + `integrations-power-bi.ts` (Server Actions)
- `src/lib/integrations/power-bi/*` (connection-string builder, M script generator, RLS rules, table catalog)
- `src/lib/integrations/registry.ts` (catálogo de integrações disponíveis)
- `prisma/schema.prisma` — novas models: `Integration`, `PowerBiProfile`, `PowerBiAccessRule`, `IntegrationCredential`, `IntegrationAuditEvent`
- `src/app/(protected)/configuracoes/page.tsx` — card "Integrações" (apenas link/status; controle total fica em /integracoes)
- `src/components/layout/sidebar.tsx` — novo item "Integrações" (super_admin only)
- `docs/runbooks/integracoes-power-bi.md`

## Arquivos compartilhados que VOU modificar
> ⚠️ CONFLITO POTENCIAL com `claude-nex-suite-refinement` (v0.16.0). Ele declarou tocar em:
> - `package.json`, `CHANGELOG.md`, `docs/STATUS.md`, `prisma/schema.prisma`, `src/app/(protected)/configuracoes/page.tsx`
>
> **Estratégia:** specs e plans agora (arquivos próprios — sem conflito). Implementação real só após o agente v0.16.0 commitar e push final. Vou rebase em cima da v0.16.0.

- `package.json` (bump 0.16.0 → 0.17.0 — depois do outro)
- `CHANGELOG.md` (release notes v0.17.0)
- `docs/STATUS.md`
- `prisma/schema.prisma` (novas models de integração)
- `src/app/(protected)/configuracoes/page.tsx` (card de "Integrações" + sessão visibility — usuário corrigiu: super_admin only, **não** usar pattern de 3 níveis)
- `src/components/layout/sidebar.tsx` (item "Integrações")

## Decisões / contexto importante
- **Visibilidade:** super_admin only (decisão final do João nesta conversa — corrigiu pedido inicial de 3 níveis).
- **Banco que Power BI vai consultar:** A definir no brainstorm — banco principal Chatwoot vs Nexus Insights interno (read-only). Recomendação técnica: rotas via banco interno + tabelas materializadas/views, NUNCA expor banco principal cru.
- **Multi-perfil:** cada perfil Power BI tem credencial própria + whitelist própria de tabelas/colunas + RLS opcional.
- **Workflow:** brainstorming → spec v1→v2→v3 → plan v1→v2→v3 → subagent-driven-development (com ui-ux-pro-max em toda task UI) → verification → code review → finishing-a-development-branch.
- **Coordenação multi-agente:** evitar tocar arquivos do outro agente até v0.16.0 estar commitada e pushada.

## Bloqueios
- Aguardando v0.16.0 do agente `claude-nex-suite-refinement` (necessário pra rebase + evitar conflito em `prisma/schema.prisma`, `package.json`, `CHANGELOG.md`, `configuracoes/page.tsx`).
- Em paralelo: trabalhar em arquivos próprios (specs/plans/research). Standby/poll dos agentes ativos a cada 5–10 min.
