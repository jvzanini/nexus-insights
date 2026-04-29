#!/usr/bin/env node
/**
 * Limpa o diretorio .next removendo arquivos de conflito do iCloud Drive
 * (arquivos/pastas com sufixo " 2", " 3", etc) antes de fazer o build.
 *
 * Sem isso, builds locais repetidos em pastas sincronizadas com iCloud
 * (ex: ~/Desktop) falham com "Directory not empty" porque o iCloud
 * recria arquivos de conflito durante o build.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const NEXT_DIR = path.join(ROOT, '.next');

/**
 * Remove recursivamente arquivos de conflito do iCloud (pattern "name N.ext"
 * ou "name N" para diretorios) dentro de um diretorio.
 */
function removeConflictFiles(dir) {
  if (!fs.existsSync(dir)) return 0;

  let count = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Detecta padrao de conflito: "name N" ou "name N.ext" onde N eh numero
    const isConflict = /\s+\d+(\.[^.]*)?$/.test(entry.name);

    if (isConflict) {
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        count++;
      } catch (err) {
        console.warn(`Nao foi possivel remover ${fullPath}: ${err.message}`);
      }
    } else if (entry.isDirectory()) {
      count += removeConflictFiles(fullPath);
    }
  }

  return count;
}

console.log('[clean-build] Removendo arquivos de conflito do iCloud...');
const conflictCount = removeConflictFiles(NEXT_DIR);
if (conflictCount > 0) {
  console.log(`[clean-build] Removidos ${conflictCount} arquivos/pastas de conflito`);
}

console.log('[clean-build] Removendo .next...');
try {
  fs.rmSync(NEXT_DIR, { recursive: true, force: true });
  console.log('[clean-build] .next removido com sucesso');
} catch (err) {
  console.error(`[clean-build] Erro ao remover .next: ${err.message}`);
  process.exit(1);
}
