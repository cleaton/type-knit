import {describe, expect, test, beforeAll, afterAll} from '@jest/globals';
import http from 'node:http'
import {TKBuilder} from '@type-knit/server'
import type { ToClient } from '@type-knit/server'
import { z } from "zod";
import {createClient} from '../src/index'
import { Request } from 'node-fetch'
const polka = require('polka');

const User = z.object({
  username: z.string(),
});

const tk = new TKBuilder()
let tkr = tk.router({
  hello: tk.call(User, (args) => `Hello from ${args.username}!`)
})

import { createServerAdapter } from '@whatwg-node/server'

const serverStart = new Promise((resolve, reject) => {
polka()
  .post('*', createServerAdapter((req) => {
    console.log("HERE I AM")
    return tkr.route({req})
  }))
  .listen(3000, () => {
    console.log(`> Running on localhost:3000`);
    resolve('ok')
  });
})
//const server = http.createServer(createServerAdapter((req) => {
//  return tkr.route({req})
//}));


function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

//server.listen()

//new Promise((resolve, reject) => {
//  server.listen(12301, '127.0.0.1', () => resolve('ok')).once('error', (err) => reject(err))
//})


type MyServer = ToClient<typeof tkr>
let client = createClient<MyServer>("http://127.0.0.1:3000")
describe('sum module', () => {
  beforeAll(async () => {
    await serverStart
  })
  test('handle simple call', async () => {
    await serverStart
    console.log('in test')
    let r = await client.e().hello.call({username: "TK"})
    expect(r).toBe("Hello from TK!")
  });
  afterAll(() => {
    //server.close()
  })
});