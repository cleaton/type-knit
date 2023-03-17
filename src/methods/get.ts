import { createMethodType } from './index';
import { type Result } from "./../utils/result";

const get = createMethodType(
	'get',
	{
		encode: async (result: Result<any>) => new Request(JSON.stringify(result), { method: 'POST' }),
		decode: async (response: Response) => await response.json() as Result<any>,
	},
	{
		encode: async (result: Result<any>) => new Response(JSON.stringify(result), { status: 200 }),
		decode: async (request: Request) => await request.json() as Result<any>,
	}
);


export default get