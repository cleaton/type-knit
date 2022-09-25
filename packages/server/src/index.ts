import { Schema, unknown, z, ZodSchema } from "zod";
import { EventEmitter, eventStream, StreamEvent } from "./events";

const User = z.object({
  username: z.string(),
});

export type TKServerContext = Omit<Record<string, any>, "req"> & {
  req: Request;
};

export type TKStreamSuccess<T> = {
  type: "success";
  topic: string;
  initValue?: T;
};
export type TKCallSuccess<T> = T;
export type TKError = {
  type: "error";
  error: string;
  status?: number;
};

export type TKCallResult<T> = TKError | TKCallSuccess<T>;
export type TKStreamResult<T> = TKError | TKStreamSuccess<T>;

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
  ) => { fetch: (req: Request) => Promise<Response>; _undefinedrouter: R };
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
  call: (args: In, ctx: Ctx) => TKCallResult<Out>;
};

export type Stream<
  SchemaType extends z.ZodType = any,
  In = any,
  Out = any,
  Ctx extends TKServerContext = any
> = {
  _type: "stream";
  _schema: SchemaType;
  _middlewares: MiddleWare[];
  stream: (args: In, ctx: Ctx) => TKStreamResult<Out>;
};

export type MiddleWare<Ctx extends TKServerContext = any> = {
  handle: (
    ctx: Ctx
  ) => { type: "response"; data: Response } | { type: "ctx"; data: Ctx };
};
export type Router<Ctx extends TKServerContext = any> = Routes & {
  _type: "router";
  _middlewares: MiddleWare[];
  route: (ctx: Ctx) => Promise<Response>;
};

type InternalKeys =
  | "_type"
  | "_schema"
  | "_middlewares"
  | "route"
  | "_executor";
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
export class TKBuilder<Ctx extends TKServerContext> {
  constructor() {}
  instance<R extends Router = any, SchemaType extends z.ZodType = any>(
    router: R,
    f: (
      args: z.infer<SchemaType>,
      ctx: Ctx
    ) => (req: Request) => Promise<Response>,
    schema?: SchemaType,
    middlewares: MiddleWare<Ctx>[] = []
  ): Instance<R, Schema, z.infer<SchemaType>, Ctx> {
    return {
      _type: "instance",
      _schema: schema,
      _middlewares: middlewares,
      // @ts-ignore we don't need to return the actual router here as only fetch is needed. Only passed to keep type information
      instance: (args?: z.infer<SchemaType>, ctx: Ctx) => ({
        fetch: f(args, ctx),
      }),
    };
  }
  call<SchemaType extends z.ZodType, Out>(
    schema: SchemaType,
    f: (args: z.infer<SchemaType>, ctx: Ctx) => TKCallResult<Out>,
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
    f: (args: z.infer<SchemaType>, ctx: Ctx) => TKStreamResult<Out>,
    middlewares: MiddleWare<Ctx>[] = []
  ): Stream<Schema, z.infer<SchemaType>, Out, Ctx> {
    return {
      _type: "stream",
      _schema: schema,
      _middlewares: middlewares,
      stream: f,
    };
  }
  router<R extends Routes, Ev extends EventEmitter<Ev>>(
    routes: R,
    middlewares: MiddleWare<Ctx>[] = [],
    emitter?: Ev
  ): R & Router {
    const ev = emitter || new EventEmitter<any>();
    return {
      ...routes,
      _middlewares: middlewares,
      _type: "router",
      emitter: ev,
      route: async (ctx: Ctx & MaybeTKInternals) => {
        const url = new URL(ctx.req.url);
        const paths = url.pathname.split("/");
        paths.shift(); // remove first ''
        const first = paths.shift();
        console.log("paths", paths);
        console.log("first", first);
        for (const m of middlewares) {
          let out = m.handle(ctx);
          if (out.type == "response") {
            return out.data;
          }
          ctx = {
            ...out.data,
            __tk_internals: ctx.__tk_internals
          }
        }
        if (!ctx.__tk_internals) {
          const url = new URL(ctx.req.url);
          const paths = url.pathname.split("/");
          paths.shift();
          let tkreq = await ctx.req.json();
          if (typeof tkreq !== "object") {
            console.log("bad req");
            return new Response("bad request", { status: 400 });
          }
          tkreq.args = tkreq.args ? tkreq.args : [];
          if (!Array.isArray(tkreq.args)) {
            console.log("bad args", tkreq.args);
            return new Response("bad request", { status: 400 });
          }
          ctx.__tk_internals = {
            index: 0,
            paths: paths,
            tkreq,
          };
        }

        const obj = routes[ctx.__tk_internals.paths[ctx.__tk_internals.index]];
        console.log(
          "obj",
          ctx.__tk_internals.paths,
          ctx.__tk_internals.index,
          obj
        );
        switch (obj._type) {
          case "call": {
            const payload = ctx.__tk_internals.tkreq.args.shift();
            const args = obj._schema.safeParse(payload);
            const result = obj.call(args.data, ctx);
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
            const result = obj.stream(args, ctx);
            if (result.type === "error") {
              const status = result.status ? result.status : 400;
              return new Response(result.error, { status });
            }
            let publish: (event: StreamEvent<unknown>) => void
            const unsub = ev.subscribe(result.topic, (event: StreamEvent<unknown>) => publish && publish(event))
            const es = eventStream(() => unsub())
            publish = es.publish
            return new Response(es.readable, {
              status: 200,
              headers: {
                'Content-Type': 'text/event-stream',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-cache',
              }
            });
          }
          case "instance": {
            const json = await ctx.req.json();
            const args = obj._schema.safeParse(json);
            const { fetch } = obj.instance(args, ctx);
            return fetch(ctx.req);
          }
          case "router": {
            ++ctx.__tk_internals.index;
            return obj.route(ctx);
          }
        }
        return new Response("route not found", { status: 404 });
      },
    };
  }
}

// Client Type Setup
type KeepFirstArg<F> = F extends (args: infer A, ...other: any) => infer R
  ? (args: A) => R
  : never;
type StreamType<
  T extends (...a: any) => any,
  G = ReturnType<T>["initValue"]
> = (...a: Parameters<T>) => G;
type InstanceType<
  T extends (...a: any) => any,
  G = ToBase<ReturnType<T>["_undefinedrouter"]>
> = (...a: Parameters<T>) => G;
type ToBase<T> = T extends Call
  ? { call: KeepFirstArg<T["call"]> }
  : T extends Stream
  ? { stream: StreamType<KeepFirstArg<T["stream"]>> }
  : T extends Instance
  ? { instance: InstanceType<KeepFirstArg<T["instance"]>> }
  : T extends Router
  ? Omit<T, InternalKeys> & {
      [K in Exclude<keyof T, InternalKeys>]: ToBase<T[K]>;
    }
  : never;
export type ToClient<T extends Router> = ToBase<T>;

/// TEMPORARY TESTS
type MyContext = {
  req: Request;
};

let tk = new TKBuilder<MyContext>();

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
let c = tk.router({
  test2: tk.call(User, (args) => args.username),
});

let r = tk.router({
  test: tk.call(User, (args) => 13),
  subrouter: b,
  instancerouter: tk.instance(c, (_args, ctx) => fetch, User),
  st: tk.stream(User, (args) => ({type: 'success', topic: "test", initValue: 1234 })),
});
type Expected = ToBase<typeof r.test>;

let rasd: Expected;
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

export {};
