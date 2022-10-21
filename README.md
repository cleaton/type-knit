# Type-Knit (TK)

Typesafe APIs over Fetch & Streams API standard. (WinterCG standards, https://wintercg.org/)

*Status*: **Alpha** - Feedback and suggestions welcome. Is this something you are interested in as well? Join the development!

* Lightweight and easy to understand
  * Single package including client, server, streaming & type definitions ~600 lines
* Ergonomic, Fast, Flexible
* Designed to be used with edge providers such as Cloudflare Workers & Durable Objects


## Example
--------------------Durable Object--------------------
```ts
import { TKBuilder, tkok } from "type-knit";
import { z } from "zod";

// Types used for input validation
const Change = z.number()
const UsersInstance = z.object({
  username: z.string()
});

// API builder
const tk = new TKBuilder<{req: Request, env: Env, self: DurableUsers }>();

// DO instance selection
export const usersInstance = tk.instance(api, (args, ctx) => {
  const id = ctx.env.COUNTER_CLASS.idFromName(args.instance)
  return ctx.env.COUNTER_CLASS.get(id)
})

// DO API
const api = tk.router({
    add: tk.call(Change, async (change, ctx) => ctx.self.add(change))
}

// DO setup
class DurableCounter implements DurableObject {
    private readonly storage: DurableObjectStorage
    private counter;
    constructor(private state: DurableObjectState, private env: Env) {
        this.storage = state.storage
        state.block.blockConcurrencyWhile(async () => {
            counter = (await this.storage.get("counter")) || 0
    }
    add(val: number) {
        this.counter = this.counter + val
        this.storage.put("counter", this.counter)
        tkok(this.counter)
    }
    fetch(req: Request): Promise<Response> {
        return api.route({ req, env: this.env, self: this });
    }
}
```
--------------------Worker--------------------
```ts
import { TKBuilder, tkok } from "type-knit";
import { z } from "zod";
import { usersInstance } from './durableUsers'

// Types used for input validation
const Name = z.string()
// API builder
const tk = new TKBuilder<{req: Request, env: Env }>();

// Worker API, which contains DO API as a subset via 
const api = tk.router({
    counter: usersInstance,
    hello: tk.call(Name, (name, ctx) => tkok(`hello ${name}`))
}
// Export router type for client to import
export type MyAPI = ToClient<typeof api>;

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        return api.route({req, env})
    }
}
```
--------------------Client--------------------
```ts
import type MyAPI from './worker'

let client = createClient<MyServer>("http://127.0.0.1:3000");
let count = await client.e()
    .counter
    .instance({ username: "myuser" })
    .add
    .call(5);
// count = {ok: true, data: 5}
```

Currently see `tests/` for more general examples

## Background
While developing a service on Cloudflare Workers I reviewed ways to get typed API (including streaming events) between Frontend & Workers + Durable Objects (DO). The two main solutions I could find were:
1. GraphQL + Type layer (ex typegraphql or typescript codegen)
    * pos: Can integrate with DO using graphql "executors"
    * ex: https://github.com/launchport/helix-flare
    * neg: For a simple project this becomes a large setup & boilerplate
    *  neg: Large overhead and difficult to understand the code path (client & server)
2. TRPC
    * pos: Easy to setup and fully typed out of box
    * neg: No easy way to integrate with DO, need some work to pipe fequests through fetch boundries
    * neg: While much smaller and simpler than GQL implementations it still feels large and complicated for what I wanted



## Current design and WIP

* Single repository for client & server for simplicity
    * single `tests/` folder wich covers both & shared test coverage results
    * frontend should use bundler with tree shaking support to only include the required client parts
* Always using POST, to have a single unified way to pass arguments
  * might need to change this allow functios to be cached using standard web caches?
  * instead of single `.call()`, expose REST functions `.post()`, `.get()`, `.delete()` etc instead? with function arguments URL encoded for other methods.
    * With URL encoded parameters, stream implementation could use native `EventSource()`. It's not used now as it only supports `GET`
* Call path is part of the URL instead of inside the POST to be part of traditional web logs
* Beta: RPC style api
* Alpha: Streams
* Todo: middleware
* Todo: Provide special backend client that can be used for "microservice-like" communcation between fetch boundries on server side for frontend API that is composed of multiple backend calls
* Thought: Make all fetch boundries use Proxy to remove need for special backend client?
