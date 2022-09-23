// src/index.ts
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
export {
  createClient
};
