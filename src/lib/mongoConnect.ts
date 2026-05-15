import mongoose from 'mongoose';

declare global {
  // eslint-disable-next-line no-var
  var _mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined;
}

if (!global._mongoose) {
  global._mongoose = { conn: null, promise: null };
}

const cache = global._mongoose;

export default async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI environment variable is not set');
    cache.promise = mongoose.connect(uri, { bufferCommands: false });
  }

  cache.conn = await cache.promise;
  return cache.conn;
}
