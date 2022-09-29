import { Schema, unknown, z, ZodSchema } from "zod";
import {
  Emitter,
  EventEmitter,
  eventStream,
  StreamEvent,
  Topics,
} from "./events";

type Sameish<T, U> = [T] extends [U] ? ([U] extends [T] ? T : never) : never;
type MaybeAsync<T> = T | PromiseLike<T>

export type TKServerContext = Omit<Record<string, any>, "req"> & {
  req: Request;
};

export type TKStreamSuccess<V, T extends Topics, Ts extends keyof T> = {
  type: "success";
  topic: Ts;
  initValue?: Sameish<V, T[Ts]>;
};
export type TKCallSuccess<T> = T;
export type TKError = {
  type: "error";
  error: string;
  status?: number;
};
export type TKCallResult<T> = TKError | TKCallSuccess<T>;
export type TKStreamResult<V, T extends Topics, Ts extends keyof T> =
  | TKStreamSuccess<V, T, Ts>
  | TKError;

export type Instance<
  R extends Router = any,
  SchemaType extends z.ZodType = any,
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
  SchemaType extends z.ZodType = any,
  In = any,
  Out = any,
  Ctx extends TKServerContext = any
> = {
  _type: "call";
  _schema?: SchemaType;
  _middlewares: MiddleWare[];
  call: (args: In, ctx: Ctx) => MaybeAsync<TKCallResult<Out>>;
};

export type Stream<
  SchemaType extends z.ZodType = any,
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

type InternalKeys = "_type" | "_schema" | "_middlewares" | "route" | "instance" | "call" | "stream";
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
  instance<R extends Router = any, SchemaType extends z.ZodType = any>(
    router: R,
    f: (
      args: z.infer<SchemaType>,
      ctx: Ctx
    ) => MaybeAsync<(req: Request) => Promise<Response>>,
    schema?: SchemaType,
    middlewares: MiddleWare<Ctx>[] = []
  ): Instance<R, Schema, z.infer<SchemaType>, Ctx> {
    return {
      _type: "instance",
      _schema: schema,
      _middlewares: middlewares,
      instance: async (args: z.infer<SchemaType>, ctx: Ctx) => ({
        fetch: await f(args, ctx),
      }),
    };
  }
  call<SchemaType extends z.ZodType, Out>(
    schema: SchemaType,
    f: (args: z.infer<SchemaType>, ctx: Ctx) => MaybeAsync<TKCallResult<Out>>,
    middlewares: MiddleWare<Ctx>[] = []
  ): Call<Schema, z.infer<SchemaType>, Out, Ctx> {
    return {
      _type: "call",
      _schema: schema,
      _middlewares: middlewares,
      call: f,
    };
  }
  stream<SchemaType extends z.ZodType, Out>(
    schema: SchemaType,
    f: (args: z.infer<SchemaType>, ctx: Ctx) => MaybeAsync<TKStreamResult<Out, T, keyof T>>,
    middlewares: MiddleWare<Ctx>[] = []
  ): Stream<Schema, z.infer<SchemaType>, Out, Ctx, T, keyof T> {
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
              const args = obj._schema.safeParse(payload);
              const result = await obj.call(args.data, ctx);
              if (result.error) {
                const status = result.status ? result.status : 400;
                return new Response(result.error, { status });
              }
              return new Response(JSON.stringify(result), {
                status: 200,
              });
            }
            case "stream": {
              const payload = ctx.__tk_internals.tkreq.args.shift();
              const args = obj._schema.safeParse(payload);
              const result = await obj.stream(args, ctx);
              if (result.type === "error") {
                const status = result.status ? result.status : 400;
                return new Response(result.error, { status });
              }
              let publish: (event: StreamEvent<unknown>) => void;
              const unsub = this.emitter.subscribe(
                result.topic,
                (event: StreamEvent<unknown>) => publish && publish(event)
              );
              const es = eventStream(() => unsub());
              publish = es.publish;
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
              const args = obj._schema.safeParse(payload);
              const { fetch } = await obj.instance(args, ctx);
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

// Client Type Setup
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

type KeepFirstArg<F> = F extends (args: infer A, ...other: any) => infer R
  ? R extends MaybeAsync<infer RA>
  ? (args: A) => RA
  : never
  : never;

type CallType<T> = T extends (args: infer A) => MaybeAsync<infer R>
? R extends TKError
? (args: A) => Promise<[undefined, string]>
: (args: A) => Promise<[R, undefined]>
: never;

type StreamType<T> = T extends (args: infer A) => MaybeAsync<infer R>
  ? R extends TKStreamSuccess<infer V, any, any> ? (args: A) => EventStream<V>
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
    [K in keyof Omit<T, InternalKeys>]: ToBase<T[K]>;
  }
  : never
export type ToClient<T extends Router> = ToBase<T>;

/// TEMPORARY TESTS

const User = z.object({
  username: z.string(),
});

type MyContext = {
  req: Request;
};

let tk = new TKBuilder<MyContext, { topica: string }>();
let tk2 = new TKBuilder<MyContext & {self?: string}>();

let ks = tk.router({
  other: {
    _type: "call",
    _middlewares: [],
    _schema: User,
    call: (args) => "hi",
  },
});

let b = tk.router({
  test2: tk.call(User, (args) => args.username),
});

async function fa() {
  return 12345
}
let c = tk2.router({
  test2: tk.call(User, (args) => fa()),
});

let r = tk.router({
  test: tk.call(User, (args) => new Promise<number>((resolve => resolve(13)))),
  subrouter: b,
  instancerouter: tk.instance(c, (_args, ctx) => fetch, User),
  st: tk.stream(User, (args) => ({
    type: "success",
    topic: "topica",
    initValue: "test2",
  })),
});

let test2 = tk.router({
  queue: tk.instance(c, (_args, ctx) => fetch, User),
})
type Expected = ToClient<typeof test2>;

let rasd: Expected = r as any;
//rasd.queue.instance({"username": "test"}).test2.call()
//rasd.queue.instance({username: "test"}).test2.call()
//rasd.call()
//rasd.subrouter.

//rb.instancerouter.instance({username: "test"}).test2.call({username: "test"})

//[]MiddleWare

//type MiddleWare<T extends WithReq> = (ctx: T) => Response | T

//let combined: typeof r.routes & typeof b.routes

let j = tk.call(User, (args) => args.username);

//j.call()()
let t = {
  f: () => (args: { hi: string }) => {
    return {
      test: "hi",
    };
  },
};

t.f()({ hi: "hello" });
//class Router<R, SchemaType extends ZodSchema, Args = z.infer<SchemaType>> {
//    public schema: SchemaType;
//    constructor(f: (args: Args) => R) {
//        f
//    }
//    async handle(req: Request) {
//        const obj = await req.json()
//        let parsed = this.schema.safeParse(obj)
//    }
//}

export { };
