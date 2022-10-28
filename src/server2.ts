import type { VType } from './tkresult'
import { TKResult, tkok, tkerr } from './tkresult'
import type { MaybeAsync } from './utils'
import {
    Emitter,
    EventEmitter,
    eventStream,
    StreamEvent,
    Topics,
  } from "./events";

type Sameish<T, U> = [T] extends [U] ? ([U] extends [T] ? T : U extends unknown ? T : never) : T extends unknown ? U : never;
type StreamResult<R, To extends Topics, Ts extends keyof To> = { topic: Ts, initValue?: Sameish<R, To[Ts]> }
type Methods = 'get' | 'put' | 'post' | 'delete'
type MethodHandler<Ctx, T, R> = (c: Ctx, args: T) => MaybeAsync<TKResult<R>>
type MethodHandlers<Ctx, To extends Topics, Ts extends keyof To> = { 
    [k in Methods]?: MethodHandler<Ctx, any, any>
} & {
    stream?: (c: Ctx, args: any) => MaybeAsync<TKResult<StreamResult<any, To, Ts>>>
}

type Routes = {
    [key: string]: MethodHandlers<any, any, any>
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
    remote<P extends string, T, R extends Routes>(path: P, routes: R, prepare: (ctx: Ctx, args: T) => (req: Request) => Response) {
        //@ts-ignore
        this._paths[path] = {type: 'instance', f: prepare}
        //@ts-ignore
        return new TKBuilder<Ctx, M & { [k in P]: MergeArgs<R, T>}>()
    }
    routes<R extends Routes>(r: R) {
        return r
    }
}

// TESTS
const tk = new TKBuilder<{}, {"testtopic": string}>();

const routes = tk.routes({
    "test": {
        post: tk.m((c, t: {name: number}) => tkok({test: "test"})),
        stream: (c, t) => tkok({topic: "testtopic", initValue: "hi"})
    }
})

routes.test.stream()

async function RequestExecutor<R extends Routes>(req: Request, r: R): Promise<Response> {
    const url = new URL(req.url)
    const method = req.method as Methods
    const handlers = r[url.pathname] ?? {}
    const h = handlers[method]
    switch (method) {
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

export {}