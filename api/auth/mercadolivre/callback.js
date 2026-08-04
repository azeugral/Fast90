// /api/auth/mercadolivre/callback.js
//
// Recebe o código OAuth do Mercado Livre,
// valida o State,
// recupera o Code Verifier,
// troca o código por tokens,
// e já salva tudo automaticamente no Redis — não precisa copiar nada.
//
// URL:
// https://fast90.vercel.app/api/auth/mercadolivre/callback

import { saveTokens } from "../../_lib/mercadolivre-tokens.js";

export default async function handler(req, res) {

  try {

    // --------------------------------------------------------
    // CONFIGURAÇÕES
    // --------------------------------------------------------

    const clientId =
      process.env.ML_CLIENT_ID;

    const clientSecret =
      process.env.ML_CLIENT_SECRET;

    const redirectUri =
      "https://fast90.vercel.app/api/auth/mercadolivre/callback";


    // --------------------------------------------------------
    // RECEBE PARÂMETROS
    // --------------------------------------------------------

    const {
      code,
      state,
      error,
      error_description
    } = req.query;


    // --------------------------------------------------------
    // VERIFICA ERRO DO MERCADO LIVRE
    // --------------------------------------------------------

    if (error) {

      return res.status(400).send(`
        <!DOCTYPE html>

        <html lang="pt-BR">

        <head>
          <meta charset="UTF-8">
          <title>Erro na autorização</title>
        </head>

        <body>

          <h1>
            Erro na autorização
          </h1>

          <p>
            Código:
            ${escapeHtml(error)}
          </p>

          <p>
            ${escapeHtml(
              error_description || ""
            )}
          </p>

        </body>

        </html>
      `);
    }


    // --------------------------------------------------------
    // VERIFICA CODE
    // --------------------------------------------------------

    if (!code) {

      return res.status(400).send(
        "Código de autorização não recebido."
      );
    }


    // --------------------------------------------------------
    // VERIFICA STATE
    // --------------------------------------------------------

    if (!state) {

      return res.status(400).send(
        "State não recebido."
      );
    }


    // --------------------------------------------------------
    // LÊ COOKIES
    // --------------------------------------------------------

    const cookies =
      req.headers.cookie || "";


    // --------------------------------------------------------
    // LOCALIZA COOKIE OAUTH
    // --------------------------------------------------------

    const oauthMatch =
      cookies.match(
        /(?:^|;\s*)ml_oauth_data=([^;]+)/
      );


    if (!oauthMatch) {

      return res.status(400).send(`
        <h1>
          Erro PKCE
        </h1>

        <p>
          Dados da autorização não encontrados.
        </p>

        <p>
          Inicie novamente o processo de autorização.
        </p>
      `);
    }


    // --------------------------------------------------------
    // RECUPERA DADOS DO COOKIE
    // --------------------------------------------------------

    let oauthData;

    try {

      oauthData =
        JSON.parse(
          decodeURIComponent(
            oauthMatch[1]
          )
        );

    } catch (error) {

      console.error(
        "Erro ao ler cookie OAuth:",
        error
      );

      return res.status(400).send(
        "Cookie de autenticação inválido."
      );
    }


    const {
      codeVerifier,
      state: savedState
    } = oauthData;


    // --------------------------------------------------------
    // VERIFICA CODE VERIFIER
    // --------------------------------------------------------

    if (!codeVerifier) {

      return res.status(400).send(
        "Code Verifier não encontrado."
      );
    }


    // --------------------------------------------------------
    // VALIDA STATE
    // --------------------------------------------------------

    if (
      !savedState ||
      state !== savedState
    ) {

      return res.status(400).send(`
        <h1>
          Erro de segurança
        </h1>

        <p>
          O parâmetro State não corresponde à autorização iniciada.
        </p>

        <p>
          Inicie novamente o processo.
        </p>
      `);
    }


    // --------------------------------------------------------
    // VERIFICA CREDENCIAIS
    // --------------------------------------------------------

    if (
      !clientId ||
      !clientSecret
    ) {

      return res.status(500).send(
        "ML_CLIENT_ID ou ML_CLIENT_SECRET não configurado na Vercel."
      );
    }


    // --------------------------------------------------------
    // TROCA CODE PELOS TOKENS
    // --------------------------------------------------------

    const response =
      await fetch(
        "https://api.mercadolibre.com/oauth/token",
        {
          method: "POST",

          headers: {
            "Accept":
              "application/json",

            "Content-Type":
              "application/x-www-form-urlencoded"
          },

          body:
            new URLSearchParams({

              grant_type:
                "authorization_code",

              client_id:
                clientId,

              client_secret:
                clientSecret,

              code:
                code,

              redirect_uri:
                redirectUri,

              code_verifier:
                codeVerifier

            })
        }
      );


    // --------------------------------------------------------
    // LÊ RESPOSTA
    // --------------------------------------------------------

    const data =
      await response
        .json()
        .catch(
          () => ({})
        );


    // --------------------------------------------------------
    // VERIFICA ERRO
    // --------------------------------------------------------

    if (!response.ok) {

      console.error(
        "Erro ao obter tokens:",
        response.status,
        data
      );

      return res.status(
        response.status
      ).send(`
        <h1>
          Erro ao obter tokens
        </h1>

        <p>
          Status:
          ${response.status}
        </p>

        <pre>${escapeHtml(
          JSON.stringify(
            data,
            null,
            2
          )
        )}</pre>
      `);
    }


    // --------------------------------------------------------
    // VERIFICA REFRESH TOKEN
    // --------------------------------------------------------

    if (
      !data.refresh_token
    ) {

      return res.status(500).send(`
        <h1>
          Refresh Token não recebido
        </h1>

        <p>
          O Mercado Livre não retornou um refresh_token.
        </p>
      `);
    }


    // --------------------------------------------------------
    // SALVA OS TOKENS NO REDIS (AUTOMÁTICO)
    // --------------------------------------------------------

    try {
      await saveTokens({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        // expires_in normalmente é 21600s (6h) — renovamos 2min antes
        expires_at: Date.now() + (data.expires_in - 120) * 1000,
      });
    } catch (saveError) {
      console.error("Erro ao salvar tokens no Redis:", saveError);

      return res.status(500).send(`
        <h1>Autorizado, mas houve um erro ao salvar</h1>
        <p>
          O Mercado Livre autorizou o app, mas não consegui salvar o token
          no Redis. Verifique se o banco Redis (Upstash) está conectado ao
          projeto na Vercel — veja o LEIA-ME-CONFIGURACAO.md.
        </p>
        <pre>${escapeHtml(String(saveError?.message || saveError))}</pre>
      `);
    }

    // --------------------------------------------------------
    // APAGA COOKIE OAUTH
    // --------------------------------------------------------

    res.setHeader(
      "Set-Cookie",
      "ml_oauth_data=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );


    // --------------------------------------------------------
    // CONFIRMA SUCESSO
    // --------------------------------------------------------

    return res.status(200).send(`

      <!DOCTYPE html>

      <html lang="pt-BR">

      <head>

        <meta charset="UTF-8">

        <meta name="viewport"
              content="width=device-width, initial-scale=1.0">

        <title>
          Autorização concluída
        </title>

        <style>

          body {

            font-family:
              Arial,
              sans-serif;

            max-width:
              800px;

            margin:
              40px auto;

            padding:
              20px;

            line-height:
              1.6;

          }

          .box {

            background:
              #e8f5e9;

            padding:
              20px;

            border-radius:
              10px;

            border:
              1px solid #a5d6a7;

          }

          .muted {

            color:
              #777;

            font-size:
              13px;

            margin-top:
              24px;

          }

        </style>

      </head>

      <body>

        <h1>
          ✅ Autorização concluída!
        </h1>

        <div class="box">
          <p>
            O Mercado Livre autorizou sua aplicação e o token já foi
            <strong>salvo automaticamente</strong>. Não precisa copiar nem
            colar nada em lugar nenhum.
          </p>
          <p>
            O site já pode buscar preços atualizados a partir de agora.
          </p>
        </div>

        <p class="muted">
          Se algum dia o acesso for revogado (ex: você trocou a senha do
          Mercado Livre, ou desautorizou o app), é só visitar
          <code>/api/auth/mercadolivre</code> de novo pra reautorizar —
          um clique, sem precisar mexer em código.
        </p>

      </body>

      </html>

    `);

  } catch (error) {

    console.error(
      "Erro no callback OAuth:",
      error
    );

    return res.status(500).send(`

      <h1>
        Erro interno
      </h1>

      <p>
        ${escapeHtml(
          error?.message ||
          "Erro desconhecido"
        )}
      </p>

    `);
  }
}


// --------------------------------------------------------
// ESCAPA TEXTO PARA HTML
// --------------------------------------------------------

function escapeHtml(value) {

  return String(value)

    .replace(
      /&/g,
      "&amp;"
    )

    .replace(
      /</g,
      "&lt;"
    )

    .replace(
      />/g,
      "&gt;"
    )

    .replace(
      /"/g,
      "&quot;"
    )

    .replace(
      /'/g,
      "&#039;"
    );

}