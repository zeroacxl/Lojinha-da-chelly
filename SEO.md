# SEO — como a Chelly Shop aparece no Google

Guia prático do que foi implementado e do que **você precisa fazer** para a
loja começar a receber visita de busca.

---

## 1. O que estava impedindo a loja de aparecer

| Problema | Consequência |
|---|---|
| `<html lang="en">` | O Google achava que a loja era em inglês |
| Nenhuma `<meta name="description">` | O resultado da busca mostrava um trecho aleatório da página |
| Nenhum `<h1>` na página | Sem hierarquia de título o Google não sabe qual é o assunto |
| Site inteiro era **um** arquivo `.html` (single-file) | Impossível ter sitemap, service worker ou cache — ou seja, impossível ranquear bem |
| Uma única URL para tudo | Só dava para aparecer em busca por "Chelly Shop", nunca por "perfume em Rio Branco" |
| Sem Open Graph | Link compartilhado no WhatsApp aparecia sem imagem e sem descrição |
| Sem dados estruturados | Nunca apareceria preço e nota no resultado da busca |
| Sem `robots.txt` nem sitemap | O Google não sabia o que rastrear |
| Imagens sem `alt`, sem `width`/`height`, sem `loading="lazy"` | Página lenta (CLS alto) e imagens não indexáveis |

---

## 2. O que foi implementado

### HTML estático (`index.html`)

Tudo isto é lido pelo Google **sem executar JavaScript** — fundamental, porque
loja em React depende de renderização e nem sempre o robô espera.

- `lang="pt-BR"`, `geo.region="BR-AC"`, `geo.placename="Rio Branco"`
- `<title>` com palavra-chave + cidade (60 caracteres, o limite que aparece inteiro)
- `<meta name="description">` de 144 caracteres (o ideal é 140–160)
- `<meta name="keywords">` (não ranqueia, mas não atrapalha)
- `robots: index, follow, max-image-preview:large` — libera imagem grande no resultado
- `<link rel="canonical">`
- **Open Graph completo** (`og:type`, `og:title`, `og:description`, `og:url`,
  `og:image` 512×512, `og:locale=pt_BR`) → prévia bonita no WhatsApp/Facebook
- **Twitter Card** `summary_large_image`
- **JSON-LD** `Store` + `OnlineBusiness` com `areaServed`, `priceRange`,
  `paymentAccepted`, `address` → alimenta o painel de conhecimento
- **JSON-LD** `WebSite` com `SearchAction` → habilita a caixa de busca do Google
- Bloco `<noscript>` com conteúdo textual real sobre a loja

### URL para cada tela (`hooks/useUrlState.ts` + `utils/seo.ts`)

Agora existem URLs distintas, e cada uma tem título/descrição/canonical próprios:

| URL | Título gerado |
|---|---|
| `/` | Chelly Shop ✨ \| Cosméticos, Perfumes e Essências em Rio Branco |
| `/?categoria=perfumes` | Perfumes em Rio Branco \| Chelly Shop |
| `/?categoria=skincare` | Skincare em Rio Branco \| Chelly Shop |
| `/?categoria=make` | Maquiagem em Rio Branco \| Chelly Shop |
| `/?q=baunilha` | Busca por "baunilha" — Chelly Shop |
| `/?produto=abc123` | Essência Baunilha 50ml — R$ 89,90 \| Chelly Shop |

Benefícios práticos:

1. **Cada categoria é uma página** para o Google — 6 vezes mais chances de aparecer.
2. **O botão "voltar" do celular funciona** (antes fechava a loja inteira).
3. **A cliente pode mandar o link de um produto no WhatsApp** e quem receber cai
   direto naquele produto.
4. Os **atalhos do ícone do app** (perfumes / skincare / ofertas) funcionam.

### Dados estruturados dinâmicos

Além do JSON-LD estático, `utils/seo.ts` escreve em tempo de execução:

- `ItemList` com até 60 produtos do catálogo
- `Product` + `Offer` (preço, moeda, disponibilidade, validade da oferta) +
  `AggregateRating` (nota média e número de avaliações) → **rich snippet com
  estrelinhas e preço** no resultado da busca
- `BreadcrumbList` → trilha clicável ("Início › Perfumes › Produto")

E cada card de produto ainda carrega **microdata** `itemprop`
(`schema.org/Product`, `Offer`, `AggregateRating`), que funciona mesmo quando o
Google não executa o JavaScript.

### Arquivos públicos

| Arquivo | Para que serve |
|---|---|
| `public/robots.txt` | Libera rastreamento, aponta o sitemap, libera Pinterest/WhatsApp/Twitterbot, bloqueia coletores de IA e raspadores de preço (Ahrefs/Semrush) |
| `public/sitemap.xml` | Lista home + 5 categorias + página de ofertas |
| `public/.well-known/security.txt` | Reporte responsável de falhas (RFC 9116) |
| `public/ads.txt` | Obrigatório para o AdSense veicular anúncio |

### Performance (é fator de ranqueamento)

Ver `PERFORMANCE.md`. Resumo: Core Web Vitals melhorados em LCP, CLS e INP —
os três são critério oficial de posicionamento desde 2021/2024.

### Acessibilidade (impacta SEO indiretamente)

- `<h1>` único por tela, hierarquia `h1 → h2 → h3` correta
- Todo `<img>` tem `alt` descritivo (imagem de produto indexa no Google Imagens)
- Todo botão só-de-ícone tem `aria-label`
- `<label>` associado a todo campo de formulário
- `role="dialog"`, `aria-modal`, foco preso, `Escape` fecha
- Link "Pular para o catálogo" para teclado/leitor de tela
- Contraste verificado nos textos sobre fundo escuro

---

## 3. O que VOCÊ precisa fazer (nessa ordem)

### Passo 1 — Trocar o domínio (30 min, obrigatório)

O domínio padrão é `https://lojinha-da-chelly.vercel.app`. Se você publicar em
outro endereço, troque em:

1. `.env` → `VITE_SITE_URL=https://seudominio.com.br`
2. `index.html` → procure `lojinha-da-chelly.vercel.app` (canonical, Open Graph,
   Twitter Card e os dois blocos JSON-LD)
3. `public/robots.txt` → linha `Sitemap:`
4. `public/sitemap.xml` → todas as `<loc>`
5. `public/.well-known/security.txt` → `Canonical:` e `Policy:`

> Dica: o item 1 cuida de tudo que é gerado em tempo de execução. Os itens 2–5
> são HTML/arquivos estáticos, então precisam ser trocados à mão.

### Passo 2 — Google Search Console (15 min, é o que faz indexar)

1. Acesse <https://search.google.com/search-console>
2. **Adicionar propriedade** → tipo *Prefixo do URL* → cole o domínio da loja
3. Verifique (o jeito mais fácil: adicione a `<meta>` que o Google mandar no
   `<head>` do `index.html`)
4. Menu **Sitemaps** → envie `sitemap.xml`
5. Menu **Ferramenta de inspeção de URL** → cole a home → **Solicitar indexação**
6. Repita o item 5 para `/?categoria=perfumes`

Sem o Search Console o Google *pode* achar a loja sozinho, mas demora semanas.
Com ele, costuma indexar em 1–3 dias.

### Passo 3 — Google Business Profile (30 min, o maior retorno)

Para uma loja que só entrega em **uma cidade**, isto vale mais que qualquer
ajuste técnico:

1. <https://business.google.com> → cadastre "Chelly Shop"
2. Categoria: *Loja de cosméticos*
3. Área de atendimento: **Rio Branco — AC** (não precisa de endereço físico se
   você atende só delivery: marque "entrego produtos aos clientes")
4. Suba 10+ fotos reais dos produtos
5. Peça avaliação para cada cliente que comprar

Isso faz a loja aparecer no **mapa** e no pacote local, que é o que aparece no
topo quando alguém busca "cosméticos perto de mim".

### Passo 4 — Conteúdo que traz busca orgânica

O Google ranqueia texto, não vitrine. Ideias baratas e de alto retorno:

- Na descrição de cada produto, escreva **3–4 frases** de verdade: para que
  serve, como usar, quanto dura, qual a fixação. O campo já existe no painel
  admin e agora é indexado (`itemprop="description"`).
- Nomes de produto descritivos: `Essência Baunilha 50ml — fixação 8h` ranqueia
  muito melhor que `Perfume 1`.
- Peça avaliação: cada avaliação é conteúdo novo indexável e gera estrelinha no
  resultado da busca.

### Passo 5 — Medir

- **Search Console** → *Desempenho*: cliques, impressões e as buscas que já
  trazem gente
- **PageSpeed Insights** (<https://pagespeed.web.dev>) → cole o domínio, veja os
  Core Web Vitals em campo (*dados reais de usuários*)
- **Rich Results Test** (<https://search.google.com/test/rich-results>) → cole a
  URL de um produto e confirme que o `Product`/`Offer` é detectado

---

## 4. Expectativa realista

| Prazo | O que acontece |
|---|---|
| Semana 1 | Indexação da home e das categorias |
| Semana 2–4 | Primeiras impressões em busca por nome da loja |
| Mês 2–3 | Começa a aparecer em "perfumes Rio Branco", "cosméticos Acre" |
| Mês 3+ | Rich snippet com preço/nota, se houver avaliações |

Busca local em cidade média é concorrência baixa — dá para chegar na primeira
página de "cosméticos Rio Branco" em poucas semanas **com o Google Business
Profile feito**. Sem ele, só o site raramente basta.

---

## 5. O que NÃO foi feito (e por quê)

- **Prerender/SSG por produto.** Seria o ideal (cada produto uma página HTML
  estática), mas exigiria mudar a arquitetura para um framework com SSR ou
  gerar HTML no build a partir do Firestore. Deixei o `?produto=` com canonical
  e JSON-LD próprios, que resolve 80% do problema sem trocar a stack.
- **Blog.** É o que mais traz busca orgânica no longo prazo, mas precisa de
  conteúdo seu. Quando quiser, dá para adicionar uma seção `/dicas` sem tocar
  na loja.
- **Hreflang.** Só faz sentido se a loja atender outro país.
