// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

import * as moveFields from "../../convex/lib/moveFields";
import * as documentation from "../../convex/lib/documentation";

function source(path: string) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function readList(file: ts.SourceFile, expression: ts.Expression): string[] {
  if (ts.isAsExpression(expression)) return readList(file, expression.expression);
  if (ts.isArrayLiteralExpression(expression)) {
    return expression.elements.flatMap((element) =>
      ts.isSpreadElement(element) ? readList(file, element.expression) : readList(file, element),
    );
  }
  if (ts.isStringLiteral(expression)) return [expression.text];
  if (ts.isIdentifier(expression)) return namedList(file, expression.text);
  throw new Error(`Unexpected enum expression: ${expression.getText(file)}`);
}

function namedList(file: ts.SourceFile, name: string): string[] {
  for (const statement of file.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const variable of statement.declarationList.declarations) {
        if (ts.isIdentifier(variable.name) && variable.name.text === name && variable.initializer) {
          return readList(file, variable.initializer);
        }
      }
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (!bindings || !ts.isNamedImports(bindings)) continue;
      const specifier = bindings.elements.find((element) => element.name.text === name);
      if (!specifier) continue;
      const target = statement.moduleSpecifier.text;
      return namedList(
        source(resolve(dirname(file.fileName), target.endsWith(".mjs") ? target : `${target}.ts`)),
        specifier.propertyName?.text ?? name,
      );
    }
  }
  throw new Error(`Missing enum list ${name} in ${file.fileName}`);
}

function mcpLists() {
  const file = source("mcp-server/assistwithmoving-mcp.mjs");
  const lists: string[][] = [];
  function visit(node: ts.Node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(file) === "z" && node.expression.name.text === "enum") {
      const values = node.arguments[0];
      // These pre-existing shared MIME allowlists belong to the upload contract.
      if (!ts.isIdentifier(values) || !/^allowed.*MimeTypes$/.test(values.text)) {
        lists.push(readList(file, values));
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return lists;
}

function openApiLists(value: unknown, path = ""): string[] {
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    key === "enum" && Array.isArray(child)
      ? [`${path}: ${child.join(", ")}`]
      : openApiLists(child, path ? `${path}.${key}` : key),
  );
}

it("pins ordered value lists independently across the backend, REST, MCP and OpenAPI", () => {
  const backend = Object.entries({ ...moveFields, ...documentation })
    .flatMap(([name, value]) => Array.isArray(value) && value.every((entry) => typeof entry === "string")
      ? [`${name}: ${value.join(", ")}`]
      : [])
    .sort();
  const rest = source("convex/restApi.ts");
  const restLists = [
    "boxContainerTypes", "restExportJobTypes", "restShareLinkStatuses",
    "restShareLinkScopes", "restShareLinkRoles", "restEstimateConfidences",
    "restPlannedItemStatuses", "restPlanningSuggestionStatuses",
    "restAiJobStatuses", "restAiSuggestionStatuses", "restMovePersonRoles",
  ].map((name) => `${name}: ${namedList(rest, name).join(", ")}`);
  const openApi = JSON.parse(readFileSync("public/openapi.json", "utf8"));

  expect({
    backend,
    rest: restLists,
    mcp: mcpLists().map((values) => values.join(", ")),
    openApi: openApiLists(openApi),
  }).toMatchSnapshot();
});

it("records deliberate door-specific confidence and disposition lists", () => {
  const lists = mcpLists();
  const schemas = JSON.parse(readFileSync("public/openapi.json", "utf8")).components.schemas;
  expect(namedList(source("convex/restApi.ts"), "restEstimateConfidences")).toEqual(moveFields.estimateConfidences);
  expect(schemas.Confidence.enum).toEqual(moveFields.estimateConfidences);
  expect(lists).toContainEqual([...moveFields.estimateConfidences, "estimated"]);
  expect(lists).toContainEqual(moveFields.itemDispositions);
  expect(schemas.ItemInput.properties.disposition.enum).toEqual([
    "keep", "sell", "donate", "free", "dump", "storage", "undecided",
  ]);
});
