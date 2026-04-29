'use client';

import { useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Loader2, ArrowRight, AlertCircle, Webhook } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { loginAction } from '@/app/(auth)/login/actions';

export function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard';

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await loginAction(formData, callbackUrl);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' as const }}
      className="w-full max-w-[420px] mx-auto"
    >
      {/* Logo mobile */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="mb-10 flex items-center justify-center gap-2.5 lg:hidden"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 shadow-[0_0_24px_rgba(37,99,235,0.4)]">
          <Webhook className="h-5 w-5 text-white" />
        </div>
        <span className="text-lg font-bold text-white tracking-tight">Nexus</span>
      </motion.div>

      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white tracking-tight">
          Bem-vindo de volta
        </h2>
        <p className="text-sm text-zinc-500 mt-2">
          Entre com suas credenciais para acessar o painel
        </p>
      </div>

      <form action={handleSubmit} className="space-y-5">
        {/* Erro */}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 rounded-xl border border-red-900/50 bg-red-950/30 p-3.5 text-sm text-red-400"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </motion.div>
        )}

        {/* Email */}
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm font-medium text-zinc-300">
            E-mail
          </Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="seu@email.com"
            required
            autoComplete="email"
            autoFocus
            disabled={isPending}
            className="h-12 rounded-xl border-zinc-800 bg-zinc-900/80 text-white placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all duration-200"
          />
        </div>

        {/* Senha */}
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm font-medium text-zinc-300">
            Senha
          </Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="********"
              required
              autoComplete="current-password"
              disabled={isPending}
              className="h-12 rounded-xl border-zinc-800 bg-zinc-900/80 pr-11 text-white placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600 transition-colors duration-200 hover:text-zinc-300 cursor-pointer"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        {/* Esqueci minha senha */}
        <div className="flex justify-end">
          <a
            href="/forgot-password"
            className="text-sm text-zinc-500 transition-colors duration-200 hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            tabIndex={isPending ? -1 : 0}
          >
            Esqueci minha senha
          </a>
        </div>

        {/* Botao */}
        <Button
          type="submit"
          disabled={isPending}
          className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 text-white font-semibold text-sm transition-all duration-300 hover:from-blue-500 hover:to-blue-400 hover:shadow-[0_0_24px_rgba(37,99,235,0.4)] disabled:opacity-50 cursor-pointer"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Entrando...
            </>
          ) : (
            <>
              <ArrowRight className="mr-2 h-4 w-4" />
              Entrar
            </>
          )}
        </Button>
      </form>
    </motion.div>
  );
}
