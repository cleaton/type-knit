import { createMethodType } from './index';
import { type Result } from "./../utils/result";


export interface strm<T> {
	subscribe(f: (data: T) => void): () => void;
}

const stream = createMethodType(
	'STREAM',
	{
		encode: async (result: Result<any>) => new Request(JSON.stringify(result), { method: 'POST' }),
		decode: async (response: Response) => await response.json() as Result<any>,
	},
	{
		encode: async (result: Result<strm<any>>) => new Response(JSON.stringify(result), { status: 200 }),
		decode: async (request: Request) => await request.json() as Result<any>,
	}
);

export default stream;