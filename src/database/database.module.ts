import { Global, Module } from "@nestjs/common";
import { db, schema } from "@oqudk/database";

export const DRIZZLE = Symbol("DRIZZLE");

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE,
      useFactory: () => db,
    },
  ],
  exports: [DRIZZLE],
})
export class DatabaseModule {}

export type Drizzle = typeof db;
export { schema };
