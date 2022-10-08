
import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import http from 'node:http'
import { z } from "zod";
import { createServerAdapter } from "@whatwg-node/server";
import { TKBuilder, tkok, TKServerContext } from "../src/index";
import type { ToClient } from "../src/index";
import { createClient } from "../src/index";

const User = z.object({
  username: z.string(),
});

const tk = new TKBuilder<TKServerContext, { testtopic: { nested: string, nr: number } }>();
const send = (count: number) => {
  if (count) {
    setTimeout(() => {
      tk.emit('testtopic', { type: "data", data: { nested: `count is: ${count}`, nr: count } })
      send(count - 1)
    }, 500)
  }
}

let instanceRouter = tk.router({
  hello: tk.call(User, (args) => tkok(`Hello ${args.username}! from instance`)),
})

let tkr = tk.router({
  hello: tk.call(User, (args) => tkok(`Hello ${args.username}!`)),
  helloasync: tk.call(User, async (args) => tkok(`Hello ${args.username} async!`)),
  hellostream: tk.stream(User, (args) => {
    send(5)
    return tkok({ topic: "testtopic", initValue: { nested: "initVal", nr: 6 } })
  }),
  helloinstance: tk.instance(instanceRouter, (args, ctx) => ({fetch: (req: Request) => instanceRouter.route({ req })}), User),
  nested: {
    hello: tk.call(User, (args) => tkok(`Hello ${args.username}! nested`))
  }
});

let tkrp = tk.router({
  helloprefix: tk.call(User, (args) => tkok(`Hello ${args.username}! prefixed`)),
})

const server = http.createServer(
  createServerAdapter((req) => {
    let path = new URL(req.url).pathname
    if (path.startsWith('/api')) {
      return tkrp.route({ req }, '/api')
    }
    return tkr.route({ req });
  })
);

const serverStart = new Promise((resolve, reject) => {
  server
    .listen(3000, "127.0.0.1", () => resolve("ok"))
    .once("error", (err) => reject(err));
});
type MyServer = ToClient<typeof tkr>;
let client = createClient<MyServer>("http://127.0.0.1:3000");
let prefixclient = createClient<ToClient<typeof tkrp>>("http://127.0.0.1:3000/api");


const tktest = suite('type-knit');

tktest.before(async () => {
  await serverStart
})

tktest('handle prefix', async () => {
  let res = await prefixclient.e()
    .helloprefix
    .call({ username: "TK" });
  let r = res.ok ? res.data : res.error
  assert.is(r, "Hello TK! prefixed")
});

tktest('handle nested', async () => {
  let res = await client.e()
    .nested
    .hello
    .call({ username: "TK" });
  let r = res.ok ? res.data : res.error
  assert.is(r, "Hello TK! nested")
});

tktest('simple call', async () => {
  let res = await client.e()
    .hello
    .call({ username: "TK" });
  let r = res.ok ? res.data : res.error
  assert.is(r, "Hello TK!")
});

tktest('simple call async', async () => {
  let res = await client.e()
    .helloasync
    .call({ username: "TK" });
  let r = res.ok ? res.data : res.error
  assert.is(r, "Hello TK async!")
});

tktest('simple instance call', async () => {
  let res = await client.e()
    .helloinstance
    .instance({ username: "instance" })
    .hello
    .call({ username: "TK" });
  let r = res.ok ? res.data : res.error
  assert.is(r, "Hello TK! from instance")
});

tktest('simple stream', async () => {
  return new Promise(resolve => {
    const r = client.e()
      .hellostream
      .stream({ username: "TK" })
    const expected = [6, 5, 4, 3, 2, 1]
    r.start((ev) => {
      switch (ev.state) {
        case 'connected':
          console.log("CONNECTED")
          break;
        case 'connecting':
          console.log("CONNECTING")
          break;
        case 'data':
          console.log("DATA: ", ev.data)
          const expect = expected.shift()
          if (expected) {
            assert.is(ev.data.nr, expect)
          }
          if (expected.length == 0) {
            r.cancel()
            resolve(true)
          }
          break;
        case 'done':
          console.log("DONE")
        case 'reconnecting':
          console.log("RECONNECTING")
        default:
          console.log("OTHER STATE")
          break;
      }
    });
  }).then(data => {
    assert.is(data, true)
  })
});

tktest.after(() => {
  server.close();
})
tktest.run();
