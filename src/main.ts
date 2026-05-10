import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ensureSchema } from "./database/bootstrap";

async function bootstrap() {
  // Run schema initializer BEFORE the Nest factory builds providers — many
  // providers query the DB at construction time, which would crash on a
  // fresh empty DB. ensureSchema is a no-op when tables already exist.
  await ensureSchema();

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix("api");
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  );

  /**
   * Swagger UI at /api/docs, raw spec at /api/docs-json. Two security schemes
   * because we have two distinct JWT audiences:
   *   - "user-jwt"   → landlord/admin endpoints (JwtAuthGuard)
   *   - "tenant-jwt" → tenant portal endpoints (TenantAuthGuard)
   * Controllers tag the right one via @ApiBearerAuth("user-jwt") or
   * @ApiBearerAuth("tenant-jwt").
   */
  const swaggerConfig = new DocumentBuilder()
    .setTitle("Milkia API")
    .setDescription("Property-management API for landlords, tenants, and admins.")
    .setVersion("1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "user-jwt")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" }, "tenant-jwt")
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("api/docs", app, swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
  Logger.log(`Swagger UI    on http://localhost:${port}/api/docs`, "Bootstrap");
}

bootstrap();
