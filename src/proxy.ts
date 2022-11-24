import { Response, Request, DurableObject, fetch } from '@cloudflare/workers-types'

type RPC<T> = {
    [K in keyof Omit<T, keyof DurableObject>]: T[K] extends (arg: any) => any ? T[K] : never;
}

type AsyncFunctions<T> = {
    [K in keyof Omit<T, keyof DurableObject>]: T[K] extends (...args: infer A) => infer R
    ? R extends Promise<any> ? (...args: A) => R : (...args: A) => Promise<R>
    : never;
}

type APIParameters<T> = T extends () => any ? undefined
    : T extends (arg: infer A) => any ? A : never;

function withAPI<T>(namespace: DurableObjectNamespace) {
    return {
        fromIdString(idhexstring: string) {
            const id = this.namespace.idFromString(idhexstring)
            return new DurableObjectStubAPI<T>(this.namespace.get(id))
        },
        fromName(name: string) {
            const id = this.namespace.idFromName(name)
            return new DurableObjectStubAPI<T>(this.namespace.get(id))
        },
        newUnique() {
            const id = this.namespace.newUniqueId()
            return new DurableObjectStubAPI<T>(this.namespace.get(id))
        }
    }
}

class DurableObjectStubAPI<T> {
    public name?: string
    constructor(private stub: DurableObjectStub) {
        this.name = stub.name
    }

    public get id(): DurableObjectId {
        return this.stub.id
    }

    async rpc<K extends keyof RPC<T>>(k: K, payload: APIParameters<RPC<T>[K]>): Promise<ReturnType<RPC<T>[K]>> {
        return this.stub.fetch('http://pd/' + k.toString, {
            method: 'POST',
            body: JSON.stringify(payload)
        }) as Promise<ReturnType<RPC<T>[K]>>
    }

    proxy(): AsyncFunctions<T> {
        const self = this;
        const target: ProxyHandler<Omit<T, keyof DurableObject>> = {
            get(target: any, p: any, receiver: any) {
                return (args: any) => {
                    return self.rpc(p, args)
                };
            }
        }
        return new Proxy({} as any, target)
    }
}

interface ProxyDurable extends DurableObject {
    fetchFallback?(request: Request): Response | Promise<Response>
    blockingInit?(): Promise<unknown>
}

abstract class ProxyDurable implements DurableObject {
    constructor(state: DurableObjectState) {
        this.blockingInit && state.blockConcurrencyWhile(this.blockingInit)
    }

    async fetch(request: Request): Promise<Response> {
        //"http://pd/" 10 characters
        const path = request.url.slice(10)
        const f = this[path]
        if (!f && this.fetchFallback) {
            return this.fetchFallback(request)
        }
        return new Response(JSON.stringify(f(await request.json())), { status: 200 })
    };
}

class ExampleDurable extends ProxyDurable {
    constructor(state: DurableObjectState, env) {
        super(state)
    }

    test(a: string) {
        return 1235
    }

    async test2(a: { test: string, name: string, age: number }) {
        return a
    }
}

const t: any = {}
const object = withAPI<ExampleDurable>(t)

object.fromName("test").name

export { }