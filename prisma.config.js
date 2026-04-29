// CommonJS config — carregado direto pelo `prisma` sem precisar de ts-node.
// O equivalente em TS está em prisma.config.ts (usado pelo dev workflow local).
module.exports = {
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
};
