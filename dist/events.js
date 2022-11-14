export class EventEmitter {
    topsub = new Map();
    nextSubid = 0;
    constructor() { }
    emit(topic, event) {
        const subscribers = this.topsub.get(topic);
        if (subscribers) {
            for (const v of subscribers.values()) {
                v(event);
            }
            if (event.type === "close") {
                subscribers.clear();
                this.topsub.delete(topic);
            }
        }
    }
    subscribe(topic, onEvent) {
        const id = ++this.nextSubid;
        let subscribers = this.topsub.get(topic);
        if (!subscribers) {
            subscribers = new Map();
            this.topsub.set(topic, subscribers);
        }
        subscribers.set(id, onEvent);
        return () => {
            const deleted = subscribers?.delete(id);
            if (deleted && subscribers?.size === 0) {
                this.topsub.delete(topic);
            }
        };
    }
}
const textEncoder = new TextEncoder();
export function eventStream(onCancel) {
    const state = {};
    const readable = new ReadableStream({
        start() { },
        async pull(controller) {
            const channel = state.channel
                ? state.channel
                : new Promise((resolve) => {
                    state.resolve = resolve;
                });
            state.channel = undefined;
            const event = await channel;
            switch (event.type) {
                case "close":
                    controller.close();
                    break;
                case "data":
                    const chunk = JSON.stringify(event.data);
                    controller.enqueue(textEncoder.encode(chunk + "\n"));
                case "ping":
                    controller.enqueue(textEncoder.encode("\n"));
                default:
                    break;
            }
        },
        async cancel(e) {
            onCancel();
        },
    });
    return {
        publish: (event) => {
            if (state.resolve) {
                const resolve = state.resolve;
                state.resolve = undefined;
                resolve(event);
            }
            else {
                // Slow consumer, replace promise with latest value
                // Should not happen as ReadableStream also has some buffering (default 1)
                state.channel = new Promise((resolve) => resolve(event));
            }
        },
        readable,
    };
}
//# sourceMappingURL=events.js.map