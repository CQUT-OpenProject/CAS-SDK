declare global {
    interface SymbolConstructor {
        readonly dispose: unique symbol;
        readonly asyncDispose: unique symbol;
    }
}
export {};
