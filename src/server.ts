import { MethodType, defaultMethods } from "./methods";
import { unvalidated } from "./utils";
import { type Result, type Ok, type Err, ok, err } from "./utils/result";
import { MaybeAsync, RemoveUnvalidated, Unvalidated } from "./utils/types";

type MethodResultOK<T> = {
  response(): Promise<Response>;
  concrete(): Promise<Ok<T>>;
};
type MethodResultError = {
  response(): Promise<Response>;
  concrete(): Promise<Err>;
};
type MethodResult<T> = MethodResultOK<T> | MethodResultError;

class Endpoint<
  MethodName extends string,
  MethodIn,
  MethodOut,
  In,
  Out extends MethodOut,
  Env,
  MW extends MWOut
> {
  constructor(
    private _method: MethodType<MethodName, MethodIn, MethodOut>,
    private _handler: (
      c: ContextMethods<Env, In, MW, MethodOut>
    ) => MaybeAsync<MethodResult<Out>>,
    private _middlewares: EndpointMiddleware<any, any>[],
    private _validator?: (tovalidate: MethodIn) => MaybeAsync<Result<In>>
  ) {}
  private ok<T extends MethodOut>(value: T): MethodResultOK<T> {
    const resultValue = ok(value);
    const concrete = async () => resultValue;
    const response = async () => this._method.server.encode(resultValue);
    return { concrete, response };
  }
  private err(value: string, code?: number): MethodResultError {
    const resultValue = err(value, code);
    const concrete = async () => resultValue;
    const response = async () => this._method.server.encode(resultValue);
    return { concrete, response };
  }
  private defaultValidator(tovalidate: any) {
    return ok(unvalidated(tovalidate) as In);
  }
  async remote<T extends Env>(request: Request, env: T) {
    const decoded = await this._method.server.decode(request);
    const validator = this._validator ?? this.defaultValidator;
    const input = await decoded.flatMap((d) => validator(d));
    if (!input.ok) return this._method.server.encode(input);
    const ctx: ContextMethods<Env, In, MWOut, MethodOut> = {
      request,
      args: () => input.value,
      env,
      mw: undefined,
      ok: this.ok,
      err: this.err,
    };
    for (const middleware of this._middlewares) {
      const result = await middleware(ctx);
      if (!result.ok) return this._method.server.encode(result);
      ctx.mw = ctx.mw ? { ...ctx.mw, ...result.value } : result.value;
    }
    const out = await this._handler(
      ctx as ContextMethods<Env, In, MW, MethodOut>
    );
    return out.response();
  }
  async local<T extends Env>(
    args: RemoveUnvalidated<In>,
    env: T,
    init?: RequestInit
  ) {
    const request = new Request("https://tk-internal", init);
    const realArgs = this._validator ? args : unvalidated(args);
    const ctx: ContextMethods<Env, In, MWOut, MethodOut> = {
      request,
      args: () => realArgs as In,
      env,
      mw: undefined,
      ok: this.ok,
      err: this.err,
    };
    for (const middleware of this._middlewares) {
      const result = await middleware(ctx);
      if (!result.ok) return result;
      ctx.mw = ctx.mw ? { ...ctx.mw, ...result.value } : result.value;
    }
    const out = await this._handler(
      ctx as ContextMethods<Env, In, MW, MethodOut>
    );
    return out.concrete();
  }
}

type MWOut = Record<string, any> | undefined;
type MWContext<Env, MW extends MWOut> = {
  req: Request;
  env: Env;
  mw: MW;
};

interface ContextMethods<Env, In, MW extends MWOut, MethodOut> {
  args(): In;
  ok<T extends MethodOut>(value: T): MethodResultOK<T>;
  err(value: string, code?: number): MethodResultError;
  request: Request;
  env: Env;
  mw: MW;
}

type EndpointMiddleware<T extends MWContext<any, any>, Out extends MWOut> = (
  c: T
) => MaybeAsync<Result<Out>>;
type GetMWOut<T, MW> = T extends EndpointMiddleware<any, infer Out>
  ? MW extends undefined
    ? Out
    : MW & Out
  : never;

class EndpointBuilder<
  MethodName extends string,
  MethodIn,
  MethodOut,
  In,
  Out,
  Env,
  MW extends MWOut
> {
  private constructor(
    private _method: MethodType<MethodName, MethodIn, MethodOut>,
    private _middlewares: EndpointMiddleware<any, any>[],
    private _validator?: (tovalidate: MethodIn) => MaybeAsync<Result<In>>
  ) {}
  static new<MethodName extends string, MethodIn, MethodOut>(
    method: MethodType<MethodName, MethodIn, MethodOut>,
    middlewares: EndpointMiddleware<any, any>[]
  ) {
    return new EndpointBuilder<
      MethodName,
      MethodIn,
      MethodOut,
      MethodIn,
      MethodOut,
      undefined,
      undefined
    >(method, middlewares);
  }
  in<T extends MethodIn>(
    validator: (tovalidate: MethodIn) => MaybeAsync<Result<T>>
  ) {
    return new EndpointBuilder<
      MethodName,
      MethodIn,
      MethodOut,
      T,
      Out,
      Env,
      MW
    >(this._method, this._middlewares, validator);
  }
  inraw<T extends MethodIn>() {
    return new EndpointBuilder<
      MethodName,
      MethodIn,
      MethodOut,
      Unvalidated<T>,
      Out,
      Env,
      MW
    >(this._method, this._middlewares);
  }
  middleware<T extends EndpointMiddleware<MWContext<Env, MW>, any>>(
    middleware: T
  ) {
    return new EndpointBuilder<
      MethodName,
      MethodIn,
      MethodOut,
      In,
      Out,
      Env,
      GetMWOut<T, MW>
    >(this._method, this._middlewares.concat([middleware]), this._validator);
  }
  handle<T extends MethodOut>(
    handler: (
      c: ContextMethods<Env, In, MW, MethodOut>
    ) => MaybeAsync<MethodResult<T>>
  ) {
    return new Endpoint<MethodName, MethodIn, MethodOut, In, T, Env, MW>(
      this._method,
      handler,
      this._middlewares,
      this._validator
    );
  }
}

type MethodConstructors<
  T extends Record<string, MethodType<any, any, any>>,
  Env,
  MW extends MWOut
> = {
  [K in keyof T]: () => T[K] extends MethodType<infer Name, infer In, infer Out>
    ? EndpointBuilder<Name, In, Out, In, Out, Env, MW>
    : never;
};
type AllowedEndpoints<Env, T> = {
	  [m in keyof T]: m extends string ? Endpoint<m, any, any, any, any, Env, any> : never
}
type Router<Env, AvaliableMethods> = {
	[path in string]: AllowedEndpoints<Env, AvaliableMethods> | Router<Env, AvaliableMethods>
}

class BaseBuilder<
  Env,
  Methods extends Record<string, MethodType<any, any, any>>,
  M extends MWOut
> {
  protected constructor(
    private _methods: Methods,
    private _middlewares: EndpointMiddleware<any, any>[]
  ) {
    for (const method in _methods) {
      (this as any)[method] = () =>
        EndpointBuilder.new(_methods[method], this._middlewares);
    }
  }
  static new<Env>() {
    const n = new BaseBuilder<Env, typeof defaultMethods, undefined>(
      defaultMethods,
      []
    );
    return n as typeof n &
      MethodConstructors<typeof defaultMethods, Env, undefined>;
  }
  public customMethods<CM extends Record<string, MethodType<any, any, any>>>(
    methods: CM
  ): BaseBuilder<Env, Methods & CM, M> &
    MethodConstructors<Methods & CM, Env, M> {
    const newMethods = {
      ...this._methods,
      ...methods,
    };
    const n = new BaseBuilder<Env, Methods & CM, M>(
      newMethods,
      this._middlewares
    );
    return n as typeof n & MethodConstructors<Methods & CM, Env, M>;
  }
  middleware<T extends EndpointMiddleware<MWContext<Env, M>, any>>(
    middleware: T
  ): BaseBuilder<Env, Methods, GetMWOut<T, M>> &
    MethodConstructors<Methods, Env, GetMWOut<T, M>> {
    const n = new BaseBuilder<Env, Methods, GetMWOut<T, M>>(
      this._methods,
      this._middlewares.concat([middleware])
    );
    return n as typeof n & MethodConstructors<Methods, Env, GetMWOut<T, M>>;
  }
  router<T extends Router<Env, Methods>>(r: T) {
	return r;
  }
}

const builder = BaseBuilder.new<{ test: number }>().middleware((c) =>
  ok({ middleware: "HI THERE" })
);
const endpoint = builder
  .post()
  .inraw<{ testargs: number }>()
  .middleware((c) => ok({ abc: 1234 }))
  .handle((c) => c.ok(c.args().rawCast));

const subscribers = new Map<string, Map<string, (data: any) => void>>();
const createSubscription = (topic: string) => {
  const existing =
    subscribers.get(topic) ??
    subscribers.set(topic, new Map<string, (data: any) => void>()).get(topic);
  return {
    subscribe(f: (data: any) => void) {
      const id = Math.random().toString(36).substring(7);
      existing?.set(id, f);
      return () => {
        existing?.delete(id);
        existing?.size === 0 && subscribers.delete(topic);
      };
    },
  };
};

function createRouter<R extends Router<any>>(router: R) {
	return router
}

type RouterClient<T extends Router<any>> = <P extends keyof T>(path: P) => T[P] extends Endpoint<infer method, any, any, infer In, infer Out, any, any> ? { [k in method]: (args: RemoveUnvalidated<In>) => Out} : T[P] extends Router<any> ? RouterClient<T[P]> : never

const publish = (topic: string, data: any) => {
  const existing = subscribers.get(topic);
  existing?.forEach((f) => f(data));
};



const streamendpoint = builder
  .stream()
  .inraw<{ testargs: number }>()
  .middleware((c) => ok({ abc: 1234 }))
  .handle((c) => c.ok(createSubscription("test")));

const r = createRouter({
	test: endpoint,
	test2: {
		test3: streamendpoint
	},
	test3: {
		...builder.post().inraw<{ testargs: number }>().handle((c) => c.ok({ abc: 1234 })
	}
  })

const client: RouterClient<typeof r> = undefined as any;

const out = client("test2")("test3").stream({ testargs: 1234 })
const out = client("test").post({ testargs: 1234 })

const streamresp = streamendpoint.local({ testargs: 1234 }, { test: 1 });
const response = endpoint.local({ testargs: 1234 }, { test: 1 });
streamresp.then((r) => {
  if (r.ok) {
    console.log("HERE");
    const unsubscribe = r.value.subscribe((data) => console.log(data));
  }
});
response.then((r) => {
  publish("test", { test: 1 });
  publish("test", { test: 2 });
  publish("test", { test: 3 });
  publish("test", { test: 4 });
  console.log(JSON.stringify(r));
});
