export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^a-z0-9]+/g, "-")     // substitui nao-alfanumericos por hifen
    .replace(/^-+|-+$/g, "")         // remove hifens no inicio/fim
    .substring(0, 80);                // limita tamanho
}
