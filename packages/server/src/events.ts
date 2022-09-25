export type Topics = {
    [event: string]: any
}
export type Unsubscribe = () => void
export type StreamEventData<T> = { type: "data"; data: T };
export type StreamEventClose = { type: "close" };
export type StreamEvent<T> = StreamEventData<T> | StreamEventClose;


export class EventEmitter<T extends Topics> {
    private topsub = new Map<keyof T, Map<number, (event: any) => void>>();
    private nextSubid = 0;
    constructor() {}
    emit<Ts extends keyof T>(topic: Ts, event: StreamEvent<T[Ts]>) {
        const subscribers = this.topsub.get(topic)
        if (subscribers) {
            for (const v of subscribers.values()) {
                v(event)
            }
            if (event.type === "close") {
                subscribers.clear()
                this.topsub.delete(topic)
            }
        }
    }

    subscribe<Ts extends keyof T>(topic: Ts, onEvent: (event: StreamEvent<[Ts]>) => void): Unsubscribe {
        const id = ++this.nextSubid
        let subscribers = this.topsub.get(topic)
        if (!subscribers) {
            subscribers = new Map<number, (event: any) => void>();
            this.topsub.set(topic, subscribers)
        }
        subscribers.set(id, onEvent)
        return () => { 
            const deleted = subscribers?.delete(id) 
            if (deleted && subscribers?.size === 0) {
                this.topsub.delete(topic)
            }
        }
    }
}


const textEncoder = new TextEncoder();

export function eventStream<T extends StreamEvent<T>>(
  onCancel: () => void
): { readable: ReadableStream; publish: (event: T) => void } {
  const state: { channel?: Promise<T>; resolve?: (event: T) => void } = {};
  const readable = new ReadableStream({
    start() {},
    async pull(controller) {
      const channel = state.channel
        ? state.channel
        : new Promise<T>((resolve) => {
            state.resolve = resolve;
          });
      const event = await channel;
      if (event.type === "close") {
        controller.close();
      } else {
        const chunk = JSON.stringify(event.data);
        controller.enqueue(textEncoder.encode(`data: ${chunk}\n\n`));
      }
    },
    async cancel(e) {
      onCancel();
    },
  });
  return {
    publish: (event: T) => {
      if (state.resolve) {
        const resolve = state.resolve;
        state.resolve = undefined;
        resolve(event);
      } else {
        // Slow consumer, replace promise with latest value
        // Should not happen as ReadableStream also has some buffering (default 1)
        state.channel = new Promise<T>((resolve) => resolve(event));
      }
    },
    readable,
  };
}