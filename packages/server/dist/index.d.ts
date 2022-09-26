import { z, Schema } from 'zod';

declare type Topics = {
    [event: string]: any;
};
declare type Unsubscribe = () => void;
declare type StreamEventData<T> = {
    type: "data";
    data: T;
};
declare type StreamEventClose = {
    type: "close";
};
declare type StreamEvent<T> = StreamEventData<T> | StreamEventClose;
interface Emitter<T extends Topics> {
    emit<Ts extends keyof T>(topic: Ts, event: StreamEvent<T[Ts]>): void;
    subscribe<Ts extends keyof T>(topic: Ts, onEvent: (event: StreamEvent<[Ts]>) => void): Unsubscribe;
}

declare type Sameish<T, U> = [T] extends [U] ? ([U] extends [T] ? T : never) : never;
declare type TKServerContext = Omit<Record<string, any>, "req"> & {
    req: Request;
};
declare type TKStreamSuccess<V, T extends Topics, Ts extends keyof T> = {
    type: "success";
    topic: Ts;
    initValue?: Sameish<V, T[Ts]>;
};
declare type TKCallSuccess<T> = T;
declare type TKError = {
    type: "error";
    error: string;
    status?: number;
};
declare type TKCallResult<T> = TKError | TKCallSuccess<T>;
declare type TKStreamResult<V, T extends Topics, Ts extends keyof T> = TKStreamSuccess<V, T, Ts> | TKError;
declare type Instance<R extends Router = any, SchemaType extends z.ZodType = any, In = any, Ctx extends TKServerContext = any> = {
    _type: "instance";
    _schema?: SchemaType;
    _middlewares: MiddleWare[];
    instance: (args: In, ctx: Ctx) => {
        fetch: (req: Request) => Promise<Response>;
        _undefinedrouter: R;
    };
};
declare type Call<SchemaType extends z.ZodType = any, In = any, Out = any, Ctx extends TKServerContext = any> = {
    _type: "call";
    _schema?: SchemaType;
    _middlewares: MiddleWare[];
    call: (args: In, ctx: Ctx) => TKCallResult<Out>;
};
declare type Stream<SchemaType extends z.ZodType = any, In = any, Out = any, Ctx extends TKServerContext = any, T extends Topics = any, Ts extends keyof T = any> = {
    _type: "stream";
    _schema: SchemaType;
    _middlewares: MiddleWare[];
    stream: (args: In, ctx: Ctx) => TKStreamResult<Out, T, Ts>;
};
declare type MiddleWare<Ctx extends TKServerContext = any> = {
    handle: (ctx: Ctx) => {
        type: "response";
        data: Response;
    } | {
        type: "ctx";
        data: Ctx;
    };
};
declare type Router<Ctx extends TKServerContext = any> = Routes & {
    _type: "router";
    _middlewares: MiddleWare[];
    route: (ctx: Ctx & MaybeTKInternals) => Promise<Response>;
};
declare type InternalKeys = "_type" | "_schema" | "_middlewares" | "route";
declare type Routes<Ctx extends TKServerContext = any> = {
    [key: string]: Call | Stream | Router<Ctx> | Instance;
};
declare type TKRequest = {
    args: unknown[];
};
declare type TKInternals = {
    index: number;
    paths: string[];
    tkreq: TKRequest;
};
declare type MaybeTKInternals = {
    __tk_internals?: TKInternals;
};
declare class TKBuilder<Ctx extends TKServerContext, T extends Topics = Record<string, any>> {
    private readonly emitter;
    constructor(emitter?: Emitter<T>);
    emit<Ts extends keyof T>(topic: Ts, event: StreamEvent<T[Ts]>): void;
    instance<R extends Router = any, SchemaType extends z.ZodType = any>(router: R, f: (args: z.infer<SchemaType>, ctx: Ctx) => (req: Request) => Promise<Response>, schema?: SchemaType, middlewares?: MiddleWare<Ctx>[]): Instance<R, Schema, z.infer<SchemaType>, Ctx>;
    call<SchemaType extends z.ZodType, Out>(schema: SchemaType, f: (args: z.infer<SchemaType>, ctx: Ctx) => TKCallResult<Out>, middlewares?: MiddleWare<Ctx>[]): Call<Schema, z.infer<SchemaType>, Out, Ctx>;
    stream<SchemaType extends z.ZodType, Out>(schema: SchemaType, f: (args: z.infer<SchemaType>, ctx: Ctx) => TKStreamResult<Out, T, keyof T>, middlewares?: MiddleWare<Ctx>[]): Stream<Schema, z.infer<SchemaType>, Out, Ctx, T, keyof T>;
    router<R extends Routes>(routes: R, middlewares?: MiddleWare<Ctx>[]): Router<Ctx> & R;
}
declare type CSEConnecting = {
    state: 'connecting';
};
declare type CSEConnected = {
    state: 'connected';
};
declare type CSEData<T> = {
    state: 'data';
    data: T;
};
declare type CSEReconnecting<T> = {
    state: 'reconnecting';
    lastError?: string;
    lastData?: T;
};
declare type CSEDone<T> = {
    state: 'done';
    lastData?: T;
};
declare type ClientStreamEvent<T> = CSEConnecting | CSEConnected | CSEData<T> | CSEReconnecting<T> | CSEDone<T>;
interface EventStream<T> {
    cancel(): void
    start(cb: (event: ClientStreamEvent<T>) => void): void;
}
declare type KeepFirstArg<F> = F extends (args: infer A, ...other: any) => infer R ? (args: A) => R : never;
declare type StreamType<T> = T extends (args: infer A) => infer R ? R extends TKStreamSuccess<infer V, any, any> ? (args: A) => EventStream<V> : never : never;
declare type InstanceType<T extends (...a: any) => any, G = ToBase<ReturnType<T>["_undefinedrouter"]>> = (...a: Parameters<T>) => G;
declare type ToBase<T> = T extends Call ? {
    [K in keyof Pick<T, "call">]: KeepFirstArg<T["call"]>;
} : T extends Stream ? {
    [K in keyof Pick<T, "stream">]: StreamType<KeepFirstArg<T["stream"]>>;
} : T extends Instance ? {
    [K in keyof Pick<T, "instance">]: InstanceType<KeepFirstArg<T["instance"]>>;
} : T extends Router ? {
    [K in keyof Omit<T, InternalKeys>]: ToBase<T[K]>;
} : never;
declare type ToClient<T extends Router> = ToBase<T>;

export { CSEConnected, CSEConnecting, CSEData, CSEDone, CSEReconnecting, Call, ClientStreamEvent, EventStream, Instance, MiddleWare, Router, Stream, TKBuilder, TKCallResult, TKCallSuccess, TKError, TKServerContext, TKStreamResult, TKStreamSuccess, ToClient };
