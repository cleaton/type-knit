import { tkstream, VType } from './tkresult'
import { TKStream, TKResult, StreamResult, tkok, tkerr } from './tkresult'
import type { MaybeAsync } from './utils'
import {
    Emitter,
    EventEmitter,
    eventStream,
    StreamEvent,
    Topics,
  } from "./events";
import { createClient } from './client';


type Methods = 'get' | 'put' | 'post' | 'delete'
type MethodHandler<Ctx, T, R> = (c: Ctx, args: T) => MaybeAsync<TKResult<R>>
type StreamHandler<Ctx, T, R, To extends Topics> = (c: Ctx, args: T) => MaybeAsync<TKResult<StreamResult<R, To, keyof To>>>
type MethodHandlers<Ctx> = { 
    [k in Methods]?: MethodHandler<Ctx, any, any>
} & {
    stream?: (c: Ctx, args: any) => MaybeAsync<TKStream<any>>
}

type Routes = {
    [key: string]: MethodHandlers<any>
}

export type Parsable<T> = {
    parse(obj: unknown): T
}

function validate<T>(p: Parsable<T>, obj: unknown): TKResult<T> {
    try {
        return tkok(p.parse(obj))
    } catch (error) {
        return tkerr(JSON.stringify(error), 400)
    }
}

//type MergeArgs<T, ET> = T extends Routes
//    ? {
//        [k in keyof T]: MergeArgs<T[k], ET>
//      }
//    : UpdateGet<T, ET> & UpdatePost<T, ET>
//
class TKBuilder<Ctx, To extends Topics = Record<string, any>> {
    private readonly emitter: Emitter<To>;
    constructor(emitter?: Emitter<To>) {
      this.emitter = emitter || new EventEmitter<To>();
    }
    emit<Ts extends keyof To>(topic: Ts, event: StreamEvent<To[Ts]>): void {
      this.emitter.emit(topic, event)
    }
    m<T, R>(h: MethodHandler<Ctx, T, R>, v?: Parsable<T>) {
        return (c: Ctx, args: T) => {
            v = v ?? {parse: (obj) => (obj as T)}
            return validate(v, args).map(t => h(c, t))
        }
    }
    s<T, R>(h: StreamHandler<Ctx, T, R, To>, v?: Parsable<T>) {
        return async (c: Ctx, args: T) => {
            v = v ?? {parse: (obj) => (obj as T)}
            return TKStream.fromStreamResult(this.emitter, validate(v, args).map(t => h(c, t)))
        }
    }
    instance<R extends Routes, T>(prepare: (ctx: Ctx, args: T) => TKResult<(req: Request) => Response>, v?: Parsable<T>) {
        const base = {path: ""}
        const handler: ProxyHandler<any> = {
            get(target: typeof base, prop: string, receiver) {
                switch (prop) {
                  case "get":
                  case "delete":
                    return async (ctx: Ctx, args: T) => {
                        v = v ?? {parse: (obj) => (obj as T)}
                        return validate(v, args).map(t => prepare(ctx, t)).map(f => {
                            return TKResult.fromResponse(f(new Request("http://localhost" + target.path + '?args=' + encodeURIComponent(JSON.stringify(args)), {
                                method: prop
                            })))
                        })
                      };
                  case "put":
                  case "post":
                    return async (ctx: Ctx, args: T) => {
                        v = v ?? {parse: (obj) => (obj as T)}
                        return validate(v, args).map(t => prepare(ctx, t)).map(f => {
                            return TKResult.fromResponse(f(new Request("http://localhost" + target.path, {
                                method: prop,
                                body: JSON.stringify(args)
                            })))
                        })
                      };
                  case "stream":
                    return async (ctx: Ctx, args: T) => {
                        v = v ?? {parse: (obj) => (obj as T)}
                        return validate(v, args).map(t => )
                      };
                  default:
                    target.path = target.path + "/" + prop
                    return new Proxy(target, handler);
                }
              }
        }
        return new Proxy(base, handler)
        return createClient<T>("http://localhost", undefined, {fetch: prepare})
    }
    routes<R extends Routes>(r: R) {
        return r
    }
    async requestExecutor<R extends Routes>(req: Request, r: R): Promise<Response> {
        const url = new URL(req.url)
        const isStream = req.headers.get("content-type") === "text/event-stream"
        const method = isStream ? 'stream' : req.method as Methods
        const handlers = r[url.pathname] ?? {}
        const h = handlers[method]
        switch (method) {
            case 'stream':
            case 'post':
            case 'put':
                if (h) {
                    const args = await req.json() as unknown
                    return (await h({}, args)).response()
                }
            case 'get':
            case 'delete': 
                if (h) {
                    const args = JSON.parse(decodeURIComponent(url.searchParams.get("args") ?? "")) as unknown
                    return (await h({}, args)).response()
                }
            default:
                return new Response('', {status: 404})
        }
    }
}

// TESTS
const tk = new TKBuilder<{}, {"testtopic": string}>();

const routes = tk.routes({
    "test": {
        post: tk.m((c, t: {name: number}) => tkok({test: "test"})),
        stream: tk.s((c, t) => tkstream("testtopic", "hi"))
    }
})

//routes.test.post()

export {}