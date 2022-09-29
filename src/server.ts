import {
  Emitter,
  EventEmitter,
  eventStream,
  StreamEvent,
  Topics,
} from "./events";

type Sameish<T, U> = [T] extends [U] ? ([U] extends [T] ? T : never) : never;
export type MaybeAsync<T> = T | PromiseLike<T>

export interface Parsable {
  parse(obj: unknown): any
}

type ParseType<T> = T extends Parsable ? ReturnType<T['parse']> : never;

function parseArgs<T extends Parsable>(args: unknown, schema: T): {ok: true, data: ParseType<T>} | {ok: false, error: Response } {
  let data;
  try {
    data = schema.parse(args)
  } catch (error) {
    return {ok: false, error: new Response(JSON.stringify(error), { status: 400 })}
  }
  return {ok: true, data}
}

export type TKServerContext = Omit<Record<string, any>, "req"> & {
  req: Request;
};

export type TKOK<T> = {ok: true, data: T}
export type TKERR = {ok: false, error: string, status?: number}
export function tkok<T>(data: T): TKOK<T> { return {ok: true, data} }
export function tkerr(error: string, status?: number): TKERR { return {ok: false, error, status}}

export type TKResult<T> = TKOK<T> | TKERR
export type StreamReturn<V, T extends Topics, Ts extends keyof T> = {topic: Ts, initValue?: Sameish<V, T[Ts]>}
export type TKStreamResult<V, T extends Topics, Ts extends keyof T> =
  | TKOK<StreamReturn<V, T, Ts>>
  | TKERR;

export type Instance<
  R extends Router = any,
  SchemaType extends Parsable = any,
  In = any,
  Ctx extends TKServerContext = any
> = {
  _type: "instance";
  _schema?: SchemaType;
  _middlewares: MiddleWare[];
  instance: (
    args: In,
    ctx: Ctx
  ) => Promise<{ fetch: (req: Request) => Promise<Response> }>;
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
  call: (args: In, ctx: Ctx) => MaybeAsync<TKResult<Out>>;
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
  route: (ctx: Ctx & MaybeTKInternals) => Promise<Response>;
};

export type TKInternalKeys = "_type" | "_schema" | "_middlewares" | "route" | "instance" | "call" | "stream";
type Routes<Ctx extends TKServerContext = any> = {
  [key: string]: Call | Stream | Router<Ctx> | Instance;
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
  instance<R extends Router = any, SchemaType extends Parsable = any>(
    router: R,
    f: (
      args: ParseType<SchemaType>,
      ctx: Ctx
    ) => MaybeAsync<(req: Request) => Promise<Response>>,
    schema?: SchemaType,
    middlewares: MiddleWare<Ctx>[] = []
  ): Instance<R, Parsable, ParseType<SchemaType>, Ctx> {
    return {
      _type: "instance",
      _schema: schema,
      _middlewares: middlewares,
      instance: async (args: ParseType<SchemaType>, ctx: Ctx) => ({
        fetch: await f(args, ctx),
      }),
    };
  }
  call<SchemaType extends Parsable, Out>(
    schema: SchemaType,
    f: (args: ParseType<SchemaType>, ctx: Ctx) => MaybeAsync<TKResult<Out>>,
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
    middlewares: MiddleWare<Ctx>[] = []
  ): Router<Ctx> & R {
    return {
      ...routes,
      _middlewares: middlewares,
      _type: "router",
      route: async (ctx: Ctx & MaybeTKInternals) => {
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
          const url = new URL(ctx.req.url);
          const paths = url.pathname.split("/");
          paths.shift();
          let tkreq = await ctx.req.json();
          if (typeof tkreq !== "object") {
            return new Response("bad request", { status: 400 });
          }
          tkreq.args = tkreq.args ? tkreq.args : [];
          if (!Array.isArray(tkreq.args)) {
            return new Response("bad request", { status: 400 });
          }
          ctx.__tk_internals = {
            index: 0,
            paths: paths,
            tkreq,
          };
        }
        let path = ctx.__tk_internals.paths.shift()
        while (path && routes[path]) {
          const obj = routes[path];
          switch (obj._type) {
            case "call": {
              const payload = ctx.__tk_internals.tkreq.args.shift();
              const parsed = parseArgs(payload, obj._schema)
              if (!parsed.ok) return parsed.error
              const result = await obj.call(parsed.data, ctx);
              if (!result.ok) {
                const status = result.status ? result.status : 400;
                return new Response(result.error, { status });
              }
              return new Response(JSON.stringify(result.data), {
                status: 200,
              });
            }
            case "stream": {
              const payload = ctx.__tk_internals.tkreq.args.shift();
              const parsed = parseArgs(payload, obj._schema)
              if (!parsed.ok) return parsed.error
              const result = await obj.stream(parsed.data, ctx);
              if (!result.ok) {
                const status = result.status ? result.status : 400;
                return new Response(result.error, { status });
              }
              let publish: (event: StreamEvent<unknown>) => void;
              const unsub = this.emitter.subscribe(
                result.data.topic,
                (event: StreamEvent<unknown>) => publish && publish(event)
              );
              const es = eventStream(() => unsub());
              publish = es.publish;
              if (result.data.initValue) {
                publish({ type: "data", data: result.data.initValue })
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
              const payload = ctx.__tk_internals.tkreq.args.shift();
              const parsed = parseArgs(payload, obj._schema)
              if (!parsed.ok) return parsed.error
              const { fetch } = await obj.instance(parsed.data, ctx);
              let url = new URL(ctx.req.url);
              ctx.__tk_internals.paths.shift();
              url.pathname = ctx.__tk_internals.paths.join('/')
              return fetch(new Request(url, { headers: ctx.req.headers, method: 'POST', body: JSON.stringify(ctx.__tk_internals.tkreq) }));
            }
            case "router": {
              return obj.route(ctx);
            }
            default: {
              ctx.__tk_internals.paths.shift()
            }
          }
        }
        return new Response("route not found", { status: 404 });
      },
    };
  }
}
