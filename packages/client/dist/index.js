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
  createClient: () => createClient
});
module.exports = __toCommonJS(src_exports);
function exec(target, handleResponse) {
  const arglist = target.execArgs ? target.execArgs : [];
  const url = new URL(target.url);
  url.pathname = url.pathname + target.execPath;
  return async (args) => {
    arglist.push(args);
    let r = new target.impl.Request(url, {
      ...target.options,
      body: JSON.stringify({ args: arglist })
    });
    let resp = await fetch(r);
    return handleResponse(resp);
  };
}
var proxyHandler = {
  get(target, prop, receiver) {
    let stringprop = prop;
    target.execPath = target.execPath ? target.execPath + "/" + stringprop : stringprop;
    switch (prop) {
      case "call":
        return exec(target, (resp) => resp.json());
      case "stream":
        return exec(target, (resp) => resp.json());
      default:
        return new Proxy(target, proxyHandler);
    }
  }
};
function createClient(url, options, fetchImpl) {
  const impl = fetchImpl ? fetchImpl : { fetch: global.fetch, Request: global.Request, Response: global.Response };
  const requiredOptions = { method: "POST" };
  const requiredHeaders = { "content-type": "application/json" };
  const baseOptions = options ? options : {};
  const baseHeaders = (options == null ? void 0 : options.headers) ? options.headers : {};
  return {
    e: (override) => {
      override = override ? override : {};
      const overrideHeaders = (override == null ? void 0 : override.headers) ? override.headers : {};
      const headers = {
        ...baseHeaders,
        ...overrideHeaders,
        ...requiredHeaders
      };
      const options2 = {
        ...baseOptions,
        ...override,
        ...requiredOptions,
        headers
      };
      const target = {
        url: new URL(url),
        options: options2,
        impl
      };
      return new Proxy(target, proxyHandler);
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createClient
});
