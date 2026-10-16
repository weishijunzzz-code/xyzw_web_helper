import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { createApiKeyMiddleware } from "../render-backend/lib/apiKeyAuth.js";

function request(headers, expected = "test-api-key") {
  let status;
  let body;
  let allowed = false;
  createApiKeyMiddleware(() => expected)(
    { header: (name) => headers[name] },
    {
      status(code) {
        status = code;
        return this;
      },
      json(value) {
        body = value;
      },
    },
    () => {
      allowed = true;
    },
  );
  return { status, body, allowed };
}

test("API key authentication denies missing, invalid and unconfigured keys", () => {
  for (const result of [
    request({}),
    request({ "x-api-key": "wrong" }),
    request({ "x-api-key": "test-api-key" }, ""),
  ]) {
    assert.equal(result.allowed, false);
    assert.equal(result.status, 401);
    assert.deepEqual(result.body, { error: "Unauthorized" });
  }
});

test("API key authentication retains header and Bearer compatibility", () => {
  assert.equal(request({ "x-api-key": "test-api-key" }).allowed, true);
  assert.equal(request({ authorization: "bEaReR test-api-key" }).allowed, true);
});

test("the API middleware precedes every API route and leaves health public", async () => {
  const source = await readFile(
    new URL("../render-backend/server.js", import.meta.url),
    "utf8",
  );
  const ast = ts.createSourceFile(
    "server.js",
    source,
    ts.ScriptTarget.ES2022,
    true,
  );
  const routes = ast.statements
    .map((node) => {
      if (
        !ts.isExpressionStatement(node) ||
        !ts.isCallExpression(node.expression)
      )
        return null;
      const call = node.expression;
      if (
        !ts.isPropertyAccessExpression(call.expression) ||
        call.expression.expression.getText(ast) !== "app"
      )
        return null;
      const [path] = call.arguments;
      return path && ts.isStringLiteral(path)
        ? {
            method: call.expression.name.text,
            path: path.text,
            position: node.pos,
          }
        : null;
    })
    .filter(Boolean);
  const middleware = routes.find(
    ({ method, path }) => method === "use" && path === "/api",
  );
  assert.ok(middleware);
  const apiRoutes = routes.filter(({ path }) => path.startsWith("/api/"));
  assert.ok(apiRoutes.some(({ path }) => path === "/api/tasks/:id/run"));
  for (const route of apiRoutes)
    assert.ok(route.position > middleware.position, route.path);
  assert.ok(
    routes.find(({ path }) => path === "/health").position <
      middleware.position,
  );
});
