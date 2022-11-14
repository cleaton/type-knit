import { Call, Instance, MaybeAsync, Router, Stream, StreamReturn, TKInternalKeys, TKResult } from "./server";
export declare type CSEConnecting = {
    state: 'connecting';
};
export declare type CSEConnected = {
    state: 'connected';
};
export declare type CSEData<T> = {
    state: 'data';
    data: T;
};
export declare type CSEReconnecting<T> = {
    state: 'reconnecting';
    lastError?: string;
    lastData?: T;
};
export declare type CSEDone<T> = {
    state: 'done';
    lastData?: T;
};
export declare type ClientStreamEvent<T> = CSEConnecting | CSEConnected | CSEData<T> | CSEReconnecting<T> | CSEDone<T>;
export interface EventStream<T> {
    cancel(): Promise<void>;
    start(cb: (event: ClientStreamEvent<T>) => void): void;
}
declare type GetArg<F> = F extends (first: any) => MaybeAsync<infer RA> ? () => Promise<RA> : F extends (first: infer A, ctx: any) => MaybeAsync<infer RA> ? (args: A) => Promise<RA> : never;
declare type StreamType<T> = T extends (args: infer A) => MaybeAsync<infer R> ? R extends TKResult<StreamReturn<infer V, any, any>> ? (args: A) => EventStream<V> : never : never;
declare type InstanceType<T, IR> = T extends (...a: any) => any ? (...a: Parameters<T>) => ToBase<IR> : never;
export declare type ToBase<T> = T extends Call ? {
    [K in keyof Pick<T, "call">]: GetArg<T["call"]>;
} : T extends Stream ? {
    [K in keyof Pick<T, "stream">]: StreamType<GetArg<T["stream"]>>;
} : T extends Instance<infer IR> ? {
    [K in keyof Pick<T, "instance">]: InstanceType<GetArg<T["instance"]>, IR>;
} : T extends Record<string, any> ? {
    [K in keyof Omit<T, TKInternalKeys>]: ToBase<T[K]>;
} : never;
export declare type ToClient<T extends Router> = ToBase<T>;
declare type TKFetchOptions = Record<string, any> & {
    headers?: Record<string, string>;
};
export declare type FetchImpl = {
    Request: typeof Request;
    Response: typeof Response;
    fetch: typeof fetch | ((req: Request) => Promise<Response>);
};
export declare function createClient<T>(url: string, options?: TKFetchOptions, fetchImpl?: FetchImpl): {
    e: (override?: TKFetchOptions, fetchImpl?: FetchImpl) => T;
};
export {};
