import { IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

export class RegisterDto {
  @IsString()
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  company?: string;
}

export class ForgotPasswordDto {
  @IsString()
  identifier!: string;

  @IsOptional()
  @IsIn(["sms", "call", "whatsapp", "email"])
  channel?: "sms" | "call" | "whatsapp" | "email";
}

export class ResetPasswordDto {
  @IsString()
  identifier!: string;

  @IsString()
  code!: string;

  @IsString()
  @MinLength(6)
  newPassword!: string;

  @IsOptional()
  @IsIn(["sms", "call", "whatsapp", "email"])
  channel?: "sms" | "call" | "whatsapp" | "email";
}

export class TenantOtpStartDto {
  @IsString()
  phone!: string;

  @IsOptional()
  @IsIn(["sms", "call", "whatsapp"])
  channel?: "sms" | "call" | "whatsapp";
}

export class TenantOtpVerifyDto {
  @IsString()
  phone!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsIn(["sms", "call", "whatsapp"])
  channel?: "sms" | "call" | "whatsapp";
}
