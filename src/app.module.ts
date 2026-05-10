import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";

import { DatabaseModule } from "./database/database.module";
import { TwilioModule } from "./modules/twilio/twilio.module";
import { HealthModule } from "./modules/health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { StatsModule } from "./modules/stats/stats.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { PropertiesModule } from "./modules/properties/properties.module";
import { UnitsModule } from "./modules/units/units.module";
import { ContractsModule } from "./modules/contracts/contracts.module";
import { PaymentsModule } from "./modules/payments/payments.module";
import { AdminModule } from "./modules/admin/admin.module";
import { ProfileModule } from "./modules/profile/profile.module";
import { OwnersModule } from "./modules/owners/owners.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { MaintenanceModule } from "./modules/maintenance/maintenance.module";
import { FacilitiesModule } from "./modules/facilities/facilities.module";
import { CampaignsModule } from "./modules/campaigns/campaigns.module";
import { SupportModule } from "./modules/support/support.module";
import { TenantPortalModule } from "./modules/tenant-portal/tenant-portal.module";
import { ContactModule } from "./modules/contact/contact.module";
import { TeamModule } from "./modules/team/team.module";
import { InvoiceModule } from "./modules/invoice/invoice.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    /**
     * Global per-IP rate limit. Per-route limits (esp. OTP) are layered on top
     * via @Throttle() and the OtpThrottlerGuard with a per-(IP+target) tracker.
     */
    ThrottlerModule.forRoot([
      { name: "short",  ttl: 1000,    limit: 20  },     // burst: 20 req/sec
      { name: "medium", ttl: 60_000,  limit: 120 },     // sustained: 120 req/min
      { name: "long",   ttl: 3600_000, limit: 2000 },   // 2000 req/hour
    ]),
    DatabaseModule,
    TwilioModule,
    HealthModule,
    AuthModule,
    StatsModule,
    DashboardModule,
    PropertiesModule,
    UnitsModule,
    ContractsModule,
    PaymentsModule,
    AdminModule,
    ProfileModule,
    OwnersModule,
    TenantsModule,
    MaintenanceModule,
    FacilitiesModule,
    CampaignsModule,
    SupportModule,
    TenantPortalModule,
    ContactModule,
    TeamModule,
    InvoiceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
