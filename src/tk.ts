type TKError<T> = { ok: false, error: string, status?: number } & Result<T>
type TKData<T> = { ok: true, type: 'data', data: T } & Result<T>
type TKStream<T> = { ok: true, type: 'stream', stream: T } & Result<T>
type Concrete<T> = TKData<T> | TKStream<T> | TKError<T>
interface Result<T> {
    response(): Promise<Response>
    concrete(): Promise<Concrete<T>>
}

class ResponseResult<T> implements Result<T> {
    constructor(private _response: Response) { }

    public get ok(): boolean {
        return this._response.ok
    }

    async response(): Promise<Response> {
        return this._response
    }

    async concrete(): Promise<Concrete<T>> {
        const type = this._response.headers.get('Content-Type')
        if (this._response.ok && type === 'application/json') {
            return TKOK<T>(await this._response.json())
        }
        if (this._response.ok && type === 'text/event-stream') {
            return TKSTREAM<T>(await this._response.json())
        }
        return TKERR<T>(await this._response.text(), this._response.status)
    }
}

const TKOK = <T>(data: T): TKData<T> => ({
    ok: true,
    type: 'data',
    data,
    async response() {
        return new Response(JSON.stringify(this.data), {
            headers: {
                'Content-Type': 'application/json',
            },
        })
    },
    async concrete() { return this }
})

const TKERR = <T>(error: string, status?: number): TKError<T> => ({
    ok: false,
    error,
    status,
    async response() { return new Response(this.error, { status: this.status || 500 }) },
    async concrete() { return this }
})

const TKSTREAM = <T>(stream: T): TKStream<T> => ({
    ok: true,
    type: 'stream',
    stream,
    async response() {
        return new Response(JSON.stringify(this.stream), {
            headers: {
                'Content-Type': 'text/event-stream',
            },
        })
    },
    async concrete() { return this }
})

//type Methods = 'GET' | 'PUT' | 'POST' | 'DELETE' | 'STREAM'
//type Input<Q extends Record<string, string>, B> = {query: Q, body: B}
//type GetHandler<T> = (ctx: Ctx<any>, input: Input<any, any>) => TKData<T> | TKError<T>
//type PutHandler<T> = (ctx: Ctx<any>, input: Input<any, any>) => TKData<T> | TKError<T>
//type PostHandler<T> = (ctx: Ctx<any>, input: Input<any, any>) => TKData<T> | TKError<T>
//type DeleteHandler<T> = (ctx: Ctx<any>, input: Input<any, any>) => TKData<T> | TKError<T>
//type StreamHandler<T> = (ctx: Ctx<any>, input: Input<any, any>) => TKStream<T> | TKError<T>
//type MethodHandlers<T1, T2, T3, T4, T5> = {
//    get?: GetHandler<T1>
//    put?: PutHandler<T2>
//    post?: PostHandler<T3>
//    delete?: DeleteHandler<T4>
//    stream?: StreamHandler<T5>
//}
//
//type Routes = Record<string, MethodHandlers<any, any, any, any, any>>
//
//class RouterBuilder<C extends Ctx<any>, R extends Routes> {
//    private constructor(private routes: R) { }
//    static new<C extends Ctx<any>>() {
//        return new RouterBuilder<C, {}>({})
//    }
//    build() {
//        return this.routes
//    }
//    get<P extends string, H extends GetHandler<any>>(path: P, handler: H) {
//        const existing = this.routes[path] ?? {}
//        existing.get = handler
//        // @ts-ignore - TODO keep types in a way typescript likes?
//        return new RouterBuilder<C, R & { [k in P]: { get: H } & R[P] }>({
//            ...this.routes,
//            [path]: existing,
//        })
//    }
//    post<P extends string, H extends GetHandler<any>>(path: P, handler: H) {
//        const existing = this.routes[path] ?? {}
//        existing.get = handler
//        // @ts-ignore - TODO keep types in a way typescript likes?
//        return new RouterBuilder<C, R & { [k in P]: { post: H } & R[P] }>({
//            ...this.routes,
//            [path]: existing,
//        })
//    }
//}



type Input = {
    query?: Record<string, string>
    body?: object,
    headers?: Record<string, string>
}
type Handler<C, I extends Input, R> = (input: I, c: C) => Concrete<R>
type MethodSpec<C, I extends Input, R> = { handler: Handler<C, I, R>, input: (input: Input) => I }
type Methods = {
    get?: MethodSpec<any, any, any>
    put?: MethodSpec<any, any, any>
    post?: MethodSpec<any, any, any>
    delete?: MethodSpec<any, any, any>
    stream?: MethodSpec<any, any, any>
}
type Routes = Record<string, Methods>

const defaultInput = (input: Input) => {
    return input
}

class TypeKnit<C> {
    input<I extends Input>(f: (input: Input) => I) {
        return {
            handler<R>(handler: Handler<C, I, R>) {
                return {
                    handler,
                    input: f,
                }
            }
        }
    }
    handler<R>(handler: Handler<C, Input, R>) {
        return {
            handler,
            input: defaultInput,
        }
    }
    async route<R extends Routes>(request: Request, ctx: C, routes: R) {
        const url = new URL(request.url)
        const methodHandlers = routes[url.pathname] ?? {}
        const stream = request.headers.get('Content-Type') === 'text/event-stream'
        const method = (stream ? 'stream' : request.method.toLowerCase()) as keyof Methods
        const spec = methodHandlers[method]
        if (spec) {
            const headers = Object.fromEntries(request.headers.entries())
            const query = Object.fromEntries(url.searchParams.entries())
            const body = await request.json<object>().catch(error => ({}))
            const input = spec.input({ body, query, headers })
            const concrete = spec.handler(input, ctx)
            return concrete.response()
        }
        return TKERR("no such route", 404).response()
    }
}



const tk = new TypeKnit<{ test: string }>()

const routes = {
    "/api/test": {
        get: tk.input(() => ({ body: { test: "hi" } })).handler(() => TKOK("Hello world")),
        put: tk.handler(() => TKOK("Hello world"))
    }
}


type RemoveContext<T> = T extends (input: infer I, ...rest: any[]) => Concrete<infer R> ?
 (input: I) => Result<R> : never
type ToFunction<T> = T extends MethodSpec<any, any, any> ? RemoveContext<T['handler']> : undefined
type ToClient<T> = T extends Routes ? {
    [P in keyof T]: ToClient<T[P]>
}
    : T extends Methods ? {
        [M in keyof T]: ToFunction<T[M]>
    }
    : never;

const r = tk.route(new Request(""), { test: "hi" }, routes)

const test = {} as ToClient<typeof routes>

test["/api/test"].get({ body: { test: "hi" } })

function createClient<T extends Record<string, any>>(): <P extends keyof T>(path: P) => T[P] {
    const makeFetch = (path: keyof T, method: string, input: Input) => {
        const base = ""
        const body = input.body ? JSON.stringify(input.body) : undefined
        const headers = input.headers
        const query = input.query ? new URLSearchParams(input.query).toString() : ""
        fetch(base + path.toString() + query, {body, headers, method})
    }
    return (path) => {
        return {
            get: (input: Input) => makeFetch(path, "GET", input),
            put: (input: Input) => makeFetch(path, "PUT", input),
            post: (input: Input) => makeFetch(path, "POST", input),
            delete: (input: Input) => makeFetch(path, "DELETE", input),
            stream: (input: Input) => makeFetch(path, "STREAM", input),
        } as T[typeof path]
    }
}

const client = createClient<ToClient<typeof routes>>()



client("/api/test").get({body: {
    test: "hi there"
}})


// ########################################################################
//const METHODS = ['get', 'post', 'put', 'delete', 'stream'] as const
//function defineDynamicClass(): {
//  new (): {
//    [K in typeof METHODS[number]]: (path: string, handler: Handler) => Pico
//  }
//} {
//  return class {} as never
//}
//
//
//type Methods = 'get' | 'post' | 'put' | 'delete' | 'stream'
//type Input<T> = {query: Record<string, string>, body: T}
//type Routes<Env> = {
//    [path: string]: {method: Methods, input: <T>(ctx: Ctx<Env>) => T, handler: <I extends Input<any>, T>(ctx: Ctx<Env>, input: I) => Concrete<T>}
//}
//export class Pico<Env, R extends Routes<Env>> extends defineDynamicClass() {
//  private r: R;
//  constructor() {
//    super();
//    [...METHODS].map((method) => {
//      this[method] = (path: string, handler: Handler) => this.on(method, path, handler)
//    })
//  }
//
//  on = (method: string, path: string, handler: Handler) => {
//    const route = {
//      pattern: new URLPattern({
//        pathname: path,
//      }),
//      method: method.toLowerCase(),
//      handler,
//    }
//    this.r.push(route)
//    return this
//  }
//
//  private match(
//    method: string,
//    url: string
//  ): { handler: Handler; result: URLPatternURLPatternResult } {
//    method = method.toLowerCase()
//    for (const route of this.r) {
//      const match = route.pattern.exec(url)
//      if ((match && route.method === 'all') || (match && route.method === method)) {
//        return { handler: route.handler, result: match }
//      }
//    }
//  }
//
//  fetch = (req: Request, env?: object, executionContext?: ExecutionContext) => {
//    const match = this.match(req.method, req.url)
//    if (match === undefined) return new Response('Not Found', { status: 404 })
//
//    Request.prototype.param = function (this: Request, key?: string) {
//      const groups = match.result.pathname.groups
//      if (key) return groups[key]
//      return groups
//    } as InstanceType<typeof Request>['param']
//    req.query = (key) => new URLSearchParams(match.result.search.input).get(key)
//    req.header = (key) => req.headers.get(key)
//
//    const response = match.handler({
//      req,
//      env,
//      executionContext,
//      text: (text) => new Response(text),
//      json: (json) =>
//        new Response(JSON.stringify(json), {
//          headers: {
//            'Content-Type': 'application/json',
//          },
//        }),
//    })
//    return response
//  }
//}
//Builder.routes({
//    "path": {type: 'get'}
//}
//const next = rb
//             .get("/api/test")
//             .input()
//             .handler()
//             .create(), () => TKOK("test"))
//             .post("/api/test", () => TKOK(123))
//             .build()
//

//const rb = new RouterBuilder()
//
//const r = rb.build({
//    "test": (args: { name: string }) => TKOK("test"),
//    "test2": (args: { age: number }) => TKOK(123)
//})

export { }