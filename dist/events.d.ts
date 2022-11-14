export declare type Topics = {
    [event: string]: any;
};
export declare type Unsubscribe = () => void;
export declare type StreamEventData<T> = {
    type: "data";
    data: T;
};
export declare type StreamEventClose = {
    type: "close";
};
export declare type StreamEventPing = {
    type: "ping";
};
export declare type StreamEvent<T> = StreamEventData<T> | StreamEventClose | StreamEventPing;
export interface Emitter<T extends Topics> {
    emit<Ts extends keyof T>(topic: Ts, event: StreamEvent<T[Ts]>): void;
    subscribe<Ts extends keyof T>(topic: Ts, onEvent: (event: StreamEvent<[Ts]>) => void): Unsubscribe;
}
export declare class EventEmitter<T extends Topics> implements Emitter<T> {
    private topsub;
    private nextSubid;
    constructor();
    emit<Ts extends keyof T>(topic: Ts, event: StreamEvent<T[Ts]>): void;
    subscribe<Ts extends keyof T>(topic: Ts, onEvent: (event: StreamEvent<[Ts]>) => void): Unsubscribe;
}
export declare function eventStream<T extends StreamEvent<T>>(onCancel: () => void): {
    readable: ReadableStream;
    publish: (event: T) => void;
};
