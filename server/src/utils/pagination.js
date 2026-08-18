function parsePagination(page, limit, defaultLimit = 20) {
  const parsedPage = Number(page);
  const parsedLimit = Number(limit);
  return {
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    limit:
      Number.isInteger(parsedLimit) && parsedLimit > 0
        ? Math.min(parsedLimit, 100)
        : defaultLimit,
  };
}

module.exports = { parsePagination };
