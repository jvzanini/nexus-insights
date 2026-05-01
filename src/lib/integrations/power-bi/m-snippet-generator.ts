/**
 * Gera snippets Power Query M pra colar no Power BI Desktop / Service.
 *
 * Cada snippet conecta a uma view derivada específica do perfil. NÃO inclui
 * senha inline — Power BI usa form Authentication; o usuário cola user e
 * senha em campos separados na primeira conexão (depois ficam armazenados
 * pelo PG do Windows credential manager).
 *
 * Strings em M usam aspas duplas — escapamos `"` interno como `""`.
 */

export interface MSnippetInput {
  host: string;
  port: number;
  database: string;
  viewName: string;
}

function escapeMString(s: string): string {
  return s.replace(/"/g, '""');
}

export function generateMSnippet(input: MSnippetInput): string {
  const host = escapeMString(input.host);
  const database = escapeMString(input.database);
  const viewName = escapeMString(input.viewName);
  return `let
    Source = PostgreSQL.Database(
        "${host}:${input.port}",
        "${database}",
        [Query="SELECT * FROM powerbi.${viewName}"]
    )
in
    Source`;
}

export interface ProfileSnippetInput {
  host: string;
  port: number;
  database: string;
  views: string[];
}

export interface ProfileSnippet {
  viewName: string;
  snippet: string;
}

export function generateMSnippetsForProfile(input: ProfileSnippetInput): ProfileSnippet[] {
  return input.views.map((viewName) => ({
    viewName,
    snippet: generateMSnippet({
      host: input.host,
      port: input.port,
      database: input.database,
      viewName,
    }),
  }));
}
