# Chelly Shop ✨

Loja de cosméticos, perfumes e essências com entrega em **Rio Branco — AC**.
Catálogo em tempo real no Firebase Firestore, pedido fechado pelo WhatsApp e
pagamento por Pix (QR Code gerado no próprio aparelho).

Instala no celular como aplicativo (PWA), funciona offline, é otimizada para
aparelho fraco e conexão ruim, e está pronta para monetizar com Google AdSense.

---

## Começar agora

```bash
npm install     # instala as dependências
npm run dev     # sobe em http://localhost:5173
```

```bash
npm run build   # gera dist/ (com service worker, manifest e ícones)
npm run preview # serve o build localmente em http://localhost:4173
```

Outros comandos:

```bash
npm test                      # 68 testes das regras do negócio (Node, sem dependência extra)
npm run typecheck             # checagem de tipos (tsc --noEmit)
npm run verify                # typecheck + testes + build (use antes de publicar)
npm run icons                 # regenera os ícones do app
npm run audit                 # checa vulnerabilidade em dependência de produção
```

### Testes

```bash
npm test
```

`scripts/run-tests.mjs` compila os testes com o esbuild (que já vem com o
Vite) e roda com o `node:test` nativo — **nenhuma dependência nova** foi
adicionada ao projeto. O que está coberto:

| Arquivo | O que garante |
|---|---|
| `scripts/tests/sanitize.test.ts` | filtro de XSS (inclusive tag reconstruída), limites de tamanho, chave Pix, URL segura, categoria válida |
| `scripts/tests/format.test.ts` | moeda/data em pt-BR, desconto, link do WhatsApp, `toDate` com `Timestamp` do Firestore |
| `scripts/tests/pix.test.ts` | payload Pix válido de ponta a ponta: TLV EMV + CRC16-CCITT calculado de forma independente |
| `scripts/tests/security.test.ts` | comparação de senha em tempo constante, honeypot, política de bloqueio, e nada lança erro fora do navegador |
| `scripts/tests/store.test.ts` | normalização do documento do Firestore, busca sem acento, filtros, ordenação (sem alterar a lista original) e destaques |

Para adicionar um teste: crie `scripts/tests/<nome>.test.ts` importando de
`../../src/...` e rode `npm test` de novo. O runner pega o arquivo sozinho.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Interface | React 19 + TypeScript (strict) |
| Estilo | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Animação | framer-motion |
| Banco | Firebase Firestore (tempo real) |
| Build | Vite 7 |
| App instalável | `vite-plugin-pwa` + Workbox 7 (service worker próprio) |
| QR Code Pix | `qrcode.react` |
| Ícones | `lucide-react` |

---

## Estrutura

```
index.html                    SEO, CSP, Open Graph, JSON-LD, CSS crítico
vite.config.ts                build, code-splitting, manifest do PWA
public/
  robots.txt                  rastreamento + sitemap
  sitemap.xml                 home, categorias e ofertas
  ads.txt                     autorização do AdSense (preencher!)
  offline.html                página exibida sem conexão
  .well-known/security.txt    reporte responsável de falha
  icons/                      ícones do app (gerados por scripts/)
scripts/
  generate-icons.mjs          gera os PNG/SVG do app sem dependência externa
  run-tests.mjs               compila e roda os testes com node:test
  tests/                      68 testes das regras do negócio
src/
  main.tsx                    boot: monta o React, remove o loader, carrega fonte
  App.tsx                     container: estado, dados, handlers (sem JSX pesado)
  sw.ts                       service worker (cache offline + atualização)
  index.css                   design system (tokens, componentes, acessibilidade)
  types.ts                    tipos de domínio
  config/
    site.ts                   nome, domínio, categorias, valores padrão
    ads.ts                    configuração do AdSense
  data/
    store.ts                  leitura do Firestore + hooks + filtro/ordenação
    writes.ts                 escrita no Firestore, validada
  hooks/
    useUrlState.ts            categoria/busca/produto refletidos na URL
    useSeo.ts                 title, description, canonical e JSON-LD dinâmicos
  utils/
    firebase.ts               credenciais e inicialização (não alterado)
    sanitize.ts               filtro de XSS, limites e validação
    format.ts                 moeda, data, Pix, WhatsApp, compressão de imagem
    security.ts               rate limit, sessão admin, honeypot, diagnóstico
    auth.ts                   login do painel (sem senha no bundle)
    seo.ts                    schemas schema.org + escrita no <head>
    adsense.ts                carregamento do SDK
    pwa.ts                    instalação, offline, perfil do aparelho
    storage.ts                localStorage seguro (não quebra em modo anônimo)
    cn.ts                     fusão de classes Tailwind
  components/
    ads/AdSlot.tsx            bloco de anúncio (preguiçoso, sem CLS)
    ui/                       Modal, Toast, ErrorBoundary, Skeleton, Logo, Timer
    shop/                     Navbar, HeroBanner, ProductCard, ProductGrid,
                              CartSidebar, ProductModal, MeAviseModal,
                              AdminLoginModal, PolicyModal, Support, Footer
    admin/AdminPanel.tsx      painel (carregado sob demanda)
    app/                      InstallPrompt, StatusBanner, FloatingActions
```

**Regra de dependência:** `components` → `data`/`hooks` → `utils`/`config`.
Nunca ao contrário. Isso mantém os componentes apresentacionais e testáveis.

---

## Documentação

| Documento | Para que serve |
|---|---|
| [`SEGURANCA.md`](SEGURANCA.md) | **Leia primeiro.** O que foi corrigido, e as Security Rules do Firestore que só você pode aplicar |
| [`PERFORMANCE.md`](PERFORMANCE.md) | O que estava lento, o que mudou, como medir |
| [`APP-CELULAR.md`](APP-CELULAR.md) | Como instalar no celular (Android, iPhone, desktop) |
| [`SEO.md`](SEO.md) | Como aparecer no Google — passo a passo com Search Console |
| [`MONETIZACAO.md`](MONETIZACAO.md) | Como ligar o AdSense e quanto esperar de receita |

---

## Configuração

Crie um `.env` na raiz (modelo em [`.env.example`](.env.example)):

```bash
VITE_SITE_URL=https://seudominio.com.br     # canonical, sitemap, Open Graph
VITE_ADSENSE_CLIENT=ca-pub-0000000000000000 # vazio = anúncios desligados
VITE_INSTAGRAM_URL=https://instagram.com/…  # vazio = botão não aparece
```

> Tudo com prefixo `VITE_` vai para o bundle **público**. Nunca coloque senha
> ou chave privada aí.

### Dados da loja (Firestore)

A loja lê dois documentos. **A estrutura não mudou** — se já existe, continua
funcionando:

```
settings/config
  pix_key      : string   chave Pix (telefone, CPF/CNPJ, e-mail ou EVP)
  whatsapp     : string   número com DDD
  store_name   : string   nome exibido no recebedor do Pix
  store_city   : string   cidade exibida no Pix

settings/admin
  password     : string   senha do painel (troque por uma forte!)

products/{id}
  name, price, discountPrice, stock, category,
  description, image, rating, comments[],
  createdAt, updatedAt, hidden

demands/{id}
  product, productId, user, whatsapp, date, createdAt
```

> `src/utils/firebase.ts` (credenciais e inicialização) **não foi alterado**.

---

## Publicar

O build gera uma pasta `dist/` estática — serve em qualquer hospedagem.

**Vercel** (mais simples):

```bash
npm i -g vercel
vercel            # preview
vercel --prod     # produção
```

Framework: *Vite* · Build: `npm run build` · Output: `dist`

**Netlify:** arraste a pasta `dist` em <https://app.netlify.com/drop>, ou conecte
o repositório com os mesmos comandos.

**GitHub Pages:**

```bash
npm run build
npx gh-pages -d dist
```

> Se publicar em subpasta (`usuario.github.io/repo`), adicione
> `base: '/repo/'` em `vite.config.ts` — sem isso os assets dão 404.

### Depois de publicar

1. **HTTPS é obrigatório** para o app instalar e o offline funcionar (Vercel,
   Netlify e GitHub Pages já dão certificado de graça).
2. Troque o domínio em `index.html`, `public/robots.txt`, `public/sitemap.xml`
   e `public/.well-known/security.txt`.
3. Aplique as Security Rules — veja [`SEGURANCA.md`](SEGURANCA.md).
4. Cadastre no [Google Search Console](https://search.google.com/search-console)
   e envie o sitemap — veja [`SEO.md`](SEO.md).
5. Adicione os cabeçalhos de segurança da sua hospedagem (exemplos prontos em
   [`SEGURANCA.md`](SEGURANCA.md), item 7).

---

## Boas práticas adotadas

**Código**

- TypeScript `strict`, sem `any` no domínio (só em fronteiras externas tratadas)
- Arquivo máximo ~400 linhas; o `App.tsx` de 1.688 linhas foi dividido em 20+
  módulos com responsabilidade única
- Nenhum `console.log` em produção; erro tratado e comunicado ao usuário
- `ErrorBoundary` por região — uma falha no catálogo não derruba a loja inteira
- Hooks com limpeza correta (nada de listener ou timer vazando)
- Comentários explicam **por quê**, não o quê
- 68 testes nas regras críticas (Pix, sanitização, preço, ordenação) sem
  adicionar dependência ao projeto — `node:test` + esbuild que já existia

**Segurança**

- Nenhuma senha no bundle
- CSP sem `unsafe-inline` em `script-src`
- Sanitização de toda entrada, com limite de tamanho
- Rate limit com espera exponencial persistida
- Sessão administrativa que expira
- Honeypot nos formulários públicos
- `frame-ancestors 'none'` contra clickjacking
- `rel="noopener noreferrer"` em todo link externo

**Performance**

- Code-splitting por biblioteca + painel administrativo sob demanda
- Imagem com `loading="lazy"`, `width`/`height` e `fetchPriority`
- `React.memo` + `useCallback`/`useMemo` onde faz diferença
- Debounce na busca, timer com `requestAnimationFrame`
- Fonte sem bloquear a primeira pintura
- Service worker: segunda visita abre instantânea
- Modo econômico automático em aparelho fraco

**Acessibilidade**

- Um `<h1>` por tela, hierarquia correta
- `alt` em toda imagem, `aria-label` em todo botão de ícone
- `<label>` associado a todo campo
- Modal com foco preso, `Escape` fecha, foco devolvido ao abrir
- Link "Pular para o catálogo"
- `prefers-reduced-motion` respeitado
- Alvo de toque ≥ 44 px nos controles principais
- Zoom liberado (`maximum-scale=5`)

**SEO**

- HTML estático completo (o robô lê sem executar JS)
- URL, título, descrição e canonical próprios por categoria/busca/produto
- JSON-LD: `Store`, `WebSite`, `ItemList`, `Product`+`Offer`+`AggregateRating`,
  `BreadcrumbList`
- Microdata `schema.org` em cada card
- `robots.txt`, `sitemap.xml`, Open Graph e Twitter Card

**Legal / confiança**

- Política de Privacidade e Termos de Uso na loja
- Consentimento LGPD explícito no formulário de contato
- Divulgação de anúncio de terceiros quando o AdSense está ativo
- `security.txt` para reporte de vulnerabilidade
- Nome do recebedor exibido junto à chave Pix (proteção contra golpe)

---

## Problemas conhecidos

| Situação | Explicação |
|---|---|
| `npm audit` aponta 5 advisories | Todos na cadeia do **Firebase**, que foi mantido sem alteração por pedido seu. Veja `SEGURANCA.md` item 8 |
| Fotos em base64 no Firestore | Cada foto ocupa ~1 MB de documento e o Firestore cobra por leitura. Com mais de ~50 produtos vale migrar para bucket. Veja `PERFORMANCE.md` |
| iOS apaga o cache do app após 7 dias sem uso | Limitação da Apple, não da loja. Recarrega sozinho na próxima abertura |
| Login do painel exige leitura da senha no navegador | Proteção real só com Firebase Auth + Security Rules. Veja `SEGURANCA.md` item 1 (Caminho B) |

---

## Licença

Uso da Chelly Shop. Ícones de interface: [Lucide](https://lucide.dev) (ISC).
Tipografia: Playfair Display e DM Sans (SIL Open Font License).
