import { createClient, ToBase, ToClient } from "./client";
import {
  Emitter,
  EventEmitter,
  eventStream,
  StreamEvent,
  Topics,
} from "./events";

type Methods = "post" | "get" | "put" | "delete" | "stream"
type Validator<Out, In = unknown> = (args: In) => MaybeAsync<TKResult<Out>>
type MethodHandler<
  M extends Methods,
  Args, Result,
  In extends Validator<Args>,
  Out extends Validator<Result>
> = { type: M, handle: (args: Args) => MaybeAsync<TKResult<Result>>, inputv: In, outputv: Out }

type StreamHandler<
  Args, Result,
  In extends Validator<Args>,
  Out extends Validator<Result>,
  T extends Topics,
  Ts extends keyof T
> = { type: "stream", handle: (args: Args) => MaybeAsync<TKResult<StreamReturn<Out, T, Ts>>>, inputv: In, outputv: Out }

type Handler = MethodHandler<any, any, any, any, any> | StreamHandler<any, any, any, any, any, any>
type Ctx<In, Out, Headers, R extends Request> = {args: In, out: Out, headers: Headers, req: R}
type MiddeleWare<Ctx, BeforeCtx, AfterCtx> = {before: (ctx: Ctx) => BeforeCtx, after: (ctx: Ctx) => AfterCtx}
type RouterInternals<C extends Ctx<any, any, any, any>> = {middlewares: MiddeleWare[]}
type Mi<I,O> = (args: I) => O
class MiE<I, O> {
  constructor(private m: Mi<I, O>) {}
  next<NO>(f: Mi<O, NO>) {
    return new MiE((arg: I) => f(this.m(arg)))
  }
  run(args: I) { return this.m(args) }
}

let req = {} as Request
type Path = `/${string}`
type RouterTDD = {
  [key: string]: TDD<typeof key> | RouterTDD
}
type TDD<P extends string> = {path: P, rawArgs: unknown[]}

function ftdd<P extends Path, E extends RouterTDD>(r: TDD<P>, existing: E): E & {[K in P]: TDD<P>} { 
  return {...existing, [r.path]: r}
}
function addRouter<P extends Path, I extends RouterTDD, E extends RouterTDD>(p: P, r: I, existing: E): E & {[K in P]: I} {
  return {...existing, [p]: r}
}

type WithPath<P extends string> = {path: P}
type RRouter<P extends string> = WithPath<P> & Record<string, WithPath<string>>

type PHandler = {post: number}
type GHandler = {get: number}
type RHandler = PHandler | GHandler
type RRoutes = {[key: string]: RHandler}
class RouterS<E extends RRoutes> {
  constructor(private routes: E = {} as E) {}
  post<P extends string>(path: P & Path, n: number): RouterS<E & { [key in P]: PHandler }> {
    return new RouterS({...this.routes, [path]: {post: n}})
  }
  router<P extends string, R extends object>(prefix: P & Path, r: R) {
    const res = {} as any
    for (const route in r) {
      res[prefix + route] = r[route]
    }
    return new RouterS<E & { [k in addPrefix<keyof R, P>]: prefixedValue<R, k, P> }>({...this.routes, ...res})
  }
  build(): SplitObj<E, "/"> {
    return this.routes as unknown as SplitObj<E, "/">
  }
  buildd() {
    return this.routes
  }
}



type UnionToIntersection<U> =
    (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I : never
type PickAndFlatten<T, K extends keyof T = keyof T> = UnionToIntersection<T[K]>;
type SplitObj<O extends Record<string, any>, D extends string> = PickAndFlatten<{[K in keyof O]: Split<K, D, O[K]>}>
type StartSplit<O, K extends keyof O, D extends string> = Split<K, D, O[K]>
  
type Split<S, D extends string, V> =
    S extends string ?
    S extends '' ? V :
    S extends `${infer T}${D}${infer U}` ? 
    T extends '' ? Split<U, D, V>
    : {[key in T]: Split<U, D, V>} : { [key in S]: V } : never;

type getRoutes<R> = R extends RouterS<infer PE> ? PE : never;

let testST = new RouterS({other: {get: 123}, test: {post: 1234}})
let testST2 = new RouterS({["/asdas/asdsad2"]: {get: 123}, ["/asdas/1234"]: {post: 123}}).buildd()["/asdas/1234"]
//let ttestst3 = testST.router("/test/test/test/test/test/test/test", testST2.build())
//let ttest4 = ttestst3.post("/testpost", 1234).build()


type MethodS<P extends string, T> = {path: P, function: T}
type MethodGroupS<P extends string> = {path: P} & {
  [key: string]: MethodGroupS<string> | MethodS<string, any>
}

type prefixedValue<TObject extends object, TPrefixedKey extends string, TPrefix extends string> = TObject extends {[K in removePrefix<TPrefixedKey, TPrefix>]: infer TValue}
  ? TValue
  : never;

type addPrefix<TKey, TPrefix extends string> = TKey extends string
  ? `${TPrefix}${TKey}`
  : never;

type removePrefix<TPrefixedKey, TPrefix extends string> = TPrefixedKey extends addPrefix<infer TKey, TPrefix>
  ? TKey
  : never;

function build<P extends string, E extends Record<string, MethodGroupS<string> | MethodS<string, any>>>(path: P, e: E) {
  const b: {[key: string]: any} = {}
  for (const k in e) {
    b[path + e[k].path] = 123
  }
  return b as {[key in addPrefix<keyof E, P>]: number}
}


function addR<P extends string, R extends Record<string, any>, E extends RRouter<string>>(path: P & Path, r: R, e: E = {} as E): E & {[K in `${E['path']}${P}`]: R & WithPath<string>} {
  return {
    ...e,
    [e.path+path]: {...r, path}
  }
}
// ctx = {req: request, headers: Rec<string, string>, args: Args, }
// cont tkr = new TKRouter<Ctx>("/prefix")
// tkr = t.middleware(m)
// tkr = t.post("/path", () => "test", Input)
// tkr["/path"].post(args)
// tkr = t.stream("/test")
// tkr = t.instance("/", (args, ctx) => { fetch: (Req) => Resp }, Input)
// tkr = t.route("/", tkr2)
// const resp = fetchRoute(t: Router, t: req, ctx: Ctx)
const aa = addR("/aa", {test: "hi"})
const bb = addR("/cc", {test2: "hi2"}, aa)
bb

let t = bb["/aa"].path

const a = ftdd({path: "/test/abc", rawArgs: []}, {})
const b = ftdd({path: "/test/abcc", rawArgs: []}, a)
const c = addRouter("/test", b, b)

c["/test"]["/test/abc"]

type Sameish<T, U> = [T] extends [U] ? ([U] extends [T] ? T : U extends unknown ? T : never) : T extends unknown ? U : never;
export type MaybeAsync<T> = T | PromiseLike<T>

export interface Parsable {
  parse(obj: unknown): any
}

type ParseType<T> = T extends Parsable ? ReturnType<T['parse']> : never;

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
export function tkok<T>(data: T): TKOK<T> {
  return { ok: true, data }
}
export function tkerr(error: string, status?: number): TKERR { return { ok: false, error, status } }

export type TKResult<T> = TKOK<T> | TKERR
export type StreamReturn<V, T extends Topics, Ts extends keyof T> = { topic: Ts, initValue?: Sameish<V, T[Ts]> }
export type TKStreamResult<V, T extends Topics, Ts extends keyof T> =
  | TKOK<StreamReturn<V, T, Ts>>
  | TKERR;

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
    ) => MaybeAsync<Fetch>,
    schema?: SchemaType,
    middlewares: MiddleWare<Ctx>[] = []
  ): Instance<R, Parsable, ParseType<SchemaType>, Ctx> {
    return {
      _type: "instance",
      _schema: schema,
      _middlewares: middlewares,
      instance: async (args: ParseType<SchemaType>, ctx: Ctx) => f(args, ctx),
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
    prefix: string = "/",
    middlewares: MiddleWare<Ctx>[] = [],
  ): Router<Ctx> & R & { tkclient: ToBase<R> } {
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
            if (result.data.initValue !== undefined) {
              publish({ type: "data", data: result.data.initValue })
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
            const payload = ctx.__tk_internals.tkreq.args.shift();
            const parsed = parseArgs(payload, obj._schema)
            if (!parsed.ok) return parsed.error
            const fetchImpl = await obj.instance(parsed.data, ctx);
            let url = new URL(ctx.req.url);
            ctx.__tk_internals.paths.shift();
            const body = JSON.stringify(ctx.__tk_internals.tkreq)
            url.pathname = ctx.__tk_internals.paths.join('/')
            const headers = new Headers(ctx.req.headers)
            headers.delete('content-length')
            return fetchImpl.fetch(new Request(url, { headers, method: 'POST', body }));
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
    return {
      ...routes,
      _middlewares: middlewares,
      _type: "router",
      route,
      tkclient: createClient<ToBase<R>>("http://localhost" + prefix, { fetch: route }).e()
    };
  }
}
