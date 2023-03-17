import { createClient, ToBase, ToClient } from "./client";
import {
  Emitter,
  EventEmitter,
  eventStream,
  StreamEvent,
  Topics,
} from "./events";

type MaybeNoArgs<Args, Ctx, R> = Args extends undefined ? (ctx: Ctx) => MaybeAsync<R> : (args: Args, ctx: Ctx) => MaybeAsync<R>
type Sameish<T, U> = [T] extends [U] ? ([U] extends [T] ? T : U extends unknown ? T : never) : T extends unknown ? U : never;
export type MaybeAsync<T> = T | PromiseLike<T>

export interface Parsable {
  parse(obj: unknown): any
}

type ParseType<T> = T extends Parsable ? ReturnType<T['parse']> : undefined;

function parseArgs<T extends Parsable>(args: unknown, schema: T): { ok: true, data: ParseType<T> } | { ok: false, error: Response } {
  let data;
  try {
    data = schema.parse(args)
  } catch (error) {
    return { ok: false, error: new Response(JSON.stringify(error), { status: 400 }) }
  }
  return { ok: true, data }
}

export type TKServerContext = Omit<Record<string, any>, "req"> & {
  req: Request;
};

export type TKOK<T> = { ok: true, data: T }
export type TKERR = { ok: false, error: string, status?: number }
export function tkok<T>(data: T): TKResult<T> {
  return TKResult.OK(data)
}
export function tkerr(error: string, status?: number): TKResult<any> { return TKResult.ERR(error, status) }

//export type TKResult<T> = TKOK<T> | TKERR
export class TKResult<T> {
  private constructor(public readonly value: TKOK<T> | TKERR) {}
  static OK<T>(data: T) { return new TKResult<T>({ok: true, data})}
  static ERR<T>(error: string, status?: number) { return new TKResult<T>({ok: false, error, status})}
  map<R>(f: (data: T) => TKResult<R>): TKResult<R> {
    return this.value.ok ? f(this.value.data) : this as unknown as TKResult<R>
  }
  get(): [T, undefined] | [undefined, string] { return this.value.ok ? [this.value.data, undefined] : [undefined, this.value.error] }
}

export type StreamReturn<V, T extends Topics, Ts extends keyof T> = { topic: Ts, initValue?: Sameish<V, T[Ts]> }
export type TKStreamResult<V, T extends Topics, Ts extends keyof T> = TKResult<StreamReturn<V, T, Ts>>

export function tkstream<T>
  (topic: string, initValue?: T) {
  return tkok({ topic, initValue })
}

export type Instance<
  R extends Router = any,
  SchemaType extends Parsable = any,
  In = any,
  Ctx extends TKServerContext = any
> = {
  _type: "instance";
  _schema?: SchemaType;
  _middlewares: MiddleWare[];
  instance: MaybeNoArgs<In, Ctx, TKResult<{ fetch: (req: Request) => Promise<Response> }>>
};

export type Call<
  SchemaType extends Parsable = any,
  In = any,
  Out = any,
  Ctx extends TKServerContext = any
> = {
  _type: "call";
  _schema?: SchemaType;
  _middlewares: MiddleWare[];
  call: MaybeNoArgs<In, Ctx, TKResult<Out>>
};

export type Stream<
  SchemaType extends Parsable = any,
  In = any,
  Out = any,
  Ctx extends TKServerContext = any,
  T extends Topics = any,
  Ts extends keyof T = any
> = {
  _type: "stream";
  _schema: SchemaType;
  _middlewares: MiddleWare[];
  stream: (args: In, ctx: Ctx) => MaybeAsync<TKStreamResult<Out, T, Ts>>;
};

export type MiddleWare<Ctx extends TKServerContext = any> = {
  handle: (
    ctx: Ctx
  ) => { type: "response"; data: Response } | { type: "ctx"; data: Ctx };
};
export type Router<Ctx extends TKServerContext = any> = {
  _type: "router";
  _middlewares: MiddleWare[];
  route: (ctx: Ctx & MaybeTKInternals, prefix?: string) => Promise<Response>;
};

export type TKInternalKeys = "_type" | "_schema" | "_middlewares" | "route" | "instance" | "call" | "stream" | "tkclient";
type Routes<Ctx extends TKServerContext = any> = {
  [key: string]: Call | Stream | Router<Ctx> | Instance | Routes<Ctx>;
};

type TKRequest = {
  args: unknown[];
};

type TKInternals = {
  index: number;
  paths: string[];
  tkreq: TKRequest;
};

type MaybeTKInternals = {
  __tk_internals?: TKInternals;
};

interface Fetch {
  fetch: (req: Request) => Promise<Response>
}

function errtoresp(tkerr: TKERR) {
  const status = tkerr.status ? tkerr.status : 400;
  return new Response(tkerr.error, { status });
}

// Build API
export class TKBuilder<
  Ctx extends TKServerContext,
  T extends Topics = Record<string, any>
> {
  private readonly emitter: Emitter<T>;
  constructor(emitter?: Emitter<T>) {
    this.emitter = emitter || new EventEmitter<T>();
  }
  emit<Ts extends keyof T>(topic: Ts, event: StreamEvent<T[Ts]>): void {
    this.emitter.emit(topic, event)
  }
  instance<R extends Router = any, SchemaType extends Parsable | undefined = undefined>(
    router: R,
    f: MaybeNoArgs<ParseType<SchemaType>, Ctx, TKResult<Fetch>>,
    schema?: SchemaType,
    middlewares: MiddleWare<Ctx>[] = []
  ): Instance<R, Parsable, ParseType<SchemaType>, Ctx> {
    return {
      _type: "instance",
      _schema: schema,
      _middlewares: middlewares,
      instance: f,
    };
  }
  call<Out, SchemaType extends Parsable | undefined = undefined>(
    f: MaybeNoArgs<ParseType<SchemaType>, Ctx, TKResult<Out>>,
    schema?: SchemaType,
    middlewares: MiddleWare<Ctx>[] = []
  ): Call<Parsable, ParseType<SchemaType>, Out, Ctx> {
    return {
      _type: "call",
      _schema: schema,
      _middlewares: middlewares,
      call: f,
    };
  }
  stream<SchemaType extends Parsable, Out>(
    schema: SchemaType,
    f: (args: ParseType<SchemaType>, ctx: Ctx) => MaybeAsync<TKStreamResult<Out, T, keyof T>>,
    middlewares: MiddleWare<Ctx>[] = []
  ): Stream<Parsable, ParseType<SchemaType>, Out, Ctx, T, keyof T> {
    return {
      _type: "stream",
      _schema: schema,
      _middlewares: middlewares,
      stream: f,
    };
  }
  router<R extends Routes>(
    routes: R,
    prefix: string = "/",
    middlewares: MiddleWare<Ctx>[] = [],
  ): Router<Ctx> & R & { tkclient: (ctx: Omit<Ctx, 'req'>) => ToBase<R> } {
    prefix = prefix.endsWith('/') ? prefix : prefix + '/'
    const route = async (ctx: Ctx & MaybeTKInternals) => {
      for (const m of middlewares) {
        let out = m.handle(ctx);
        if (out.type == "response") {
          return out.data;
        }
        ctx = {
          ...out.data,
          __tk_internals: ctx.__tk_internals,
        };
      }
      if (!ctx.__tk_internals) {
        let pathname = new URL(ctx.req.url).pathname;
        let paths: string[] = []
        let tkreq = { args: [] }
        if (pathname.startsWith(prefix)) {
          paths = pathname.replace(prefix, "").split("/");
          tkreq = await ctx.req.json();
          if (typeof tkreq !== "object") {
            return new Response("bad request", { status: 400 });
          }
          tkreq.args = tkreq.args ? tkreq.args : [];
          if (!Array.isArray(tkreq.args)) {
            return new Response("bad request", { status: 400 });
          }
        }
        ctx.__tk_internals = {
          index: 0,
          paths,
          tkreq,
        };
      }
      let path = ctx.__tk_internals.paths.shift()
      let r: Routes | undefined = routes
      while (path && r && r[path]) {
        const obj = r[path];
        switch (obj._type) {
          case "call": {
            let result: TKResult<any>
            if (obj._schema !== undefined) {
              const payload = ctx.__tk_internals.tkreq.args.shift();
              const parsed = parseArgs(payload, obj._schema)
              if (!parsed.ok) return parsed.error
              result = await obj.call(parsed.data, ctx);
            } else {
              result = await obj.call(ctx, undefined);
            }
            if (!result.value.ok) return errtoresp(result.value)
            return new Response(JSON.stringify(result.value.data), {
              status: 200,
            });
          }
          case "stream": {
            const payload = ctx.__tk_internals.tkreq.args.shift();
            const parsed = parseArgs(payload, obj._schema)
            if (!parsed.ok) return parsed.error
            const result = await obj.stream(parsed.data, ctx);
            if (!result.value.ok) {
              const status = result.value.status ? result.value.status : 400;
              return new Response(result.value.error, { status });
            }
            let publish: (event: StreamEvent<unknown>) => void;
            const unsub = this.emitter.subscribe(
              result.value.data.topic,
              (event: StreamEvent<unknown>) => publish && publish(event)
            );
            const es = eventStream(() => unsub());
            publish = es.publish;
            if (result.value.data.initValue !== undefined) {
              publish({ type: "data", data: result.value.data.initValue })
            } else {
              publish({ type: "ping" })
            }
            return new Response(es.readable, {
              status: 200,
              headers: {
                "Content-Type": "text/event-stream",
                Connection: "keep-alive",
                "Cache-Control": "no-cache",
              },
            });
          }
          case "instance": {
            let fetchImpl: TKResult<Fetch>
            if (obj._schema !== undefined) {
              const payload = ctx.__tk_internals.tkreq.args.shift();
              const parsed = parseArgs(payload, obj._schema)
              if (!parsed.ok) return parsed.error
              fetchImpl = await obj.instance(parsed.data, ctx);
            } else {
              fetchImpl = await obj.instance(ctx, undefined);
            }
            if (!fetchImpl.value.ok) return errtoresp(fetchImpl.value)
            let url = new URL(ctx.req.url);
            ctx.__tk_internals.paths.shift();
            const body = JSON.stringify(ctx.__tk_internals.tkreq)
            url.pathname = ctx.__tk_internals.paths.join('/')
            const headers = new Headers()
            for (const [header, value] of (ctx.req.headers as any).entries()) {
              if (header !== 'content-length') {
                headers.append(header, value)
              }
            }
            return fetchImpl.value.data.fetch(new Request(url, { headers, method: 'POST', body }));
          }
          case "router": {
            return obj.route(ctx);
          }
          default: {
            r = r[path] as Routes
            path = ctx.__tk_internals.paths.shift()
          }
        }
      }
      return new Response("route not found", { status: 404 });
    }
    const cli = createClient<ToBase<R>>("http://localhost" + prefix)
    const tkclient = (ctx: Omit<Ctx, 'req'>) => {
      return cli.e(undefined, {
        Request: Request,
        Response: Response,
        fetch: (req: Request) => route({ ...ctx, req } as Ctx)
      })
    }
    return {
      ...routes,
      _middlewares: middlewares,
      _type: "router",
      route,
      tkclient: tkclient
    };
  }
}
