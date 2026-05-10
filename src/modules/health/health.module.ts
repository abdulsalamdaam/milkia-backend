import { Controller, Get, Module } from "@nestjs/common";

@Controller()
class HealthController {
  @Get("healthz")
  health() {
    return { status: "ok" };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
