import { ToBase } from "./client";
import { Emitter, StreamEvent, Topics } from "./events";
type MaybeNoArgs<Args, Ctx, R> = Args extends undefined ? (ctx: Ctx) => MaybeAsync<R> : (args: Args, ctx: Ctx) => MaybeAsync<R>;
type Sameish<T, U> = [T] extends [U] ? ([U] extends [T] ? T : U extends unknown ? T : never) : T extends unknown ? U : never;
export type MaybeAsync<T> = T | PromiseLike<T>;
export interface Parsable {
    parse(obj: unknown): any;
}
type ParseType<T> = T extends Parsable ? ReturnType<T['parse']> : undefined;
export type TKServerContext = Omit<Record<string, any>, "req"> & {
    req: Request;
};
export type TKOK<T> = {
    ok: true;
    data: T;
};
export type TKERR = {
    ok: false;
    error: string;
    status?: number;
};
export declare function tkok<T>(data: T): TKResult<T>;
export declare function tkerr(error: string, status?: number): TKResult<any>;
export declare class TKResult<T> {
    readonly value: TKOK<T> | TKERR;
    private constructor();
    static OK<T>(data: T): TKResult<T>;
    static ERR<T>(error: string, status?: number): TKResult<T>;
    map<R>(f: (data: T) => TKResult<R>): TKResult<R>;
    get(): [T, undefined] | [undefined, string];
}
export type StreamReturn<V, T extends Topics, Ts extends keyof T> = {
    topic: Ts;
    initValue?: Sameish<V, T[Ts]>;
};
export type TKStreamResult<V, T extends Topics, Ts extends keyof T> = TKResult<StreamReturn<V, T, Ts>>;
export declare function tkstream<T>(topic: string, initValue?: T): TKResult<{
    topic: string;
    initValue: T | undefined;
}>;
export type Instance<R extends Router = any, SchemaType extends Parsable = any, In = any, Ctx extends TKServerContext = any> = {
    _type: "instance";
    _schema?: SchemaType;
    _middlewares: MiddleWare[];
    instance: MaybeNoArgs<In, Ctx, TKResult<{
        fetch: (req: Request) => Promise<Response>;
    }>>;
};
export type Call<SchemaType extends Parsable = any, In = any, Out = any, Ctx extends TKServerContext = any> = {
    _type: "call";
    _schema?: SchemaType;
    _middlewares: MiddleWare[];
    call: MaybeNoArgs<In, Ctx, TKResult<Out>>;
};
export type Stream<SchemaType extends Parsable = any, In = any, Out = any, Ctx extends TKServerContext = any, T extends Topics = any, Ts extends keyof T = any> = {
    _type: "stream";
    _schema: SchemaType;
    _middlewares: MiddleWare[];
    stream: (args: In, ctx: Ctx) => MaybeAsync<TKStreamResult<Out, T, Ts>>;
};
export type MiddleWare<Ctx extends TKServerContext = any> = {
    handle: (ctx: Ctx) => {
        type: "response";
        data: Response;
    } | {
        type: "ctx";
        data: Ctx;
    };
};
export type Router<Ctx extends TKServerContext = any> = {
    _type: "router";
    _middlewares: MiddleWare[];
    route: (ctx: Ctx & MaybeTKInternals, prefix?: string) => Promise<Response>;
};
export type TKInternalKeys = "_type" | "_schema" | "_middlewares" | "route" | "instance" | "call" | "stream" | "tkclient";
type Routes<Ctx extends TKServerContext = any> = {
    [key: string]: Call | Stream | Router<Ctx> | Instance | Routes<Ctx>;
};
type TKRequest = {
    args: unknown[];
};
type TKInternals = {
    index: number;
    paths: string[];
    tkreq: TKRequest;
};
type MaybeTKInternals = {
    __tk_internals?: TKInternals;
};
interface Fetch {
    fetch: (req: Request) => Promise<Response>;
}
export declare class TKBuilder<Ctx extends TKServerContext, T extends Topics = Record<string, any>> {
    private readonly emitter;
    constructor(emitter?: Emitter<T>);
    emit<Ts extends keyof T>(topic: Ts, event: StreamEvent<T[Ts]>): void;
    instance<R extends Router = any, SchemaType extends Parsable | undefined = undefined>(router: R, f: MaybeNoArgs<ParseType<SchemaType>, Ctx, TKResult<Fetch>>, schema?: SchemaType, middlewares?: MiddleWare<Ctx>[]): Instance<R, Parsable, ParseType<SchemaType>, Ctx>;
    call<Out, SchemaType extends Parsable | undefined = undefined>(f: MaybeNoArgs<ParseType<SchemaType>, Ctx, TKResult<Out>>, schema?: SchemaType, middlewares?: MiddleWare<Ctx>[]): Call<Parsable, ParseType<SchemaType>, Out, Ctx>;
    stream<SchemaType extends Parsable, Out>(schema: SchemaType, f: (args: ParseType<SchemaType>, ctx: Ctx) => MaybeAsync<TKStreamResult<Out, T, keyof T>>, middlewares?: MiddleWare<Ctx>[]): Stream<Parsable, ParseType<SchemaType>, Out, Ctx, T, keyof T>;
    router<R extends Routes>(routes: R, prefix?: string, middlewares?: MiddleWare<Ctx>[]): Router<Ctx> & R & {
        tkclient: (ctx: Omit<Ctx, 'req'>) => ToBase<R>;
    };
}
export {};
