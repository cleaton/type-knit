import { Call, Instance, MaybeAsync, Router, Stream, StreamReturn, tkerr, TKInternalKeys, TKOK, tkok, TKStreamResult } from "./server";

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

async function handleCall(req: Request) {
  const resp = await fetch(req)
  if (resp.status === 200) {
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
        return exec(target, (req) => handleCall(req));
      case "stream":
        return exec(target, (req) => new EventStreamImpl(req));
      case "instance":
        return (args: unknown) => {
          target.execArgs.push(args);
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

export type ClientStreamEvent<T> = CSEConnecting  | CSEConnected | CSEData<T> | CSEReconnecting<T> | CSEDone<T>

export interface EventStream<T> {
  cancel(): Promise<void>;
  start(cb: (event: ClientStreamEvent<T>) => void): void;
}

type KeepFirstArg<F> = F extends (args: infer A, ...other: any) => infer R
  ? R extends MaybeAsync<infer RA>
  ? (args: A) => RA
  : never
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

type ToBase<T> = T extends Call
  ? { [K in keyof Pick<T, "call">]: CallType<KeepFirstArg<T["call"]>> }
  : T extends Stream
  ? { [K in keyof Pick<T, "stream">]: StreamType<KeepFirstArg<T["stream"]>> }
  : T extends Instance<infer IR>
  ? {
    [K in keyof Pick<T, "instance">]: InstanceType<
      KeepFirstArg<T["instance"]>, IR
    >;
  }
  : T extends object ? {
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
