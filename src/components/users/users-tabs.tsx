"use client";

import { Users as UsersIcon, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { UsersTable } from "./users-table";
import { AuditsTable } from "./audits-table";
import type { UserListItem } from "@/lib/actions/users";
import type { AuthUser } from "@/lib/auth-helpers";

interface AccountOption {
  id: number;
  name: string;
}
interface TeamOption {
  id: number;
  name: string;
}

export function UsersTabs({
  users,
  currentUser,
  accountOptions,
  teamOptions,
}: {
  users: UserListItem[];
  currentUser: AuthUser;
  accountOptions: AccountOption[];
  teamOptions: TeamOption[];
}) {
  const isSuperAdmin = currentUser.platformRole === "super_admin";

  if (!isSuperAdmin) {
    return (
      <UsersTable
        users={users}
        currentUser={currentUser}
        accountOptions={accountOptions}
        teamOptions={teamOptions}
      />
    );
  }

  return (
    <div>
      <PageHeader
        icon={UsersIcon}
        title="Usuários"
        subtitle="Gerencie os usuários da plataforma e acompanhe a auditoria"
      />

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="users">
            <UsersIcon className="h-3.5 w-3.5" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="audits">
            <ShieldCheck className="h-3.5 w-3.5" />
            Auditoria
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users">
          <UsersTable
            users={users}
            currentUser={currentUser}
            accountOptions={accountOptions}
            teamOptions={teamOptions}
            hideHeader
          />
        </TabsContent>

        <TabsContent value="audits">
          <AuditsTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
