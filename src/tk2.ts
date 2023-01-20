type TKOK<T> = { ok: true; value: T };
type TKERR = { ok: false; error: string; status?: number };
type TKCONCRETE<T> = TKOK<T> | TKERR;
interface Result<C> {
  response(): Promise<Response>;
  concrete(): Promise<TKCONCRETE<C>>;
}

interface CTXMethods {
  ok<T>(value: T): Result<T>;
  err(error: string, status?: number): Result<TKERR>;
}

type Method<Name extends string, Decoded, InFormat, OutFormat> = {
  name: Name;
  requestDecoder: (req: Request) => Promise<Decoded>;
  requestEncoder: <IN>(args: IN) => Promise<Request>;
  responseDecoder: <OUT>(resp: Response) => Promise<OUT>;
  responseEncoder: <OUT>(out: OUT) => Promise<Response>;
};
type Methods = {
  [K in string]: Method<K, any, any, any>;
};

type GetInReq<T> = T extends Method<any, any, infer InReq, any> ? InReq : never;
type GetOutReq<T> = T extends Method<any, any, any, infer OutReq> ? OutReq : never;

const POST: Method<"POST", { headers: Record<string, string> }, JSONBody<any, any, any>, any> = {
  name: "POST",
  requestDecoder: async (req: Request) => ({
    headers: Object.fromEntries(req.headers),
  }),
  requestEncoder: async <IN>(args: IN) => new Request(""),
  responseDecoder: async <OUT>(resp: Response) => resp.json<OUT>(),
  responseEncoder: async <OUT>(out: OUT) => new Response(JSON.stringify(out)),
};

function buildMethods<T extends Methods>(methods: T) {
  return methods;
}
const DefaultMethods = buildMethods({
  POST: POST,
});
type DefaultMethods = typeof DefaultMethods;

function buildContextMethods<M extends Methods>(m: M) {
  return Object.fromEntries(
    Object.entries(m).map(([name, method], _) => [
      name,
      {
        ok<T>(value: T): Result<T> {
          return {
            async response() {
              return method.responseEncoder(value);
            },
            async concrete() {
              return { ok: true, value };
            },
          };
        },
        err(error: string, status?: number) {
          status = status ? (status >= 400 ? status : 400) : 400;
          return {
            async response() {
              return new Response(error, { status });
            },
            async concrete() {
              return { ok: false, error };
            },
          };
        },
      },
    ])
  ) as Record<keyof M, CTXMethods>;
}


type HandleHelper<IN> = CTXMethods & {
  in: IN
}
type AddRouteF<CTX, M extends Method<any, any, any, any>> = <P extends string, IN extends GetInReq<M>, OUT extends GetOutReq<M>>(
  path: P,
  validate: (decoded: GetDecodeType<M>) => IN,
  handle: (tk: HandleHelper<IN>, ctx: CTX) => Result<OUT> | Promise<Result<OUT>>
) => { [path in P]: { [method in GetMethodName<M>]: TKMethod<IN, OUT, CTX> } };
type RouteMethods<CTX, MethodsImplementations extends Methods> = {
  [m in keyof MethodsImplementations]: AddRouteF<CTX, MethodsImplementations[m]>;
};

function createAddRouteF<CTX, M extends Method<any, any, any, any>>(method: M): AddRouteF<CTX, M> {
  return <P extends string, IN extends GetInReq<M>, OUT extends GetOutReq<M>>(
    path: P,
    validate: (decoded: GetDecodeType<M>) => IN,
    handle: (tk: HandleHelper<IN>, ctx: CTX) => Result<OUT> | Promise<Result<OUT>>
  ) => {
    return {
      [path]: {
        [method.name]: async (req: Request, ctx: CTX) => {
          const DECODED = await method.requestDecoder(req);
          const helper = {
            ...this.contextMethoods[method],
            in: validate(DECODED)
          }
          const OUT = await handle(helper, ctx);
          return method.responseEncoder(OUT);
        },
      },
    } as {
      [path in P]: { [method in GetMethodName<M>]: TKMethod<IN, OUT, CTX> };
    };
  };
}
function tkBuilder<CTX = {}, CustomMethods extends Methods = {}>(custom?: CustomMethods) {
  const methods = {
    ...DefaultMethods,
    ...custom,
  };
  const contextMethoods = buildContextMethods(methods);
  return Object.fromEntries(Object.entries(methods).map(([name, method], _) => [name, createAddRouteF(method)])) as RouteMethods<CTX, typeof methods>;
}

const tkb = tkBuilder();

/// CLIENT CONFIGURATION
function createRequestBuilder<M extends Method<any, any, any, any>>(method: M) {
  (args: unknown) => {
    const resp = method.requestEncoder(args).then(req => fetch(req))
    return {
      async response() { return resp },
      async concrete() { return await method.responseDecoder(await resp) }
    }
  }
}
function tkClient<T extends Record<string, Record<keyof (CustomMethods & DefaultMethods), any>>, CustomMethods extends Methods = {}>(url: string, custom?: CustomMethods) {
  const methods = {
    ...DefaultMethods,
    ...custom,
  };
  const reqConstructors = Object.fromEntries(Object.entries(methods).map(([name, method], _) => [name, createRequestBuilder(method)]))
  return <P extends keyof T>(path: P) => reqConstructors as T[P]
}
/// CLIENT CONFIGURATIOn

//class TKServer<CTX = {}, CustomMethods extends Methods = {}> extends dynamicRouterMethodsClass()<CTX, CustomMethods & DefaultMethods, keyof (CustomMethods & DefaultMethods)> {
//    private m: DefaultMethods & CustomMethods
//    private contextMethoods: Record<keyof (DefaultMethods & CustomMethods), CTXMethods>
//    constructor(custom?: CustomMethods) {
//        this.m = {
//            ...DefaultMethods,
//            ...custom
//        }
//        this.contextMethoods = buildContextMethods(this.m)
//    }
//    route<
//    P extends string,
//    M extends keyof (DefaultMethods & CustomMethods),
//    IN extends GetInReq<(DefaultMethods & CustomMethods)[M]>,
//    OUT extends GetOutReq<(DefaultMethods & CustomMethods)[M]>
//    >(path: P,
//    method: M,
//    validate: (decoded: GetDecodeType<M>) => IN,
//    handle: (args: IN, ctx: CTX & CTXMethods) => Result<OUT>) {
//        const methodInstance = this.m[method]
//        return {
//            [path]: {
//                [methodInstance.name]: async (req: Request, ctx: CTX) => {
//                    const DECODED = await methodInstance.requestDecoder(req)
//                    const IN = validate(DECODED)
//                    const OUT = handle(IN, { ...ctx, ...this.contextMethoods[method] })
//                    return methodInstance.responseEncoder(OUT)
//                }
//            }
//        } as { [path in P]: { [method in GetMethodName<M>]: TKMethod<IN, OUT, CTX> } }
//    }
//}
//
//const tk = new TKServer();

//class TKClient<> {
//
//}

type GetDecodeType<T> = T extends Method<any, infer Decoded, any, any> ? Decoded : never;
type GetMethodName<T> = T extends Method<infer Name, any, any, any> ? Name : never;
type TKMethod<IN, OUT, CTX> = (req: Request, ctx: CTX) => Promise<Response>;
type JSONBody<H extends Record<string, string>, T extends Record<string, string>, J> = { headers?: H; query?: T; json?: J };

const test = tkb.POST(
  "/test/something",
  (test) => ({ json: { hi: 1234 } }),
  async (tk, ctx) => tk.ok({ out: tk.in.json.hi })
);
const test2 = tkb.POST(
  "/test/something2",
  (test) => ({ json: { hi: 1234 } }),
  async (tk, ctx) => tk.ok({ out: tk.in.json.hi })
);
const test3 = tkb.POST(
  "/test/something3",
  (test) => ({ json: { hi: 1234 } }),
  async (tk, ctx) => tk.ok({ out: "1234" })
);

type Router<CTX> = {
  [k in string]: { [m in string]: TKMethod<any, any, CTX> };
};

type ToClientHandler<T> = T extends TKMethod<infer IN, infer OUT, any> ? (args: IN) => Result<OUT> : never;
type ToClient<R extends Router<any>> = {
  [K in keyof R]: { [M in keyof R[K]]: ToClientHandler<R[K][M]> };
};

const re = merge(test, test2, test3);

type Client = ToClient<typeof re>;

const testcli = tkClient<Client>("http://127.0.0.1");
const r = testcli("/test/something").POST({json: {hi: 123}}).concrete()

async function route<CTX>(ctx: CTX, req: Request, r: Router<CTX>) {
  const url = new URL(req.url);
  const methodName = req.headers.get("tk-m");
  const methods = r[url.pathname];
  const m = methods ? methods[methodName] : undefined;
  return m ? m(req, ctx) : new Response("not found", { status: 404 });
}
const t = "" as unknown;
route(t, new Request(""), re);

/// MERGE UTIL
// Names of properties in T with types that include undefined
type OptionalPropertyNames<T> = {
  [K in keyof T]: undefined extends T[K] ? K : never;
}[keyof T];

// Common properties from L and R with undefined in R[K] replaced by type in L[K]
type SpreadProperties<L, R, K extends keyof L & keyof R> = {
  [P in K]: L[P] | Exclude<R[P], undefined>;
};

// Type of { ...L, ...R }
type Spread<L, R> = // Properties in L that don't exist in R
  Pick<L, Exclude<keyof L, keyof R>> &
    // Properties in R with types that exclude undefined
    Pick<R, Exclude<keyof R, OptionalPropertyNames<R>>> &
    // Properties in R, with types that include undefined, that don't exist in L
    Pick<R, Exclude<OptionalPropertyNames<R>, keyof L>> &
    // Properties in R, with types that include undefined, that exist in L
    SpreadProperties<L, R, OptionalPropertyNames<R> & keyof L> extends infer O
    ? { [K in keyof O]: O[K] }
    : never;

type SpreadTuple<T extends readonly any[]> = T extends [infer F] ? F : T extends [infer F, ...infer R] ? Spread<F, SpreadTuple<R>> : never;

function merge<T extends object[]>(...sources: T): SpreadTuple<T> {
  return Object.assign({}, ...sources);
}

// const tk = new TK<CTX>(extramethods?)
/// tk.add("/test", tk.POST, (decoded) => ({}), () => ())
/*
// SERVER
{
    path: P,
    httpMethod: HM,
    tkMethod: {
        name: Name
        match: (Request) => boolean,
        requestDecoder: (request) => in,
        responseDecoder(out) => Promise<response>
    }
    handler: (in, ctx) => out
    
}
 methods = routes["path"]
 for(method in methods) {
  if (method.match(request))
    decoded = method.requestDecoder(request)
    validated = method.validator(decoded)
    in = method.transform(validated)
    out = method.handle(in, ctx)
    return method.responseEncoder(out)
}
return new Response("not found", {status: 404})


MethodConstructors<CTX> = Record<string, (validate: (D) => V, handle: (V, CTX) => R) => Method>

const tk = {
    defaultMethods = {
        POST: {
            method: "POST"
            requestDecoder: (req) => {

            }
        }
    }
}
const router = new Router(tk.defaultMethods())

 Router.add("/p", tk.POST(), )

 add = <P, T extends keyof types>(path: P, type: T, validator: (ReturnType<types[T][requestDecoder]>) => InputType<types[T][validationTransform])

// CLIENT
const client = new Client<RouterType>("http://localhost:123")
const result = client("/path").POST(in)
 */
