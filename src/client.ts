import { Call, Instance, Router, Stream, StreamReturn, tkerr, TKInternalKeys, TKOK, tkok, TKStreamResult } from "./server";
import type { MaybeAsync } from "./utils"
function exec<T>(target: TKProxyTarget, executeRequest: (req: Request) => T) {
  return (args: unknown) => {
    const url = new URL(target.url);
    url.pathname = url.pathname + target.execPath;
    if (args !== undefined) target.execArgs.push(args);
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
  constructor(private impl: FetchImpl, private req: Request) { }
  async cancel() {
    this.cancelled = true
    this.reader?.cancel()
  }
  async start(cb: (event: ClientStreamEvent<T>) => void) {
    cb({ state: 'connecting' })
    let resp = await this.impl.fetch(this.req)
    if (resp.ok) {
      cb({ state: 'connected' })
      const body = resp.body
      let lastData: T | undefined
      if (body) {
        this.reader = body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = '';
        let endOfStream = false
        while (!this.cancelled) {
          let { done, value } = await this.reader.read()
          if (done) {
            endOfStream = true
            break;
          }
          if (value) {
            buffer += value
            let split = buffer.indexOf("\n")
            while (split >= 0) {
              let b = buffer.slice(0, split)
              if (b !== "") { // empty newline === Ping
                const data = JSON.parse(buffer)
                cb({ state: "data", data })
              }
              buffer = buffer.slice(split + 1)
              split = buffer.indexOf("\n")
            }
          }
        }
        if (endOfStream) {
          cb({ state: "done", lastData })
        }
      }
    } else {
      //TODO: better error handling
      console.log(await resp.body)
    }
  }
}

async function handleCall(impl: FetchImpl, req: Request) {
  const resp = await impl.fetch(req)
  if (resp.ok) {
    return tkok(await resp.json())
  }
  return tkerr(await resp.text(), resp.status)
}

const proxyHandler: ProxyHandler<any> = {
  get(target: TKProxyTarget, prop, receiver) {
    let stringprop = prop as string;
    target.execPath = target.execPath
      ? target.execPath + "/" + stringprop
      : stringprop;
    switch (prop) {
      case "call":
        return exec(target, (req) => handleCall(target.impl, req));
      case "stream":
        return exec(target, (req) => new EventStreamImpl(target.impl, req));
      case "instance":
        return (args: unknown) => {
          if (args !== undefined) target.execArgs.push(args);
          return new Proxy(target, proxyHandler);
        };
      default:
        return new Proxy(target, proxyHandler);
    }
  },
};

export type CSEConnecting = { state: 'connecting' }
export type CSEConnected = { state: 'connected' }
export type CSEData<T> = { state: 'data', data: T }
export type CSEReconnecting<T> = { state: 'reconnecting', lastError?: string, lastData?: T }
export type CSEDone<T> = { state: 'done', lastData?: T }

export type ClientStreamEvent<T> = CSEConnecting | CSEConnected | CSEData<T> | CSEReconnecting<T> | CSEDone<T>

export interface EventStream<T> {
  cancel(): Promise<void>;
  start(cb: (event: ClientStreamEvent<T>) => void): void;
}

type GetArg<F> = F extends (first: any) => MaybeAsync<infer RA>
  ? () => Promise<RA>
  : F extends (first: infer A, ctx: any) => MaybeAsync<infer RA>
  ? (args: A) => Promise<RA>
  : never;

type CallType<T> = T extends (args: infer A) => MaybeAsync<infer R>
  ? (args: A) => Promise<R>
  : never;

type StreamType<T> = T extends (args: infer A) => MaybeAsync<infer R>
  ? R extends TKOK<StreamReturn<infer V, any, any>>
  ? (args: A) => EventStream<V>
  : never
  : never;

type InstanceType<T, IR> = T extends (...a: any) => any
  ? (...a: Parameters<T>) => ToBase<IR>
  : never;

export type ToBase<T> = T extends Call
  ? { [K in keyof Pick<T, "call">]: GetArg<T["call"]> }
  : T extends Stream
  ? { [K in keyof Pick<T, "stream">]: StreamType<GetArg<T["stream"]>> }
  : T extends Instance<infer IR>
  ? {
    [K in keyof Pick<T, "instance">]: InstanceType<
      GetArg<T["instance"]>, IR
    >;
  }
  : T extends Record<string, any> ? {
    [K in keyof Omit<T, TKInternalKeys>]: ToBase<T[K]>;
  }
  : never
export type ToClient<T extends Router> = ToBase<T>;

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
  fetch: typeof fetch | ((req: Request) => Promise<Response>);
};

export function createClient<T>(
  url: string,
  options?: TKFetchOptions,
  fetchImpl?: FetchImpl
) {
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

  let u: URL
  try {
    u = new URL(url);
  } catch (error) {
    u = new URL(url, origin)
  }

  u.pathname = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/'

  return {
    e: (override?: TKFetchOptions, fetchImpl?: FetchImpl): T => {
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
        impl: fetchImpl || impl,
        execArgs: [],
      };
      return new Proxy(target, proxyHandler);
    },
  };
}

export { };
