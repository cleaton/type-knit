declare type TKFetchOptions = Record<string, any> & {
  headers?: Record<string, string>;
};
declare type FetchImpl = {
  Request: typeof Request;
  Response: typeof Response;
  fetch: typeof fetch;
};
declare function createClient<T>(
  url: string,
  options?: TKFetchOptions,
  fetchImpl?: FetchImpl
): {
  e: () => T;
};

export { FetchImpl, createClient };
