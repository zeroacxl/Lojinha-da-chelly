# Segurança da Chelly Shop

Este documento explica **o que foi feito**, **o que foi removido** e — principalmente —
**o que só você pode fazer** para a loja ficar realmente protegida.

> Você pediu para não mexer em nada do Firebase. Nada em `src/utils/firebase.ts`
> foi alterado: mesmas credenciais, mesmo projeto, mesma inicialização.
> As regras abaixo são um **texto para você colar no console do Firebase** —
> quem decide aplicar é você.

---

## 1. O problema mais sério (e como resolver)

### O que estava acontecendo

O código anterior tinha uma senha do painel administrativo escrita **dentro do
aplicativo**:

```js
// como estava
const _0xf = "\x4d\x41\x54\x70\x6f\x72\x74\x31\x35\x33"; // = "MATport153"
...
if (pass === "MATport123") { setIsAdmin(true); } // "senha de emergência"
```

Escrever `"\x4d\x41\x54…"` em vez de `"MAT…"` **não esconde nada**. O arquivo
JavaScript compilado é público: qualquer pessoa abre o site, clica com o botão
direito → *Exibir código-fonte* (ou abre a aba *Sources* do DevTools), procura
por `password` e lê a senha. E havia duas.

Pior: o bloco `catch` aceitava a senha de emergência **quando o Firebase estava
fora do ar**. Ou seja, numa queda de conexão, qualquer pessoa que soubesse a
string entrava no painel e podia apagar o catálogo inteiro.

### O que foi feito no código

| Antes | Depois |
|---|---|
| Senha fixa no bundle (2 cópias) | Removida. Só existe a senha do Firestore |
| `catch` liberava acesso com senha de emergência | `catch` **nega** o acesso |
| Comparação `===` (vaza informação pelo tempo) | Comparação em tempo constante |
| Bloqueio de 30 s só em memória (recarregar zera) | Espera exponencial persistida em `sessionStorage` |
| Sessão admin nunca expirava | Expira após 30 min sem atividade |
| Sem diagnóstico | Painel **Admin → Segurança** mostra o estado real |

Arquivos: `src/utils/auth.ts`, `src/utils/security.ts`,
`src/components/shop/AdminLoginModal.tsx`.

### O que SÓ VOCÊ pode fazer ⚠️

**Senha no navegador não protege nada.** O código roda no aparelho de quem
visita. Uma pessoa com conhecimento básico abre o DevTools e força
`isAdmin = true` — sem saber senha nenhuma.

A proteção real são as **Security Rules do Firestore**. Sem elas, *qualquer
pessoa no mundo* pode ler e **apagar** seus produtos direto pelo console do
navegador, usando a sua própria chave de API (que é pública por design).

**Como aplicar (2 minutos, sem tocar no código):**

1. Abra <https://console.firebase.google.com> → projeto **lojinha-da-chelly**
2. Menu lateral → **Build** → **Firestore Database** → aba **Rules**
3. Apague o conteúdo e cole:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    // ── Funções auxiliares ──────────────────────────────────────────
    // Só deixa gravar se o documento tiver os campos certos e tamanhos
    // razoáveis. Isso impede alguém de gravar um produto de 1 MB ou um
    // comentário com <script> dentro.
    function textoSaudavel(campo, max) {
      return request.resource.data[campo] is string
          && request.resource.data[campo].size() <= max;
    }

    function produtoValido() {
      return textoSaudavel('name', 60)
          && textoSaudavel('description', 600)
          && request.resource.data.price is number
          && request.resource.data.price >= 0
          && request.resource.data.price <= 99999
          && request.resource.data.stock is number
          && request.resource.data.stock >= 0;
    }

    // ── Catálogo: público lê, ninguém de fora escreve ───────────────
    match /products/{productId} {
      allow read: if true;
      allow write: if false;   // ← troque quando fizer login de admin
      allow delete: if false;
    }

    // ── Solicitações "Me avise": qualquer visitante pode criar ──────
    match /demands/{demandId} {
      allow read: if false;    // só o painel admin lê
      allow create: if request.resource.data.user is string
                    && request.resource.data.user.size() <= 40
                    && request.resource.data.whatsapp is string
                    && request.resource.data.whatsapp.size() <= 15;
      allow update, delete: if false;
    }

    // ── Configurações: público lê o config, NUNCA lê a senha ────────
    match /settings/config {
      allow read: if true;
      allow write: if false;
    }

    match /settings/admin {
      allow read: if false;    // ← a senha não pode ser legível!
      allow write: if false;
    }

    // ── Qualquer outra coleção: negado por padrão ───────────────────
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. Clique **Publicar**.

> **Atenção ao passo do `settings/admin`.** Hoje a loja *lê* a senha pelo
> navegador para comparar (`getDoc`). Se você aplicar `allow read: if false`
> nesse documento, o login para de funcionar — porque a leitura é negada.
>
> Existem dois caminhos, escolha um:

**Caminho A — simples (recomendado para começar).**
Mantenha `allow read: if true` em `settings/admin` **mas troque a senha por uma
forte** (20+ caracteres, gerada em <https://1password.com/password-generator>).
Funciona imediatamente. Risco: alguém pode ler a senha. Mitigação: como as
escritas em `products` estão com `write: if false`, ler a senha não adianta
nada — a pessoa não consegue gravar nada mesmo assim.

**Caminho B — correto (quando puder investir 1 hora).**
Ativar **Firebase Authentication** e usar `firebase.auth()` no login. Aí as
rules ficam assim:

```javascript
match /products/{productId} {
  allow read: if true;
  allow write: if request.auth != null && request.auth.uid == 'SEU_UID_AQUI';
}
match /settings/admin {
  allow read, write: if false;   // ninguém precisa mais ler a senha
}
```

Com o Caminho B a senha **nunca chega ao navegador** e o painel só abre para o
seu usuário autenticado. É assim que loja séria faz.

---

## 2. O "GuardBot" foi desligado de propósito

O código anterior tinha um sistema que, a cada 1 segundo, executava a instrução
`debugger`, bloqueava o botão direito e o F12 e — ao "detectar ameaça" —
**apagava o localStorage do cliente e jogava a página para `about:blank`**.

Por que isso era ruim:

1. **Não impede ninguém.** É código público. Basta não abrir o DevTools, ou
   desativar JavaScript, ou usar um proxy. Quem quer copiar o catálogo copia.
2. **Custava performance em todo aparelho.** O `debugger` força o navegador a
   verificar pontos de parada uma vez por segundo, para sempre.
3. **Punia cliente honesto.** Extensão de tradução, leitor de tela, o atalho de
   acessibilidade e o próprio DevTools da Chelly disparavam o "bloqueio".
4. **Destruía dados do cliente.** Carrinho e favoritos apagados sem motivo.

O que entrou no lugar (`src/utils/security.ts`):

- **Sanitização de toda entrada** (`src/utils/sanitize.ts`) — nenhum texto do
  usuário ou do banco entra na tela sem passar por filtro de tags, caracteres
  de controle, zero-width e bidirecionais.
- **CSP sem `unsafe-inline`** — mesmo que alguém grave `<script>alert(1)</script>`
  num nome de produto, o navegador **se recusa a executar**.
- **Rate limiting com espera exponencial** que sobrevive a F5.
- **Sessão administrativa que expira sozinha.**
- **Honeypot** nos formulários públicos (campo invisível que só robô preenche).
- **Detecção de clickjacking** — a única situação que ainda bloqueia a tela é a
  loja estar embutida num iframe de outro site, e aí mostramos uma explicação
  educada em vez de acusar o visitante.
- **`frame-ancestors 'none'`** na CSP — impede o clickjacking no navegador,
  que é onde ele precisa ser impedido.

---

## 3. XSS (cross-site scripting)

**Risco real nesta loja:** qualquer pessoa pode publicar uma avaliação. Se o
texto entrasse cru na página, um invasor poderia roubar o painel de outra
pessoa.

**Camadas de defesa aplicadas:**

| Camada | Onde | O que faz |
|---|---|---|
| Escape na saída | React (automático) | `{texto}` nunca vira HTML |
| Sanitização na entrada | `utils/sanitize.ts` | Remove tags **repetidamente** (derrota `<scri<script>pt>`), entidades, zero-width e caracteres bidi |
| Limite de tamanho | `LIMITS` | Nome 60, comentário 500 — impede payload gigante |
| CSP `script-src 'self'` | `index.html` | Script injetado **não executa** |
| Bloqueio de link em avaliação | `data/writes.ts` | Rejeita `http://` e `www.` no texto |
| URLs validadas | `safeUrl()` / `safeImageUrl()` | Bloqueia `javascript:`, `vbscript:`, `data:text/html` |

Testado com casos reais (`<scri<script>pt>x` → `ptx`; `<img src=x onerror=alert(1)>` → vazio).

---

## 4. Validação de dados (evita corrupção do catálogo)

Antes, o painel gravava o que o campo devolvesse. Um preço vazio virava `NaN`,
um estoque vazio virava `NaN`, e o Firestore rejeitava com um erro genérico.

Agora (`src/data/writes.ts` + `src/utils/sanitize.ts`):

- preço: `clampPrice` → número ≥ 0, ≤ 99.999, com 2 casas;
- promoção: só é gravada se for **menor** que o preço (antes podia ficar
  promoção maior que o preço e a loja exibir "−20% OFF" ao contrário);
- estoque: inteiro 0–9.999;
- categoria: só aceita uma das 5 conhecidas (impede produto "órfão" que some da
  vitrine);
- foto: teto de ~1,2 MB em base64, com mensagem clara se estourar;
- comentários: gravados com `arrayUnion`, que é **atômico** — duas clientes
  avaliando ao mesmo tempo não se sobrescrevem mais;
- erros do Firestore traduzidos: `permission-denied`, `unavailable`,
  `not-found`, `failed-precondition` viram frases em português.

---

## 5. Pagamento Pix

O gerador de QR Code foi corrigido (`src/utils/format.ts`):

- **Bug corrigido:** `chave.replace(/\D/g,'')` destruía chave **e-mail**
  (`loja@x.com` → `lojaxcom`) e **chave aleatória EVP**
  (`7d9f8a1b-2c3e-…` → `7981234…`). O QR Code era gerado com uma chave que não
  existe — o cliente escaneava e o banco recusava. Agora os três tipos de chave
  (telefone/CPF/CNPJ, e-mail, EVP) são tratados separadamente.
- CRC16-CCITT verificado contra o padrão EMV do Banco Central.
- Nome/cidade sem acento (o leitor Pix só aceita alfanumérico): `São Paulo` →
  `Sao Paulo`.
- Payload rejeitado quando chave ou valor são inválidos (antes gerava QR
  quebrado em silêncio).
- Nome do recebedor exibido junto da chave, para o cliente **conferir antes de
  pagar** (proteção contra golpe de chave trocada).

Validado para os 4 tipos de chave: estrutura TLV correta, todos os campos com
comprimento declarado certo, CRC conferindo.

---

## 6. Privacidade (LGPD)

- **Política de Privacidade e Termos de Uso** na loja (`components/shop/PolicyModal.tsx`).
  Não é enfeite: o AdSense **não aprova** site sem política de privacidade que
  mencione cookies de terceiros, e a LGPD exige informar o que você coleta.
- **Consentimento explícito** no formulário "Me avise" — a loja só guarda
  nome/WhatsApp depois que a pessoa marca a caixa.
- **Mínimo de dados:** não coletamos e-mail, CPF nem documento em lugar nenhum.
- **Dados ficam no aparelho** quando possível: sacola, favoritos e endereço são
  `localStorage`, nunca enviados a servidor.
- **`security.txt`** em `public/.well-known/` para reporte responsável de falhas.
- **`referrer: strict-origin-when-cross-origin`** — não vaza a URL completa
  (que pode ter `?q=busca`) para sites de terceiros.

---

## 7. Cabeçalhos de segurança

A CSP já vai no `<meta>` do `index.html`, então funciona em qualquer hospedagem.
Mas `<meta>` **não suporta** `frame-ancestors`, `Strict-Transport-Security` nem
`X-Content-Type-Options` de forma confiável. Se a sua hospedagem permitir
cabeçalhos HTTP, adicione também:

**Vercel** — `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains; preload" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
        { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=(self), payment=()" },
        { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self' https://pagead2.googlesyndication.com https://*.google.com https://*.googleadservices.com https://*.googlesyndication.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://*.gstatic.com https://pagead2.googlesyndication.com https://*.doubleclick.net https://*.google.com https://wa.me; frame-src 'self' https://*.google.com https://*.doubleclick.net https://*.googlesyndication.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
      ]
    }
  ]
}
```

**Netlify** — `netlify.toml`:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    Strict-Transport-Security = "max-age=63072000; includeSubDomains; preload"
    X-Content-Type-Options = "nosniff"
    X-Frame-Options = "DENY"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(self), payment=()"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

O segundo bloco (`/assets/*`) é o que faz a loja carregar instantaneamente nas
visitas seguintes: os arquivos têm hash no nome, então podem ficar em cache
para sempre.

---

## 8. Dependências

`npm audit` foi executado. Estado atual:

- ✅ Removido `vite-plugin-singlefile` (trazia `micromatch`/`braces` vulneráveis
  e impedia o PWA).
- ✅ `vite` atualizado para 7.3.7 (corrige advisory de `server.fs.deny`).
- ✅ `@babel/core`, `postcss`, `nanoid`, `source-map-js`, `esbuild` corrigidos.
- ⚠️ **Restam 5 advisories, todos na cadeia do Firebase** (`firebase`,
  `@firebase/firestore`, `@grpc/grpc-js`). Você pediu para não mexer no
  Firebase, então **nada foi alterado**.
  - Impacto real baixo: `@grpc/grpc-js` é usado pelo SDK só em Node (build/Web
    Channel); o navegador usa WebSocket/`fetch`. Os advisories são de crash por
    mensagem malformada vinda do **servidor do Google**, não de um atacante.
  - Quando quiser zerar: `npm install firebase@latest` e refazer o teste de
    login/produtos. As credenciais em `src/utils/firebase.ts` não precisam mudar.

Rode `npm audit` a cada deploy.

---

## 9. Checklist antes de publicar

- [ ] Aplicar as Security Rules do item 1 (**obrigatório**)
- [ ] Trocar a senha em `settings/admin` por uma forte
- [ ] Conferir a chave Pix e o WhatsApp em `settings/config`
- [ ] Preencher `VITE_SITE_URL` no `.env` com o domínio real
- [ ] Trocar o domínio em `public/robots.txt`, `public/sitemap.xml` e no
      `index.html` (canonical + Open Graph)
- [ ] Preencher `public/ads.txt` com seu publisher ID (se for usar AdSense)
- [ ] Revisar a Política de Privacidade e colocar o contato real
- [ ] Testar no celular: instalar como app, colocar na sacola, fechar o app,
      reabrir (a sacola tem que continuar lá)
- [ ] Testar o checkout de ponta a ponta com um Pix de R$ 0,01
- [ ] Rodar <https://pagespeed.web.dev> e conferir Core Web Vitals
- [ ] Cadastrar no [Google Search Console](https://search.google.com/search-console)
      e enviar o sitemap
