const baseUrl = import.meta.env.BASE_URL;
const trimmedBase = baseUrl === "/" ? "" : baseUrl.replace(/\/$/, "");

export function withBase(path: string) {
  if (/^(https?:)?\/\//.test(path)) return path;
  if (path === "/") return baseUrl;
  return `${trimmedBase}${path.startsWith("/") ? path : `/${path}`}`;
}

export function stripBase(pathname: string) {
  if (!trimmedBase || !pathname.startsWith(trimmedBase)) return pathname;
  const stripped = pathname.slice(trimmedBase.length);
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}
