/**
 * Genera `src/lib/__fixtures__/openapi-contract.json` a partir del OpenAPI del
 * backend Python (Pydantic), que es la fuente de verdad del contrato que
 * consume el web vía `openapi-typescript`.
 *
 * Uso (desde `apps/api-worker`):
 *   PYTHON_OPENAPI_JSON=/ruta/openapi.json pnpm gen:contract
 *
 * Para producir el JSON:
 *   cd apps/api
 *   uv run python -c "import json; from app.main import app; open('openapi.json','w',encoding='utf-8').write(json.dumps(app.openapi(), ensure_ascii=False))"
 *
 * El fixture guarda:
 *   - `components`: la forma normalizada de los schemas compartidos (salvo las
 *     desviaciones deliberadas documentadas en el test);
 *   - `paths`: por ruta+método, los códigos de respuesta y el `$ref` de cada
 *     body (detecta rutas faltantes o status equivocados sin DB).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CONTRACT_DEVIATIONS,
  normalizeComponents,
  normalizePaths,
} from "../src/lib/contract";
import { openApiComponents } from "../src/schemas";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, "../src/lib/__fixtures__/openapi-contract.json");

const sourcePath = process.env.PYTHON_OPENAPI_JSON;
if (!sourcePath) {
  throw new Error(
    "Falta PYTHON_OPENAPI_JSON con la ruta al openapi.json del backend Python.",
  );
}

const pythonDoc = JSON.parse(readFileSync(sourcePath, "utf8")) as {
  components?: { schemas?: Record<string, unknown> };
  paths?: Record<string, unknown>;
};

const pythonSchemas = pythonDoc.components?.schemas ?? {};
const ours = new Set(openApiComponents.map(([name]) => name));
const deviations = new Set<string>(CONTRACT_DEVIATIONS);

const shared = Object.keys(pythonSchemas)
  .filter((name) => ours.has(name) && !deviations.has(name))
  .sort();

if (shared.length === 0) {
  throw new Error("La intersección de componentes quedó vacía: revisá el JSON.");
}

/**
 * Componentes que existen en Python y NO en el Worker (sin contar las
 * desviaciones deliberadas). El test exige que esté vacío: si un componente
 * desaparece del Worker, el fixture cambia y CI lo detecta.
 */
const pythonOnly = Object.keys(pythonSchemas)
  .filter((name) => !ours.has(name) && !deviations.has(name))
  .sort();

const selected: Record<string, unknown> = {};
for (const name of shared) {
  selected[name] = pythonSchemas[name];
}

const fixture = {
  components: normalizeComponents(selected),
  paths: normalizePaths(pythonDoc.paths ?? {}),
  pythonOnly,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(fixture, null, 2)}\n`,
  "utf8",
);

console.log(
  `Fixture escrito en ${outputPath} (${shared.length} componentes, ` +
    `${Object.keys(fixture.paths).length} paths, ` +
    `${pythonOnly.length} componentes solo en Python).`,
);
