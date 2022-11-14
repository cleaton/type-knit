import { tkerr, tkok } from "./server";
function exec(target, executeRequest) {
    return (args) => {
        const url = new URL(target.url);
        url.pathname = url.pathname + target.execPath;
        if (args !== undefined)
            target.execArgs.push(args);
        let r = new target.impl.Request(url, {
            ...target.options,
            body: JSON.stringify({ args: target.execArgs }),
        });
        return executeRequest(r);
    };
}
class EventStreamImpl {
    impl;
    req;
    cancelled = false;
    reader;
    constructor(impl, req) {
        this.impl = impl;
        this.req = req;
    }
    async cancel() {
        this.cancelled = true;
        this.reader?.cancel();
    }
    async start(cb) {
        cb({ state: 'connecting' });
        let resp = await this.impl.fetch(this.req);
        if (resp.ok) {
            cb({ state: 'connected' });
            const body = resp.body;
            let lastData;
            if (body) {
                this.reader = body.pipeThrough(new TextDecoderStream()).getReader();
                let buffer = '';
                let endOfStream = false;
                while (!this.cancelled) {
                    let { done, value } = await this.reader.read();
                    if (done) {
                        endOfStream = true;
                        break;
                    }
                    if (value) {
                        buffer += value;
                        let split = buffer.indexOf("\n");
                        while (split >= 0) {
                            let b = buffer.slice(0, split);
                            if (b !== "") { // empty newline === Ping
                                const data = JSON.parse(buffer);
                                cb({ state: "data", data });
                            }
                            buffer = buffer.slice(split + 1);
                            split = buffer.indexOf("\n");
                        }
                    }
                }
                if (endOfStream) {
                    cb({ state: "done", lastData });
                }
            }
        }
        else {
            //TODO: better error handling
            console.log(await resp.body);
        }
    }
}
async function handleCall(impl, req) {
    const resp = await impl.fetch(req);
    if (resp.ok) {
        return tkok(await resp.json());
    }
    return tkerr(await resp.text(), resp.status);
}
const proxyHandler = {
    get(target, prop, receiver) {
        let stringprop = prop;
        target.execPath = target.execPath
            ? target.execPath + "/" + stringprop
            : stringprop;
        switch (prop) {
            case "call":
                return exec(target, (req) => handleCall(target.impl, req));
            case "stream":
                return exec(target, (req) => new EventStreamImpl(target.impl, req));
            case "instance":
                return (args) => {
                    if (args !== undefined)
                        target.execArgs.push(args);
                    return new Proxy(target, proxyHandler);
                };
            default:
                return new Proxy(target, proxyHandler);
        }
    },
};
export function createClient(url, options, fetchImpl) {
    const impl = fetchImpl
        ? fetchImpl
        : {
            fetch: fetch,
            Request: Request,
            Response: Response,
        };
    const requiredOptions = { method: "POST" };
    const requiredHeaders = { "content-type": "application/json" };
    const baseOptions = options ? options : {};
    const baseHeaders = options?.headers
        ? options.headers
        : {};
    let u;
    try {
        u = new URL(url);
    }
    catch (error) {
        u = new URL(url, origin);
    }
    u.pathname = u.pathname.endsWith('/') ? u.pathname : u.pathname + '/';
    return {
        e: (override, fetchImpl) => {
            override = override ? override : {};
            const overrideHeaders = override?.headers
                ? override.headers
                : {};
            const headers = {
                ...baseHeaders,
                ...overrideHeaders,
                ...requiredHeaders,
            };
            const options = {
                ...baseOptions,
                ...override,
                ...requiredOptions,
                headers,
            };
            const target = {
                url: u,
                options,
                impl: fetchImpl || impl,
                execArgs: [],
            };
            return new Proxy(target, proxyHandler);
        },
    };
}
//# sourceMappingURL=client.js.map