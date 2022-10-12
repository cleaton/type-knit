# Type-Knit (TK)

Typesafe APIs over Fetch & Streams API standard.

*Status*: **Alpha** - Feedback and suggestions welcome. Is this something you are interested in as well? Join the development!

* Lightweight and easy to understand
  * Single package including client, server, streaming & type definitions ~600 lines
* Ergonomic, Fast, Flexible
* Designed to be used with edge providers such as Cloudflare Workers & Durable Objects
```ts
import { TKBuilder, tkok } from "type-knit";
import { z } from "zod";
const User = z.object({
    id: z.string()
    name: z.string()
})

const UsersInstance = z.object({
  instance: z.string()
});

const tk = new TKBuilder<{req: Request, env: Env, self: DurableUsers }>();
const api = tk.router({
    create: tk.call(User, async (user, ctx) => {
        await ctx.self.storage.put(user.id, user)
        return tkok(true)
    }
}
export const usersInstance = tk.instance(api, (args, ctx) => {
  const id = ctx.env.USERS_CLASS.idFromName(args.instance)
  return ctx.env.USERS_CLASS.get(id)
})

class DurableUsers implements DurableObject {
    public readonly storage: DurableObjectStorage
    constructor(state: DurableObjectState, private env: Env) {
        this.storage = state.storage
    }
    fetch(req: Request): Promise<Response> {
        return api.route({ req, env: this.env, self: this });
    }
}
//--------------------Worker--------------------
import { TKBuilder, tkok } from "type-knit";
import { z } from "zod";
import { usersInstance } from './durableUsers'
const Name = z.string()
const tk = new TKBuilder<{req: Request, env: Env }>();
const api = tk.router({
    users: usersInstance,
    hello: tk.call(Name, (name, ctx) => tkok(`hello ${name}`))
}

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        return api.route({req, env})
    }
}
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
