"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var src_exports = {};
__export(src_exports, {
  TKBuilder: () => TKBuilder
});
module.exports = __toCommonJS(src_exports);
var import_zod = require("zod");
var User = import_zod.z.object({
  username: import_zod.z.string()
});
var TKBuilder = class {
  constructor() {
  }
  instance(router, f, schema, middlewares = []) {
    return {
      _type: "instance",
      _schema: schema,
      _middlewares: middlewares,
      instance: (args, ctx) => ({
        fetch: f(args, ctx)
      })
    };
  }
  call(schema, f, middlewares = []) {
    return {
      _type: "call",
      _schema: schema,
      _middlewares: middlewares,
      call: f
    };
  }
  stream(schema, f, middlewares = []) {
    return {
      _type: "stream",
      _schema: schema,
      _middlewares: middlewares,
      stream: f
    };
  }
  router(routes, middlewares = []) {
    return {
      ...routes,
      _middlewares: middlewares,
      _type: "router",
      route: async (ctx) => {
        const url = new URL(ctx.req.url);
        const paths = url.pathname.split("/");
        paths.shift();
        const first = paths.shift();
        console.log("paths", paths);
        console.log("first", first);
        for (const m of middlewares) {
          let out = m.handle(ctx);
          if (out.type == "response") {
            return out.data;
          }
          ctx = out.data;
        }
        if (!ctx.__tk_internals) {
          const url2 = new URL(ctx.req.url);
          const paths2 = url2.pathname.split("/");
          paths2.shift();
          let tkreq = await ctx.req.json();
          if (typeof tkreq !== "object") {
            console.log("bad req");
            return new Response("bad request", { status: 400 });
          }
          tkreq.args = tkreq.args ? tkreq.args : [];
          if (!Array.isArray(tkreq.args)) {
            console.log("bad args", tkreq.args);
            return new Response("bad request", { status: 400 });
          }
          ctx.__tk_internals = {
            index: 0,
            paths: paths2,
            tkreq
          };
        }
        const obj = routes[ctx.__tk_internals.paths[ctx.__tk_internals.index]];
        console.log("obj", ctx.__tk_internals.paths, ctx.__tk_internals.index, obj);
        switch (obj._type) {
          case "call": {
            const payload = ctx.__tk_internals.tkreq.args.shift();
            console.log("payload", payload);
            const args = obj._schema.safeParse(payload);
            const result = obj.call(args.data, ctx);
            if (result.error) {
              const status = result.status ? result.status : 400;
              return new Response(result.error, { status });
            }
            return new Response(JSON.stringify(result), {
              status: 200
            });
          }
          case "stream": {
            const json = await ctx.req.json();
            const args = obj._schema.safeParse(json);
            const stream = obj.stream(args, ctx);
            return new Response(JSON.stringify("TODO"), {
              status: 200
            });
          }
          case "instance": {
            const json = await ctx.req.json();
            const args = obj._schema.safeParse(json);
            const { fetch: fetch2 } = obj.instance(args, ctx);
            return fetch2(ctx.req);
          }
          case "router": {
            ++ctx.__tk_internals.index;
            return obj.route(ctx);
          }
        }
        return new Response("route not found", { status: 404 });
      }
    };
  }
};
var tk = new TKBuilder();
var ks = tk.router({ other: { _type: "call", _middlewares: [], _schema: User, call: (args) => "hi" } });
var b = tk.router({
  test2: tk.call(User, (args) => args.username)
});
var c = tk.router({
  test2: tk.call(User, (args) => args.username)
});
var r = tk.router({
  test: tk.call(User, (args) => 13),
  subrouter: b,
  instancerouter: tk.instance(c, (_args, ctx) => fetch, User),
  st: tk.stream(User, (args) => ({ topic: "test", initValue: 1234 }))
});
var j = tk.call(User, (args) => args.username);
var t = {
  f: () => (args) => {
    return {
      test: "hi"
    };
  }
};
t.f()({ hi: "hello" });
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TKBuilder
});
