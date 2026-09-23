import fs from "node:fs";
import path from "node:path";

const sdkRoot = process.argv[2];
const outputPath = process.argv[3];

if (!sdkRoot || !outputPath) {
  console.error("用法: node tools/build-openapi.mjs <ad_open_sdk_go 目录> <输出 json>");
  process.exit(1);
}

const apiDir = path.join(sdkRoot, "api");
const modelDir = path.join(sdkRoot, "models");

const builtins = new Set([
  "bool", "byte", "int", "int8", "int16", "int32", "int64",
  "uint", "uint8", "uint16", "uint32", "uint64",
  "float32", "float64", "string", "rune",
]);

function walk(dir, extension) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full, extension));
    else if (entry.name.endsWith(extension)) files.push(full);
  }
  return files;
}

function parseGoType(raw) {
  let text = raw.trim();
  let nullable = false;
  while (text.startsWith("*")) {
    nullable = true;
    text = text.slice(1).trim();
  }
  if (text.startsWith("[]")) {
    return { kind: "array", items: parseGoType(text.slice(2)), nullable };
  }
  const map = /^map\[string\]([\s\S]+)$/.exec(text);
  if (map) {
    return { kind: "map", value: parseGoType(map[1]), nullable };
  }
  return { kind: "named", name: text, nullable };
}

function typeLabel(type) {
  if (type.kind === "array") return `${typeLabel(type.items)}[]`;
  if (type.kind === "map") return `map[string]${typeLabel(type.value)}`;
  return type.name;
}

function isComplexQuery(type, structs) {
  if (type.kind === "array" || type.kind === "map") return true;
  if (type.kind === "named" && structs.has(type.name)) return true;
  return false;
}

const structs = new Map();
const aliases = new Map();
const enumValues = new Map();

function readModels() {
  for (const file of walk(modelDir, ".go")) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const structMatch = /^type\s+([A-Za-z0-9_]+)\s+struct\s+\{/.exec(line);
      if (structMatch) {
        const name = structMatch[1];
        const fields = [];
        let pendingComment = "";
        i++;
        for (; i < lines.length; i++) {
          const fieldLine = lines[i];
          if (/^\}/.test(fieldLine)) break;
          const comment = /^\s*\/\/\s?(.*)$/.exec(fieldLine);
          if (comment) {
            pendingComment = comment[1].trim();
            continue;
          }
          const field = /^\s*([A-Za-z0-9_]+)\s+(.+?)\s+`json:"([^"]+)"`/.exec(fieldLine);
          if (!field) {
            pendingComment = "";
            continue;
          }
          const jsonName = field[3].split(",")[0];
          if (!jsonName || jsonName === "-") {
            pendingComment = "";
            continue;
          }
          fields.push({
            name: jsonName,
            type: parseGoType(field[2]),
            optional: field[3].includes("omitempty"),
            description: pendingComment,
          });
          pendingComment = "";
        }
        structs.set(name, { fields, description: "" });
        continue;
      }

      const aliasMatch = /^type\s+([A-Za-z0-9_]+)\s+(string|int|int32|int64|float32|float64|bool)\b/.exec(line);
      if (aliasMatch) {
        const description = i > 0 ? (/^\/\/\s?(.*)$/.exec(lines[i - 1])?.[1] ?? "") : "";
        aliases.set(aliasMatch[1], { base: aliasMatch[2], description: description.trim() });
      }
    }
  }

  for (const file of walk(modelDir, ".go")) {
    const text = fs.readFileSync(file, "utf8");
    const pattern = /([A-Za-z0-9_]+)\s+([A-Za-z0-9_]+)\s+=\s+(?:"([^"]*)"|(-?\d+))/g;
    let match;
    while ((match = pattern.exec(text))) {
      const typeName = match[2];
      if (!aliases.has(typeName)) continue;
      const value = match[3] !== undefined ? match[3] : Number(match[4]);
      const values = enumValues.get(typeName) ?? [];
      if (!values.includes(value)) values.push(value);
      enumValues.set(typeName, values);
    }
  }
}

function schemaForNamed(name, nullable) {
  if (name === "Time" || name === "time.Time") {
    return { type: "string", format: "date-time", nullable: nullable || undefined };
  }
  if (name === "FormFileInfo" || name === "File") {
    return { type: "string", format: "binary", nullable: nullable || undefined };
  }
  if (name === "interface{}" || name === "any") {
    return { nullable: true };
  }
  if (builtins.has(name) || name === "byte") {
    return primitiveSchema(name, nullable);
  }
  if (structs.has(name) || aliases.has(name)) {
    const ref = { $ref: `#/components/schemas/${name}` };
    return nullable ? { allOf: [ref], nullable: true } : ref;
  }
  const ref = { $ref: `#/components/schemas/${name}` };
  return nullable ? { allOf: [ref], nullable: true } : ref;
}

function primitiveSchema(name, nullable) {
  const schema = {};
  if (name === "bool") schema.type = "boolean";
  else if (name === "string") schema.type = "string";
  else if (name === "float32") {
    schema.type = "number";
    schema.format = "float";
  } else if (name === "float64") {
    schema.type = "number";
    schema.format = "double";
  } else if (name === "int32" || name === "int16" || name === "int8") {
    schema.type = "integer";
    schema.format = "int32";
  } else {
    schema.type = "integer";
    schema.format = "int64";
  }
  if (nullable) schema.nullable = true;
  return schema;
}

function schemaForType(type) {
  if (type.kind === "array") {
    const schema = { type: "array", items: schemaForType(type.items) };
    if (type.nullable) schema.nullable = true;
    return schema;
  }
  if (type.kind === "map") {
    const schema = { type: "object", additionalProperties: schemaForType(type.value) };
    if (type.nullable) schema.nullable = true;
    return schema;
  }
  return schemaForNamed(type.name, type.nullable);
}

const fieldGlossary = {
  code: "返回码。0 表示成功",
  message: "返回信息",
  request_id: "请求日志 ID，排查问题时使用",
  data: "业务数据",
  page_info: "分页信息",
  list: "列表数据",
  page: "页码，从 1 开始",
  page_size: "每页条数",
  total_page: "总页数",
  total_number: "总条数",
  advertiser_id: "广告主 ID",
  ad_id: "计划 ID",
  ad_ids: "计划 ID 列表",
  campaign_id: "广告组 ID",
  project_id: "项目 ID",
  promotion_id: "广告 ID",
  account_id: "账户 ID",
  account_type: "账户类型",
  product_id: "商品 ID",
  product_info: "商品信息",
  material_id: "素材 ID",
  material_type: "素材类型",
  marketing_goal: "营销目标",
  aweme_id: "抖音号 ID",
  aweme_item_id: "抖音视频 ID",
  video_id: "视频 ID",
  video_cover_id: "视频封面 ID",
  video_material: "视频素材",
  image_id: "图片 ID",
  image_ids: "图片 ID 列表",
  image_mode: "素材样式",
  image_url: "图片地址",
  budget: "预算，单位元",
  budget_mode: "预算类型",
  bid: "出价",
  bid_type: "出价类型",
  external_action: "优化目标",
  deep_external_action: "深度优化目标",
  audit_status: "审核状态",
  app_id: "应用 ID",
  task_id: "任务 ID",
  component_id: "组件 ID",
  anchor_id: "锚点 ID",
  instance_id: "实例 ID",
  item_id: "条目 ID",
  word_id: "关键词 ID",
  create_time: "创建时间",
  start_time: "开始时间",
  end_time: "结束时间",
  error_message: "错误信息",
  error_list: "错误列表",
  has_more: "是否还有下一页",
  filtering: "过滤条件。对象或数组按巨量接口要求序列化成 JSON 字符串",
  height: "高度",
  width: "宽度",
  url: "链接地址",
  gender: "性别",
  age: "年龄",
  city: "城市",
  district: "地域",
  location_type: "地域类型",
  platform: "平台",
  match_type: "匹配类型",
  reason: "原因",
};

function preferChinese(existing, wireName) {
  if (existing && /[\u4e00-\u9fff]/.test(existing)) return existing;
  return fieldGlossary[wireName];
}

function schemaRefName(schema) {
  const ref = schema?.$ref || schema?.allOf?.[0]?.$ref;
  return ref ? ref.split("/").pop() : undefined;
}

function querySchema(type) {
  if (isComplexQuery(type, structs)) {
    return {
      type: "string",
      description: `JSON 字符串，结构为 ${typeLabel(type)}。对象和数组按巨量接口要求整体放进查询参数。`,
    };
  }
  return schemaForType(type);
}

function parseRequestStruct(text) {
  const match = /type\s+(Api[A-Za-z0-9_]+Request)\s+struct\s+\{([\s\S]*?)\n\}/.exec(text);
  if (!match) return new Map();
  const fields = new Map();
  for (const line of match[2].split(/\r?\n/)) {
    const field = /^\s*([A-Za-z0-9_]+)\s+(.+?)\s*$/.exec(line);
    if (!field) continue;
    if (field[1] === "ctx" || field[1] === "ApiService") continue;
    fields.set(field[1], parseGoType(field[2]));
  }
  return fields;
}

function parseDescriptions(text) {
  const descriptions = new Map();
  const pattern = /\/\/\s*(.+)\nfunc\s+\(r\s+\*Api[A-Za-z0-9_]+Request\)\s+([A-Za-z0-9_]+)\(/g;
  let match;
  while ((match = pattern.exec(text))) {
    descriptions.set(match[2][0].toLowerCase() + match[2].slice(1), match[1].trim());
  }
  return descriptions;
}

function parseOperation(text, file) {
  const method = /localVarHTTPMethod\s*=\s*http\.Method([A-Za-z]+)/.exec(text)?.[1]?.toLowerCase();
  const rawPath = /localVarPath\s*:=\s*localBasePath\s*\+\s*"([^"]+)"/.exec(text)?.[1];
  if (!method || !rawPath) return null;

  const fields = parseRequestStruct(text);
  const descriptions = parseDescriptions(text);
  const required = new Set();
  for (const match of text.matchAll(/if r\.([A-Za-z0-9_]+) == nil \{\s*return localVarReturnValue, nil, ReportError\("[^"]*required/g)) {
    required.add(match[1]);
  }

  const parameters = [];
  const formProperties = {};
  const formRequired = [];
  const addParam = (location, wireName, fieldName) => {
    const type = fields.get(fieldName);
    if (!type) return;
    if (location === "query") collectModelNames(type, queryModelNames);
    const schema = location === "query" ? querySchema(type) : schemaForType(type);
    const isRequired = required.has(fieldName) || location === "path";
    if (isRequired && schema.nullable) delete schema.nullable;
    const parameter = {
      name: wireName,
      in: location,
      required: isRequired,
      schema,
    };
    const description = preferChinese(descriptions.get(fieldName) || schema.description, wireName);
    if (description) parameter.description = description;
    if (location === "query" || location === "header" || location === "path") parameters.push(parameter);
    else {
      formProperties[wireName] = description ? { ...schema, description } : { ...schema, description: fieldGlossary[wireName] };
      if (required.has(fieldName)) formRequired.push(wireName);
    }
  };

  for (const match of text.matchAll(/parameterAddToHeaderOrQuery\(localVar(QueryParams|HeaderParams|FormParams),\s*"([^"]+)",\s*r\.([A-Za-z0-9_]+)/g)) {
    const location = match[1] === "QueryParams" ? "query" : match[1] === "HeaderParams" ? "header" : "form";
    addParam(location, match[2], match[3]);
  }
  for (const match of text.matchAll(/formFiles\["([^"]+)"\]\s*=\s*r\.([A-Za-z0-9_]+)/g)) {
    addParam("form", match[1], match[2]);
  }

  let requestBody;
  const bodyField = /localVarPostBody\s*=\s*r\.([A-Za-z0-9_]+)/.exec(text)?.[1];
  const contentTypes = [...text.matchAll(/localVarHTTPContentTypes\s*:=\s*\[\]string\{([^}]*)\}/g)].map((match) => match[1]);
  const contentType = /"([^"]+)"/.exec(contentTypes[0] ?? "")?.[1] ?? "application/json";

  if (bodyField && fields.get(bodyField)) {
    requestBody = {
      required: required.has(bodyField) || true,
      content: {
        [contentType]: { schema: schemaForType(fields.get(bodyField)) },
      },
    };
  } else if (Object.keys(formProperties).length > 0) {
    requestBody = {
      required: true,
      content: {
        [contentType.includes("multipart") ? "multipart/form-data" : "application/x-www-form-urlencoded"]: {
          schema: {
            type: "object",
            properties: formProperties,
            required: formRequired.length > 0 ? formRequired : undefined,
          },
        },
      },
    };
  }

  const responseType = /localVarReturnValue\s+\*([A-Za-z0-9_]+)/.exec(text)?.[1] ?? "object";
  const summaryMatch = /\/\*\s*\r?\n([A-Za-z0-9_]+) Method for [\s\S]*?\r?\n\r?\n([^\r\n@*][^\r\n]*)/.exec(text);
  const operationId = summaryMatch?.[1] ?? path.basename(file, ".go");
  const summary = summaryMatch?.[2]?.trim();
  const apiPath = rawPath.replace(/\/+$/, "") || "/";

  for (const name of apiPath.matchAll(/\{([^{}]+)\}/g)) {
    if (!parameters.some((item) => item.in === "path" && item.name === name[1])) {
      parameters.push({
        name: name[1],
        in: "path",
        required: true,
        schema: { type: "string" },
      });
    }
  }

  const operation = {
    operationId,
    parameters: parameters.length > 0 ? parameters : undefined,
    requestBody,
    responses: {
      200: {
        description: summary || "OK",
        content: {
          "application/json": {
            schema: responseType === "object" ? { type: "object" } : schemaForNamed(responseType, false),
          },
        },
      },
    },
  };
  if (summary) operation.summary = summary;
  if (apiPath.includes("/oauth2/")) operation.security = [];

  return { path: apiPath, method, operation, summary };
}

function componentSchema(name) {
  if (structs.has(name)) {
    const model = structs.get(name);
    const properties = {};
    const required = [];
    for (const field of model.fields) {
      const schema = schemaForType(field.type);
      const description = preferChinese(field.description, field.name);
      if (description) schema.description = description;
      properties[field.name] = schema;
      if (!field.optional) required.push(field.name);
    }
    const summary = schemaSummaries.get(name);
    return {
      type: "object",
      description: summary || undefined,
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  const alias = aliases.get(name);
  if (!alias) return { type: "object", additionalProperties: true };
  const values = enumValues.get(name);
  if (alias.base === "string") {
    return values ? { type: "string", enum: values, description: alias.description || undefined } : { type: "string", description: alias.description || undefined };
  }
  if (alias.base === "bool") return { type: "boolean" };
  if (alias.base === "float32" || alias.base === "float64") {
    return { type: "number", format: alias.base === "float32" ? "float" : "double", enum: values };
  }
  return { type: "integer", format: alias.base === "int32" ? "int32" : "int64", enum: values };
}

function collectRefs(schema, into) {
  if (!schema || typeof schema !== "object") return;
  if (schema.$ref) {
    into.add(schema.$ref.split("/").pop());
    return;
  }
  for (const value of Object.values(schema)) {
    if (Array.isArray(value)) value.forEach((item) => collectRefs(item, into));
    else if (value && typeof value === "object") collectRefs(value, into);
  }
}

readModels();
const paths = {};
const usedOperationIds = new Set();
const queryModelNames = new Set();
const schemaSummaries = new Map();
let operations = 0;

function collectModelNames(type, into) {
  if (!type) return;
  if (type.kind === "array") {
    collectModelNames(type.items, into);
    return;
  }
  if (type.kind === "map") {
    collectModelNames(type.value, into);
    return;
  }
  if (type.kind === "named" && (structs.has(type.name) || aliases.has(type.name))) {
    into.add(type.name);
  }
}

for (const file of walk(apiDir, ".go")) {
  const base = path.basename(file);
  if (!base.startsWith("api_") || base === "api_common.go") continue;
  const parsed = parseOperation(fs.readFileSync(file, "utf8"), file);
  if (!parsed) {
    console.warn(`跳过无法解析的接口文件: ${path.basename(file)}`);
    continue;
  }
  let operationId = parsed.operation.operationId;
  if (usedOperationIds.has(operationId)) operationId = `${operationId}_${parsed.method}`;
  usedOperationIds.add(operationId);
  parsed.operation.operationId = operationId;
  paths[parsed.path] ??= {};
  if (paths[parsed.path][parsed.method]) {
    console.warn(`路径重复，后者覆盖: ${parsed.method.toUpperCase()} ${parsed.path} (${path.basename(file)})`);
  }
  paths[parsed.path][parsed.method] = parsed.operation;
  if (parsed.summary) {
    const responseName = schemaRefName(parsed.operation.responses?.[200]?.content?.["application/json"]?.schema);
    const bodyContent = parsed.operation.requestBody?.content;
    const bodyName = schemaRefName(bodyContent && Object.values(bodyContent)[0]?.schema);
    if (responseName && !schemaSummaries.has(responseName)) schemaSummaries.set(responseName, parsed.summary);
    if (bodyName && !schemaSummaries.has(bodyName)) schemaSummaries.set(bodyName, parsed.summary);
  }
  operations++;
}

if (queryModelNames.size > 0) {
  const properties = {};
  for (const name of [...queryModelNames].sort()) {
    properties[name] = { $ref: `#/components/schemas/${name}` };
  }
  paths["/open_api/query_models"] = {
    get: {
      operationId: "OceanEngineQueryModelIndex",
      deprecated: true,
      summary: "查询参数模型索引。这个接口不存在，只为了让生成器输出 filtering 等查询对象。",
      description: "对象和数组类型的查询参数要先序列化成 JSON 字符串。请使用 OceanEngineJson，不要调用此路径。",
      responses: {
        200: {
          description: "查询参数模型索引",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OceanEngineQueryModels" },
            },
          },
        },
      },
      security: [],
    },
  };
}

const needed = new Set();
collectRefs({ paths }, needed);
for (const name of queryModelNames) needed.add(name);
const queue = [...needed];
while (queue.length > 0) {
  const name = queue.pop();
  const schema = componentSchema(name);
  const nested = new Set();
  collectRefs(schema, nested);
  for (const child of nested) {
    if (!needed.has(child)) {
      needed.add(child);
      queue.push(child);
    }
  }
}

const schemas = {};
for (const name of [...needed].sort()) {
  if (name === "OceanEngineQueryModels") continue;
  schemas[name] = componentSchema(name);
}
if (queryModelNames.size > 0) {
  const properties = {};
  for (const name of [...queryModelNames].sort()) {
    properties[name] = { $ref: `#/components/schemas/${name}` };
  }
  schemas.OceanEngineQueryModels = {
    type: "object",
    description: "仅用于生成查询参数模型，不是巨量接口的返回值。",
    properties,
  };
}

const document = {
  openapi: "3.0.3",
  info: {
    title: "巨量引擎 Marketing API",
    version: "1.0.0",
    description: "由官方 Go SDK 生成代码转换而来，再用 Kiota 生成 C# 客户端。对象和数组类型的查询参数是 JSON 字符串。",
  },
  servers: [{ url: "https://api.oceanengine.com" }],
  security: [{ AccessToken: [] }],
  paths,
  components: {
    securitySchemes: {
      AccessToken: { type: "apiKey", in: "header", name: "Access-Token" },
    },
    schemas,
  },
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(document));
console.log(`接口 ${operations} 个，模型 ${Object.keys(schemas).length} 个，写入 ${outputPath}`);
