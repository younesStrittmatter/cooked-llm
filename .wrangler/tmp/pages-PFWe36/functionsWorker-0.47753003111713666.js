var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// api/admin/check.js
async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!env.ADMIN_PASSWORD) {
    return Response.json({ ok: false, error: "ADMIN_PASSWORD not configured" }, { status: 500 });
  }
  const ok = typeof body.password === "string" && body.password === env.ADMIN_PASSWORD;
  return Response.json({ ok }, { status: ok ? 200 : 401 });
}
__name(onRequestPost, "onRequestPost");

// api/maps/[name].js
function isAuthorized(request, env) {
  const key = request.headers.get("x-admin-key") || "";
  return Boolean(env.ADMIN_PASSWORD) && key === env.ADMIN_PASSWORD;
}
__name(isAuthorized, "isAuthorized");
async function onRequestGet({ request, env, params }) {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.MAPS_KV) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const name = decodeURIComponent(params.name);
  const raw = await env.MAPS_KV.get(`map:${name}`);
  if (!raw) return Response.json({ error: "Not found" }, { status: 404 });
  try {
    const record = JSON.parse(raw);
    return Response.json({ name, ...record });
  } catch {
    return Response.json({ error: "Corrupt map data" }, { status: 500 });
  }
}
__name(onRequestGet, "onRequestGet");
async function onRequestDelete({ request, env, params }) {
  if (!isAuthorized(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.MAPS_KV) {
    return Response.json(
      { error: "Storage not configured (MAPS_KV binding missing)" },
      { status: 500 }
    );
  }
  const name = decodeURIComponent(params.name);
  await env.MAPS_KV.delete(`map:${name}`);
  return Response.json({ deleted: name });
}
__name(onRequestDelete, "onRequestDelete");

// ../src/game/map-symbols.js
var MAP_SYMBOLS = [
  { char: ".", name: "floor" },
  { char: "#", name: "wall" },
  { char: "C", name: "counter" },
  { char: "B", name: "cutting board" },
  { char: "T", name: "tomato dispenser" },
  { char: "P", name: "pumpkin dispenser" },
  { char: "L", name: "plate dispenser" },
  { char: "X", name: "trash" },
  { char: "D", name: "delivery" }
];
var DISPENSE_ITEMS = {
  T: "tomato",
  P: "pumpkin",
  L: "plate"
};
function symbolByChar(char) {
  const entry = MAP_SYMBOLS.find((s) => s.char === char);
  if (!entry) return null;
  const dispenseItem = DISPENSE_ITEMS[char];
  return {
    char: entry.char,
    type: typeForChar(char),
    name: entry.name,
    dispenseItem
  };
}
__name(symbolByChar, "symbolByChar");
function typeForChar(char) {
  if (char === ".") return "floor";
  if (char === "#") return "wall";
  if (char === "C") return "counter";
  if (char === "B") return "cuttingBoard";
  if (char === "X") return "trash";
  if (char === "D") return "delivery";
  if (char in DISPENSE_ITEMS) return "dispenser";
  return "floor";
}
__name(typeForChar, "typeForChar");

// ../src/game/map.js
function buildMap(text) {
  const layout = text.trimEnd();
  const rows = layout.split("\n");
  const width = Math.max(...rows.map((row) => row.length));
  const height = rows.length;
  const cells = rows.map(
    (row, y) => [...row.padEnd(width, ".")].map((char, x) => {
      const sym = symbolByChar(char);
      const type = sym?.type ?? "floor";
      const cell = { x, y, type, item: null, cutProgress: 0 };
      if (sym?.dispenseItem) {
        cell.dispenseItem = sym.dispenseItem;
      }
      return cell;
    })
  );
  return { width, height, cells };
}
__name(buildMap, "buildMap");

// ../shared/game-defaults.js
var DEFAULT_MAP = `###############
#T......C....P#
#L....X.......#
#....B........#
#.............#
#...C..D..C...#
#.............#
#.............#
###############`;
var DEFAULT_COLORS = {
  hat: "#ffffff",
  apron: "#0040ff",
  hair: "#ffc500",
  mustache: "#5a3a1a",
  skin: "#e3a691"
};
var DEFAULT_SETTINGS = {
  walkSpeed: 1,
  cutSpeed: 1
};

// api/config.js
var ACTIVE_KEY = "active";
function isAuthorized2(request, env) {
  const key = request.headers.get("x-admin-key") || "";
  return Boolean(env.ADMIN_PASSWORD) && key === env.ADMIN_PASSWORD;
}
__name(isAuthorized2, "isAuthorized");
function fallbackConfig() {
  return {
    mapName: null,
    mapText: DEFAULT_MAP,
    walkSpeed: DEFAULT_SETTINGS.walkSpeed,
    cutSpeed: DEFAULT_SETTINGS.cutSpeed,
    colors: DEFAULT_COLORS,
    publishedAt: null
  };
}
__name(fallbackConfig, "fallbackConfig");
async function onRequestGet2({ env }) {
  const fallback = fallbackConfig();
  if (!env.MAPS_KV) {
    return Response.json(fallback);
  }
  const raw = await env.MAPS_KV.get(ACTIVE_KEY);
  if (!raw) return Response.json(fallback);
  try {
    const data = JSON.parse(raw);
    return Response.json({ ...fallback, ...data });
  } catch {
    return Response.json(fallback);
  }
}
__name(onRequestGet2, "onRequestGet");
async function onRequestPost2({ request, env }) {
  if (!isAuthorized2(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.MAPS_KV) {
    return Response.json(
      { error: "Storage not configured (MAPS_KV binding missing)" },
      { status: 500 }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mapText = String(body.mapText ?? "");
  try {
    buildMap(mapText);
  } catch (err) {
    return Response.json({ error: `Invalid map: ${err.message}` }, { status: 400 });
  }
  const config = {
    mapName: body.mapName ? String(body.mapName) : null,
    mapText: mapText.trimEnd(),
    walkSpeed: Number(body.walkSpeed) || DEFAULT_SETTINGS.walkSpeed,
    cutSpeed: Number(body.cutSpeed) || DEFAULT_SETTINGS.cutSpeed,
    colors: {
      skin: body.colors?.skin ?? DEFAULT_COLORS.skin,
      hair: body.colors?.hair ?? DEFAULT_COLORS.hair,
      mustache: body.colors?.mustache ?? DEFAULT_COLORS.mustache,
      apron: body.colors?.apron ?? DEFAULT_COLORS.apron,
      hat: body.colors?.hat ?? DEFAULT_COLORS.hat
    },
    publishedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  await env.MAPS_KV.put(ACTIVE_KEY, JSON.stringify(config));
  return Response.json(config);
}
__name(onRequestPost2, "onRequestPost");

// api/llm.js
async function onRequestPost3({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const prompt = body.prompt?.trim();
  if (!prompt) {
    return Response.json({ error: "prompt is required" }, { status: 400 });
  }
  if (!env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }
  const model = env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001";
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) {
    const err = await res.text();
    return Response.json({ error: err }, { status: res.status });
  }
  const data = await res.json();
  const text = data.content?.find((block) => block.type === "text")?.text ?? "";
  return Response.json({ text, model });
}
__name(onRequestPost3, "onRequestPost");

// api/maps/index.js
function isAuthorized3(request, env) {
  const key = request.headers.get("x-admin-key") || "";
  return Boolean(env.ADMIN_PASSWORD) && key === env.ADMIN_PASSWORD;
}
__name(isAuthorized3, "isAuthorized");
function normalizeName(name) {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}
__name(normalizeName, "normalizeName");
async function onRequestGet3({ request, env }) {
  if (!isAuthorized3(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.MAPS_KV) {
    return Response.json({ maps: [] });
  }
  const list = await env.MAPS_KV.list({ prefix: "map:" });
  const maps = [];
  for (const key of list.keys) {
    const raw = await env.MAPS_KV.get(key.name);
    if (!raw) continue;
    try {
      const { savedAt } = JSON.parse(raw);
      maps.push({ name: key.name.slice("map:".length), savedAt });
    } catch {
    }
  }
  maps.sort((a, b) => a.name.localeCompare(b.name));
  return Response.json({ maps });
}
__name(onRequestGet3, "onRequestGet");
async function onRequestPost4({ request, env }) {
  if (!isAuthorized3(request, env)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!env.MAPS_KV) {
    return Response.json(
      { error: "Storage not configured (MAPS_KV binding missing)" },
      { status: 500 }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = normalizeName(body.name);
  if (!name) {
    return Response.json({ error: "Map name is required" }, { status: 400 });
  }
  const text = String(body.text ?? "");
  try {
    buildMap(text);
  } catch (err) {
    return Response.json({ error: `Invalid map: ${err.message}` }, { status: 400 });
  }
  const record = { text: text.trimEnd(), savedAt: (/* @__PURE__ */ new Date()).toISOString() };
  await env.MAPS_KV.put(`map:${name}`, JSON.stringify(record));
  return Response.json({ name, ...record });
}
__name(onRequestPost4, "onRequestPost");

// ../.wrangler/tmp/pages-PFWe36/functionsRoutes-0.7135756199095074.mjs
var routes = [
  {
    routePath: "/api/admin/check",
    mountPath: "/api/admin",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost]
  },
  {
    routePath: "/api/maps/:name",
    mountPath: "/api/maps",
    method: "DELETE",
    middlewares: [],
    modules: [onRequestDelete]
  },
  {
    routePath: "/api/maps/:name",
    mountPath: "/api/maps",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet]
  },
  {
    routePath: "/api/config",
    mountPath: "/api",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet2]
  },
  {
    routePath: "/api/config",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost2]
  },
  {
    routePath: "/api/llm",
    mountPath: "/api",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost3]
  },
  {
    routePath: "/api/maps",
    mountPath: "/api/maps",
    method: "GET",
    middlewares: [],
    modules: [onRequestGet3]
  },
  {
    routePath: "/api/maps",
    mountPath: "/api/maps",
    method: "POST",
    middlewares: [],
    modules: [onRequestPost4]
  }
];

// ../node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: /* @__PURE__ */ __name(() => {
            isFailOpen = true;
          }, "passThroughOnException")
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
export {
  pages_template_worker_default as default
};
