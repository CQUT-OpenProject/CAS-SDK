// Ensure Symbol.dispose and Symbol.asyncDispose are defined in all Node/Edge runtimes
declare global {
  interface SymbolConstructor {
    readonly dispose: unique symbol;
    readonly asyncDispose: unique symbol;
  }
}

if (typeof (Symbol as { dispose?: symbol }).dispose !== "symbol") {
  Object.defineProperty(Symbol, "dispose", {
    value: Symbol("Symbol.dispose"),
    configurable: true,
    writable: false,
    enumerable: false,
  });
}

if (typeof (Symbol as { asyncDispose?: symbol }).asyncDispose !== "symbol") {
  Object.defineProperty(Symbol, "asyncDispose", {
    value: Symbol("Symbol.asyncDispose"),
    configurable: true,
    writable: false,
    enumerable: false,
  });
}

export {};
