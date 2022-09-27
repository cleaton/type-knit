import { ClientStreamEvent, EventStream } from "./server";

function exec<T>(target: TKProxyTarget, executeRequest: (req: Request) => T) {
  return (args: unknown) => {
    const url = new URL(target.url);
    url.pathname = url.pathname + target.execPath;
    target.execArgs.push(args);
    let r = new target.impl.Request(url, {
      ...target.options,
      body: JSON.stringify({ args: target.execArgs }),
    });
    return executeRequest(r);
  };
}

class EventStreamImpl<T> implements EventStream<T> {
  private cancelled = false;
  private reader?: ReadableStreamDefaultReader<string>
  constructor(private req: Request) {}
  async cancel() {
    this.cancelled = true
    this.reader?.cancel()
  }
  async start(cb: (event: ClientStreamEvent<T>) => void) {
    cb({state: 'connecting'})
    let resp = await fetch(this.req)
    cb({state: 'connected'})
    const body = resp.body
    let lastData: T | undefined
    if (body) {
      this.reader = body.pipeThrough(new TextDecoderStream()).getReader()
      let buffer = '';
      let endOfStream = false
      while (!this.cancelled) {
        let {done, value} = await this.reader.read()
        if (done) {
          endOfStream = true
          break;
        } if (value) {
          let end = value.indexOf("\n")
          if (end) {
            buffer += value.slice(0, end)
            let data = JSON.parse(buffer)
            lastData = data
            cb({state: "data", data})
            buffer = value.slice(end + 1)
          } else {
            buffer += value
          }
        }
      }
      if (endOfStream) {
        cb({state: "done", lastData})
      }
    }
  }
}

const proxyHandler: ProxyHandler<any> = {
  get(target: TKProxyTarget, prop, receiver) {
    let stringprop = prop as string;
    target.execPath = target.execPath
      ? target.execPath + "/" + stringprop
      : stringprop;
    switch (prop) {
      case "call":
        return exec(target, (req) => fetch(req).then(resp => resp.json()));
      case "stream":
        return exec(target, (req) => new EventStreamImpl(req));
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
        fetch: fetch,
        Request: Request,
        Response: Response,
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
