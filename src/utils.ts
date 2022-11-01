export type MaybeAsync<T> = T | PromiseLike<T>
export type Sameish<T, U> = [T] extends [U] ? ([U] extends [T] ? T : U extends unknown ? T : never) : T extends unknown ? U : never;