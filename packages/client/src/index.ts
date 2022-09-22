import fetch from 'node-fetch'
import {Request} from 'node-fetch'

const proxyHandler: ProxyHandler<any> = {
    get(target, prop, receiver) {
        let stringprop = prop as string
        target.path = target.path ? target.path + '/' + stringprop : stringprop
        switch (prop) {
            case 'call': // Same as stream
            case 'stream':
                let arglist: unknown[] = target.args ? target.args : []
                return async (args: unknown) => {
                    let url = target.baseRequest.url + target.path
                    arglist.push(args)
                    let r = new Request(url, {
                        method: 'POST',
                        headers: {
                            'content-type': 'application/json'
                        },
                        body: JSON.stringify({args: arglist})
                    })
                    let resp = await fetch(r)
                    return resp.json()
                }
            default:
                return new Proxy(target, proxyHandler);
        }
    }
};

export function createClient<T>(req: Request): T {
    let baseRequest = new Request(req, {method: 'POST'})
    return new Proxy({baseRequest}, proxyHandler)
}

export { }