import { createClient } from "./client";
import { EventEmitter, eventStream, } from "./events";
function parseArgs(args, schema) {
    let data;
    try {
        data = schema.parse(args);
    }
    catch (error) {
        return { ok: false, error: new Response(JSON.stringify(error), { status: 400 }) };
    }
    return { ok: true, data };
}
export function tkok(data) {
    return TKResult.OK(data);
}
export function tkerr(error, status) { return TKResult.ERR(error, status); }
//export type TKResult<T> = TKOK<T> | TKERR
export class TKResult {
    value;
    constructor(value) {
        this.value = value;
    }
    static OK(data) { return new TKResult({ ok: true, data }); }
    static ERR(error, status) { return new TKResult({ ok: false, error, status }); }
    map(f) {
        return this.value.ok ? f(this.value.data) : this;
    }
    get() { return this.value.ok ? [this.value.data, undefined] : [undefined, this.value.error]; }
}
export function tkstream(topic, initValue) {
    return tkok({ topic, initValue });
}
function errtoresp(tkerr) {
    const status = tkerr.status ? tkerr.status : 400;
    return new Response(tkerr.error, { status });
}
// Build API
export class TKBuilder {
    emitter;
    constructor(emitter) {
        this.emitter = emitter || new EventEmitter();
    }
    emit(topic, event) {
        this.emitter.emit(topic, event);
    }
    instance(router, f, schema, middlewares = []) {
        return {
            _type: "instance",
            _schema: schema,
            _middlewares: middlewares,
            instance: f,
        };
    }
    call(f, schema, middlewares = []) {
        return {
            _type: "call",
            _schema: schema,
            _middlewares: middlewares,
            call: f,
        };
    }
    stream(schema, f, middlewares = []) {
        return {
            _type: "stream",
            _schema: schema,
            _middlewares: middlewares,
            stream: f,
        };
    }
    router(routes, prefix = "/", middlewares = []) {
        prefix = prefix.endsWith('/') ? prefix : prefix + '/';
        const route = async (ctx) => {
            for (const m of middlewares) {
                let out = m.handle(ctx);
                if (out.type == "response") {
                    return out.data;
                }
                ctx = {
                    ...out.data,
                    __tk_internals: ctx.__tk_internals,
                };
            }
            if (!ctx.__tk_internals) {
                let pathname = new URL(ctx.req.url).pathname;
                let paths = [];
                let tkreq = { args: [] };
                if (pathname.startsWith(prefix)) {
                    paths = pathname.replace(prefix, "").split("/");
                    tkreq = await ctx.req.json();
                    if (typeof tkreq !== "object") {
                        return new Response("bad request", { status: 400 });
                    }
                    tkreq.args = tkreq.args ? tkreq.args : [];
                    if (!Array.isArray(tkreq.args)) {
                        return new Response("bad request", { status: 400 });
                    }
                }
                ctx.__tk_internals = {
                    index: 0,
                    paths,
                    tkreq,
                };
            }
            let path = ctx.__tk_internals.paths.shift();
            let r = routes;
            while (path && r && r[path]) {
                const obj = r[path];
                switch (obj._type) {
                    case "call": {
                        let result;
                        if (obj._schema !== undefined) {
                            const payload = ctx.__tk_internals.tkreq.args.shift();
                            const parsed = parseArgs(payload, obj._schema);
                            if (!parsed.ok)
                                return parsed.error;
                            result = await obj.call(parsed.data, ctx);
                        }
                        else {
                            result = await obj.call(ctx, undefined);
                        }
                        if (!result.value.ok)
                            return errtoresp(result.value);
                        return new Response(JSON.stringify(result.value.data), {
                            status: 200,
                        });
                    }
                    case "stream": {
                        const payload = ctx.__tk_internals.tkreq.args.shift();
                        const parsed = parseArgs(payload, obj._schema);
                        if (!parsed.ok)
                            return parsed.error;
                        const result = await obj.stream(parsed.data, ctx);
                        if (!result.value.ok) {
                            const status = result.value.status ? result.value.status : 400;
                            return new Response(result.value.error, { status });
                        }
                        let publish;
                        const unsub = this.emitter.subscribe(result.value.data.topic, (event) => publish && publish(event));
                        const es = eventStream(() => unsub());
                        publish = es.publish;
                        if (result.value.data.initValue !== undefined) {
                            publish({ type: "data", data: result.value.data.initValue });
                        }
                        else {
                            publish({ type: "ping" });
                        }
                        return new Response(es.readable, {
                            status: 200,
                            headers: {
                                "Content-Type": "text/event-stream",
                                Connection: "keep-alive",
                                "Cache-Control": "no-cache",
                            },
                        });
                    }
                    case "instance": {
                        let fetchImpl;
                        if (obj._schema !== undefined) {
                            const payload = ctx.__tk_internals.tkreq.args.shift();
                            const parsed = parseArgs(payload, obj._schema);
                            if (!parsed.ok)
                                return parsed.error;
                            fetchImpl = await obj.instance(parsed.data, ctx);
                        }
                        else {
                            fetchImpl = await obj.instance(ctx, undefined);
                        }
                        if (!fetchImpl.value.ok)
                            return errtoresp(fetchImpl.value);
                        let url = new URL(ctx.req.url);
                        ctx.__tk_internals.paths.shift();
                        const body = JSON.stringify(ctx.__tk_internals.tkreq);
                        url.pathname = ctx.__tk_internals.paths.join('/');
                        const headers = new Headers();
                        for (const [header, value] of ctx.req.headers.entries()) {
                            if (header !== 'content-length') {
                                headers.append(header, value);
                            }
                        }
                        return fetchImpl.value.data.fetch(new Request(url, { headers, method: 'POST', body }));
                    }
                    case "router": {
                        return obj.route(ctx);
                    }
                    default: {
                        r = r[path];
                        path = ctx.__tk_internals.paths.shift();
                    }
                }
            }
            return new Response("route not found", { status: 404 });
        };
        const cli = createClient("http://localhost" + prefix);
        const tkclient = (ctx) => {
            return cli.e(undefined, {
                Request: Request,
                Response: Response,
                fetch: (req) => route({ ...ctx, req })
            });
        };
        return {
            ...routes,
            _middlewares: middlewares,
            _type: "router",
            route,
            tkclient: tkclient
        };
    }
}
//# sourceMappingURL=server.js.map