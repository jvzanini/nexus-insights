import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants/roles";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const platformRole =
    ((session.user as any)?.platformRole as keyof typeof PLATFORM_ROLE_LABELS) ??
    "viewer";
  const isOwner = (session.user as any)?.isOwner ?? false;
  const avatarUrl = (session.user as any)?.avatarUrl ?? null;

  const user = {
    id: (session.user as any)?.id ?? "",
    name: session.user.name || session.user.email || "Usuário",
    email: session.user.email || "",
    role: PLATFORM_ROLE_LABELS[platformRole] || "Usuário",
    platformRole,
    isOwner,
    avatarUrl,
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar user={user} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 pt-16 pb-8 sm:px-6 sm:pt-8 sm:pb-8 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
