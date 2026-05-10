/// <reference types="multer" />
import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Post, Query, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { IsOptional, IsString, MaxLength } from "class-validator";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { UploadsService } from "./uploads.service";

class PresignPutDto {
  @IsString()
  @MaxLength(120)
  filename!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  folder?: string;
}

/**
 * Generic upload endpoints. Authenticated routes; the service is also
 * injected into other modules that need to persist files (e.g. maintenance
 * attachments). New file-handling code should NOT touch the S3 SDK directly
 * — go through UploadsService instead.
 */
@Controller("uploads")
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploads: UploadsService) {}

  @Post()
  @UseInterceptors(FileInterceptor("file"))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body("folder") folder?: string,
  ) {
    if (!file) throw new BadRequestException("الملف مطلوب");
    const result = await this.uploads.upload(file, { folder });
    const url = await this.uploads.presignGet(result.key);
    return { ...result, url };
  }

  /** Issue a fresh signed GET URL for an existing key. */
  @Get("sign")
  async sign(@Query("key") key: string, @Query("ttl") ttl?: string) {
    if (!key) throw new BadRequestException("key is required");
    const ttlSeconds = ttl ? Math.max(30, Math.min(3600, Number(ttl))) : undefined;
    const url = await this.uploads.presignGet(key, ttlSeconds);
    return { key, url, expiresIn: ttlSeconds ?? 900 };
  }

  /** Issue a signed PUT URL so the browser can upload directly to MinIO. */
  @Post("presign")
  @HttpCode(200)
  async presign(@Body() body: PresignPutDto) {
    const key = this.uploads.buildKey(body.filename, { folder: body.folder });
    return this.uploads.presignPut({ key, contentType: body.contentType });
  }

  @Delete()
  async remove(@Query("key") key: string) {
    if (!key) throw new BadRequestException("key is required");
    await this.uploads.delete(key);
    return { ok: true };
  }
}
