"use client";

import { motion } from "framer-motion";
import {
  BarChart3,
  Filter,
  Activity,
  ArrowRight,
} from "lucide-react";
import Image from "next/image";

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.3 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: "easeOut" as const },
  },
};

const features = [
  {
    icon: BarChart3,
    color: "text-violet-400",
    bgColor: "bg-violet-500/10 border-violet-500/20",
    title: "Visão completa do atendimento",
    description:
      "Volume, tempos de resposta, ranking de atendentes e backlog em tempo quase real.",
  },
  {
    icon: Filter,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10 border-blue-500/20",
    title: "Filtros cruzados em tudo",
    description:
      "Estado × departamento × atendente × período × status. Resposta instantânea.",
  },
  {
    icon: Activity,
    color: "text-emerald-400",
    bgColor: "bg-emerald-500/10 border-emerald-500/20",
    title: "Atualização automática",
    description:
      "Painéis ao vivo se atualizam sozinhos, e você decide a cadência ideal.",
  },
];

export function LoginBranding() {
  return (
    <div className="relative hidden h-full flex-col justify-between overflow-hidden p-12 lg:flex">
      <div className="absolute inset-0 bg-[#09090b]" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -left-20 -top-20 h-[600px] w-[600px] rounded-full bg-violet-600/10 blur-[120px]" />
        <div className="absolute -bottom-20 -right-20 h-[500px] w-[500px] rounded-full bg-purple-600/10 blur-[120px]" />
        <div className="absolute top-1/3 left-1/3 h-[400px] w-[400px] rounded-full bg-violet-500/5 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255,255,255,.4) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10"
      >
        <div className="flex items-center gap-3">
          <Image
            src="/logo-nexus-ai.png"
            alt="Nexus AI"
            width={44}
            height={44}
            className="rounded-[22%] shadow-[0_0_24px_rgba(124,58,237,0.4)]"
          />
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Nexus AI
            </h1>
            <p className="text-xs text-zinc-500">Insights</p>
          </div>
        </div>
      </motion.div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative z-10 space-y-10"
      >
        <motion.div variants={itemVariants} className="space-y-4">
          <h2 className="text-4xl font-bold text-white tracking-tight leading-tight">
            Relatórios e insights
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-purple-400">
              dos atendimentos.
            </span>
          </h2>
          <p className="text-base text-zinc-400 max-w-md leading-relaxed">
            Plataforma de visualização e análise da operação Chatwoot da Matrix
            Fitness Group. Acompanhe cada conversa, atendente e estado.
          </p>
        </motion.div>

        <div className="space-y-4">
          {features.map((feature) => (
            <motion.div
              key={feature.title}
              variants={itemVariants}
              className="group flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-300"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${feature.bgColor}`}
              >
                <feature.icon className={`h-5 w-5 ${feature.color}`} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-zinc-200">
                    {feature.title}
                  </p>
                  <ArrowRight className="h-3 w-3 text-zinc-600 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                </div>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 1.2 }}
        className="relative z-10"
      >
        <p className="text-xs text-zinc-600">
          Nexus AI &copy; {new Date().getFullYear()}. Todos os direitos
          reservados.
        </p>
      </motion.div>
    </div>
  );
}
