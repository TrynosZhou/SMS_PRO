export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
  isPaginated: boolean;
}

export const parsePaginationParams = (
  query: Record<string, any>,
  defaultLimit = 20,
  maxLimit = 100
): PaginationParams => {
  const rawPage = query?.page;
  const rawLimit = query?.limit;

  const page = Math.max(parseInt(rawPage as string, 10) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(rawLimit as string, 10) || defaultLimit, 1),
    maxLimit
  );

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    isPaginated: rawPage !== undefined || rawLimit !== undefined
  };
};

export const buildPaginationResponse = <T>(
  data: T[],
  page: number,
  limit: number,
  totalItems?: number
) => {
  const total = totalItems ?? data.length;
  const totalPages = limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1;

  return {
    data,
    page,
    limit,
    total,
    totalPages
  };
};
