import { Request } from 'node-fetch';

declare function createClient<T>(req: Request): T;

export { createClient };
