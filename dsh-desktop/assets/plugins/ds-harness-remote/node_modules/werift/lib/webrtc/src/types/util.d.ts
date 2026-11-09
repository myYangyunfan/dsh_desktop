export type CallbackWithValue<T> = ((e: T) => void) | ((e: T) => Promise<void>) | null | undefined;
export type Callback = (() => void) | (() => Promise<void>) | null | undefined;
