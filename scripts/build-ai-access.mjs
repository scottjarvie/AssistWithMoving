import fs from "node:fs";
import ts from "typescript";
const check = process.argv.includes("--check");
function output(path, text) {
  if (check) { if (fs.readFileSync(path, "utf8") !== text) throw new Error(`${path} is stale; run node scripts/build-ai-access.mjs`); }
  else fs.writeFileSync(path, text);
}
const policy = JSON.parse(fs.readFileSync("shared/ai-connection-policy.json", "utf8"));
for (const file of ["public/ai.txt", "public/llms.txt", "public/llms-full.txt"]) {
  const text = fs.readFileSync(file, "utf8");
  output(file, policy.instructions + "\n\n" + text.slice(text.indexOf("# ")));
}
// Derive the API-key capability catalogue from tool handlers and the exact
// backend route-to-power function. Composite handlers include helper powers.
function source(path) { return ts.createSourceFile(path, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS); }
const rest = source("convex/lib/restApi.ts");
const routeNode = rest.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "requiredScopesForRestRoute");
const routeJs = ts.transpileModule(routeNode.getText(rest).replace(/^export /, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const routeScopes = new Function(routeJs + "; return requiredScopesForRestRoute;")();
const api = source("mcp-server/assistwithmoving-api.mjs");
const functions = new Map(api.statements.filter(ts.isFunctionDeclaration).filter(n => n.name).map(n => [n.name.text, n]));
function children(node, callback) { callback(node); ts.forEachChild(node, child => children(child, callback)); }
function pathValue(node, variables = new Map()) {
  if (ts.isIdentifier(node) && variables.has(node.text)) return pathValue(variables.get(node.text), new Map([...variables].filter(([name]) => name !== node.text)));
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isConditionalExpression(node)) return pathValue(node.whenTrue, variables) ?? pathValue(node.whenFalse, variables);
  if (ts.isTemplateExpression(node)) return node.head.text + node.templateSpans.map(span => "id" + span.literal.text).join("");
  return undefined;
}
function powers(name, seen = new Set()) {
  if (seen.has(name)) return [];
  seen.add(name);
  const node = functions.get(name); if (!node) return [];
  const result = new Set();
  const variables = new Map();
  children(node, n => { if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) variables.set(n.name.text, n.initializer); });
  children(node, n => {
    if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return;
    if (n.expression.text === "assistWithMovingRequest") {
      const options = n.arguments[1]; if (!options || !ts.isObjectLiteralExpression(options)) return;
      const props = new Map(options.properties.filter(p => ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)).map(p => [p.name.getText(api), ts.isPropertyAssignment(p) ? p.initializer : p.name]));
      const path = props.get("path") && pathValue(props.get("path"), variables);
      const method = props.get("method") ? pathValue(props.get("method"), variables) ?? "POST" : "GET";
      if (path) for (const scope of routeScopes({ method, segments: path.split("/").filter(Boolean) })) result.add(scope);
    } else if (functions.has(n.expression.text)) for (const scope of powers(n.expression.text, new Set(seen))) result.add(scope);
  });
  return [...result].sort();
}
const tools = source("mcp-server/assistwithmoving-mcp.mjs");
const catalog = {};
children(tools, node => {
  if (!ts.isCallExpression(node) || node.expression.getText(tools) !== "registerTool" || node.arguments.length < 3 || !ts.isStringLiteral(node.arguments[1])) return;
  const name = node.arguments[1].text;
  const config = node.arguments[2];
  const scopes = new Set();
  children(config, n => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && functions.has(n.expression.text)) for (const scope of powers(n.expression.text)) scopes.add(scope);
  });
  catalog[name] = { scopes: ["get_api_context", "get_api_capabilities", "reduce_connection"].includes(name) ? [] : [...scopes].sort(), websiteOnly: ["add_household_member"].includes(name) };
});
const unscoped = Object.entries(catalog).filter(([name, access]) => !["get_api_context", "get_api_capabilities", "reduce_connection"].includes(name) && access.scopes.length === 0);
if (unscoped.length) throw new Error(`Undecided tool powers: ${unscoped.map(([name]) => name).join(", ")}`);
output("shared/api-tool-access.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(`AI policy and ${Object.keys(catalog).length} API tools ${check ? "verified" : "generated"}`);
