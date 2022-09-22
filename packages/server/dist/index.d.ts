import { z, Schema } from 'zod';

declare type TKServerContext = Omit<Record<string, any>, "req"> & {
    req: Request;
};
declare type TKStreamSuccess<T> = {
    topic: string;
    initValue?: T;
};
declare type TKCallSuccess<T> = T;
declare type TKError = {
    error: string;
    status?: number;
};
declare type TKCallResult<T> = TKError | TKCallSuccess<T>;
declare type TKStreamResult<T> = TKStreamSuccess<T> | TKError;
declare type Instance<R extends Router = any, SchemaType extends z.ZodType = any, In = any, Ctx extends TKServerContext = any> = {
    _type: 'instance';
    _schema?: SchemaType;
    _middlewares: MiddleWare[];
    instance: (args: In, ctx: Ctx) => {
        fetch: (req: Request) => Promise<Response>;
        _undefinedrouter: R;
    };
};
declare type Call<SchemaType extends z.ZodType = any, In = any, Out = any, Ctx extends TKServerContext = any> = {
    _type: 'call';
    _schema?: SchemaType;
    _middlewares: MiddleWare[];
    call: (args: In, ctx: Ctx) => TKCallResult<Out>;
};
declare type Stream<SchemaType extends z.ZodType = any, In = any, Out = any, Ctx extends TKServerContext = any> = {
    _type: 'stream';
    _schema: SchemaType;
    _middlewares: MiddleWare[];
    stream: (args: In, ctx: Ctx) => {
        topic: string;
        initValue: Out;
    };
};
declare type MiddleWare<Ctx extends TKServerContext = any> = {
    handle: (ctx: Ctx) => {
        type: 'response';
        data: Response;
    } | {
        type: 'ctx';
        data: Ctx;
    };
};
declare type Router<Ctx extends TKServerContext = any> = Routes & {
    _type: 'router';
    _middlewares: MiddleWare[];
    route: (ctx: Ctx) => Promise<Response>;
};
declare type InternalKeys = "_type" | "_schema" | "_middlewares" | "route" | "_executor";
declare type Routes<Ctx extends TKServerContext = any> = {
    [key: string]: Call | Stream | Router<Ctx> | Instance;
};
declare class TKBuilder<Ctx extends TKServerContext> {
    constructor();
    instance<R extends Router = any, SchemaType extends z.ZodType = any>(router: R, f: (args: z.infer<SchemaType>, ctx: Ctx) => (req: Request) => Promise<Response>, schema?: SchemaType, middlewares?: MiddleWare<Ctx>[]): Instance<R, Schema, z.infer<SchemaType>, Ctx>;
    call<SchemaType extends z.ZodType, Out>(schema: SchemaType, f: (args: z.infer<SchemaType>, ctx: Ctx) => TKCallResult<Out>, middlewares?: MiddleWare<Ctx>[]): Call<Schema, z.infer<SchemaType>, Out, Ctx>;
    stream<SchemaType extends z.ZodType, Out>(schema: SchemaType, f: (args: z.infer<SchemaType>, ctx: Ctx) => {
        topic: string;
        initValue: Out;
    }, middlewares?: MiddleWare<Ctx>[]): Stream<Schema, z.infer<SchemaType>, Out, Ctx>;
    router<R extends Routes>(routes: R, middlewares?: MiddleWare<Ctx>[]): R & Router;
}
declare type KeepFirstArg<F> = F extends (args: infer A, ...other: any) => infer R ? (args: A) => R : never;
declare type StreamType<T extends (...a: any) => any, G = ReturnType<T>['initValue']> = (...a: Parameters<T>) => G;
declare type InstanceType<T extends (...a: any) => any, G = ToBase<ReturnType<T>['_undefinedrouter']>> = (...a: Parameters<T>) => G;
declare type ToBase<T> = T extends Call ? {
    'call': KeepFirstArg<T['call']>;
} : T extends Stream ? {
    'stream': StreamType<KeepFirstArg<T['stream']>>;
} : T extends Instance ? {
    'instance': InstanceType<KeepFirstArg<T['instance']>>;
} : T extends Router ? Omit<T, InternalKeys> & {
    [K in Exclude<keyof T, InternalKeys>]: ToBase<T[K]>;
} : never;
declare type ToClient<T extends Router> = ToBase<T>;

export { Call, Instance, MiddleWare, Router, Stream, TKBuilder, TKCallResult, TKCallSuccess, TKError, TKServerContext, TKStreamResult, TKStreamSuccess, ToClient };
