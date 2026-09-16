// functions/api/dados.js
//
// API da Lista de Mercado
// Cloudflare Pages Functions + D1
//
// Binding esperado no Cloudflare:
// DB -> mercado-db
//
// Tabela:
// CREATE TABLE IF NOT EXISTS listas (
//   mes TEXT PRIMARY KEY,
//   dados TEXT NOT NULL,
//   atualizado_em TEXT DEFAULT CURRENT_TIMESTAMP
// );

function respostaJson(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "Cache-Control": "no-store",
    },
  });
}

async function lerBody(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// GET /api/dados
// Retorna todos os meses.
//
// GET /api/dados?mes=2026-09
// Retorna apenas um mês.
export async function onRequestGet(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return respostaJson(
        { ok: false, erro: "Binding D1 'DB' não encontrado." },
        500
      );
    }

    const url = new URL(request.url);
    const mes = url.searchParams.get("mes");

    if (mes) {
      const registro = await env.DB
        .prepare(
          `
          SELECT mes, dados, atualizado_em
          FROM listas
          WHERE mes = ?
          `
        )
        .bind(mes)
        .first();

      if (!registro) {
        return respostaJson({
          ok: true,
          encontrado: false,
          mes,
          dados: null,
        });
      }

      let dados;

      try {
        dados = JSON.parse(registro.dados);
      } catch {
        dados = null;
      }

      return respostaJson({
        ok: true,
        encontrado: true,
        mes: registro.mes,
        dados,
        atualizado_em: registro.atualizado_em,
      });
    }

    const resultado = await env.DB
      .prepare(
        `
        SELECT mes, dados, atualizado_em
        FROM listas
        ORDER BY mes ASC
        `
      )
      .all();

    const listas = {};

    for (const registro of resultado.results || []) {
      try {
        listas[registro.mes] = JSON.parse(registro.dados);
      } catch {
        listas[registro.mes] = null;
      }
    }

    return respostaJson({
      ok: true,
      listas,
    });
  } catch (erro) {
    console.error("Erro GET /api/dados:", erro);

    return respostaJson(
      {
        ok: false,
        erro: "Não foi possível carregar os dados.",
      },
      500
    );
  }
}

// POST /api/dados
//
// Salva/atualiza um mês.
//
// Body:
// {
//   "mes": "2026-09",
//   "dados": { ... }
// }
export async function onRequestPost(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return respostaJson(
        { ok: false, erro: "Binding D1 'DB' não encontrado." },
        500
      );
    }

    const body = await lerBody(request);

    if (!body) {
      return respostaJson(
        { ok: false, erro: "JSON inválido." },
        400
      );
    }

    const mes = body.mes;
    const dados = body.dados;

    if (!mes || typeof mes !== "string") {
      return respostaJson(
        { ok: false, erro: "O campo 'mes' é obrigatório." },
        400
      );
    }

    if (dados === undefined) {
      return respostaJson(
        { ok: false, erro: "O campo 'dados' é obrigatório." },
        400
      );
    }

    const dadosJson = JSON.stringify(dados);

    await env.DB
      .prepare(
        `
        INSERT INTO listas (
          mes,
          dados,
          atualizado_em
        )
        VALUES (?, ?, CURRENT_TIMESTAMP)

        ON CONFLICT(mes)
        DO UPDATE SET
          dados = excluded.dados,
          atualizado_em = CURRENT_TIMESTAMP
        `
      )
      .bind(mes, dadosJson)
      .run();

    return respostaJson({
      ok: true,
      mes,
      salvo: true,
    });
  } catch (erro) {
    console.error("Erro POST /api/dados:", erro);

    return respostaJson(
      {
        ok: false,
        erro: "Não foi possível salvar os dados.",
      },
      500
    );
  }
}

// DELETE /api/dados?mes=2026-09
//
// Exclui um mês do D1.
export async function onRequestDelete(context) {
  try {
    const { request, env } = context;

    if (!env.DB) {
      return respostaJson(
        { ok: false, erro: "Binding D1 'DB' não encontrado." },
        500
      );
    }

    const url = new URL(request.url);
    const mes = url.searchParams.get("mes");

    if (!mes) {
      return respostaJson(
        { ok: false, erro: "Informe o mês que deseja excluir." },
        400
      );
    }

    await env.DB
      .prepare(
        `
        DELETE FROM listas
        WHERE mes = ?
        `
      )
      .bind(mes)
      .run();

    return respostaJson({
      ok: true,
      mes,
      excluido: true,
    });
  } catch (erro) {
    console.error("Erro DELETE /api/dados:", erro);

    return respostaJson(
      {
        ok: false,
        erro: "Não foi possível excluir o mês.",
      },
      500
    );
  }
}

// Outros métodos
export async function onRequest(context) {
  const metodo = context.request.method;

  if (metodo === "GET") {
    return onRequestGet(context);
  }

  if (metodo === "POST" || metodo === "PUT") {
    return onRequestPost(context);
  }

  if (metodo === "DELETE") {
    return onRequestDelete(context);
  }

  return respostaJson(
    {
      ok: false,
      erro: `Método ${metodo} não permitido.`,
    },
    405
  );
}
