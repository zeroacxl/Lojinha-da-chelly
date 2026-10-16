# Performance e "rodar em qualquer aparelho"

O que mudou, quanto custava antes, e como medir.

---

## 1. O resultado do build

```
dist/manifest.webmanifest                  1.49 kB
dist/index.html                           13.80 kB │ gzip:  4.5 kB
dist/assets/index-*.css                   71.1 kB │ gzip: 12.2 kB
dist/assets/vendor-BXWtuYvb.js             3.05 kB │ gzip:  1.2 kB
dist/assets/vendor-workbox-*.js            5.72 kB │ gzip:  2.4 kB
dist/assets/vendor-icons-*.js              9.69 kB │ gzip:  4.0 kB
dist/assets/vendor-qrcode-*.js            16.46 kB │ gzip:  6.2 kB
dist/assets/AdminPanel-*.js               21.80 kB │ gzip:  6.8 kB  ← só baixa quem abre o painel
dist/assets/vendor-motion-*.js           128.41 kB │ gzip: 42.2 kB
dist/assets/index-*.js                   139.32 kB │ gzip: 42.7 kB
dist/assets/vendor-react-*.js            218.49 kB │ gzip: 68.6 kB
dist/assets/vendor-firebase-*.js         260.38 kB │ gzip: 81.8 kB
```

**JavaScript baixado na primeira visita: ~197 KB gzip**
(`index` + `vendor-react` + `vendor-motion` + `vendor-icons` + `vendor-firebase`
+ `vendor-qrcode` + miudezas). O painel administrativo (6,8 KB gzip) só é
baixado se alguém abrir o painel.

Na **segunda visita em diante**: 0 KB de rede para o app inteiro — o service
worker serve tudo do cache.

> O `vendor-firebase` (81,8 KB gzip) é a maior fatia e não foi tocado, porque
> você pediu para não mexer no Firebase. Se um dia quiser cortar, dá para usar
> só `firebase/firestore/lite` (~40% menor) em troca de perder o tempo real.

---

## 2. O que estava deixando lento

### 2.1 Um arquivo de 1.688 linhas que renderizava inteiro

`App.tsx` tinha a vitrine, o carrinho, três modais e o painel administrativo no
mesmo componente, com ~35 `useState`. Consequência: **qualquer** mudança de
estado — uma tecla na busca, o timer do banner, o scroll — re-executava a
função inteira e re-renderizava a página toda, incluindo os 40 cards.

**Correção:** App virou container (estado + dados). Apresentação foi para
`src/components/*`, e cada card é `React.memo` recebendo handlers estáveis
(`useCallback`) e derivados memoizados (`useMemo`). Digitar na busca agora
re-renderiza só o campo e a grade filtrada, com debounce de 250 ms.

### 2.2 O "GuardBot" rodando `debugger` todo segundo

```js
// como estava
const interval = setInterval(() => {
  const start = Date.now();
  debugger;                       // ← força checagem de breakpoint, sempre
  if (Date.now() - start > 100) { ... }
}, 1000);
```

Além disso, outro `setInterval` varria `window` procurando variáveis suspeitas
a cada 2 s. Em Android de entrada isso é CPU queimada à toa, para sempre, sem
ganho nenhum de segurança (ver `SEGURANCA.md`).

**Correção:** removido. O monitoramento que sobrou é passivo (roda uma vez).

### 2.3 Build em arquivo único

`vite-plugin-singlefile` colocava CSS + JS + React + Firebase **dentro do
HTML**. Resultado:

- nada podia ser cacheado separadamente (mudou uma linha → o cliente baixa tudo);
- impossível ter service worker, manifest ou code-splitting;
- impossível o app instalar no celular.

**Correção:** plugin removido. Build com `manualChunks` separando React,
Firebase, animação, ícones e QR Code — quem já visitou baixa só o que mudou.

### 2.4 `toDataURL` chamado 8 vezes por foto

O compressor de imagem testava 7 qualidades diferentes em sequência, cada uma
gerando um base64 completo da imagem de 1400 px.

**Correção:** tenta a qualidade alta primeiro; se estourar o orçamento, faz
**busca binária** (5 iterações no pior caso, e cada uma só quando precisa).
Também libera o `ObjectURL` em caso de erro (antes vazava memória) e rejeita
arquivo >25 MB ou que não seja imagem antes de decodificar.

### 2.5 Timer do banner reiniciando o React a cada segundo

`setInterval` com `setState` → 60 re-renders/minuto da árvore inteira do
banner, mesmo com a aba escondida.

**Correção:** `requestAnimationFrame` + comparação do segundo (só chama
`setState` quando o número na tela muda) + pausa quando a aba fica invisível.

### 2.6 Todas as fotos baixando de uma vez

As imagens ficam em **base64 dentro do Firestore** — cada uma com até 800 KB.
Com 20 produtos eram até 16 MB baixados na abertura, tudo em paralelo.

**Correção:** `loading="lazy"` + `decoding="async"` em tudo, e `eager` +
`fetchPriority="high"` apenas nas 5 primeiras. O navegador só baixa o que está
perto da viewport. Em 4G isso é a diferença entre abrir em 2 s e em 20 s.

### 2.7 Fontes bloqueando a primeira pintura

Duas famílias com **todos os pesos** (`300;400;500;700;900` + itálicos) em um
`<link rel="stylesheet">` síncrono no `<head>`: o navegador não pintava nada
até baixar o CSS do Google.

**Correção:** só os pesos realmente usados (`400;500;700` + `700;900` itálico),
e a folha é injetada em `requestIdleCallback` depois da primeira pintura. O
texto aparece na hora com a fonte do sistema e troca suavemente (`display=swap`).
O `preconnect` para `fonts.gstatic.com` continua, então a troca é quase
imperceptível.

> Não usamos o truque clássico `media="print" onload="this.media='all'"` porque
> handler inline é bloqueado pela nossa CSP — e com razão, é o mesmo mecanismo
> do XSS. O resultado é o mesmo, sem abrir exceção na política.

### 2.8 Tela branca enquanto o React carregava

**Correção:** o `index.html` já vem com a tela de carregamento pintada em CSS
crítico inline (logo, título, barra animada). O `main.tsx` remove esse bloco
quando o React monta. FCP imediato, sem flash branco.

---

## 3. "Rodar em qualquer aparelho"

### Compatibilidade

| Configuração | Valor | Alcança |
|---|---|---|
| `build.target` | `es2019` | Android 6+, iOS 12+, Chrome 63+, Safari 12+, Firefox 62+ |
| `build.cssTarget` | `chrome63` | CSS sem sintaxe que navegador antigo não entende |
| `<meta viewport>` | `width=device-width, initial-scale=1, maximum-scale=5, viewport-fit=cover` | Zoom liberado (acessibilidade) + notch do iPhone |

Cuidados específicos no código:

- **`normalize('NFD')` protegido por try/catch** — busca sem acento funciona
  mesmo onde `String.prototype.normalize` falha.
- **`Intl.NumberFormat` com fallback manual** — preço sai certo em navegador
  sem `Intl` completo.
- **`toDataURL('image/webp')` com detecção** — se o navegador não suporta WebP
  (iOS antigo, Safari ≤ 13), cai para JPEG automaticamente.
- **`requestIdleCallback` com fallback para `setTimeout`** — Safari não tem.
- **`IntersectionObserver` com fallback** — sem ele, o anúncio carrega direto.
- **`navigator.onLine`, `env(safe-area-inset-*)`, `100dvh` com `100vh` antes** —
  o valor antigo vem primeiro, então navegador que não entende o novo usa o velho.
- **Nenhum optional chaining/nullish no output** — o target `es2019` rebaixa.
- **Sem `confirm()` nativo** no painel — em WebView e no app instalado ele é
  bloqueado em vários aparelhos. Trocado por confirmação em dois toques na
  própria tela.

### Modo econômico (aparelho fraco)

`getDeviceProfile()` em `src/utils/pwa.ts` detecta:

```
lowEnd = saveData (economia de dados ligada)
      || hardwareConcurrency <= 2   (2 núcleos ou menos)
      || deviceMemory <= 2          (2 GB de RAM ou menos)
      || effectiveType === '2g' / 'slow-2g'
```

Quando `lowEnd` **ou** `prefers-reduced-motion` está ativo:

- carrossel de ofertas **sem autoplay** e sem transição;
- animações dos modais reduzidas a fade simples;
- `motion-safe:` desliga o zoom das fotos no hover (CSS);
- `prefers-reduced-motion` desliga animação global (CSS).

Nenhum recurso é **removido** — só o enfeite. A loja continua completa.

### Offline

`src/sw.ts` define:

| Recurso | Estratégia | Por quê |
|---|---|---|
| Arquivos do build | **Precache** na instalação | Segunda visita abre instantâneo |
| Navegação | **NetworkFirst**, timeout de 4 s | Online pega versão nova; offline cai no cache; sem cache, `offline.html` |
| CSS/JS/fonte do domínio | **StaleWhileRevalidate** | Instantâneo e sempre atualizado em segundo plano |
| Imagem externa | **StaleWhileRevalidate**, teto de 60 entradas, `purgeOnQuotaError` | Não estoura a cota do aparelho |
| Firestore, AdSense, Analytics | **NetworkOnly** (nunca cacheado) | Não interferimos no Firebase e respeitamos política de anúncio |

`navigator.storage.persist()` é solicitado na abertura: sem isso, o sistema pode
apagar o cache do app quando o celular fica com pouco espaço.

O painel **Admin → Segurança** mostra quantos MB o app ocupa no aparelho e tem
um botão para liberar espaço.

---

## 4. Core Web Vitals

Os três são fator oficial de ranqueamento no Google.

| Métrica | O que era | O que ficou | Como |
|---|---|---|---|
| **LCP** (carregamento) | Fonte síncrona + todas as fotos em paralelo + HTML gigante | Muito menor | Fonte assíncrona, `loading="lazy"`, `fetchPriority="high"` nas 5 primeiras, CSS crítico inline, service worker |
| **CLS** (estabilidade) | Alto: foto sem dimensão, esqueleto de tamanho diferente, anúncio sem espaço reservado | ~0 | `width`/`height` + `aspect-ratio` em toda imagem, esqueleto com o mesmo tamanho do card, `minHeight` fixo no bloco de anúncio |
| **INP** (interatividade) | Re-render da página inteira por tecla | Muito menor | `React.memo` + `useCallback`/`useMemo`, debounce na busca, timer com rAF, remoção do `debugger` |
| **TBT** (JS bloqueando) | Tudo num arquivo, painel sempre carregado | Menor | Code-splitting + painel em `lazy` |

---

## 5. Como medir você mesmo

```bash
# build + relatório de tamanho
npm run build

# subir o build localmente
npm run preview
```

Depois:

1. **Lighthouse no Chrome** — F12 → aba *Lighthouse* → marque *Performance*,
   *Accessibility*, *Best Practices*, *SEO* → *Analyze*. Rode com o perfil
   "Mobile" e com "Slow 4G".
2. **PageSpeed Insights** — <https://pagespeed.web.dev> → cole a URL pública.
   A aba *Real* mostra dados de usuários de verdade (só aparece depois de algum
   tráfego).
3. **Chrome DevTools → Application → Manifest** — mostra se o app é instalável e
   aponta o que falta.
4. **DevTools → Application → Service Workers** — marque *Offline* e recarregue:
   a loja tem que abrir com o catálogo salvo.

### Metas realistas para esta loja

| Métrica | Meta |
|---|---|
| Lighthouse Performance (mobile) | ≥ 85 |
| Lighthouse Accessibility | ≥ 95 |
| Lighthouse Best Practices | ≥ 95 |
| Lighthouse SEO | 100 |
| LCP | < 2,5 s em 4G |
| CLS | < 0,1 |
| INP | < 200 ms |

> O que ainda pode pesar: **o tamanho das fotos em base64 no Firestore**. Cada
> foto de 800 KB vira ~1,07 MB de texto no documento, e o Firestore cobra
> leitura por documento. Se o catálogo passar de ~50 produtos, vale migrar as
> imagens para um bucket (Firebase Storage ou Cloudflare R2) e guardar só a URL.
> Isso corta o peso da vitrine em ~90%. **Não fiz essa mudança** porque você
> pediu para não mexer no Firebase — mas é a próxima otimização com maior
> retorno quando quiser.
