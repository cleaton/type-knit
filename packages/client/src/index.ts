function exec<T>(target: TKProxyTarget, handleResponse: (resp: Response) => T) {
  return async (args: unknown) => {
    const url = new URL(target.url);
    url.pathname = url.pathname + target.execPath;
    target.execArgs.push(args);
    let r = new target.impl.Request(url, {
      ...target.options,
      body: JSON.stringify({ args: target.execArgs }),
    });
    let resp = await fetch(r);
    return handleResponse(resp);
  };
}

const proxyHandler: ProxyHandler<any> = {
  get(target: TKProxyTarget, prop, receiver) {
    let stringprop = prop as string;
    target.execPath = target.execPath
      ? target.execPath + "/" + stringprop
      : stringprop;
    switch (prop) {
      case "call":
        return exec(target, (resp) => resp.json());
      case "stream":
        return exec(target, (resp) => resp.json());
      case "instance":
        return async (args: unknown) => {
          target.execArgs.push(args);
          return new Proxy(target, proxyHandler);
        };
      default:
        return new Proxy(target, proxyHandler);
    }
  },
};

type TKProxyTarget = {
  url: URL;
  options: TKFetchOptions;
  impl: FetchImpl;
  execPath?: string;
  execArgs: unknown[];
};

type TKFetchOptions = Record<string, any> & {
  headers?: Record<string, string>;
};

export type FetchImpl = {
  Request: typeof Request;
  Response: typeof Response;
  fetch: typeof fetch;
};

export function createClient<T>(
  url: string,
  options?: TKFetchOptions,
  fetchImpl?: FetchImpl
): { e: () => T } {
  const impl: FetchImpl = fetchImpl
    ? fetchImpl
    : {
        fetch: global.fetch,
        Request: global.Request,
        Response: global.Response,
      };
  const requiredOptions = { method: "POST" };
  const requiredHeaders = { "content-type": "application/json" };
  const baseOptions = options ? options : {};
  const baseHeaders: Record<string, string> = options?.headers
    ? options.headers
    : {};
  const u = new URL(url);

  return {
    e: (override?: TKFetchOptions): T => {
      override = override ? override : {};
      const overrideHeaders: Record<string, string> = override?.headers
        ? override.headers
        : {};
      const headers = {
        ...baseHeaders,
        ...overrideHeaders,
        ...requiredHeaders,
      };
      const options = {
        ...baseOptions,
        ...override,
        ...requiredOptions,
        headers,
      };
      const target: TKProxyTarget = {
        url: u,
        options,
        impl,
        execArgs: [],
      };
      return new Proxy(target, proxyHandler);
    },
  };
}

export {};
