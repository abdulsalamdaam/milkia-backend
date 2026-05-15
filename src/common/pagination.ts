import { z } from "zod/v4";

/**
 * Shared pagination + search query schema for every list endpoint.
 *
 * All list endpoints follow the same wire shape so the React Query hooks on
 * the frontend can share helpers and so the user gets consistent behavior
 * across tabs:
 *
 *   GET /api/<entity>?page=2&pageSize=25&search=alpha&sort=createdAt&order=desc
 *
 * The handler reads `page` + `pageSize` to compute LIMIT/OFFSET and returns
 *
 *   { data: T[]; page: number; pageSize: number; total: number }
 *
 * `search` is optional; controllers ILIKE it against their text columns.
 */
export const listQuerySchema = z.object({
  page:     z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  search:   z.string().trim().optional(),
  sort:     z.string().trim().optional(),
  order:    z.enum(["asc", "desc"]).default("desc"),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export type Paginated<T> = { data: T[]; page: number; pageSize: number; total: number };
