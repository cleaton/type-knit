import type { MaybeAsync } from './utils'

export function tkok<T>(data: T) : TKResult<T> { return TKResult.fromValue({ok: true, data}) }
export function tkerr(msg: string, status?: number): TKResult<any> { return TKResult.fromValue({ok: false, error: msg, status}) }
export type VOK<T> = { ok: true, data: T }
export type VERR = { ok: false, error: string, status?: number }
export type VType<T> =  VOK<T> | VERR
export class TKResult<T> {
    private self!: { type: 'response'; v: Response; } | { type: 'value'; v: MaybeAsync<VType<T>>; };
    private constructor() { }
    static fromResponse<T>(response: Response) {
        const t = new TKResult<T>();
        t.self = { type: 'response', v: response };
        return t
    }
    static fromValue<T>(value: MaybeAsync<VType<T>>) {
        const t = new TKResult<T>();
        t.self = { type: 'value', v: value }
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
                if (v.ok) {
                    return new Response(JSON.stringify(this.self.v), { status: 200 })
                } else {
                    return new Response(v.error, { status: v.status ?? 400 })
                }

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