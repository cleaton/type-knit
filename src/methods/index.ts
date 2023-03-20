import { type Result } from "./../utils/result";
import get from "./get";
import post from "./post";
import stream from "./stream";

type Encoder<ToEncode, EncodeTo, ToDecode, DecodeTo> = {
	encode: (result: Result<ToEncode>) => Promise<EncodeTo>;
	decode: (response: ToDecode) => Promise<Result<DecodeTo>>;
};
type ClientEncoder<In, Out> = Encoder<In, RequestInit, Response, Out>;
type ServerEncoder<In, Out> = Encoder<Out, Response, Request, In>;
type ForceUpper<T extends string> = T extends Uppercase<T> ? T : never;
export interface MethodType<Name extends string, In, Out> {
	name: ForceUpper<Name>;
	client: ClientEncoder<In, Out>;
	server: ServerEncoder<In, Out>;
}

export function createMethodType<Name extends string, In, Out>(
	name: ForceUpper<Name>,
	client: ClientEncoder<In, Out>,
	server: ServerEncoder<In, Out>
) {
	return {
		[name]: {
			name,
			client,
			server,
		},
	} as {
		[name in Name]: MethodType<Name, In, Out>;
	};
}

export const defaultMethods = {
	...post,
	...get,
	...stream,
};