import { Global, Module } from "@nestjs/common";
import { TwilioVerifyService } from "./twilio-verify.service";

@Global()
@Module({
  providers: [TwilioVerifyService],
  exports: [TwilioVerifyService],
})
export class TwilioModule {}
