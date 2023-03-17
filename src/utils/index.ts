import { Unvalidated } from "./types";

export function unvalidated<T>(value: T): Unvalidated<T> {
	return {
		rawCast: value,
	};
}