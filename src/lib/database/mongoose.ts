import mongoose from "mongoose";
import { AsyncLocalStorage } from "node:async_hooks";

// Request-scoped storage for dedicated, per-request MongoDB connections
const connectionStorage = new AsyncLocalStorage<mongoose.Connection>();

let connectionSequence = 0;

const opts = {
  bufferCommands: false,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000,
  socketTimeoutMS: 15000,
  maxPoolSize: 1,
};

/**
 * Creates or retrieves a Model that automatically binds to the dedicated connection
 * active in the current request context via AsyncLocalStorage.
 * If running outside withDatabase, it falls back to the default global model.
 */
export function getModel<T>(
  name: string,
  schema: mongoose.Schema<T>,
  collection?: string,
): mongoose.Model<T> {
  const baseModel =
    (mongoose.models[name] as mongoose.Model<T>) ??
    mongoose.model<T>(name, schema, collection);

  return new Proxy(baseModel, {
    get(target, prop, receiver) {
      const conn = connectionStorage.getStore();
      if (conn) {
        const scopedModel =
          (conn.models[name] as mongoose.Model<T>) ??
          conn.model<T>(name, schema, collection);
        const val = Reflect.get(scopedModel, prop);
        if (typeof val === "function") {
          return val.bind(scopedModel);
        }
        return val;
      }
      return Reflect.get(target, prop, receiver);
    },
    construct(target, args) {
      const conn = connectionStorage.getStore();
      if (conn) {
        const scopedModel =
          (conn.models[name] as mongoose.Model<T>) ??
          conn.model<T>(name, schema, collection);
        return new (scopedModel as any)(...args);
      }
      return new (target as any)(...args);
    },
  }) as mongoose.Model<T>;
}

/**
 * Fallback connection function for compatibility.
 * If running inside withDatabase, returns the active mongoose instance.
 */
export async function connectToDatabase(): Promise<typeof mongoose> {
  const activeConn = connectionStorage.getStore();
  if (activeConn) {
    return mongoose;
  }

  const MONGODB_URI = process.env.MONGODB_DIRECT_URI || process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env.local",
    );
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  return await mongoose.connect(MONGODB_URI, opts);
}

/**
 * Request-scoped database lifecycle abstraction.
 * Creates a dedicated, isolated Mongoose connection using mongoose.createConnection(),
 * binds all models via AsyncLocalStorage, executes the database operation,
 * and cleanly closes the connection in a finally block.
 *
 * This completely avoids the stale-socket Error 1101 failures on Cloudflare Workers
 * caused by shared connections whose underlying TCP streams are severed across request boundaries.
 */
export async function withDatabase<T>(
  operation: (m: typeof mongoose) => Promise<T>,
): Promise<T> {
  // Support nested withDatabase invocations safely within the same request
  const existingConn = connectionStorage.getStore();
  if (existingConn) {
    return await operation(mongoose);
  }

  const MONGODB_URI = process.env.MONGODB_DIRECT_URI || process.env.MONGODB_URI;
  if (!MONGODB_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env.local",
    );
  }

  const connId = ++connectionSequence;
  if (process.env.NODE_ENV !== "production") {
    console.log(`[MongoDB] Opening dedicated connection #${connId}`);
  }

  const conn = await mongoose.createConnection(MONGODB_URI, opts).asPromise();
  try {
    return await connectionStorage.run(conn, () => operation(mongoose));
  } finally {
    try {
      await conn.close();
      if (process.env.NODE_ENV !== "production") {
        console.log(`[MongoDB] Closed dedicated connection #${connId}`);
      }
    } catch (closeErr) {
      console.error(`[MongoDB] Error closing connection #${connId}:`, closeErr);
    }
  }
}
