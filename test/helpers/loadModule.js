import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

/**
 * Execute a real source module with isolated browser/network dependencies.
 * @param {URL} url Module under test.
 * @param {object} dependencies Explicit module dependency replacements.
 * @param {object} globals Browser and timer globals for the isolated context.
 * @returns {Promise<object>} Runtime exports from the transpiled source.
 */
export async function loadModule(url, dependencies = {}, globals = {}) {
  const source = await readFile(url, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: url.pathname,
  });
  const exports = {};
  vm.runInNewContext(
    outputText,
    {
      exports,
      require(name) {
        if (!Object.hasOwn(dependencies, name))
          throw new Error(`Unexpected dependency: ${name}`);
        return dependencies[name];
      },
      console,
      setTimeout,
      clearTimeout,
      ...globals,
    },
    { filename: url.pathname },
  );
  return exports;
}
