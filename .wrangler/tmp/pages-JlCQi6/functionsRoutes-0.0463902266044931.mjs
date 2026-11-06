import { onRequestGet as __api_admin_check_js_onRequestGet } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/admin/check.js"
import { onRequestPost as __api_admin_check_js_onRequestPost } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/admin/check.js"
import { onRequestDelete as __api_maps__name__js_onRequestDelete } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/maps/[name].js"
import { onRequestGet as __api_maps__name__js_onRequestGet } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/maps/[name].js"
import { onRequestDelete as __api_prompts__name__js_onRequestDelete } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/prompts/[name].js"
import { onRequestGet as __api_prompts__name__js_onRequestGet } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/prompts/[name].js"
import { onRequestDelete as __api_sessions__key__js_onRequestDelete } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/sessions/[key].js"
import { onRequestGet as __api_sessions__key__js_onRequestGet } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/sessions/[key].js"
import { onRequestGet as __api_config_js_onRequestGet } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/config.js"
import { onRequestPost as __api_config_js_onRequestPost } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/config.js"
import { onRequestPost as __api_llm_js_onRequestPost } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/llm.js"
import { onRequestGet as __api_maps_index_js_onRequestGet } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/maps/index.js"
import { onRequestPost as __api_maps_index_js_onRequestPost } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/maps/index.js"
import { onRequestGet as __api_prompts_index_js_onRequestGet } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/prompts/index.js"
import { onRequestPost as __api_prompts_index_js_onRequestPost } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/prompts/index.js"
import { onRequestGet as __api_sessions_index_js_onRequestGet } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/sessions/index.js"
import { onRequestPost as __api_sessions_index_js_onRequestPost } from "/Users/ys5852/Documents/code/markus/cooked-llm/functions/api/sessions/index.js"

export const routes = [
    {
      routePath: "/api/admin/check",
      mountPath: "/api/admin",
      method: "GET",
      middlewares: [],
      modules: [__api_admin_check_js_onRequestGet],
    },
  {
      routePath: "/api/admin/check",
      mountPath: "/api/admin",
      method: "POST",
      middlewares: [],
      modules: [__api_admin_check_js_onRequestPost],
    },
  {
      routePath: "/api/maps/:name",
      mountPath: "/api/maps",
      method: "DELETE",
      middlewares: [],
      modules: [__api_maps__name__js_onRequestDelete],
    },
  {
      routePath: "/api/maps/:name",
      mountPath: "/api/maps",
      method: "GET",
      middlewares: [],
      modules: [__api_maps__name__js_onRequestGet],
    },
  {
      routePath: "/api/prompts/:name",
      mountPath: "/api/prompts",
      method: "DELETE",
      middlewares: [],
      modules: [__api_prompts__name__js_onRequestDelete],
    },
  {
      routePath: "/api/prompts/:name",
      mountPath: "/api/prompts",
      method: "GET",
      middlewares: [],
      modules: [__api_prompts__name__js_onRequestGet],
    },
  {
      routePath: "/api/sessions/:key",
      mountPath: "/api/sessions",
      method: "DELETE",
      middlewares: [],
      modules: [__api_sessions__key__js_onRequestDelete],
    },
  {
      routePath: "/api/sessions/:key",
      mountPath: "/api/sessions",
      method: "GET",
      middlewares: [],
      modules: [__api_sessions__key__js_onRequestGet],
    },
  {
      routePath: "/api/config",
      mountPath: "/api",
      method: "GET",
      middlewares: [],
      modules: [__api_config_js_onRequestGet],
    },
  {
      routePath: "/api/config",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_config_js_onRequestPost],
    },
  {
      routePath: "/api/llm",
      mountPath: "/api",
      method: "POST",
      middlewares: [],
      modules: [__api_llm_js_onRequestPost],
    },
  {
      routePath: "/api/maps",
      mountPath: "/api/maps",
      method: "GET",
      middlewares: [],
      modules: [__api_maps_index_js_onRequestGet],
    },
  {
      routePath: "/api/maps",
      mountPath: "/api/maps",
      method: "POST",
      middlewares: [],
      modules: [__api_maps_index_js_onRequestPost],
    },
  {
      routePath: "/api/prompts",
      mountPath: "/api/prompts",
      method: "GET",
      middlewares: [],
      modules: [__api_prompts_index_js_onRequestGet],
    },
  {
      routePath: "/api/prompts",
      mountPath: "/api/prompts",
      method: "POST",
      middlewares: [],
      modules: [__api_prompts_index_js_onRequestPost],
    },
  {
      routePath: "/api/sessions",
      mountPath: "/api/sessions",
      method: "GET",
      middlewares: [],
      modules: [__api_sessions_index_js_onRequestGet],
    },
  {
      routePath: "/api/sessions",
      mountPath: "/api/sessions",
      method: "POST",
      middlewares: [],
      modules: [__api_sessions_index_js_onRequestPost],
    },
  ]