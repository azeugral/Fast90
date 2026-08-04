// /api/auth/mercadolivre.js
//
// Inicia o processo de autenticação OAuth do Mercado Livre.
//
// URL:
// https://fast90.vercel.app/api/auth/mercadolivre
//
// Depois da autorização, o Mercado Livre redirecionará
// o usuário para:
// /api/auth/mercadolivre/callback

import crypto from "crypto";

export default async function handler(req, res) {

  try {

    // --------------------------------------------------------
    // CONFIGURAÇÕES
    // --------------------------------------------------------

    const clientId =
      process.env.ML_CLIENT_ID;

    const redirectUri =
      "https://fast90.vercel.app/api/auth/mercadolivre/callback";


    // --------------------------------------------------------
    // VERIFICA CLIENT ID
    // --------------------------------------------------------

    if (!clientId) {

      res.status(500).send(
        "ML_CLIENT_ID não está configurado na Vercel."
      );

      return;
    }


    // --------------------------------------------------------
    // GERA O CODE VERIFIER
    // --------------------------------------------------------

    const codeVerifier =
      crypto.randomBytes(32).toString("base64url");


    // --------------------------------------------------------
    // GERA O CODE CHALLENGE
    // --------------------------------------------------------

    const codeChallenge =
      crypto
        .createHash("sha256")
        .update(codeVerifier)
        .digest("base64url");


    // --------------------------------------------------------
    // STATE
    // --------------------------------------------------------
    //
    // O state ajuda a proteger o fluxo OAuth contra
    // requisições inesperadas.
    //
    // Para manter o exemplo simples, geramos um valor
    // aleatório e o enviamos no fluxo.
    //

    const state =
      crypto.randomBytes(16).toString("hex");


    // --------------------------------------------------------
    // SALVA O CODE VERIFIER EM COOKIE
    // --------------------------------------------------------
    //
    // O callback precisará desse valor para concluir
    // o fluxo PKCE.
    //

    const oauthData =
      JSON.stringify({ codeVerifier, state });

    const cookieValue =
      encodeURIComponent(oauthData);


    res.setHeader(
      "Set-Cookie",
      `ml_oauth_data=${cookieValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
    );


    // --------------------------------------------------------
    // MONTA URL DE AUTORIZAÇÃO
    // --------------------------------------------------------

    const authorizationUrl =
      new URL(
        "https://auth.mercadolivre.com.br/authorization"
      );


    authorizationUrl.searchParams.set(
      "response_type",
      "code"
    );

    authorizationUrl.searchParams.set(
      "client_id",
      clientId
    );

    authorizationUrl.searchParams.set(
      "redirect_uri",
      redirectUri
    );

    authorizationUrl.searchParams.set(
      "code_challenge",
      codeChallenge
    );

    authorizationUrl.searchParams.set(
      "code_challenge_method",
      "S256"
    );

    authorizationUrl.searchParams.set(
      "state",
      state
    );


    // --------------------------------------------------------
    // REDIRECIONA PARA O MERCADO LIVRE
    // --------------------------------------------------------

    res.redirect(
      302,
      authorizationUrl.toString()
    );

  } catch (error) {

    console.error(
      "Erro ao iniciar OAuth:",
      error
    );

    res.status(500).send(
      "Erro ao iniciar autenticação com o Mercado Livre."
    );

  }

}
