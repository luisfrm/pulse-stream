/**
 * Genera `src/lib/__fixtures__/openapi-contract.json` a partir del OpenAPI del
 * backend Python (Pydantic), que es la fuente de verdad del contrato que
 * consume el web vía `openapi-typescript`.
 *
 * Uso (desde `apps/api-worker`):
 *   pnpm gen:contract
 *
 * Requiere `PYTHON_OPENAPI_JSON` apuntando al JSON. Para producirlo:
 *   cd apps/api
 *   uv run python -c "import json,sys; from app.main import app; json.dump(app.openapi(), sys.stdout)" > openapi.json
 *
 * Solo se incluyen los componentes que existen en AMBOS lados (la intersección
 * con `openApiComponents`), salvo las desviaciones deliberadas documentadas en
 * el test (`UserCreate`/`UserUpdate` no aceptan campos de privilegio).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { CONTRACT_DEVIATIONS, normalizeComponents } from "../src/lib/contract";
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

const selected: Record<string, unknown> = {};
for (const name of shared) {
  selected[name] = pythonSchemas[name];
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(
  outputPath,
  `${JSON.stringify(normalizeComponents(selected), null, 2)}\n`,
  "utf8",
);

console.log(
  `Fixture escrito en ${outputPath} (${shared.length} componentes compartidos).`,
);
