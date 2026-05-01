/**
 * Catálogo estático das integrações suportadas pelo Nexus Insights.
 *
 * O hub `/integracoes` lê este registry para renderizar os cards. Apenas
 * Power BI está disponível na v0.17.0; demais entradas são placeholders
 * "Em breve" para sinalizar roadmap.
 *
 * Ícones: nomes de Lucide React. O Server Component
 * `IntegrationsHubCard` resolve o nome → componente via ICON_MAP.
 */

export type IntegrationKind =
  | "power_bi"
  | "looker_studio"
  | "tableau"
  | "excel"
  | "webhook";

export type IntegrationLucideIcon =
  | "BarChart3"
  | "TrendingUp"
  | "PieChart"
  | "Sheet"
  | "Webhook";

export interface IntegrationDescriptor {
  kind: IntegrationKind;
  label: string;
  vendor: string;
  description: string;
  href: string | null;
  status: "available" | "coming_soon";
  icon: IntegrationLucideIcon;
}

export const INTEGRATIONS: IntegrationDescriptor[] = [
  {
    kind: "power_bi",
    label: "Power BI",
    vendor: "Microsoft",
    description:
      "Conecte o Nexus Insights ao Power BI Desktop ou Service.",
    href: "/integracoes/power-bi",
    status: "available",
    icon: "BarChart3",
  },
  {
    kind: "looker_studio",
    label: "Looker Studio",
    vendor: "Google",
    description: "Conexão direta a PostgreSQL.",
    href: null,
    status: "coming_soon",
    icon: "TrendingUp",
  },
  {
    kind: "tableau",
    label: "Tableau",
    vendor: "Salesforce",
    description: "Servidor PostgreSQL.",
    href: null,
    status: "coming_soon",
    icon: "PieChart",
  },
  {
    kind: "excel",
    label: "Excel / CSV",
    vendor: "Microsoft",
    description: "Export agendado.",
    href: null,
    status: "coming_soon",
    icon: "Sheet",
  },
  {
    kind: "webhook",
    label: "Webhooks",
    vendor: "HTTP genérico",
    description: "Eventos em tempo real.",
    href: null,
    status: "coming_soon",
    icon: "Webhook",
  },
];
