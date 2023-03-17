import { type MaybeAsync } from './types';
export type Result<T> = Ok<T> | Err;

interface ResultI<T> {
	map<U extends MaybeAsync<any>>(f: (t: T) => U): Result<U>;
	flatMap<U extends MaybeAsync<Result<any>>>(f: (t: T) => U): U;
}
export class Ok<T> implements ResultI<T> {
	public ok: true = true;
	constructor(public value: T) {}
	map<U extends MaybeAsync<any>>(f: (t: T) => U): Result<U> {
		return new Ok(f(this.value));
	}
	flatMap<U extends MaybeAsync<Result<any>>>(f: (t: T) => U): U {
		return f(this.value);
	}
}
export class Err implements ResultI<any> {
	public ok: false = false;
	constructor(public error: string, public code?: number) {}
	map<U extends MaybeAsync<any>>(f: (t: any) => U): Result<U> {
		return this;
	}
	flatMap<U extends MaybeAsync<Result<any>>>(f: (t: any) => U): U {
		return this as any as U;
	}
}
function assertIsError(error: unknown): asserts error is Error {
    if (!(error instanceof Error)) {
        throw error
    }
}
function ok<T>(value: T) {
	return new Ok(value);
}
function err(error: string, code?: number) {
	return new Err(error, code);
}
function asyncTryResult<Args extends any[], Ret>(asyncFn: (...args: Args) => Promise<Ret>): (...args: Args) => Promise<Result<Ret>> {
	return async (...args: Args) => {
		return asyncFn(...args).then(ok).catch(e => {
			assertIsError(e)
			return err(e.message);
		});
	}
}
function tryResult<Args extends any[], Ret>(asyncFn: (...args: Args) => Ret): (...args: Args) => Result<Ret> {
	return (...args: Args) => {
		try {
			return ok(asyncFn(...args));
		} catch (e) {
			assertIsError(e);
			return err(e.message);
		}
	}
}

export {
    ok,
    err,
    asyncTryResult,
    tryResult,
}