# Instalar no celular como aplicativo

A loja agora é um **PWA** (Progressive Web App). Isso significa que ela instala
na tela inicial do celular e abre em tela cheia, com ícone próprio, igual a um
aplicativo — **sem passar por Play Store nem App Store**, sem taxa de
desenvolvedor (a Google cobra US$ 25 e a Apple US$ 99/ano) e sem ocupar 60 MB.

---

## 1. O que a cliente ganha

| | Site comum | Chelly Shop instalada |
|---|---|---|
| Ícone na tela inicial | Não (só favorito) | **Sim**, com a marca da loja |
| Abre em tela cheia | Não (tem barra do navegador) | **Sim**, sem barra nenhuma |
| Velocidade na 2ª visita | Baixa tudo de novo | **Instantânea** (está no aparelho) |
| Funciona sem sinal | Não | **Sim** — mostra o catálogo salvo |
| Sacola ao fechar | Perde se limpar o navegador | **Não perde** |
| Espaço ocupado | — | ~1,5 MB |
| Atualização | — | Automática, avisa "Nova versão" |
| Passar por loja de app | — | **Não precisa** |

---

## 2. Como instalar (o que a loja já mostra sozinha)

A loja detecta o aparelho e mostra o caminho certo. Existem três gatilhos:

1. **Convite automático** — 12 segundos depois de abrir, aparece uma barrinha
   embaixo: *"Instale a Chelly Shop no celular"*. Se a pessoa dispensar, não
   insistimos por 7 dias.
2. **Botão na navbar** — "📲 Instalar app" (aparece quando instalar é possível).
3. **Botão no rodapé** — "Instalar no celular".

### Android (Chrome, Samsung Internet, Edge, Opera, Firefox)

Toque em **Instalar aplicativo** → confirme em **Instalar**. O ícone aparece na
tela inicial.

> O Android dispara o evento `beforeinstallprompt` e a loja usa isso para abrir
> a janela nativa de instalação com um toque.

Caminho manual, se o botão não aparecer: menu **⋮** → **Instalar aplicativo**
(ou **Adicionar à tela inicial**).

### iPhone e iPad (Safari)

A Apple **não permite** janela automática de instalação, então a loja mostra o
passo a passo com ícones:

1. No **Safari**, toque em **Compartilhar** (quadrado com seta para cima), na
   barra de baixo.
2. Role e toque em **"Adicionar à Tela de Início"**.
3. Toque em **"Adicionar"**.

O app abre em tela cheia, sem a barra do Safari.

> Importante: no iPhone tem que ser pelo **Safari**. Chrome, Instagram e o
> navegador interno do WhatsApp não têm essa opção — se a cliente chegar por um
> link do Instagram, avise para abrir no Safari.
>
> ⚠️ **iOS apaga o cache do app se ele ficar 7 dias sem ser aberto.** É uma
> limitação da Apple, não da loja. O catálogo volta a carregar sozinho na
> próxima abertura.

### Computador (Chrome, Edge, Firefox, Safari)

Ícone de instalação na barra de endereço, ou menu **⋮** → **Instalar Chelly
Shop**. Vira uma janela própria, com atalho no menu Iniciar.

---

## 3. O que foi necessário no código

| Peça | Arquivo | Função |
|---|---|---|
| Manifesto do app | `vite.config.ts` (bloco `manifest`) | Nome, ícones, cores, modo `standalone`, atalhos |
| Service worker | `src/sw.ts` | Cache offline, atualização, página sem conexão |
| Registro + prompt | `src/utils/pwa.ts` | Registra o SW, guarda o `beforeinstallprompt`, detecta iOS/aparelho fraco |
| Convite na interface | `src/components/app/InstallPrompt.tsx` | Barrinha + guia passo a passo |
| Ícones | `public/icons/*` + `scripts/generate-icons.mjs` | PNG 192/512, maskable, apple-touch, favicon SVG |
| Página offline | `public/offline.html` | O que aparece sem sinal |
| Avisos de status | `src/components/app/StatusBanner.tsx` | "Sem conexão" / "Nova versão do app" |

### Ícones

Gerados por `scripts/generate-icons.mjs`, um script Node **sem nenhuma
dependência externa** (escreve o PNG byte a byte, com `zlib` da biblioteca
padrão). Para regenerar:

```bash
node scripts/generate-icons.mjs
```

Arquivos gerados:

```
public/icons/pwa-192x192.png              ícone padrão
public/icons/pwa-512x512.png              ícone grande + splash
public/icons/maskable-icon-192x192.png    ícone adaptativo Android (safe-zone 80%)
public/icons/maskable-icon-512x512.png
public/icons/apple-touch-icon.png         iPhone/iPad (180×180)
public/icons/favicon-96x96.png            aba do navegador
public/icons/favicon.svg                  vetorial (nítido em qualquer tela)
public/icons/icon-mono-512.png            monocromático (atalhos do sistema)
```

Quer trocar o desenho? Edite as cores no topo do script (`ROSE`, `BLUE`,
`SLATE`) ou a geometria em `sparkleRadius()` e rode de novo.

### Atualização do app

O service worker usa `registerType: 'prompt'`. Quando você publica uma versão
nova:

1. A cliente abre a loja e a versão antiga aparece na hora (do cache).
2. Em segundo plano o SW novo baixa os arquivos.
3. Quando termina, aparece **"Nova versão do app — Atualizar"**.
4. Ela toca em *Atualizar* quando quiser — nunca no meio de um pedido.

Se você preferir atualização automática sem perguntar, troque em
`src/utils/pwa.ts`: chame `applyUpdate()` diretamente dentro do callback de
`registerServiceWorker` em `App.tsx`.

---

## 4. Checklist de publicação

O PWA **só funciona em HTTPS** (o navegador exige). Em `localhost` funciona
para desenvolvimento.

- [ ] Publicar em domínio com HTTPS (Vercel, Netlify, Cloudflare Pages e GitHub
      Pages já dão certificado de graça)
- [ ] Confirmar que `https://seudominio.com/sw.js` abre (deve devolver JavaScript)
- [ ] Confirmar que `https://seudominio.com/manifest.webmanifest` abre
- [ ] Abrir no Chrome do Android → menu **⋮** → tem que aparecer **"Instalar
      aplicativo"**
- [ ] DevTools → **Application → Manifest** → sem erro vermelho
- [ ] DevTools → **Application → Service Workers** → *Status: activated*
- [ ] Marcar **Offline** no DevTools e recarregar → abre o catálogo salvo
- [ ] Rodar o Lighthouse → categoria *PWA* / *Installable*
- [ ] Testar no iPhone pelo Safari → Compartilhar → *Adicionar à Tela de Início*

### Testar no seu celular sem publicar

Na mesma rede Wi-Fi do computador:

```bash
npm run dev
# aponte o celular para http://SEU_IP_LOCAL:5173
```

> O IP aparece no terminal ao subir o dev server (o `host: '0.0.0.0'` já está
> configurado em `vite.config.ts` para isso).
>
> **Atenção:** por HTTP o service worker não registra (exigência do navegador),
> então o modo offline e o botão de instalar não aparecem nesse teste. Para
> testar a instalação de verdade, use HTTPS.

---

## 5. Quer um app "de loja" de verdade?

Se um dia você quiser estar na Play Store com o mesmo código, o caminho mais
barato é o **[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)**
(do próprio Google): ele pega este PWA e gera um **TWA** (Trusted Web
Activity), que é um APK assinado apontando para o seu site. Custo: US$ 25 uma
única vez na conta de desenvolvedor Google. Nenhum código muda.

Não é necessário agora — o PWA cobre o caso de uso (cliente instalar e comprar)
sem custo nenhum.
