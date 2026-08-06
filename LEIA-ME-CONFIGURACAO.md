# Preços do site — painel manual

⚠️ **Mudança de rumo:** depois de vários testes, confirmamos que o
Mercado Livre bloqueia (403) a leitura de preço de produtos que não
pertencem à conta que autorizou o app — isso vale tanto pro endpoint de
item único quanto pro multiget, e o programa de afiliados deles **não tem
uma API própria** que resolva isso (é uma limitação da plataforma, não do
nosso código). Por isso todo o fluxo de autorização OAuth com o Mercado
Livre foi removido do projeto.

No lugar disso: um **painel simples e protegido por senha**, onde você
mesmo atualiza o preço de cada produto em poucos segundos, sem precisar
editar código nem fazer commit no GitHub. O site busca esse valor
automaticamente — a única diferença é que quem digita o preço é você, não
uma API.

O Redis que você já conectou continua sendo usado (agora pra guardar os
preços em vez do token do Mercado Livre) — não precisa mexer nele de novo.

---

## 1. Configurar a senha do painel

No projeto da Vercel → **Settings → Environment Variables**, adicione:

| Name | Value |
|---|---|
| `ADMIN_PASSWORD` | uma senha forte, só sua |

Marca "Production" e salva. Depois disso, dá um **Redeploy**
(Deployments → `...` no último → Redeploy) pra ela valer.

## 2. Subir os arquivos

Sobe os arquivos deste pacote pro GitHub (pode substituir tudo). O que
mudou desde a última vez:
- **Removidos:** `api/prices.js`, `api/auth/` inteiro (não são mais
  usados).
- **Novos:** `api/_lib/redis.js`, `api/manual-prices.js`,
  `api/admin/prices.js`, `admin.html`.
- **Editado:** `produtos.html` (busca preço em `/api/manual-prices` em vez
  da API do Mercado Livre).

## 3. Usar o painel

Acesse, logado ou não (a senha é pedida na hora):

```
https://fast90.vercel.app/admin.html
```

Digita a senha configurada no passo 1, e aparece um card por produto. Pra
cada um:
- **Preço atual** — o valor que aparece no site.
- **Preço original (opcional)** — preenche só se quiser mostrar um valor
  riscado acima (indicando desconto). Deixa em branco se não tiver
  promoção.
- **Produto disponível** — desmarca se o produto estiver esgotado no
  Mercado Livre (o card mostra "Indisponível" no site).

Clica em **Salvar** em cada produto que quiser atualizar. A mudança
aparece no site em até 1 minuto (o site cacheia por 1 minuto pra não
sobrecarregar o banco).

A página `/admin.html` não tem link em nenhum lugar do site público —
só quem sabe o endereço (e a senha) consegue entrar. Se quiser, pode
favoritar essa URL no navegador do seu celular/computador pra acessar
rápido sempre que for atualizar uma promoção.

## Como funciona por baixo dos panos

- Os preços ficam guardados no Redis, numa única chave (`product_prices`),
  como um objeto com um campo por produto (`capsulas`, `whey`, `creatina`,
  `coqueteleira`, `balanca`, `marmita` — os mesmos nomes usados no
  `data-cat` de cada card do `produtos.html`).
- `/api/manual-prices` — **público**, sem senha. É o que o site chama pra
  exibir os preços pra qualquer visitante. Só leitura.
- `/api/admin/prices` — **protegido por senha**. É o que o `admin.html`
  usa tanto pra ler os valores atuais (ao entrar) quanto pra salvar
  (`POST`).
- Se algum produto ainda não tiver preço salvo no painel, o `produtos.html`
  mantém o valor estático que está escrito direto no HTML — nada quebra.

## Testar

```
https://fast90.vercel.app/api/manual-prices
```
Deve devolver `{"prices": {...}}` (vazio `{}` até você salvar o primeiro
preço pelo painel).
