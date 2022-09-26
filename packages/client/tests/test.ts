import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import http from "node:http";
import { TKBuilder, TKServerContext } from "@type-knit/server";
import type { ToClient } from "@type-knit/server";
import { z } from "zod";
import { createClient } from "../src/index";
import { createServerAdapter } from "@whatwg-node/server";

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
let tkr = tk.router({
  hello: tk.call(User, (args) => `Hello from ${args.username}!`),
  hellostream: tk.stream(User, (args) => {
    send(5)
    return {type: "success", topic: "testtopic", initValue: {nested: "initVal", nr: 6}}
  })
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

describe("sum module", () => {
  beforeAll(async () => {
    await serverStart;
  });
  test("handle simple call", async () => {
    let r = await client.e().hello.call({ username: "TK" });
    expect(r).toBe("Hello from TK!");
  });
  test("handle simple stream", async () => {
    return new Promise(resolve => {
      const r = client.e().hellostream.stream({ username: "TK" })
      
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
      console.log("HERE, ", data)
      expect("test").toBe("test")
    })
  });
  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve("closed")));
    });
  });
});
