#!/usr/bin/env node
/**
 * Runner de testes da Chelly Shop.
 *
 * Por que um runner próprio em vez de Jest/Vitest?
 *  - O projeto não tinha nenhuma dependência de teste e adicionar uma traz
 *    mais 300 pacotes (e mais advisories em `npm audit`).
 *  - O Node 20+ já vem com `node:test` e `node:assert`, que cobrem tudo o que
 *    precisamos para testar as regras puras da loja.
 *  - Só falta um passo: compilar TypeScript e resolver imports sem extensão
 *    (o padrão do Vite). O esbuild, que já é dependência do Vite, faz isso.
 *
 * O que ele faz:
 *   1. compila cada `scripts/tests/*.test.ts` para um `.mjs` em node_modules/.cache
 *   2. roda `node --test` em cima de todos eles
 *   3. sai com código 1 se qualquer teste falhar
 *
 * Uso:  npm test
 */
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TEST_DIR = join(ROOT, 'scripts', 'tests');
const OUT_DIR = join(ROOT, 'node_modules', '.cache', 'chelly-tests');

/**
 * Plugin que resolve imports de TypeScript sem extensão.
 *
 * `import x from './sanitize'` é válido para o Vite/bundler, mas o Node exige
 * a extensão real. Aqui completamos com `.ts` / `.tsx` / `/index.ts`.
 */
const resolveTsExtensions = {
  name: 'resolve-ts-extensions',
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^\.{1,2}\// }, async (args) => {
      const base = resolve(args.resolveDir, args.path);
      const candidates = [
        `${base}.ts`,
        `${base}.tsx`,
        join(base, 'index.ts'),
        join(base, 'index.tsx'),
      ];
      for (const candidate of candidates) {
        try {
          const resolved = await pluginBuild.resolve(pathToFileURL(candidate).href, {
            kind: 'import-statement',
            resolveDir: args.resolveDir,
          });
          if (resolved.path) return resolved;
        } catch {
          /* tenta o próximo candidato */
        }
      }
      return undefined; // deixa o esbuild resolver do jeito dele
    });
  },
};

async function main() {
  const files = readdirSync(TEST_DIR)
    .filter((f) => f.endsWith('.test.ts'))
    .sort();

  if (files.length === 0) {
    console.error('Nenhum arquivo *.test.ts em scripts/tests/');
    process.exit(1);
  }

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`Compilando ${files.length} arquivo(s) de teste…`);

  await build({
    entryPoints: files.map((f) => join(TEST_DIR, f)),
    outdir: OUT_DIR,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outExtension: { '.js': '.mjs' },
    plugins: [resolveTsExtensions],
    /**
     * O SDK do Firebase traz dependências em CommonJS (@grpc/grpc-js) que usam
     * `require()` internamente. Num pacote ESM o `require` não existe, então
     * criamos um a partir do próprio loader do Node. Sem isso o teste de
     * `src/data/store.ts` (que importa o Firestore) nem chega a rodar.
     *
     * Já `import.meta.env` é uma convenção do Vite: no build de produção ele
     * substitui cada `import.meta.env.VITE_X` pelo valor literal, então o
     * código publicado não depende disto. Aqui, para o teste rodar fora do
     * Vite, criamos o objeto a partir das variáveis de ambiente do Node.
     */
    banner: {
      js: [
        "import { createRequire as __chellyCreateRequire } from 'node:module';",
        'const require = __chellyCreateRequire(import.meta.url);',
        'import.meta.env ??= Object.assign(Object.create(null), process.env, { MODE: "test", DEV: false, PROD: true });',
      ].join('\n'),
    },
    // Mantém legível para a mensagem de erro apontar a linha certa.
    sourcemap: 'inline',
    logLevel: 'warning',
  });

  const targets = files.map((f) => join(OUT_DIR, f.replace(/\.ts$/, '.mjs')));

  const result = spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...targets], {
    stdio: 'inherit',
    cwd: ROOT,
  });

  process.exit(result.status ?? 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
