"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Users as UsersIcon } from "lucide-react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { AuthUser } from "@/lib/auth-helpers";

import { AuditsTable } from "./audits-table";
import { UsersContent } from "./users-content";

interface UsersTabsProps {
  currentUser: AuthUser;
}

export function UsersTabs({ currentUser }: UsersTabsProps) {
  const isSuperAdmin = currentUser.platformRole === "super_admin";

  if (!isSuperAdmin) {
    return (
      <UsersContent isSuperAdmin={false} currentUser={currentUser} />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="flex items-center gap-3"
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-violet-500/20 bg-violet-600/10"
          aria-hidden="true"
        >
          <UsersIcon className="h-5 w-5 text-violet-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie os usuários da plataforma e acompanhe a auditoria
          </p>
        </div>
      </motion.div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="users">
            <UsersIcon className="h-3.5 w-3.5" aria-hidden="true" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="audits">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersContent
            isSuperAdmin
            currentUser={currentUser}
            showHeader={false}
          />
        </TabsContent>

        <TabsContent value="audits">
          <AuditsTable />
        </TabsContent>
      </Tabs>
    </motion.div>
  );
}
