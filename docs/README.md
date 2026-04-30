# Documentação — Nexus Insights

> Plataforma BI sobre o atendimento Chatwoot. Em produção: https://insights.nexusai360.com (v0.7.0).
> Cliente: Matrix Fitness Group.

## Onde encontrar o quê

### `STATUS.md`
**Comece aqui** se for retomar o trabalho. Tem o estado atual da plataforma, o que está em produção, e o que vem na próxima release. Atualizado a cada release.

### `discovery/`
Documentos da fase inicial (descoberta de dados Chatwoot, decisões consolidadas). Histórico — não consultar para trabalho novo.

### `runbooks/`
Procedimentos operacionais. Consultar quando for executar uma operação:
- **`deploy.md`** — fluxo de deploy automático (GHCR + Portainer Swarm). **LER ANTES de mexer em CI/CD.**
- `webhook-routing-cutover.md` — herdado do Roteador (provavelmente obsoleto aqui).
- `embedded-signup-setup.md` — herdado do Roteador (provavelmente obsoleto aqui).

### `superpowers/`
Trabalho metodológico (skill superpowers). Estrutura:
- **`specs/`** — design specs por release (uma por versão). Visão "o que/por quê".
- **`plans/`** — implementation plans por release. Visão "como, passo a passo".
- **`brainstorms/`** — exploração de ideias antes de virar spec. Pode haver ideias que nunca virarão spec.

### `CHANGELOG.md` (raiz do projeto)
Histórico legível de mudanças por release.

### `CLAUDE.md` (raiz do projeto)
Regras supremas do projeto — idioma, skills obrigatórias, double-check, padrão Roteador, deploy. **Sempre respeitada por Claude em qualquer sessão.**

---

## Próximo trabalho (v0.8.0)

`docs/superpowers/brainstorms/2026-04-30-novos-relatorios.md` — catálogo de 52 ideias de relatórios novos categorizadas (A-J). Top 5 propostos para a v0.8.0; aguardando aprovação do João para fechar escopo.
