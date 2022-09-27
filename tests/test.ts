
import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import http from 'node:http'
import { z } from "zod";
import { createServerAdapter } from "@whatwg-node/server";
import { TKBuilder, TKServerContext } from "../src/index";
import type { ToClient } from "../src/index";
import { createClient } from "../src/index";

const User = z.object({
  username: z.string(),
});

const tk = new TKBuilder<TKServerContext, {testtopic: {nested: string, nr: number}}>();
const send = (count: number) => {
  if (count) {
    setTimeout(() => {
      tk.emit('testtopic', {type: "data", data: {nested: `count is: ${count}`, nr: count}})
      send(count - 1)
    }, 500)
  }
}

let instanceRouter = tk.router({
  hello: tk.call(User, (args) => `Hello ${args.username}! from instance`),
})

let tkr = tk.router({
  hello: tk.call(User, (args) => `Hello ${args.username}!`),
  hellostream: tk.stream(User, (args) => {
    send(5)
    return {type: "success", topic: "testtopic", initValue: {nested: "initVal", nr: 6}}
  }),
  helloinstance: tk.instance(instanceRouter, (args, ctx) => (req: Request) => (instanceRouter.route({req})), User)
});

const server = http.createServer(
  createServerAdapter((req) => {
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


const tktest = suite('type-knit');

tktest.before(async () => {
  await serverStart
})

tktest('simple call', async () => {
  let r = await client.e()
                      .hello
                      .call({ username: "TK" });
  assert.is(r, "Hello TK!")
});

tktest('simple instance call', async () => {
  let r = await client.e()
                      .helloinstance
                      .instance({username: "instance"})
                      .hello
                      .call({ username: "TK" });
  assert.is(r, "Hello TK! from instance")
});

tktest('simple stream', async () => {
  return new Promise(resolve => {
    const r = client.e()
                    .hellostream
                    .stream({ username: "TK" })
    
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
          if (ev.data.nr === 1) {
            r.cancel()
            resolve(ev.data.nr)
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
  }).then( data => {
    assert.is(data, 1)
  })
});

tktest.after(() => {
  server.close();
})
tktest.run();
