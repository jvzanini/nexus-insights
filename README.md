# Nexus AI — Roteador de Webhooks

Plataforma interna de roteamento inteligente de webhooks da Meta (WhatsApp Cloud API). Recebe, filtra e distribui eventos para multiplos destinos com confiabilidade, retry automatico e monitoramento em tempo real.

## Funcionalidades

- **Roteamento inteligente** — Filtre por tipo de evento e distribua para multiplos destinos
- **Retry automatico** — Backoff exponencial ou fixo com recuperacao de falhas
- **Dashboard em tempo real** — Metricas, graficos e monitoramento de entregas
- **Gestao de empresas** — Multi-tenant com credenciais isoladas por empresa
- **Controle de acesso** — Hierarquia Super Admin > Admin > Gerente > Visualizador
- **Notificacoes** — Feed em tempo real via SSE (Server-Sent Events)
- **Logs detalhados** — Consulta com paginacao cursor-based e filtros avancados
- **Reenvio de webhooks** — Reprocesse entregas com falha em um clique
- **Perfil de usuario** — Avatar, nome, email com verificacao, senha, tema
- **Temas** — Dark mode, light mode e modo sistema
- **Responsivo** — Otimizado para desktop, tablet e mobile

## Stack Tecnica

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Next.js 14+ (App Router, Server Components, Server Actions) |
| Linguagem | TypeScript |
| Estilo | Tailwind CSS + shadcn/ui (base-ui) + Framer Motion |
| Autenticacao | NextAuth.js v5 (JWT stateless) |
| Banco de dados | PostgreSQL 16 |
| Cache/Fila | Redis 7 + BullMQ |
| ORM | Prisma v7 |
| Graficos | Recharts |
| Email | Resend |
| Icones | Lucide React |
| Temas | next-themes |
| Deploy | Docker Swarm via Portainer |
| CI/CD | GitHub Actions |
| Registry | GitHub Container Registry (ghcr.io) |

## Arquitetura

```
                    ┌─────────────────┐
  Meta Webhook ────>│  Next.js API     │
                    │  /api/webhook/:key│
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Redis + BullMQ │
                    │   (fila)         │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Worker         │
                    │   (processador)  │
                    └────────┬────────┘
                             │
               ┌─────────────┼─────────────┐
               ▼             ▼             ▼
          Destino A     Destino B     Destino N
```

## Infraestrutura

4 containers Docker via Docker Swarm Stack:

| Container | Servico |
|-----------|---------|
| `app` | Next.js (frontend + API + worker) |
| `db` | PostgreSQL 16 |
| `redis` | Redis 7 |
| `worker` | BullMQ job processor |

## Setup Local

```bash
# Clone
git clone https://github.com/jvzanini/nexus-roteador-webhook.git
cd nexus-roteador-webhook

# Dependencias
npm install

# Variaveis de ambiente
cp .env.example .env
# Edite .env com suas credenciais

# Prisma
npx prisma generate
npx prisma db push

# Dev
npm run dev
```

## Deploy

O deploy e automatico via GitHub Actions:

1. Push na branch `main`
2. GitHub Actions executa build + testes
3. Imagem Docker publicada no GHCR
4. Deploy automatico no Portainer (Docker Swarm Stack)

**URL de producao:** https://roteadorwebhook.nexusai360.com

## Estrutura do Projeto

```
src/
├── app/
│   ├── (auth)/           # Login, esqueci senha, reset, verificacao email
│   ├── (protected)/      # Dashboard, empresas, usuarios, settings, perfil
│   └── api/              # Webhook ingest, health check, auth
├── components/
│   ├── dashboard/        # Stats, graficos, filtros, entregas recentes
│   ├── layout/           # Sidebar, notification bell
│   ├── login/            # Branding, formulario login
│   ├── providers/        # ThemeProvider, SessionProvider
│   ├── routes/           # Cards de rota, formularios, lista
│   └── ui/               # Componentes base (shadcn + CustomSelect)
├── lib/
│   ├── actions/          # Server Actions (company, credential, dashboard, logs, etc.)
│   └── constants/        # Eventos WhatsApp, configuracoes
└── generated/            # Prisma client gerado
```

## Versionamento

Este projeto segue commits semanticos em portugues:

- `feat:` — Nova funcionalidade
- `fix:` — Correcao de bug
- `docs:` — Documentacao
- `refactor:` — Refatoracao sem mudanca de comportamento

## Licenca

Projeto interno — NexusAI360 &copy; 2026. Todos os direitos reservados.
