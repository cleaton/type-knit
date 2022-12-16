type TKError<T> = { ok: false, error: string, status?: number }
type TKData<T> = { ok: true, data: T }
type TKStream<T> = { ok: true, stream: TKStreamSubscribable<T> }
type TKStreamEvent<T> = { type: 'end' } | { type: 'error', error: string } | { type: 'data', data: T }
type TKStreamEventCallback<T> = (event: TKStreamEvent<T>) => void | Promise<void>
type TKStreamSubscribable<T> = {
    subscribe(callback: TKStreamEventCallback<T>): () => void
}
type Concrete<T> = TKData<T> | TKStream<T> | TKError<T>
type ConcreteData<T> = TKData<T> | TKError<T>
type ConcreteStream<T> = TKStream<T> | TKError<T>
interface Result<T extends Concrete<any>> {
    response(): Promise<Response>
    concrete(): Promise<T>
}

class TKSubscriptions {
    private subscribers: Map<string, Map<string, TKStreamEventCallback<any>>>
    constructor () {
        this.subscribers = new Map()
    }
    subscriber<T>(topic: string, subid?: string): TKStreamSubscribable<T> {
        let topicSubscribers = this.subscribers.get(topic)
        if (!topicSubscribers) {
            topicSubscribers = new Map()
            this.subscribers.set(topic, topicSubscribers)
        }
        subid = subid ?? crypto.randomUUID()
        return {
            subscribe(calllback) {
                topicSubscribers.set(subid, calllback)
                return () => topicSubscribers.delete(subid)
            }
        }
    }
    publish(topic: string, data: TKStreamEvent<any>, subid?: string) {
        const subscribers = this.subscribers.get(topic)
        if (!subscribers) return
        if (subid !== undefined) {
            const subscriber = subscribers.get(subid)
            if (subscriber) subscriber(data)
            return
        }
        for (const [_subid, callback] of subscribers.entries()) {
            callback(data)
        }
    }
}

class ResponseResult<T extends Concrete<any>> implements Result<T> {
    constructor(private _response: Response) { }

    public get ok(): boolean {
        return this._response.ok
    }

    async response(): Promise<Response> {
        return this._response
    }

    // force convert to the expected type T
    async concrete(): Promise<T> {
        const type = this._response.headers.get('Content-Type')
        if (this._response.ok && type === 'application/json') {
            return TKOK(await this._response.json()) as unknown as T
        }
        if (this._response.ok && type === 'text/event-stream') {
            // TODO extract eventstream
            const subscribable = {
                subscribe(callback) {
                    const close = () => {

                    }
                    return close
                }
            }
            return TKSTREAM(subscribable) as unknown as T
        }
        return TKERR(await this._response.text(), this._response.status) as unknown as T
    }
}

const TKOK = <T>(data: T): Result<TKData<T> | TKError<T>> => ({
    async response() {
        return new Response(JSON.stringify(this.data), {
            headers: {
                'Content-Type': 'application/json',
            },
        })
    },
    async concrete() { return { ok: true, data } }
})

const TKERR = <T>(error: string, status?: number): Result<TKError<T>> => ({
    async response() { return new Response(this.error, { status: this.status || 500 }) },
    async concrete() { return { ok: false, error, status } }
})

const TKSTREAM = <T extends TKStreamSubscribable<any>>(stream: T): Result<TKStream<T> | TKError<T>> => ({
    async response() {
        stream.subscribe()
        const ts = new TransformStream()
        ts.writable.getWriter().write()
        return new Response(es.readable, {
            status: 200,
            headers: {
              "Content-Type": "text/event-stream",
              Connection: "keep-alive",
              "Cache-Control": "no-cache",
            },
          })
    },
    async concrete() { return { ok: true, stream } }
})

type Context = {
    req: Request
}
type Validator<C extends Context> = (ctx: C) => Validated<any, any, any>
type Validated<T, Q extends Record<string, string>, H extends Record<string, string>> = {
    query?: Q,
    headers?: H,
    body?: T
}
type Handler<C, I, R> = (input: I, c: C) => R
type MethodSpec<C extends Context, R, I extends Validator<C>> = { handler: Handler<C, ReturnType<I>, R>, input?: I }
type CallMethodSpec<C extends Context, R extends Result<ConcreteData<any>>, I extends Validator<C>> = MethodSpec<C, R, I>
type StreamMethodSpec<C extends Context, R extends Result<ConcreteStream<any>>, I extends Validator<C>> = MethodSpec<C, R, I>
type Methods = {
    get?: CallMethodSpec<any, any, any>
    put?: CallMethodSpec<any, any, any>
    post?: CallMethodSpec<any, any, any>
    delete?: CallMethodSpec<any, any, any>
    stream?: StreamMethodSpec<any, any, any>
}

type Routes<M extends Methods = any> = Record<string, M>

const defaultInput: Validator<any> = () => {
    return {}
}

class TypeKnit<C> {
    handler<H extends Handler<C & Context, ReturnType<IV>, any>, IV extends Validator<C & Context>>(handler: H, input?: IV): MethodSpec<C & Context, ReturnType<H>, IV> {
        return {
            handler,
            input: input ?? defaultInput as IV
        }
    }
    build<R extends Routes>(routes: R): R {
        return routes
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

const routes = tk.build({
    "/api/test": {
        get: tk.handler((i) => {
            if (i.body.test === "ERROR") {
                return TKERR("TEST ERROR")
            }
            return TKOK(12345)
        }, () => ({ body: { test: "hi" } })),
        put: tk.handler(() => TKOK("Hello world"))
    },
    "/api/test2": {
        put: tk.handler(() => TKOK("Hello world"))
    },
})



type WithValidated<T> = T & Omit<Validated<any, Record<string, string>, Record<string, string>>, keyof T>
type RemoveContext<T> = T extends (input: infer I, ...rest: any[]) => infer R ?
    (input: WithValidated<I>) => R : never
type ToFunction<T> = T extends { handler: any } ? RemoveContext<T['handler']> : undefined
type ExtractMethods<T extends Methods> = {
    [M in keyof T]: ToFunction<T[M]>
}
type ToClient<T extends Routes> = {
    [P in keyof T]: ExtractMethods<T[P]>
}

const r = tk.route(new Request(""), { test: "hi" }, routes)

const test = {} as ToClient<typeof routes>
test["/api/test"].get({ body: { test: "hi" }, query: { test: "hi" } })


type Input = Validated<unknown, any, any>
function createClient<T extends Record<string, any>>(): <P extends keyof T>(path: P) => T[P] {
    const makeFetch = (path: keyof T, method: string, input: Input) => {
        const base = ""
        const body = input.body ? JSON.stringify(input.body) : undefined
        const headers = input.headers
        const query = input.query ? new URLSearchParams(input.query).toString() : ""
        fetch(base + path.toString() + query, { body, headers, method })
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
client("/api/test2").put({})
client("/api/test").get({body: {test: "hello"}})
client("/api/test").get({ body: { test: "hi" } }).concrete().then(r => r.ok === true ? r.data : r.error)

export { }