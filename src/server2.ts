import type { VType } from './tkresult'
import { TKResult } from './tkresult'
import type { MaybeAsync } from './utils'

type StreamResult<T> = {topic: string, initValue?: T}
type Call<T, R, Ctx> = (c: Ctx, args: T) => MaybeAsync<VType<R>>
type Post<T, R, Ctx> = {post: (c: Ctx, args: T) => TKResult<R>}
type Get<T, R, Ctx> = {get: (c: Ctx, args: T) => TKResult<R>}
type Delete<T, R, Ctx> = {delete: (c: Ctx, args: T) => TKResult<R>}
type Put<T, R, Ctx> = {put: (c: Ctx, args: T) => TKResult<R>}
type Stream<T, R, Ctx> = {stream: (c: Ctx, args: T) => TKResult<StreamResult<R>>}
type Handlers<T, R, Ctx> = Post<T, R, Ctx> | Get<T, R, Ctx> | Delete<T, R, Ctx> | Put<T, R, Ctx> | Stream<T, R, Ctx>
type Routes = {
    [key: string]: Handlers<any, any, any>
}

class TKBuilder<Ctx = any, M extends Routes = {}> {
    private _paths: M
    constructor(paths?: M) {
        this._paths = paths ?? {} as M
    }
    // TODO reduce repetition
    post<P extends string, T, R>(path: P, call: Call<T, R, Ctx>) {
        const existing: Record<string, any> = this._paths[path] ?? {}
        existing['post'] = (c: Ctx, args: T) => TKResult.fromValue<R>(call(c, args))
        this._paths[path] = existing as M[P]
        return new TKBuilder<Ctx, {[k in Exclude<keyof M, P>]: M[k]} & { [k in P]: M[k] & Post<T, R, Ctx> }>()
    }
    get<P extends string, T, R>(path: P, call: Call<T, R, Ctx>) {
        const existing: Record<string, any> = this._paths[path] ?? {}
        existing['get'] = (c: Ctx, args: T) => TKResult.fromValue<R>(call(c, args))
        this._paths[path] = existing as M[P]
        return new TKBuilder<Ctx, {[k in Exclude<keyof M, P>]: M[k]} & { [k in P]: M[k] & Get<T, R, Ctx> }>()
    }
    put<P extends string, T, R>(path: P, call: Call<T, R, Ctx>) {
        const existing: Record<string, any> = this._paths[path] ?? {}
        existing['put'] = (c: Ctx, args: T) => TKResult.fromValue<R>(call(c, args))
        this._paths[path] = existing as M[P]
        return new TKBuilder<Ctx, {[k in Exclude<keyof M, P>]: M[k]} & { [k in P]: M[k] & Put<T, R, Ctx> }>()
    }
    delete<P extends string, T, R>(path: P, call: Call<T, R, Ctx>) {
        const existing: Record<string, any> = this._paths[path] ?? {}
        existing['delete'] = (c: Ctx, args: T) => TKResult.fromValue<R>(call(c, args))
        this._paths[path] = existing as M[P]
        return new TKBuilder<Ctx, {[k in Exclude<keyof M, P>]: M[k]} & { [k in P]: M[k] & Delete<T, R, Ctx> }>()
    }
    stream<P extends string, T, R>(path: P) {

    }
    build2(fetch: (req: Request) => Response) {
        const resp = {} as any
        for (const p in this._paths) {
            const respm = {} as any
            const methods = this._paths[p]
            for(const m in methods) {
                switch (m) {
                    case 'post':
                        respm[m] = (c: Ctx, args: any) => TKResult.fromResponse(fetch(new Request('' + p , {method: 'post', body: JSON.stringify(args)})))
                        break;
                }
            }
            resp[p] = respm
        }
        return this._paths
    }
    build() {
        return this._paths
    }
}

// TESTS
const tk = new TKBuilder();

const routes = tk.post("test", (c, t: {name: number}) => ({ok: true, data: {test: "test"}}))
                 .post("test2", (c, t: {name: number}) => ({ok: true, data: {test: "test"}}))
                 .get("test", (c, t: {name: number}) => ({ok: true, data: {t: "test"}}))
                 .get("test", (c, t: {name: number}) => ({ok: true, data: {tet: "te"}}))
                 .build()

const r2 = await routes.test.get({}, {name: 123}).value()

const r = await routes.test.post({}, {name: 123}).value()
if (r.ok) {
    r.data
}

type ToClient<T> = T extends Routes
    ? {
        [K in keyof T]: ToClient<T[K]>
    }
    : T extends Post<infer I, infer R, any>
    ? { post: (args: I) => MaybeAsync<TKResult<R>> }
    : never;

const cli = {} as ToClient<typeof routes>

cli.test.post({name: 123})

export {}