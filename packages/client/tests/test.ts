import { describe, expect, test, beforeAll, afterAll } from "@jest/globals";
import http from "node:http";
import { TKBuilder } from "@type-knit/server";
import type { ToClient } from "@type-knit/server";
import { z } from "zod";
import { createClient } from "../src/index";
import { createServerAdapter } from "@whatwg-node/server";

const User = z.object({
  username: z.string(),
});

const tk = new TKBuilder();
let tkr = tk.router({
  hello: tk.call(User, (args) => `Hello from ${args.username}!`),
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
  afterAll(async () => {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve("closed")));
    });
  });
});
