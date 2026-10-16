# Monetização com Google AdSense

A loja já está **pronta** para AdSense. Enquanto você não configurar seu ID de
editor, nada muda: nenhum script do Google é carregado, nenhum espaço é
reservado na página, nenhuma requisição é feita. A loja fica exatamente como era.

---

## 1. Ligar em 5 passos

### Passo 1 — Criar a conta

1. Acesse <https://www.google.com/adsense> e entre com uma conta Google
2. Informe a **URL do domínio** onde a loja está publicada
3. País: **Brasil**; moeda: **BRL**
4. Aceite os termos

> ⚠️ O domínio precisa ser seu e estar no ar. AdSense **não aprova**
> `*.vercel.app`, `*.netlify.app` nem `localhost` — o revisor entende como
> domínio temporário. Você precisa de um domínio próprio (um `.com.br` custa
> ~R$ 40/ano no <https://registro.br>).

### Passo 2 — Copiar o ID de editor

No AdSense: **Configurações → Conta → Informações da conta → ID do editor**.
Formato: `ca-pub-1234567890123456`.

### Passo 3 — Configurar a loja

Crie um arquivo `.env` na raiz do projeto (copie de `.env.example`):

```bash
VITE_ADSENSE_CLIENT=ca-pub-1234567890123456
```

Pronto. Só isso já faz a loja carregar o SDK e exibir **anúncios automáticos**
(o Google escolhe onde colocar).

Se preferir posições fixas, crie os blocos no AdSense (**Anúncios → Por
unidade de anúncio → Anúncios display**) e informe os slots:

```bash
VITE_ADSENSE_CLIENT=ca-pub-1234567890123456
VITE_ADSENSE_SLOT_TOP=1234567890
VITE_ADSENSE_SLOT_FEED=2345678901
VITE_ADSENSE_SLOT_BOTTOM=3456789012
```

Depois rebuild e publique:

```bash
npm run build
```

> Alternativa sem `.env`: edite `ADSENSE.clientId` em `src/config/ads.ts`.
> O `.env` é melhor porque fica fora do Git.

### Passo 4 — Publicar o `ads.txt`

O arquivo já existe em `public/ads.txt` e vai para a raiz no build. Você só
precisa trocar o placeholder pelo seu publisher ID:

```
google.com, pub-1234567890123456, DIRECT, f08c47fec0942fa0
```

Note: no `ads.txt` o prefixo é **`pub-`**, não `ca-pub-`. O resto da linha é
fixo (`f08c47fec0942fa0` é a TAG ID oficial do Google — não mude).

Teste abrindo `https://seudominio.com/ads.txt`. Sem isso o AdSense mostra o
aviso *"Problemas com o ads.txt"* e **para de veicular** depois de alguns dias.

### Passo 5 — Pedir revisão

**Configurações → Conta → Verificação do site** → solicitar análise.

Enquanto isso, o AdSense já injeta o snippet de verificação. Se ele pedir para
colar um `<script>` no `<head>`, **não cole direto**: a nossa CSP bloqueia
script de domínio não listado. O snippet do AdSense vem de
`pagead2.googlesyndication.com`, que **já está liberado** na CSP do
`index.html`, então funciona sem mudança.

---

## 2. Onde os anúncios aparecem

Decidido em `src/App.tsx` e `src/components/shop/ProductGrid.tsx`:

| Posição | Formato | Quando |
|---|---|---|
| Depois da faixa institucional | horizontal (90–100 px) | Sempre que AdSense estiver ativo |
| A cada 9 produtos na grade | in-feed (250 px) | Só a partir da 2ª tela — nunca antes do primeiro produto |
| Antes do rodapé | horizontal | Reservado em `AdPlacement.footer` |

**Onde não aparece, de propósito:**

- ❌ Dentro do carrinho ou em qualquer etapa do checkout
- ❌ No modal de produto
- ❌ No painel administrativo
- ❌ Antes do primeiro conteúdo da página

Motivos: (1) anúncio no meio do pagamento derruba conversão, que é o que
realmente dá dinheiro na loja; (2) a política do AdSense proíbe anúncio que
interfira na navegação ou que fique perto demais de botão de ação; (3) anúncio
acima do primeiro conteúdo é reprovado em revisão.

### Detalhes de implementação

- **Carregamento preguiçoso:** cada bloco só injeta o SDK quando chega a 400 px
  da viewport (`IntersectionObserver`). Anúncio fora da tela não atrasa nada.
- **Sem salto de layout:** o bloco reserva `minHeight` fixo por formato e
  breakpoint. Isso protege o **CLS**, que é fator de ranqueamento no Google —
  anúncio que empurra a página derruba o Core Web Vitals e, com ele, a posição
  na busca.
- **Recolhe se falhar:** com adblock, CSP bloqueando ou sem rede, o espaço é
  liberado em vez de ficar um buraco em branco.
- **Rótulo "Publicidade"** em cada bloco: exigência do Conar, da LGPD e da
  própria política do AdSense.
- **SDK injetado uma única vez**, com `async` + `crossorigin`.

---

## 3. O que você precisa ter para ser aprovado

O AdSense reprova a maioria dos pedidos por um destes motivos. Todos já estão
resolvidos na loja:

| Exigência | Onde está |
|---|---|
| Política de Privacidade | Rodapé → **Política de Privacidade** (`components/shop/PolicyModal.tsx`), com seção específica sobre cookies de anúncio de terceiros e link para as configurações do Google |
| Termos de Uso | Rodapé → **Termos de Uso** |
| Conteúdo original suficiente | Catálogo com nome, descrição e avaliação de clientes + textos institucionais no rodapé, na faixa principal e no `<noscript>` |
| Navegação clara | Categorias, busca, paginação por filtro, links internos no rodapé |
| Contato visível | Central de Atendimento com WhatsApp + página *Sobre* implícita no rodapé |
| Domínio próprio com HTTPS | Você precisa providenciar (Passo 1) |
| `ads.txt` na raiz | `public/ads.txt` |
| Não ter cliques inválidos | Nunca clique nos próprios anúncios — é banimento permanente |

**Antes de pedir revisão:**

- [ ] Ter ao menos 15–20 produtos **com descrição escrita** (não só nome)
- [ ] Ter o domínio próprio no ar há algumas semanas
- [ ] Ter tráfego real chegando (nem que seja do Instagram)
- [ ] Preencher o contato real na Política de Privacidade
- [ ] Conferir que a loja abre sem erro no celular

> Conta nova leva de **alguns dias a 3 semanas** para ser aprovada. Se for
> reprovada, o e-mail diz o motivo — quase sempre é "conteúdo insuficiente".
> Adicione descrições e tente de novo.

---

## 4. Expectativa de receita (seja realista)

AdSense paga por mil impressões (RPM). No Brasil, para loja de cosméticos:

| Situação | RPM típico | 1.000 visitas/mês | 10.000 visitas/mês |
|---|---|---|---|
| Tráfego brasileiro, mobile | R$ 3 – R$ 12 | R$ 3 – R$ 12 | R$ 30 – R$ 120 |
| Com parcela de tráfego US/EU | R$ 15 – R$ 40 | R$ 15 – R$ 40 | R$ 150 – R$ 400 |

**Tradução honesta:** com o tráfego de uma loja local pequena, AdSense rende o
equivalente a um lanche por mês. Ele vale como **renda passiva que não custa
nada** — mas o dinheiro de verdade continua sendo a venda.

Por isso as decisões de design foram nesta direção:

1. Anúncio **nunca** atrapalha o checkout (uma venda perdida custa mais que um
   ano de AdSense).
2. Anúncio **não** degrada o Core Web Vitals (posição na busca vale mais que o
   anúncio em si).
3. Se um dia o AdSense estiver atrapalhando, é só deixar `VITE_ADSENSE_CLIENT`
   vazio: tudo desliga sozinho, sem sobrar buraco na página.

### Alternativas que costumam render mais para loja local

- **Programa de afiliados** de marketplace (Amazon Associados, Shopee Afiliados,
  Magalu Parceiro): comissão de 5–15% por venda, bem acima do RPM de display.
- **Google Merchant Center + Shopping gratuito**: aparece no Google Shopping sem
  pagar anúncio. Para cosmético, converte muito melhor que banner.
- **Meta Ads com catálogo**: se a verba permitir, R$ 10/dia bem segmentados em
  Rio Branco costumam pagar o mês inteiro.

O código já isola a camada de anúncio em `src/components/ads/` e
`src/utils/adsense.ts`, então trocar de fornecedor é local.

---

## 5. Resolução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| Espaço reservado mas anúncio não aparece | Sem `ads.txt` na raiz, ou conta ainda em revisão | Confira `https://seudominio.com/ads.txt` |
| Nenhum espaço aparece | `VITE_ADSENSE_CLIENT` vazio ou em formato errado | Precisa ser `ca-pub-` + 16 dígitos; rebuild depois de mudar o `.env` |
| Erro de CSP no console | Domínio de anúncio não listado | Já listamos `pagead2.googlesyndication.com`, `*.doubleclick.net`, `*.googlesyndication.com`, `*.googleadservices.com`. Se aparecer outro no console, adicione em `index.html` |
| Anúncio em branco com adblock | Esperado | O bloco recolhe sozinho; nada a fazer |
| "Anúncios em risco" no painel do AdSense | `ads.txt` divergente ou domínio não verificado | Refaça os passos 1 e 4 |
| Layout "pulou" quando o anúncio carregou | `ADSENSE.reserveSpace` desligado | Mantenha `reserveSpace: true` em `src/config/ads.ts` |

Para testar sem gastar impressão real, o AdSense tem
[modos de teste](https://support.google.com/adsense/answer/9007376) — mas
**nunca clique** num anúncio seu, nem em modo de teste com a conta real ligada.
