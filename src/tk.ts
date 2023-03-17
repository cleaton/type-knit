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

function buildContextMethods<M extends Method<any,any,any,any>>(method: M): CTXMethods {
  return {
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
  };
}


type HandleHelper<IN> = CTXMethods & {
  in: IN
}
type AddEndpointF<CTX, M extends Method<any, any, any, any>> = <IN extends GetInReq<M>, OUT extends GetOutReq<M>>(
  validate: (decoded: GetDecodeType<M>) => IN,
  handle: (tk: HandleHelper<IN>, ctx: CTX) => Result<OUT> | Promise<Result<OUT>>
) => TKEndpoint<CTX, M, IN, OUT>;
type RouteMethods<CTX, MethodsImplementations extends Methods> = {
  [m in keyof MethodsImplementations]: AddEndpointF<CTX, MethodsImplementations[m]>;
};


type TKEndpoint<CTX, M extends Method<any, any, any, any>, IN extends GetInReq<M>, OUT extends GetOutReq<M>> = {
  method: M,
  contextMethods: CTXMethods,
  validate: (decoded: GetDecodeType<M>) => IN
  handle: (tk: HandleHelper<IN>, ctx: CTX) => Result<OUT> | Promise<Result<OUT>>
}

function addEndpointF<CTX, M extends Method<any, any, any, any>>(method: M) {
  const contextMethods = buildContextMethods(method)
  return <IN extends GetInReq<M>, OUT extends GetOutReq<M>>(
    validate: (decoded: GetDecodeType<M>) => IN,
    handle: (tk: HandleHelper<IN>, ctx: CTX) => Result<OUT> | Promise<Result<OUT>>
  ): TKEndpoint<CTX, M, IN, OUT> => (
    {
      method,
      contextMethods,
      validate,
      handle
    }
  )
}

/// CLIENT CONFIGURATION
function createRequestBuilder<M extends Method<any, any, any, any>>(method: M) {
  return (args: unknown) => {
    const resp = method.requestEncoder(args).then(req => fetch(req))
    return {
      async response() { return resp },
      async concrete() { return await method.responseDecoder(await resp) }
    }
  }
}
interface TKClientImpl {
  execute(path: string, method: Method<any,any,any, any>, args: unknown)
}
function tkClient<E extends Endpoints<any>, CustomMethods extends Methods = {}>(url: string, custom?: CustomMethods) {
  const methods = {
    ...DefaultMethods,
    ...custom,
  };
  const reqConstructors = Object.fromEntries(Object.entries(methods).map(([name, method], _) => [name, createRequestBuilder(method)]))
  return <P extends keyof E>(path: P) => reqConstructors as ToClient<E>[P]
}
function localClient<E extends Endpoints<any>>(endpoints: E) {
  return <P extends keyof E>(path: P) => endpoints[path] as ToClient<E>[P]
}
/// CLIENT CONFIGURATIOn

//const clientBase = new TKClientBase<ServerType>();
//const client = new FetchClient(ClientBase)
//const doClient = new DOClient(ClientBase, DoStub)
//const localClient = new LocalClient(ClientBase, ServerInstance)

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


function EnpointsBuilder<CTX, CustomMethods extends Methods = {}>(custom?: CustomMethods) {
  const methods = {
    ...DefaultMethods,
    ...custom,
  };
  const builders = Object.fromEntries(Object.entries(methods).map(([name, method], _) => [name, addEndpointF(method)]))  as RouteMethods<CTX, typeof methods>
  return {
    ...builders,
    endpoints<T extends {
      [path in string]: {
        [method in keyof typeof methods]: TKEndpoint<CTX, typeof methods[method], any, any>
      }
    }>(endpoints: T): T {
      return endpoints
    }
  }
}

type PathFormat = `/${string}`
type Endpoints<CTX> = {
  [k in PathFormat]: Record<string, TKEndpoint<CTX, Method<any,any, any, any>, any, any>>
}

type TT = Record<string, Record<string, number>>

const ttt: TT = {}
const r = ttt["hi"]["hi"]



const eb = EnpointsBuilder()
const endpoints = {
  "/test/something": {
    POST: eb.POST((decoded => ({json: {test: 1234}})), (tk) => tk.ok(tk.in.json))
  },
  "/test/something2": {
    POST: eb.POST((decoded => ({json: {test: 1234}})), (tk) => tk.ok(tk.in.json))
  }
}


type ToClientHandler<T> = T extends TKEndpoint<any, any, infer IN, infer OUT> ? (args: IN) => Result<OUT> : never;
type ToClient<E extends Endpoints<any>> = {
  [P in keyof E]: { [M in keyof E[P]]: ToClientHandler<E[P][M]> };
};
type ToTestClient<Routes> = <P extends keyof Routes>(url: P) => Routes[P]

const cli = tkClient<typeof endpoints>("/test")

//cli("/test/something").POST()
//function toClient<E extends Endpoints<any>, R extends keyof E>(endpoints: T, path: R) {
//  return routes[path]
//}
//const re = merge(test, test2, test3);

//type Client = ToClient<typeof routes>;
//
//
//const aokokas = undefined as ToTestClient<typeof routes>
//aokokas("test/somthing4").POST
//const tttt = undefined as Client
//tttt["/test/something4"].POST()


//const testcli = tkClient<Client>("http://127.0.0.1");
//const r = testcli("/test/something").POST({json: {hi: 123}}).concrete()
//
async function route<CTX, E extends Endpoints<CTX>>(ctx: CTX, req: Request, e: E) {
  const url = new URL(req.url);
  const methodName = req.headers.get("tk-m");
  const methods = e[url.pathname as PathFormat];
  const m = methods ? methods[methodName] : undefined;
  if (m) {
    const method = m.method
    const contextMethods = m.contextMethods
    const decoded = method.requestDecoder(req)
    const helper: HandleHelper<any> = {
      in: () => m.validate(decoded),
      ...contextMethods
    }
    const out = await m.handle(helper, ctx)
    return out.response()
  }
  return new Response("not found", { status: 404 })
}
const t = "" as unknown;
route(t, new Request(""), endpoints);

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
