import type { MaybeAsync, Sameish } from './utils'
import {
    Emitter,
    eventStream,
    StreamEvent,
    Topics,
  } from "./events";

export function tkok<T>(data: T) : TKResult<T> { return TKResult.OK(data) }
export function tkerr<T = any>(msg: string, status?: number): TKResult<T> { return TKResult.ERR(msg, status) }
export function tkstream<T, To extends Topics, Ts extends keyof To>(topic: Ts, initValue?: Sameish<T, To[Ts]>) : TKResult<StreamResult<T, To, Ts>> { return TKResult.OK({topic, initValue})}
export type VOK<T> = { ok: true, data: T }
export type VERR = { ok: false, error: string, status?: number }
export type VType<T> =  VOK<T> | VERR
export type StreamResult<R, To extends Topics, Ts extends keyof To> = { topic: Ts, initValue?: Sameish<R, To[Ts]> }
//export class TKResult<T> {
//    private constructor(private readonly self: MaybeAsync<VOK<T> | VERR>) {}
//    static OK<T>(data: T) {
//        return new TKResult<T>({ok: true, data})
//    }
//
//    static ERR<T>(error: string, status?: number) {
//        return new TKResult<T>({ok: false, error, status})
//    }
//
//    map<R>(f: (data: T) => MaybeAsync<TKResult<R>>): TKResult<R> {
//        const map = async () => {
//            const self = await this.self
//            return self.ok ? (await f(self.data)).value : self
//        }
//        return new TKResult<R>(map())
//    }
//    
//    public get value() : MaybeAsync<VOK<T> | VERR> {
//        return this.self
//    }
//    
//}

function VTypeToResponse<T>(v: VType<T>) {
    if (v.ok) {
        return new Response(JSON.stringify(v.data), { status: 200 })
    } else {
        return new Response(v.error, { status: v.status ?? 400 })
    }
}

export class TKStream<T> {
    private constructor(private _response: MaybeAsync<Response>) {}
    static fromResponse<T>(response: MaybeAsync<Response>) {
        return new TKStream<T>(response);
    }
    static async fromStreamResult<T, To extends Topics, Ts extends keyof To>(emitter: Emitter<To>, v: TKResult<StreamResult<T, To, Ts>>) {
        const c = await v.value()
        if(c.ok) { 
        let publish: (event: StreamEvent<unknown>) => void;
        const unsub = emitter.subscribe(
          c.data.topic,
          (event: StreamEvent<unknown>) => publish && publish(event)
        );
        const es = eventStream(() => unsub());
        publish = es.publish;
        if (c.data.initValue !== undefined) {
          publish({ type: "data", data: c.data.initValue })
        } else {
          publish({ type: "ping" })
        }
        const resp = new Response(es.readable, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            Connection: "keep-alive",
            "Cache-Control": "no-cache",
          },
        })
        return new TKStream<T>(resp)
        }
        return new TKStream<T>(VTypeToResponse(c))
    }

    async response(): Promise<Response> {
        return this._response
    }
}
export class TKResult<T> {
    private self!: { type: 'response'; v: Response; } | { type: 'value'; v: MaybeAsync<VType<T>>; }
    private constructor() { }
    static fromResponse<T>(response: Response) {
        const t = new TKResult<T>();
        t.self = { type: 'response', v: response };
        return t
    }
    static OK<T>(value: T) {
        const t = new TKResult<T>();
        t.self = { type: 'value', v: {ok: true, data: value} }
        return t
    }
    static ERR<T>(error: string, status?: number) {
        const t = new TKResult<T>();
        t.self = { type: 'value', v: {ok: false, error, status} }
        return t
    }
    static fromValue<T>(v: MaybeAsync<VType<T>>) {
        const t = new TKResult<T>();
        t.self = { type: 'value', v }
        return t
    }

    map<R>(f: (arg: T) => MaybeAsync<TKResult<R>>) {
        const r = new TKResult<R>()
        const nextValue: MaybeAsync<VType<R>> = this.value().then(async v => {
            return v.ok ? (await f(v.data)).value() : v
        })
        r.self = { type: 'value', v: nextValue }
        return r
    }

    async response(): Promise<Response> {
        switch (this.self.type) {
            case 'response':
                return this.self.v
            case 'value':
                const v = await this.self.v
                return VTypeToResponse(v)

        }
    }

    async value(): Promise<VType<T>> {
        switch (this.self.type) {
            case 'response':
                const v = this.self.v
                if (v.ok) {
                    return { ok: true, data: (await this.self.v.json()) as T }
                } else {
                    return { ok: false, error: await v.text(), status: v.status }
                }
            case 'value':
                return this.self.v
        }
    }
}