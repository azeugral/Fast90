# Preços em tempo real — Mercado Livre

Este pacote já vem com tudo implementado. Falta só você fazer 3 coisas:
1. Criar suas credenciais gratuitas no Mercado Livre.
2. Publicar o site na Vercel (grátis) com as variáveis de ambiente.
3. Trocar os IDs de exemplo pelos IDs reais dos seus produtos.

Sobre a Amazon: por enquanto ela fica de fora. A API antiga (PA-API) foi
desativada em 15/05/2026, e a substituta (Creators API) só libera acesso
pra quem já tem 10 vendas qualificadas nos últimos 30 dias — ou seja, não
dá pra usar antes do site já estar vendendo. Quando isso acontecer, é só
me chamar que a gente integra do mesmo jeito.

---

## 1. Criar seu app no Mercado Livre Developers (grátis, sem precisar vender)

1. Acesse **https://developers.mercadolivre.com.br** e faça login com sua conta
   normal do Mercado Livre (não precisa ser vendedor).
2. Vá em **"Minhas aplicações" → "Criar nova aplicação"**.
3. Preencha nome, descrição etc. Em **"URL de redirect"**, coloque qualquer
   URL https válida — por exemplo `https://www.google.com` (você só vai usar
   isso uma vez, no passo seguinte).
4. Ao salvar, anote o **App ID (Client ID)** e o **Secret Key (Client Secret)**.

## 2. Gerar o refresh token (feito uma única vez)

1. Monte esta URL trocando `SEU_APP_ID` e `SUA_URL_DE_REDIRECT` pelos valores
   do passo anterior, e abra ela no navegador:

   ```
   https://auth.mercadolivre.com.br/authorization?response_type=code&client_id=SEU_APP_ID&redirect_uri=SUA_URL_DE_REDIRECT
   ```

2. Faça login, autorize o app. Você vai ser redirecionado para
   `SUA_URL_DE_REDIRECT?code=TG-xxxxxxxx...`. Copie o valor depois de `code=`.

3. No terminal (ou em algo como o Postman), troque esse código por um
   refresh token:

   ```bash
   curl -X POST https://api.mercadolibre.com/oauth/token \
     -H "accept: application/json" \
     -H "content-type: application/x-www-form-urlencoded" \
     -d "grant_type=authorization_code" \
     -d "client_id=SEU_APP_ID" \
     -d "client_secret=SEU_CLIENT_SECRET" \
     -d "code=O_CODIGO_QUE_VOCE_COPIOU" \
     -d "redirect_uri=SUA_URL_DE_REDIRECT"
   ```

4. A resposta traz um `refresh_token` (algo como `TG-xxxxx...`). **Guarde
   esse valor** — ele não expira sozinho (só se você revogar o acesso do
   app), então esse passo só precisa ser feito uma vez.

## 3. Publicar na Vercel

1. Suba esta pasta pra um repositório no GitHub.
2. Crie uma conta em **https://vercel.com** (dá pra logar com GitHub) e
   importe o repositório — a Vercel detecta o `api/prices.js` automaticamente
   e já publica como função serverless.
3. No painel do projeto, vá em **Settings → Environment Variables** e
   adicione:
   - `ML_CLIENT_ID` → o App ID do passo 1
   - `ML_CLIENT_SECRET` → o Secret Key do passo 1
   - `ML_REFRESH_TOKEN` → o refresh token do passo 2
4. Faça o deploy. A partir daí, `/api/prices` já está no ar.

## 4. Trocar os IDs de exemplo pelos IDs reais

No `produtos.html`, cada card tem um atributo `data-ml-id="MLB000000000X"`
(valores de exemplo). Pra cada produto:

1. Abra o anúncio dele no Mercado Livre.
2. O ID aparece na URL, algo como `.../MLB1234567890-...` → o ID é
   `MLB1234567890`.
3. Substitua o valor de exemplo pelo ID real no card correspondente.

Cards sem um ID real (ainda com `MLB0000000...`) são ignorados pelo script —
eles continuam mostrando o preço estático que você digitar no HTML, sem
gerar erro nenhum.

## Como funciona por baixo dos panos

- `produtos.html` carrega e, se algum card tiver `data-ml-id` válido,
  chama `/api/prices?ids=...`.
- A função `api/prices.js` troca o refresh token por um access token,
  consulta o Mercado Livre e devolve preço atual, preço original (se tiver
  promoção) e disponibilidade.
- A resposta fica em cache por 1h na CDN da Vercel (`Cache-Control:
  s-maxage=3600`) — assim os visitantes não geram uma chamada nova a cada
  acesso, e você não estoura limite de requisição. Pra mudar essa janela,
  edite o valor `s-maxage` em `api/prices.js`.
- Se a chamada falhar por qualquer motivo, o preço que já está escrito no
  HTML continua aparecendo normalmente — nada quebra pro visitante.

## Testar localmente (opcional)

Com a [Vercel CLI](https://vercel.com/docs/cli) instalada:

```bash
npm i -g vercel
vercel dev
```

Isso sobe o site local com as funções serverless funcionando (usa as
variáveis de ambiente configuradas com `vercel env pull` ou um `.env.local`).
