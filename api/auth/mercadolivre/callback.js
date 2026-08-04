// /api/auth/mercadolivre/callback.js
//
// Recebe o código OAuth do Mercado Livre,
// valida o State,
// recupera o Code Verifier,
// e troca o código por tokens.
//
// URL:
// https://fast90.vercel.app/api/auth/mercadolivre/callback

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
    // APAGA COOKIE OAUTH
    // --------------------------------------------------------

    res.setHeader(
      "Set-Cookie",
      "ml_oauth_data=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
    );


    // --------------------------------------------------------
    // MOSTRA NOVO REFRESH TOKEN
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
              #f4f4f4;

            padding:
              20px;

            border-radius:
              10px;

            word-break:
              break-all;

            border:
              1px solid #ddd;

          }

          .warning {

            background:
              #fff3cd;

            padding:
              15px;

            border-radius:
              8px;

            margin-top:
              20px;

          }

        </style>

      </head>

      <body>

        <h1>
          Autorização concluída!
        </h1>

        <p>
          O Mercado Livre autorizou sua aplicação com sucesso.
        </p>


        <h2>
          Novo Refresh Token
        </h2>


        <div class="box">

          ${escapeHtml(
            data.refresh_token
          )}

        </div>


        <div class="warning">

          <strong>
            IMPORTANTE:
          </strong>

          <p>
            Copie o valor acima e coloque na Vercel
            como a variável:
          </p>

          <strong>
            ML_REFRESH_TOKEN
          </strong>

          <p>
            Não compartilhe esse token publicamente.
          </p>

        </div>


        <p>

          Depois de salvar o Refresh Token na Vercel,
          faça um novo deploy.

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