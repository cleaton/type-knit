export type MaybeAsync<T> = T | Promise<T>;

export type Unvalidated<T> = {
	rawCast: T;
};

export type RemoveUnvalidated<T> = T extends Unvalidated<infer U> ? U : T;