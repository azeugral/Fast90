# Preços em tempo real — Mercado Livre

Versão consolidada. Se você seguiu guias anteriores, esse aqui substitui
todos — o fluxo ficou mais simples: **não existe mais nenhum passo manual
de copiar/colar token**. Você autoriza uma vez pelo navegador e pronto.

O projeto já vem com tudo implementado:
- `api/prices.js` — busca o preço atual de um produto no Mercado Livre.
- `api/auth/mercadolivre.js` e `api/auth/mercadolivre/callback.js` — fluxo
  de autorização (visita, faz login no Mercado Livre, autoriza, e o token
  já fica salvo sozinho).
- O token se renova automaticamente pra sempre depois disso, guardado num
  banco Redis gratuito — sem manutenção manual.

Sobre a Amazon: continua de fora por enquanto. A API antiga (PA-API) foi
desativada em 15/05/2026, e a substituta (Creators API) só libera acesso
pra quem já tem 10 vendas qualificadas nos últimos 30 dias.

---

## 1. Criar o app no Mercado Livre Developers

1. Acesse **https://developers.mercadolivre.com.br**, faça login com sua
   conta normal (não precisa ser vendedor) e crie uma aplicação.
2. Em **"URI de redirect"**, coloque a URL real do callback do seu site
   (troque pelo seu domínio da Vercel se for diferente):
   ```
   https://fast90.vercel.app/api/auth/mercadolivre/callback
   ```
   ⚠️ Precisa ser **exatamente** essa URL — se o Mercado Livre redirecionar
   pra um endereço diferente do configurado aqui, a autorização falha.
3. Em **Fluxos OAuth**, marque **Authorization Code** e **Refresh Token**.
4. Em **PKCE necessário**, deixe **LIGADO** — o código já implementa PKCE
   (é mais seguro, e como a autorização é feita direto pelo site, não tem
   nenhuma desvantagem em deixar ligado).
5. Em **Negócios**, marque só **Mercado Livre**.
6. Em **Permissões**, deixe **"Sem acesso"** em tudo, exceto "Usuários"
   (que é o mínimo exigido pro OAuth funcionar).
7. Em **Tópicos**, deixe tudo desmarcado (não usamos webhooks).
8. Salve e anote o **App ID (Client ID)** e a **Secret Key (Client Secret)**.

## 2. Criar o banco Redis gratuito

1. No seu projeto na Vercel, vá na aba **Storage** → **Create Database**
   (ou **Marketplace**, dependendo de como a Vercel estiver mostrando).
2. Escolha **Upstash** → **Redis** → plano gratuito → **Connect** pra
   vincular ao projeto.
3. A Vercel injeta sozinha as variáveis de conexão do Redis — não precisa
   copiar nem colar nada.

## 3. Configurar as variáveis de ambiente

No projeto da Vercel, em **Settings → Environment Variables**, adicione
(marcando "Production" em cada uma):

| Name | Value |
|---|---|
| `ML_CLIENT_ID` | o App ID do passo 1 |
| `ML_CLIENT_SECRET` | a Secret Key do passo 1 |

Não precisa mais de `ML_REFRESH_TOKEN` — o token vem do passo 4.

Depois de salvar, faça o **deploy** (ou **Redeploy**, se o projeto já
existia).

## 4. Autorizar o app (o único passo manual, feito só uma vez)

Abra no navegador, logado com sua conta do Mercado Livre:

```
https://fast90.vercel.app/api/auth/mercadolivre
```

Você vai ser redirecionado pro Mercado Livre, vai autorizar o app, e volta
pro seu site com uma mensagem confirmando que o token foi salvo. Pronto —
não precisa copiar nada, não precisa mexer em variável de ambiente.

Se um dia o acesso for revogado (troca de senha, desautorização manual
etc.), é só visitar essa mesma URL de novo.

## 5. Adicionar os produtos

No `produtos.html`, cada card tem um atributo `data-ml-id`. Você pode usar:
- O ID puro: `data-ml-id="MLB1234567890"`
- Ou colar a URL inteira do produto: `data-ml-id="https://produto.mercadolivre.com.br/MLB-1234567890-..."`

Os dois formatos funcionam — o código extrai o ID sozinho. Cards com os IDs
de exemplo (`MLB0000000...`) são ignorados e mostram o preço estático que
estiver escrito no HTML, sem gerar erro.

Se o ID for de uma **página de catálogo** (URL com `/p/MLB...`, que reúne
vários vendedores), o sistema busca automaticamente o preço de quem está
"ganhando" aquela página no momento — então funciona nos dois casos.

## Testar

```
https://fast90.vercel.app/api/prices?ids=MLB1234567890
```

- JSON com preço → tudo funcionando.
- `{"error":"...", "detail":"Nenhuma autorização..."}` (401) → falta fazer
  o passo 4.
- Erro 500 mencionando Redis → confira se o banco foi conectado ao projeto
  certo (passo 2) e se deu Redeploy depois.

## Como funciona por baixo dos panos

- `produtos.html` chama `/api/prices?ids=...` pros cards com `data-ml-id`.
- `api/prices.js` lê o token salvo no Redis, renova se necessário (guardando
  o novo token de volta no Redis — o Mercado Livre invalida o token anterior
  a cada uso, então isso é essencial) e busca o preço.
- Resposta cacheada por 1h na CDN da Vercel (`Cache-Control: s-maxage=3600`)
  pra não estourar limite de chamadas.
- Se qualquer coisa falhar, o preço estático do HTML continua aparecendo —
  nada quebra pro visitante.

## Testar localmente (opcional)

```bash
npm i -g vercel
vercel dev
```
