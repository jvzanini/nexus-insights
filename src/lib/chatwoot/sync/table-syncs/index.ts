import { accountUsersSync } from "./account-users";
import { contactsSync } from "./contacts";
import { conversationsSync } from "./conversations";
import { inboxesSync } from "./inboxes";
import { messagesSync } from "./messages";
import { reportingEventsSync } from "./reporting-events";
import { taggingsSync } from "./taggings";
import { teamMembersSync } from "./team-members";
import { teamsSync } from "./teams";
import { usersSync } from "./users";
import type { TableSync } from "../types";

/**
 * Registry de todas as tabelas que o polling delta sincroniza.
 *
 * Ordem importa: tabelas que outras dependem ficam antes
 * (ex: inboxes antes de conversations; teams antes de team_members).
 *
 * Para adicionar uma tabela nova: criar arquivo em ./<table-name>.ts,
 * importar acima, adicionar no array.
 */
export const TABLE_SYNCS: readonly TableSync[] = [
  inboxesSync,
  teamsSync,
  teamMembersSync,
  usersSync,
  accountUsersSync,
  contactsSync,
  conversationsSync,
  messagesSync,
  reportingEventsSync,
  taggingsSync,
];
