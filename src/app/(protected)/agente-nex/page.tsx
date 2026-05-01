import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Page(): never {
  redirect("/agente-nex/configuracao");
}
