import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { TeamService } from "./team.service";
import { IsArray, IsBoolean, IsEmail, IsOptional, IsString, MinLength } from "class-validator";

class CreateEmployeeDto {
  @IsString() name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() preset?: string;
  @IsOptional() @IsArray() permissions?: string[];
  @IsOptional() @IsString() roleLabel?: string;
}

class UpdateEmployeeDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() preset?: string;
  @IsOptional() @IsArray() permissions?: string[];
  @IsOptional() @IsString() roleLabel?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller("team")
@UseGuards(JwtAuthGuard)
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get("employees")
  list(@CurrentUser() user: AuthUser) {
    return this.team.listEmployees(user.id);
  }

  @Post("employees")
  create(@CurrentUser() user: AuthUser, @Body() body: CreateEmployeeDto) {
    return this.team.createEmployee(user.id, body);
  }

  @Patch("employees/:id")
  update(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: UpdateEmployeeDto,
  ) {
    return this.team.updateEmployee(user.id, id, body);
  }

  @Delete("employees/:id")
  remove(@CurrentUser() user: AuthUser, @Param("id", ParseIntPipe) id: number) {
    return this.team.deleteEmployee(user.id, id);
  }

  @Post("employees/:id/reset-password")
  resetPassword(
    @CurrentUser() user: AuthUser,
    @Param("id", ParseIntPipe) id: number,
    @Body() body: { password: string },
  ) {
    return this.team.resetEmployeePassword(user.id, id, body.password);
  }

  @Get("role-presets")
  presets() {
    return this.team.rolePresets();
  }
}
