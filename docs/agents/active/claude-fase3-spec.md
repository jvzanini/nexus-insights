---
agent: claude-fase3-spec
started_at: 2026-05-03T22:00-03:00
target_version: v0.38.0
status: in_progress
---

## Tópico
Spec v3 final da **Fase 3 do épico Multi-tenant Realtime — UI completa**. Não toca código fonte: apenas docs/.

## Escopo desta sessão
- Apenas spec v1→v2→v3 com double-check rigoroso (≥20 achados em cada pente fino).
- Cobre: sidebar reorg ("Bancos Nexus Chat" sub Configurações + remove "Jobs de pré-agregação"), página `/configuracoes/conexoes` rica em 4 abas (Conexões / Tempo real / Jobs / Saúde), wizard de onboarding nova empresa, polish da UI atual (last edited, test feedback, soft-delete blocked modal, mobile cards), acessibilidade (Tabs ARIA, focus management, Skeleton, Sonner), performance (scroll virtualizado, TanStack Query, SSE reconnect).
- Não-objetivos: i18n, push notifications, histórico >24h.

## Arquivos que vou tocar
- `docs/superpowers/specs/2026-05-03-multi-tenant-realtime-fase3-ui-completa-design.md` (criar v3 final)
- `docs/agents/active/claude-fase3-spec.md` (este arquivo)
- `docs/agents/HISTORY.md` (append no commit final)

## Arquivos compartilhados que VOU modificar
- `docs/agents/HISTORY.md` (append-only no commit relevante; baixíssimo risco de conflito)

## Coordenação multi-agente (snapshot)
- `claude-conversas-bugfix-v035` ativo → bug fix /relatorios/conversas (XLSX rows + filtro Documento). Escopo disjunto: meu = docs/, dele = src/components/reports/* + src/lib/reports/*.
- `claude-dashboard-conversas-chart-fix` ativo → fix gráfico Conversas dashboard. Escopo disjunto.
- `claude-multitenant-realtime-fase1` ativo (mesmo épico, fase anterior): spec/plan da Fase 1 já commitada e implementada parcial (L0+L1 em produção via v0.33). Sem overlap em arquivos: meu spec é da Fase 3.
- `claude-agente-nex-polish-v031` ativo → /agente-nex/*. Escopo disjunto.

## Decisões / contexto importante
- **UI/UX Pro Max obrigatória ANTES de detalhar layouts/cores/components.** Regra absoluta CLAUDE.md §2.2.
- **"Nexus Chat"** sempre na UI/copy. "Chatwoot" só em nomes técnicos legados.
- Versão alvo: **v0.38+** (Fase 1 = v0.33, Fase 2 = v0.36/0.37 spec em paralelo por outro agente).
- Padrão visual: Roteador Webhook Meta. Stack: Next.js 16 + Tailwind v4 + base-ui (prop `render`, NUNCA `asChild`). Sonner toast. Lucide React (ícones, sem emoji).
- JobsPanel existente em `src/components/settings/jobs-panel.tsx` (372 linhas) — base para aba Jobs (move pra `src/components/settings/nexus-chat/jobs-tab.tsx`, adiciona seleção de connection ativa).
- Página /configuracoes/conexoes nasce mínima na Fase 1; Fase 3 evolui pra rica.

## Bloqueios
- (vazio)
